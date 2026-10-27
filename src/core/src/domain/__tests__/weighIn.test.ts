// @plm SRS-077  운동 전 체중 체크인 판정·숫자 왕복 — `bun run test:core`
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stepBodyweightKg } from '../bodyweight';
import { toKg } from '../units';
import {
  WEIGH_IN_WINDOW_MS,
  bodyweightUnitOf,
  enteredBodyweightToKg,
  formatBodyweight,
  hasLogOnLocalDay,
  localDayRange,
  shouldOfferWeighIn,
  shownBodyweight,
  weighInMarkKey,
  weighInStartKg,
} from '../weighIn';

const NOW = new Date(2026, 9, 27, 18, 30).getTime(); // 로컬 18:30
const base = { enabled: true, doneSets: 0, startedAt: NOW - 60_000, now: NOW, loggedToday: false, marked: false };

test('띄우는 조건 — 켬 · 완료 세트 0 · 10분 안 · 오늘 기록 없음 · 표시 없음', () => {
  assert.equal(shouldOfferWeighIn(base), true);
  assert.equal(shouldOfferWeighIn({ ...base, enabled: false }), false);
  assert.equal(shouldOfferWeighIn({ ...base, doneSets: 1 }), false);
  assert.equal(shouldOfferWeighIn({ ...base, loggedToday: true }), false);
  assert.equal(shouldOfferWeighIn({ ...base, marked: true }), false);
  assert.equal(shouldOfferWeighIn({ ...base, startedAt: NOW - WEIGH_IN_WINDOW_MS }), true); // 경계 포함
  assert.equal(shouldOfferWeighIn({ ...base, startedAt: NOW - WEIGH_IN_WINDOW_MS - 1 }), false);
  assert.equal(shouldOfferWeighIn({ ...base, startedAt: NOW + 30_000 }), true); // 시계 차이 조금
  assert.equal(shouldOfferWeighIn({ ...base, startedAt: NOW + 5 * 60_000 }), false);
  assert.equal(shouldOfferWeighIn({ ...base, startedAt: Number.NaN }), false);
});

test('오늘 기록 — 로컬 날짜 · 표식(0)·깨진 행은 세지 않는다', () => {
  const { startMs, endMs } = localDayRange(NOW);
  assert.equal(new Date(startMs).getHours(), 0);
  assert.equal(new Date(endMs).getDate(), 28);
  const row = (measuredAt: number | null, weightKg: number | null) => ({ id: String(measuredAt), measuredAt, weightKg, updatedAt: 1 });
  assert.equal(hasLogOnLocalDay([row(startMs, 75)], NOW), true);
  assert.equal(hasLogOnLocalDay([row(startMs - 1, 75)], NOW), false); // 어제 23:59
  assert.equal(hasLogOnLocalDay([row(endMs, 75)], NOW), false); // 내일 0시
  assert.equal(hasLogOnLocalDay([row(NOW, 0)], NOW), false); // 설정 안 함 표식
  assert.equal(hasLogOnLocalDay([row(null, 75), row(NOW, null)], NOW), false);
  assert.equal(hasLogOnLocalDay([], NOW), false);
});

test('표시 단위 — 예전 프로필 단위가 lb 일 때만 lb', () => {
  assert.equal(bodyweightUnitOf('lb'), 'lb');
  assert.equal(bodyweightUnitOf('kg'), 'kg');
  assert.equal(bodyweightUnitOf(null), 'kg');
  assert.equal(bodyweightUnitOf(undefined), 'kg');
  assert.equal(weighInMarkKey('w1'), 'weighin:w1');
});

test('lb↔kg 왕복 — 보이던 숫자 그대로면 저장 kg 원값(U-8)', () => {
  // 75kg 는 lb 로 165.3 으로 보인다. 165.3lb 를 kg 로 바꾸면 74.98 — 그대로 저장하면 안 된다.
  assert.equal(shownBodyweight(75, 'lb'), 165.3);
  assert.equal(formatBodyweight(75, 'lb'), '165.3');
  assert.notEqual(toKg(165.3, 'lb'), 75);
  assert.equal(enteredBodyweightToKg(165.3, 'lb', 75), 75);
  assert.equal(enteredBodyweightToKg(165.32, 'lb', 75), 75); // 소수 둘째 자리는 반올림
  assert.equal(enteredBodyweightToKg(75, 'kg', 75), 75);
  assert.equal(enteredBodyweightToKg(166, 'lb', 75), toKg(166, 'lb')); // 진짜로 고치면 그 값
  assert.equal(enteredBodyweightToKg(74.4, 'kg', 75), 74.4);
  assert.equal(enteredBodyweightToKg(0, 'kg', 75), null);
  assert.equal(enteredBodyweightToKg(-3, 'kg', 75), null);
  assert.equal(enteredBodyweightToKg(Number.NaN, 'kg', 75), null);
  assert.equal(enteredBodyweightToKg(301, 'kg', 75), null);
  assert.equal(enteredBodyweightToKg(80, 'kg', null), 80);
});

test('± 스텝 뒤에는 보이는 숫자가 정확히 저장된다(lb 스텝 0.2·1·2)', () => {
  let kg = 75; // 165.3lb
  kg = stepBodyweightKg(kg, 0.2, 'lb');
  assert.equal(shownBodyweight(kg, 'lb'), 165.5);
  assert.equal(enteredBodyweightToKg(165.5, 'lb', kg), kg); // 스텝 뒤 다시 보이던 숫자 = 그 kg
  kg = stepBodyweightKg(kg, -2, 'lb');
  assert.equal(shownBodyweight(kg, 'lb'), 163.5);
  let k2 = 72.3;
  k2 = stepBodyweightKg(k2, -0.1, 'kg');
  assert.equal(shownBodyweight(k2, 'kg'), 72.2);
});

test('지난 값이 없으면 출발값 70kg · 155lb', () => {
  assert.equal(weighInStartKg(null, 'kg'), 70);
  assert.equal(shownBodyweight(weighInStartKg(null, 'lb'), 'lb'), 155);
  assert.equal(weighInStartKg(81.2, 'lb'), 81.2);
  assert.equal(weighInStartKg(0, 'kg'), 70);
});
