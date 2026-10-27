// @plm SRS-067  운동 블록별 kg/lb — 표시 왕복 정밀도 · 칸별 기본 단위 · 토글(숫자 유지) 환산
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayWeight, formatEnteredWeight, toKg } from '../units';
import { pickStartUnit, planUnitSwitch } from '../blockUnit';

test('lb 로 적은 100 은 kg 로 저장돼도 다시 100lb 로 보인다(부동소수 꼬리 없음)', () => {
  const kg = toKg(100, 'lb');
  assert.equal(kg, 45.359237);
  assert.equal(displayWeight(kg, 'lb'), 100);
  assert.equal(formatEnteredWeight(kg, 'lb'), '100lb');
  // 흔한 lb 숫자 전부 — 왕복이 정확해야 한다
  for (const lb of [2.5, 5, 22.5, 45, 67.5, 102.5, 135, 225, 315, 405]) {
    assert.equal(displayWeight(toKg(lb, 'lb'), 'lb'), lb, `${lb}lb`);
  }
});

test('세트 무게 표시는 증분 반올림을 하지 않는다 — 102.5lb 는 103 이 아니다 · 41.25kg 도 그대로', () => {
  assert.equal(formatEnteredWeight(toKg(102.5, 'lb'), 'lb'), '102.5lb');
  assert.equal(formatEnteredWeight(41.25, 'kg'), '41.25kg');
  assert.equal(formatEnteredWeight(60, 'kg'), '60kg');
  assert.equal(formatEnteredWeight(0, 'lb'), '0lb');
});

const h = (variantKey: string | null, weightUnit: 'kg' | 'lb' | null, completedAt: number | null) => ({
  variantKey,
  weightUnit,
  completedAt,
});

test('기본 단위 — 같은 칸으로 가장 최근에 완료한 블록의 단위(Q1 A)', () => {
  const history = [h(null, 'kg', 100), h(null, 'lb', 200), h('hammer', 'kg', 300)];
  assert.equal(pickStartUnit(history, null, 'kg'), 'lb');
  assert.equal(pickStartUnit(history, '', 'kg'), 'lb', 'null 과 빈 키는 같은 기본 칸');
  assert.equal(pickStartUnit(history, 'hammer', 'lb'), 'kg', '다른 칸의 단위는 보지 않는다');
});

test('기본 단위 — 완료되지 않았거나 단위가 비어 있는 블록은 보지 않고, 없으면 예전 프로필 단위', () => {
  const history = [h(null, 'lb', null), h(null, null, 500)];
  assert.equal(pickStartUnit(history, null, 'kg'), 'kg');
  assert.equal(pickStartUnit([], 'cybex', 'lb'), 'lb');
  assert.equal(pickStartUnit([], null, null), 'kg');
});

test('토글(Q4 B) — 보이는 숫자를 그대로 두고 단위만 바꾼다 · 0·빈 무게는 그대로', () => {
  const sets = [
    { id: 'a', weightKg: 100 },
    { id: 'b', weightKg: 0 },
    { id: 'c', weightKg: 62.5 },
  ];
  const toLb = planUnitSwitch(sets, 'kg', 'lb');
  assert.deepEqual(
    toLb.map((s) => [s.id, displayWeight(s.weightKg, 'lb')]),
    [
      ['a', 100],
      ['c', 62.5],
    ],
    '0kg 세트는 바꿀 것이 없다',
  );
  assert.equal(toLb[0].weightKg, 45.359237);
});

test('토글을 다시 누르면 정확히 원래 kg 로 돌아온다(오조작 원복 — QA Q6)', () => {
  const sets = [{ id: 'a', weightKg: 100 }, { id: 'c', weightKg: 62.5 }];
  const lb = planUnitSwitch(sets, 'kg', 'lb');
  const back = planUnitSwitch(lb, 'lb', 'kg');
  assert.deepEqual(back, sets);
});

test('같은 단위로의 토글은 아무것도 바꾸지 않는다', () => {
  assert.deepEqual(planUnitSwitch([{ id: 'a', weightKg: 100 }], 'kg', 'kg'), []);
});

// ── /qa code 조치(2026-10-27) ── @plm SRS-067
import { enteredWeightToKg, isUserTouched, planUnitSwitchV2 } from '../blockUnit';
import { roundLoadKg } from '../prescription';
import { planBlockMultiplierResync, summarizeSlots } from '../recordSlots';
import { roundSuggestionKg } from '../units';
import { calcPlates, lbPlateInventory } from '../plateCalculator';

const roundBar = (kg: number, unit: 'kg' | 'lb') => roundLoadKg(kg, 'barbell', unit);

test('H-3: 손대지 않은 처방 70kg 은 lb 토글 뒤에도 실제 무게 그대로(원판 5lb 단위) — 70lb 가 되지 않는다', () => {
  const plan = planUnitSwitchV2([{ id: 'rx', weightKg: 70, touched: false }], 'kg', 'lb', roundBar);
  assert.equal(plan.length, 1);
  assert.equal(displayWeight(plan[0].weightKg, 'lb'), 155); // 154.32lb → 155lb
  assert.ok(Math.abs(plan[0].weightKg - 70) < 1.2, '실제 하중이 거의 같다');
  // 옛 판(Q4 B 전 세트)은 70lb(31.75kg)를 만들었다 — 회귀 방지
  assert.equal(planUnitSwitch([{ id: 'rx', weightKg: 70 }], 'kg', 'lb')[0].weightKg, toKg(70, 'lb'));
});

