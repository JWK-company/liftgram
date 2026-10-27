// @plm SRS-057 SRS-058  기록 칸(조합) 규칙 — 조합별 분리 · 지난 조합 승계 · 플레이트 한쪽 입력(ADR-034 · ADR-037)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalVariantKey, normalizeVariantDimsV34, parseVariantKey } from '../variants';
import {
  pickRecentBrands,
  blockLoadMultiplier,
  carryWeightAcrossMultiplier,
  pickStartSlot,
  summarizeSlots,
  type SlotSession,
} from '../recordSlots';
import { setVolumeKg, totalVolumeKg } from '../volume';
import { snapshotFromSets } from '../personalRecords';
import type { LoggedSet } from '../types';

const set = (weightKg: number, reps: number, extra: Partial<LoggedSet> = {}): LoggedSet => ({
  weightKg,
  reps,
  rpe: null,
  isWarmup: false,
  isFailed: false,
  ...extra,
});

const pushdown = { baseEquipment: 'cable', attachments: ['rope', 'straight', 'v', 'ez', 'single'], grips: [], load: false };
const chestPress = { baseEquipment: 'machine', attachments: [], grips: ['wide', 'close', 'neutral'], load: true };

test('조합 분리 — 같은 종목의 로프/일자바, 핀/플레이트, 그립은 서로 다른 칸이다', () => {
  const rope = canonicalVariantKey(normalizeVariantDimsV34({ attach: 'rope' }, pushdown));
  const straight = canonicalVariantKey(normalizeVariantDimsV34({ attach: 'straight' }, pushdown));
  assert.equal(rope, 'attach:rope');
  assert.equal(straight, 'attach:straight');
  assert.notEqual(rope, straight);

  const pin = canonicalVariantKey(normalizeVariantDimsV34({ equipment: 'hammer', load: 'pin' }, chestPress));
  const plate = canonicalVariantKey(normalizeVariantDimsV34({ equipment: 'hammer', load: 'plate' }, chestPress));
  assert.equal(pin, 'equip:hammer|load:pin');
  assert.equal(plate, 'equip:hammer|load:plate');

  const wide = canonicalVariantKey(normalizeVariantDimsV34({ grip: 'wide' }, chestPress));
  const close = canonicalVariantKey(normalizeVariantDimsV34({ grip: 'close' }, chestPress));
  assert.notEqual(wide, close);
  // 옛 키(축 없음) = 기본 칸
  assert.equal(canonicalVariantKey(normalizeVariantDimsV34({}, chestPress)), null);
});

test('허용 목록 밖 축은 지운다 — 케이블 아닌 종목의 부착물·머신 아닌 종목의 적재 방식', () => {
  assert.equal(canonicalVariantKey(normalizeVariantDimsV34({ load: 'plate' }, pushdown)), null);
  assert.equal(canonicalVariantKey(normalizeVariantDimsV34({ attach: 'rope' }, chestPress)), null);
  // 허용 목록 밖 부착물(vulcan 은 이 family 에 없다)
  assert.equal(canonicalVariantKey(normalizeVariantDimsV34({ attach: 'mag_wide' }, pushdown)), null);
});

test('조합별 기록 요약 — 칸마다 따로 모이고 최근 칸이 먼저 · PR 도 칸별', () => {
  const sessions: SlotSession[] = [
    { variantKey: 'attach:rope', completedAt: 100, sets: [set(30, 12), set(30, 10)] },
    { variantKey: 'attach:straight', completedAt: 200, sets: [set(40, 10)] },
    { variantKey: 'attach:rope', completedAt: 300, sets: [set(32.5, 10), set(25, 15, { isWarmup: true })] },
  ];
  const out = summarizeSlots(sessions);
  assert.equal(out.length, 2);
  assert.equal(out[0].variantKey, 'attach:rope'); // 최근(300)
  assert.equal(out[0].sessions, 2);
  assert.deepEqual(out[0].lastSets, [{ weightKg: 32.5, reps: 10, loadMultiplier: null }]); // 워밍업 제외
  assert.deepEqual(out[0].best, { weightKg: 32.5, reps: 10 });
  assert.deepEqual(out[1].best, { weightKg: 40, reps: 10 }); // 일자바 PR 은 로프와 섞이지 않는다
});

test('지난 조합 승계 — 명시 칸이 우선, 없으면 지난번 수행 조합, 그것도 없으면 기본', () => {
  const none = { variantKey: null, variantAttach: null };
  const rope = { variantKey: 'attach:rope', variantAttach: 'rope' };
  const straight = { variantKey: 'attach:straight', variantAttach: 'straight' };
  assert.deepEqual(pickStartSlot(none, rope), rope); // 지난번 로프 → 이번도 로프
  assert.deepEqual(pickStartSlot(straight, rope), straight); // 루틴이 일자바로 정했으면 일자바
  assert.deepEqual(pickStartSlot(none, null), none); // 처음 하는 종목 → 기본
});

