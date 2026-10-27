// @plm SRS-061 SRS-062 SRS-063  운동 중 보조 — PR 2종 칩 · PR 수 재계산 · 처방 무게 기준
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countMajorPrs, pickPrSets, snapshotFromSets, EMPTY_PR } from '../personalRecords';
import {
  resolvePrescribedLoad,
  roundLoadKg,
  sanitizePrescriptionValue,
  type PrescribedSet,
} from '../prescription';
import type { LoggedSet } from '../types';

const set = (id: string, weightKg: number, reps: number, extra: Partial<LoggedSet> = {}) => ({
  id,
  weightKg,
  reps,
  isWarmup: false,
  isFailed: false,
  ...extra,
});

// ── PR 2종 칩(#50) ──
test('pickPrSets — 중량 PR 과 볼륨 PR 을 서로 다른 세트로 고른다', () => {
  const r = pickPrSets([set('a', 100, 3), set('b', 80, 12), set('c', 90, 5)]);
  assert.equal(r.weight?.id, 'a'); // 100kg 이 가장 무겁다
  assert.equal(r.volume?.id, 'b'); // 80×12=960 이 가장 크다
});

test('pickPrSets — 같은 무게면 횟수가 많은 세트, 워밍업·실패는 빼고 본다', () => {
  const r = pickPrSets([
    set('w', 140, 1, { isWarmup: true }),
    set('f', 130, 1, { isFailed: true }),
    set('a', 100, 3),
    set('b', 100, 5),
  ]);
  assert.equal(r.weight?.id, 'b');
  assert.equal(r.volume?.id, 'b');
});

test('pickPrSets — 한쪽 입력(배수 2) 세트는 계산 무게로 비교한다', () => {
  const r = pickPrSets([set('one', 50, 10, { loadMultiplier: 2 }), set('two', 90, 10)]);
  assert.equal(r.weight?.id, 'one'); // 50×2=100 > 90
});

test('pickPrSets — 기록이 없으면 둘 다 null', () => {
  const r = pickPrSets([]);
  assert.equal(r.weight, null);
  assert.equal(r.volume, null);
});

// ── 과거 세트를 고친 뒤 PR 수 재계산(#51 · QA Q2) ──
test('countMajorPrs — 그 운동보다 앞선 기록만 이력으로 센다', () => {
  // 앞선 운동 최고 100×5. 이번 운동 110×5 → 중량·볼륨 둘 다 PR
  const before = snapshotFromSets([set('x', 100, 5)]);
  assert.equal(countMajorPrs([{ current: [set('y', 110, 5)], historyBest: before }]), 2);
  // 이력이 비면(첫 운동) 둘 다 PR
  assert.equal(countMajorPrs([{ current: [set('y', 110, 5)], historyBest: EMPTY_PR }]), 2);
  // 앞선 기록보다 낮으면 0
  assert.equal(countMajorPrs([{ current: [set('y', 90, 5)], historyBest: before }]), 0);
});

// ── 처방 무게 기준(#56) ──
test('sanitizePrescriptionValue — 옛 JSON(무게 기준 없음)은 그대로 읽힌다', () => {
  const rows = sanitizePrescriptionValue([{ setType: 'top', targetRir: 2, repMin: 5, repMax: 8, loadHint: 'heavy' }]);
  assert.ok(rows);
  assert.equal(rows[0].setType, 'top');
  assert.equal(rows[0].loadBasis, undefined);
});

test('sanitizePrescriptionValue — 무게 기준 범위 밖 값은 버린다', () => {
  const rows = sanitizePrescriptionValue([
    { setType: 'top', loadBasis: 'pct1rm', loadPct: 80 },
    { setType: 'backoff', loadBasis: 'pctTop', loadPct: 140 }, // 탑셋 140% → 버림
    { setType: 'normal', loadBasis: 'fixed', loadKg: 60 },
    { setType: 'normal', loadBasis: 'pct1rm', loadPct: 10 }, // 1RM 10% → 버림
    { setType: 'normal', loadBasis: 'weird', loadPct: 80 },
  ]) as PrescribedSet[];
  assert.equal(rows[0].loadBasis, 'pct1rm');
  assert.equal(rows[0].loadPct, 80);
  assert.equal(rows[1].loadBasis, undefined);
  assert.equal(rows[2].loadBasis, 'fixed');
  assert.equal(rows[2].loadKg, 60);
  assert.equal(rows[3].loadBasis, undefined);
  assert.equal(rows[4].loadBasis, undefined);
});

test('roundLoadKg — 바벨류 2.5kg · 그 밖 1kg', () => {
  assert.equal(roundLoadKg(81.3, 'barbell', 'kg'), 82.5);
  assert.equal(roundLoadKg(81.2, 'barbell', 'kg'), 80);
  assert.equal(roundLoadKg(81.3, 'dumbbell', 'kg'), 81);
  assert.equal(roundLoadKg(81.3, 'ezbar', 'kg'), 82.5);
});

test('resolvePrescribedLoad — 1RM 의 N% · 탑셋의 N% · 직접', () => {
  const a = resolvePrescribedLoad({ basis: 'pct1rm', pct: 80, est1rmKg: 100, equipment: 'barbell', unit: 'kg' });
  assert.ok('weightKg' in a);
  assert.equal(a.weightKg, 80);
  assert.equal(a.reasonKey, 'prescription.load.reasonPct1rm');

  const b = resolvePrescribedLoad({ basis: 'pctTop', pct: 90, topKg: 100, equipment: 'barbell', unit: 'kg' });
  assert.ok('weightKg' in b);
  assert.equal(b.weightKg, 90);

  const c = resolvePrescribedLoad({ basis: 'fixed', kg: 62, equipment: 'barbell', unit: 'kg' });
  assert.ok('weightKg' in c);
  assert.equal(c.weightKg, 62); // 직접 적은 무게는 반올림하지 않는다
});

test('resolvePrescribedLoad — 기록·탑셋이 없으면 기다린다', () => {
  const a = resolvePrescribedLoad({ basis: 'pct1rm', pct: 80, est1rmKg: 0, equipment: 'barbell', unit: 'kg' });
  assert.deepEqual(a, { pending: 'needFirstSet' });
  const b = resolvePrescribedLoad({ basis: 'pctTop', pct: 90, topKg: null, equipment: 'barbell', unit: 'kg' });
  assert.deepEqual(b, { pending: 'needTop' });
});
