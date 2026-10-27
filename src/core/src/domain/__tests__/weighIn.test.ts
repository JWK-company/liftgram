// @plm SRS-077  운동 전 체중 체크인 판정·숫자 왕복 — `bun run test:core`
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isFutureMeasuredAt, stepBodyweightKg, weeklyRateDaysNeeded } from '../bodyweight';
import { toKg } from '../units';
import {
  WEIGH_IN_WINDOW_MS,
  bodyweightUnitOf,
  enteredBodyweightToKg,
  formatBodyweight,
  isLargeBodyweightJump,
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

test('표시 단위 — 늘 kg(SRS-067 · 예전 프로필 단위가 lb 여도 · qa P3-3)', () => {
  // [원본] assert.equal(bodyweightUnitOf('lb'), 'lb');
  assert.equal(bodyweightUnitOf('lb'), 'kg');
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

test('직접 입력 오타 방지 — 하한 20kg · 지난 값 ±30% 넘으면 확인(qa P3-6)', () => {
  assert.equal(enteredBodyweightToKg(7, 'kg', 72), null); // 「72」를 치다 「7」
  assert.equal(enteredBodyweightToKg(19.9, 'kg', 72), null);
  assert.equal(enteredBodyweightToKg(20, 'kg', 72), 20);
  assert.equal(isLargeBodyweightJump(100, 72), true);
  assert.equal(isLargeBodyweightJump(50, 72), true);
  assert.equal(isLargeBodyweightJump(80, 72), false);
  assert.equal(isLargeBodyweightJump(93.6, 72), false); // 정확히 30% 는 확인 안 함
  assert.equal(isLargeBodyweightJump(100, null), false);
  assert.equal(isLargeBodyweightJump(100, 0), false);
});

test('미래 측정 시각 — 1분 넘게 뒤면 미래(qa P3-1)', () => {
  assert.equal(isFutureMeasuredAt(NOW + 30_000, NOW), false);
  assert.equal(isFutureMeasuredAt(NOW + 60_001, NOW), true);
  assert.equal(isFutureMeasuredAt(NOW - 86_400_000, NOW), false);
});

test('주간 변화까지 남은 날 수 — 최근 28일 안의 서로 다른 날로 센다(qa P3-12 ⓑ)', () => {
  const D = 86_400_000;
  const log = (id: string, at: number, kg = 72) => ({ id, measuredAt: at, weightKg: kg, updatedAt: 0 });
  assert.equal(weeklyRateDaysNeeded([], NOW), 3);
  assert.equal(weeklyRateDaysNeeded([log('a', NOW - 60 * D), log('b', NOW)], NOW), 2); // 60일 전은 창 밖
  assert.equal(weeklyRateDaysNeeded([log('a', NOW - 5 * D), log('b', NOW)], NOW), 1);
  assert.equal(weeklyRateDaysNeeded([log('a', NOW - 1000), log('b', NOW)], NOW), 2); // 같은 날 두 번 = 하루
  assert.equal(weeklyRateDaysNeeded([log('a', NOW - 9 * D), log('b', NOW - 5 * D), log('c', NOW)], NOW), 0);
  assert.equal(weeklyRateDaysNeeded([log('a', NOW - 5 * D, 0), log('b', NOW)], NOW), 2); // 표식(0)은 안 셈
});
