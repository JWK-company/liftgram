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
