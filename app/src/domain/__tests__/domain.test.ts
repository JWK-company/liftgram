// 순수 도메인 단위테스트 — `npm test` (node --import tsx --test). RN 불필요.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  estimateOneRepMax,
  bestEstimatedOneRepMax,
  totalVolumeKg,
  setVolumeKg,
  workingSetCount,
  snapshotFromSets,
  detectNewPRs,
  EMPTY_PR,
  calcPlates,
  toKg,
  fromKg,
  formatWeight,
  roundToIncrement,
  containsMedicalClaim,
  type LoggedSet,
} from '../index';

const ws = (weightKg: number, reps: number, extra: Partial<LoggedSet> = {}): LoggedSet => ({
  weightKg,
  reps,
  isWarmup: false,
  isFailed: false,
  ...extra,
});

// ── Epley 1RM (ADR-010) ──────────────────────────────────────────────
test('Epley: reps=1 → 무게 그대로', () => {
  assert.equal(estimateOneRepMax(100, 1), 100);
});

test('Epley: 100kg × 5 = 116.666…', () => {
  assert.ok(Math.abs(estimateOneRepMax(100, 5) - 100 * (1 + 5 / 30)) < 1e-9);
  assert.ok(Math.abs(estimateOneRepMax(100, 5) - 116.6667) < 1e-3);
});

test('Epley: 비정상 입력 → 0', () => {
  assert.equal(estimateOneRepMax(0, 5), 0);
  assert.equal(estimateOneRepMax(100, 0), 0);
  assert.equal(estimateOneRepMax(-50, 5), 0);
});

test('bestEstimatedOneRepMax: 워밍업/실패 제외', () => {
  const sets = [ws(60, 10), ws(120, 1), ws(200, 1, { isWarmup: true }), ws(300, 1, { isFailed: true })];
  // 워킹 세트: 60×10(=80), 120×1(=120) → 최고 120
  assert.equal(bestEstimatedOneRepMax(sets), 120);
});

// ── 볼륨 (SRS-005) ───────────────────────────────────────────────────
test('볼륨: 워밍업·실패 세트는 0', () => {
  assert.equal(setVolumeKg(ws(100, 5, { isWarmup: true })), 0);
  assert.equal(setVolumeKg(ws(100, 5, { isFailed: true })), 0);
  assert.equal(setVolumeKg(ws(100, 5)), 500);
});

test('볼륨 합계 + 워킹세트 수', () => {
  const sets = [ws(80, 8), ws(80, 8), ws(80, 8), ws(40, 10, { isWarmup: true })];
  assert.equal(totalVolumeKg(sets), 80 * 8 * 3);
  assert.equal(workingSetCount(sets), 3);
});

// ── PR 검출 (SRS-005) ────────────────────────────────────────────────
test('PR: 과거 기록 없으면 모든 지표가 신규 PR', () => {
  const snap = snapshotFromSets([ws(100, 5)]);
  const prs = detectNewPRs(snap, EMPTY_PR);
  const types = prs.map((p) => p.type).sort();
  assert.deepEqual(types, ['estimated1RM', 'maxReps', 'maxVolumeSet', 'maxWeight'].sort());
});

test('PR: 동률이면 갱신 아님', () => {
  const snap = snapshotFromSets([ws(100, 5)]);
  assert.equal(detectNewPRs(snap, snap).length, 0);
});

test('PR: 중량만 갱신', () => {
  const hist = snapshotFromSets([ws(100, 5)]);
  const cur = snapshotFromSets([ws(110, 5)]);
  const prs = detectNewPRs(cur, hist);
  assert.ok(prs.some((p) => p.type === 'maxWeight'));
});

// ── 플레이트 계산기 (SRS-003) ────────────────────────────────────────
test('플레이트: 100kg 기본 → 한쪽 40kg, 잔여 0', () => {
  const r = calcPlates(100);
  assert.equal(r.achievableKg, 100);
  assert.equal(Math.round(r.leftoverKg * 100) / 100, 0);
  const perSideTotal = r.perSide.reduce((s, p) => s + p.plateKg * p.count, 0);
  assert.equal(perSideTotal, 40);
});

test('플레이트: 바 이하 목표 → 플레이트 없음', () => {
  const r = calcPlates(15);
  assert.deepEqual(r.perSide, []);
  assert.equal(r.achievableKg, 20);
});

test('플레이트: 못 맞추는 잔여는 leftover로', () => {
  const r = calcPlates(21, { barKg: 20, platesKg: [5] }); // 한쪽 0.5 필요하나 5짜리뿐
  assert.equal(r.achievableKg, 20);
  assert.ok(r.leftoverKg > 0);
});

// ── 단위 변환 (SRS-003) ──────────────────────────────────────────────
test('단위: lb↔kg 왕복', () => {
  assert.ok(Math.abs(toKg(100, 'lb') - 45.359237) < 1e-6);
  assert.equal(fromKg(100, 'kg'), 100);
  assert.ok(Math.abs(fromKg(toKg(225, 'lb'), 'lb') - 225) < 1e-6);
});

test('단위: 반올림 증분 + 포맷', () => {
  assert.equal(roundToIncrement(101.3, 0.5), 101.5);
  assert.equal(formatWeight(100, 'kg'), '100kg');
  assert.equal(formatWeight(102.5, 'kg', { withUnit: false }), '102.5');
});

// ── 웰니스 카피 게이트 (ADR-006) ─────────────────────────────────────
test('웰니스: 의료 단정 표현 검출', () => {
  assert.equal(containsMedicalClaim('이 운동으로 질병을 치료할 수 있습니다'), true);
  assert.equal(containsMedicalClaim('이번 주 총 볼륨 12,400kg'), false);
});
