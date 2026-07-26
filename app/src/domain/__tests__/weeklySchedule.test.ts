// 주단위 스케줄·블록 순수 테스트 (SRS-044) — `npm test`. @plm SRS-044
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sanitizeWeeklySchedule, todayPlan, currentBlockWeek, missedCatchUp } from '../weeklySchedule';

const WEEK = 7 * 24 * 60 * 60 * 1000;
// 2026-07-20은 월요일(로컬 자정 기준).
const MON = new Date(2026, 6, 20, 9, 0, 0).getTime();

test('sanitizeWeeklySchedule: 길이 7 보정·불량 항목 무해화·빈 스케줄은 null', () => {
  const s = sanitizeWeeklySchedule({ days: ['r1', 'rest', 42, '', null], blockWeeks: 5, blockStartAt: MON });
  assert.equal(s?.days.length, 7);
  assert.equal(s?.days[0], 'r1');
  assert.equal(s?.days[1], 'rest');
  assert.equal(s?.days[2], null); // 숫자 → null
  assert.equal(s?.days[3], null); // 빈 문자열 → null
  assert.equal(s?.days[6], null); // 부족분 채움
  assert.equal(s?.blockWeeks, 5);
  assert.equal(sanitizeWeeklySchedule({ days: [], blockWeeks: null }), null);
  assert.equal(sanitizeWeeklySchedule('x'), null);
  assert.equal(sanitizeWeeklySchedule(null), null);
});

test('todayPlan: 월=0 요일 매핑(일요일 경계 포함)', () => {
  const s = sanitizeWeeklySchedule({ days: ['a', null, 'rest', null, null, null, 'g'], blockWeeks: null });
  assert.deepEqual(todayPlan(s, MON), { kind: 'routine', routineId: 'a' }); // 월
  assert.deepEqual(todayPlan(s, MON + 2 * 24 * 3600 * 1000), { kind: 'rest' }); // 수
  assert.deepEqual(todayPlan(s, MON + 6 * 24 * 3600 * 1000), { kind: 'routine', routineId: 'g' }); // 일(getDay=0 → idx 6)
  assert.deepEqual(todayPlan(s, MON + 24 * 3600 * 1000), { kind: 'none' }); // 화(미배정)
  assert.deepEqual(todayPlan(null, MON), { kind: 'none' });
});

test('currentBlockWeek: 5+1 사이클 — 1~5주 운동, 6주차 디로딩, 7주차에 1주차로 롤오버', () => {
  const s = sanitizeWeeklySchedule({ days: ['a'], blockWeeks: 5, blockStartAt: MON });
  assert.deepEqual(currentBlockWeek(s, MON), { week: 1, cycleWeeks: 6, isDeload: false });
  assert.deepEqual(currentBlockWeek(s, MON + 4 * WEEK), { week: 5, cycleWeeks: 6, isDeload: false });
  assert.deepEqual(currentBlockWeek(s, MON + 5 * WEEK), { week: 6, cycleWeeks: 6, isDeload: true });
  assert.deepEqual(currentBlockWeek(s, MON + 6 * WEEK), { week: 1, cycleWeeks: 6, isDeload: false }); // 롤오버
});

test('currentBlockWeek: 블록 미설정·시작 전·불량은 null', () => {
  const noBlock = sanitizeWeeklySchedule({ days: ['a'], blockWeeks: null });
  assert.equal(currentBlockWeek(noBlock, MON), null);
  const s = sanitizeWeeklySchedule({ days: ['a'], blockWeeks: 4, blockStartAt: MON });
  assert.equal(currentBlockWeek(s, MON - 1000), null); // 시작 전
  assert.equal(currentBlockWeek(null, MON), null);
});

// ── missedCatchUp — 놓친 루틴 캐치업 (두 카드 UX) ────────────────────
const DAY = 24 * 3600 * 1000;
const dayNumOf = (ms: number) => {
  const d = new Date(ms);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
};

test('missedCatchUp: 어제(배정일) 완료 0건 → 어제 루틴을 캐치업', () => {
  // 월 a · 화 b · 수 c. 오늘=수. 화요일 완료 없음.
  const s = sanitizeWeeklySchedule({ days: ['a', 'b', 'c'], blockWeeks: null });
  const wed = MON + 2 * DAY;
  const done = new Set([dayNumOf(MON)]); // 월요일만 수행
  assert.deepEqual(missedCatchUp(s, done, wed), { routineId: 'b', dayIdx: 1, daysAgo: 1 });
});

test('missedCatchUp: 어제 무엇이든 완료했으면(대체 수행 포함) null', () => {
  const s = sanitizeWeeklySchedule({ days: ['a', 'b', 'c'], blockWeeks: null });
  const wed = MON + 2 * DAY;
  const done = new Set([dayNumOf(MON + DAY)]); // 화요일 수행(어떤 루틴이든)
  assert.equal(missedCatchUp(s, done, wed), null);
});

test('missedCatchUp: 휴식·미배정일은 건너뛰고 가장 최근 배정일만 본다', () => {
  // 월 a · 화 rest · 수 미배정 · 목=오늘. 월요일을 놓침 → daysAgo 3.
  const s = sanitizeWeeklySchedule({ days: ['a', 'rest', null], blockWeeks: null });
  const thu = MON + 3 * DAY;
  assert.deepEqual(missedCatchUp(s, new Set<number>(), thu), { routineId: 'a', dayIdx: 0, daysAgo: 3 });
});

test('missedCatchUp: 가장 최근 배정일을 수행했으면 그 전에 놓친 날이 있어도 null(최근 1건만)', () => {
  // 월 a · 화 b. 오늘=수. 화(b) 수행·월(a) 놓침 → 캐치업 없음.
  const s = sanitizeWeeklySchedule({ days: ['a', 'b'], blockWeeks: null });
  const wed = MON + 2 * DAY;
  const done = new Set([dayNumOf(MON + DAY)]);
  assert.equal(missedCatchUp(s, done, wed), null);
});

test('missedCatchUp: 스케줄 없음·6일 내 배정일 없음 → null', () => {
  assert.equal(missedCatchUp(null, new Set<number>(), MON), null);
  const restOnly = sanitizeWeeklySchedule({ days: ['rest', 'rest', 'rest', 'rest', 'rest', 'rest', 'rest'], blockWeeks: null });
  assert.equal(missedCatchUp(restOnly, new Set<number>(), MON + 3 * DAY), null);
});