test('플레이트 한쪽 입력 — 플레이트 칸 + 켜짐일 때만 배수 2', () => {
  assert.equal(blockLoadMultiplier({ load: 'plate' }, true), 2);
  assert.equal(blockLoadMultiplier({ load: 'plate' }, false), null);
  assert.equal(blockLoadMultiplier({ load: 'pin' }, true), null); // 핀로드에는 없다
  assert.equal(blockLoadMultiplier({}, true), null);
  assert.equal(blockLoadMultiplier(parseVariantKey('equip:hammer|load:plate'), true), 2);
});

test('한쪽 입력 볼륨·PR — 입력 40kg(한쪽) × 10회 = 계산 80kg, 볼륨 800', () => {
  const oneSide = set(40, 10, { loadMultiplier: 2 });
  assert.equal(setVolumeKg(oneSide), 800);
  assert.equal(totalVolumeKg([oneSide, set(40, 8, { loadMultiplier: 2 })]), 1440);
  assert.equal(snapshotFromSets([oneSide]).maxWeightKg, 80);
  // 양쪽 합 80 으로 적은 지난 세트와 같은 무게로 비교된다 — PR 이 칸 안에서 이어진다
  assert.equal(snapshotFromSets([set(80, 10)]).maxWeightKg, snapshotFromSets([oneSide]).maxWeightKg);
  // 배수 null = 1(QA B1 — 옛 세트 볼륨이 0 이 되지 않는다)
  assert.equal(setVolumeKg(set(80, 10, { loadMultiplier: null })), 800);
});

test('지난 세트 프리필 환산 — 양쪽 합 80 → 한쪽 입력이면 40, 그 반대도', () => {
  assert.equal(carryWeightAcrossMultiplier(80, null, 2), 40);
  assert.equal(carryWeightAcrossMultiplier(40, 2, null), 80);
  assert.equal(carryWeightAcrossMultiplier(42.5, 2, 2), 42.5);
  assert.equal(carryWeightAcrossMultiplier(25, 1, 2), 12.5);
});

// ── /qa code M-1 — 운동 도중 한쪽 입력을 켜도 이미 한 세트의 무게 의미는 그대로 ──────────────
test('배수 재조정(M-1): 완료한 세트는 그대로, 안 한 세트만 새 배수로 옮기고 계산 무게가 같게 환산한다', async () => {
  const { planBlockMultiplierResync } = await import('../recordSlots');
  const sets = [
    { id: 'a', done: true, weightKg: 100, loadMultiplier: null },
    { id: 'b', done: true, weightKg: 100, loadMultiplier: null },
    { id: 'c', done: false, weightKg: 100, loadMultiplier: null },
    { id: 'd', done: null, weightKg: 100, loadMultiplier: null }, // 옛 세트(done 미기록) = 수행한 것으로 본다
  ];
  const plan = planBlockMultiplierResync(sets, 2);
  assert.deepEqual(plan, [{ id: 'c', weightKg: 50, loadMultiplier: 2 }]);
});

test('배수 재조정(M-1): 끄면(2 → null) 안 한 세트의 한쪽 40 이 양쪽 80 이 된다 · 같은 배수면 아무것도 안 한다', async () => {
  const { planBlockMultiplierResync } = await import('../recordSlots');
  assert.deepEqual(planBlockMultiplierResync([{ id: 'x', done: false, weightKg: 40, loadMultiplier: 2 }], null), [
    { id: 'x', weightKg: 80, loadMultiplier: null },
  ]);
  assert.deepEqual(planBlockMultiplierResync([{ id: 'y', done: false, weightKg: 40, loadMultiplier: 2 }], 2), []);
});

// 화면 정리 D9 — 칸 시트 「최근 쓴 브랜드」 @plm SRS-071
test('최근 쓴 브랜드 — 최신순·중복 제거·허용 목록 밖 건너뜀·최대 3개', () => {
  const allowed = ['hammer', 'technogym', 'cybex', 'matrix', 'custom1'];
  assert.deepEqual(
    pickRecentBrands(['technogym', null, 'technogym', 'dumbbell', 'hammer', 'custom1', 'cybex'], allowed),
    ['technogym', 'hammer', 'custom1'],
  );
  assert.deepEqual(pickRecentBrands([], allowed), []);
  assert.deepEqual(pickRecentBrands(['matrix'], allowed, 1), ['matrix']);
});
