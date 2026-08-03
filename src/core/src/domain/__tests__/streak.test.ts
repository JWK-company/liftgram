// 스트릭·주간목표 순수 도메인 테스트 — `npm test` (node --import tsx --test). RN 불필요.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dayNumber, computeStreak, weeklyProgress } from '../streak';

// 로컬 날짜 부품으로 ms 구성 → 러너 타임존과 무관하게 결정적.
const d = (y: number, m: number, day: number) => dayNumber(new Date(y, m, day).getTime());

test('dayNumber: 연속 로컬 날짜는 연속 정수(월/연 경계 포함)', () => {
  assert.equal(d(2026, 6, 16) - d(2026, 6, 15), 1);
  assert.equal(d(2026, 6, 2) - d(2026, 5, 30), 2); // 6/30 → 7/2 (월 경계 2일)
  assert.equal(d(2027, 0, 1) - d(2026, 11, 31), 1); // 연말 경계
});

test('dayNumber: 같은 날 다른 시각은 동일 번호', () => {
  assert.equal(dayNumber(new Date(2026, 6, 15, 6, 0).getTime()), dayNumber(new Date(2026, 6, 15, 23, 30).getTime()));
});

test('computeStreak: 기록 없으면 0/0', () => {
  assert.deepEqual(computeStreak([], 1000), { current: 0, longest: 0 });
});

test('computeStreak: 오늘 포함 연속 3일', () => {
  const t = 1000;
  assert.deepEqual(computeStreak([t, t - 1, t - 2], t), { current: 3, longest: 3 });
});

test('computeStreak: 오늘 안 했어도 어제까지면 유지', () => {
  const t = 1000;
  assert.equal(computeStreak([t - 1, t - 2], t).current, 2);
});

test('computeStreak: 이틀 비면 현재 0(최장은 보존)', () => {
  const t = 1000;
  const s = computeStreak([t - 2, t - 3, t - 4], t); // 가장 최근이 그저께
  assert.equal(s.current, 0);
  assert.equal(s.longest, 3);
});

test('computeStreak: 중복 날짜는 한 번만', () => {
  const t = 1000;
  assert.equal(computeStreak([t, t, t - 1], t).current, 2);
});

test('computeStreak: 최장은 과거 최대 연속(현재와 분리)', () => {
  const t = 1000;
  const days = [t, t - 1, t - 6, t - 7, t - 8, t - 9, t - 10]; // 현재 2연속, 과거 5연속
  const s = computeStreak(days, t);
  assert.equal(s.current, 2);
  assert.equal(s.longest, 5);
});

// 주말 제외 스트릭 — 2026-07-12는 일요일이므로 07-10=금, 07-11=토, 07-13=월, 07-14=화, 07-09=목.
const thu = d(2026, 6, 9);
const fri = d(2026, 6, 10);
const sat = d(2026, 6, 11);
const mon = d(2026, 6, 13);
const tue = d(2026, 6, 14);

test('skipWeekends=true: 금까지 운동·오늘 월 → 스트릭 유지(주말 공백 무시)', () => {
  assert.equal(computeStreak([thu, fri], mon, true).current, 2);
});

test('skipWeekends=false(기본): 금 다음 오늘 월 → 토요일에서 끊김', () => {
  assert.equal(computeStreak([thu, fri], mon, false).current, 0);
});

test('skipWeekends=true: 평일(월)이 비면 끊김', () => {
  // 금 운동, 오늘 화 → 사이 월(평일) 비어서 끊김
  assert.equal(computeStreak([fri], tue, true).current, 0);
});

test('skipWeekends: 최장도 주말 건너뜀 반영', () => {
  assert.equal(computeStreak([fri, mon], mon, true).longest, 2);
  assert.equal(computeStreak([fri, mon], mon, false).longest, 1);
});

test('skipWeekends=true: 주말 운동도 정상 카운트', () => {
  // 금·토·(일 쉼)·월 → 연속 3
  assert.equal(computeStreak([fri, sat, mon], mon, true).current, 3);
});

test('weeklyProgress: 이번 주 고유 일수만·지난주 제외·목표 달성', () => {
  const anyDay = d(2026, 6, 15);
  const dow = new Date(anyDay * 86400000).getUTCDay();
  const weekStart = anyDay - ((dow + 6) % 7); // 월요일
  const today = weekStart + 6; // 그 주 일요일 → 주 전체가 과거
  const days = [weekStart, weekStart, weekStart + 1, weekStart + 2, weekStart - 1]; // 마지막=지난주 일요일
  const w = weeklyProgress(days, today, 3);
  assert.equal(w.done, 3); // weekStart, +1, +2 (중복 제거, 지난주 제외)
  assert.equal(w.reached, true);
});

test('weeklyProgress: 목표 미달 시 reached=false', () => {
  const anyDay = d(2026, 6, 15);
  const dow = new Date(anyDay * 86400000).getUTCDay();
  const weekStart = anyDay - ((dow + 6) % 7);
  const today = weekStart + 6;
  const w = weeklyProgress([weekStart, weekStart + 1], today, 4);
  assert.equal(w.done, 2);
  assert.equal(w.reached, false);
});