test('H-3: 사람이 적었거나 완료한 세트는 Q4 B — 숫자 그대로·단위만 · 다시 누르면 원래대로', () => {
  const sets = [
    { id: 'a', weightKg: 100, touched: true },
    { id: 'b', weightKg: 0, touched: true },
  ];
  const toLb = planUnitSwitchV2(sets, 'kg', 'lb', roundBar);
  assert.deepEqual(toLb.map((x) => x.id), ['a']);
  assert.equal(displayWeight(toLb[0].weightKg, 'lb'), 100);
  const back = planUnitSwitchV2([{ id: 'a', weightKg: toLb[0].weightKg, touched: true }], 'lb', 'kg', roundBar);
  assert.equal(back[0].weightKg, 100);
});

test('H-3: 이미 새 단위 원판에 맞는 자동 채움은 다시 쓰지 않는다(바꿀 것이 없다)', () => {
  const kg = toKg(135, 'lb');
  assert.deepEqual(planUnitSwitchV2([{ id: 'x', weightKg: kg, touched: false }], 'kg', 'lb', roundBar), []);
});

test('H-3: 사람이 고친 세트 판정 — v25 user_edited 우선 · 옛 세트는 updated_at · 완료는 늘 사람', () => {
  assert.equal(isUserTouched({ done: false, userEdited: false, updatedAt: 2, createdAt: 1 }), false); // 시스템 환산이 updated_at 을 바꿔도
  assert.equal(isUserTouched({ done: false, userEdited: true, updatedAt: 1, createdAt: 1 }), true);
  assert.equal(isUserTouched({ done: true, userEdited: false }), true);
  assert.equal(isUserTouched({ done: false, userEdited: null, updatedAt: 2, createdAt: 1 }), true);
  assert.equal(isUserTouched({ done: false, userEdited: null, updatedAt: 1, createdAt: 1 }), false);
});

test('M-1: 보이던 숫자 그대로 떠나면 저장 kg 를 바꾸지 않는다 — lb 블록의 kg 유래 60 이 60.0012 가 되지 않는다', () => {
  const shown = displayWeight(60, 'lb'); // 132.28
  assert.notEqual(toKg(shown, 'lb'), 60); // 옛 판은 이 값을 썼다(거짓 PR)
  assert.equal(enteredWeightToKg(shown, 'lb', 60), null);
  assert.equal(enteredWeightToKg(45.36, 'kg', toKg(100, 'lb')), null); // kg 블록의 lb 유래
  assert.equal(enteredWeightToKg(135, 'lb', 60), toKg(135, 'lb')); // 진짜로 고치면 쓴다
  assert.equal(enteredWeightToKg(Number.NaN, 'kg', 60), null);
});

test('H-3 원칙: 한쪽 입력 환산은 사람이 이미 적은 안 한 세트를 덮지 않는다(배수만 바꾼다)', () => {
  const plan = planBlockMultiplierResync(
    [
      { id: 'auto', done: false, weightKg: 20, loadMultiplier: 1, touched: false },
      { id: 'typed', done: false, weightKg: 40, loadMultiplier: 1, touched: true },
      { id: 'done', done: true, weightKg: 60, loadMultiplier: 1, touched: true },
    ],
    2,
  );
  assert.deepEqual(plan, [
    { id: 'auto', weightKg: 10, loadMultiplier: 2 },
    { id: 'typed', weightKg: 40, loadMultiplier: 2 },
  ]);
});

test('M-2: 제안 무게는 블록 단위 증분 — lb 에 89.95 대신 90', () => {
  const kg = toKg(89.95, 'lb');
  assert.equal(displayWeight(roundSuggestionKg(kg, 'lb'), 'lb'), 90);
  assert.equal(roundSuggestionKg(61.2, 'kg'), 61);
  assert.equal(roundSuggestionKg(0, 'kg'), 0);
});

test('M-2: lb 블록 원판 계산 — 45lb 봉 + 한쪽 45·25 = 185lb', () => {
  const bd = calcPlates(toKg(185, 'lb'), lbPlateInventory());
  assert.deepEqual(
    bd.perSide.map((p) => [displayWeight(p.plateKg, 'lb'), p.count]),
    [[45, 1], [25, 1]],
  );
  assert.ok(bd.leftoverKg < 0.01);
});

test('M-2: 칸 시트 — 그 칸 마지막 블록에 적은 단위를 싣는다', () => {
  const [s] = summarizeSlots([
    { variantKey: 'equip:hammer', completedAt: 1, weightUnit: 'lb', sets: [{ weightKg: toKg(100, 'lb'), reps: 8, isWarmup: false, isFailed: false }] },
  ]);
  assert.equal(s.weightUnit, 'lb');
  assert.equal(formatEnteredWeight(s.lastSets[0].weightKg, 'lb'), '100lb');
});
