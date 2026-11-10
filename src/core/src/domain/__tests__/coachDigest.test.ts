// 담당 회원 점검(SPEC-050 P4) — 이번 주 월요일 0시 · 쉰 날(달력 날짜) · 3일 이상 쉰 회원이 위로(안정 정렬).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { orderByRest, restDays, weekStartMs } from '../coachDigest';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

test('weekStartMs — 그 주 월요일 0시(일요일은 앞 주 월요일)', () => {
  assert.equal(weekStartMs(at(2026, 11, 10, 15)), new Date(2026, 10, 9, 0).getTime()); // 화 → 11/9(월)
  assert.equal(weekStartMs(at(2026, 11, 9, 0)), new Date(2026, 10, 9, 0).getTime()); // 월 0시 그대로
  assert.equal(weekStartMs(at(2026, 11, 15, 23)), new Date(2026, 10, 9, 0).getTime()); // 일 → 같은 주 월요일
});

test('restDays — 오늘 0 · 어제 밤 23시도 1 · 없으면 null', () => {
  const now = at(2026, 11, 10, 9);
  assert.equal(restDays(at(2026, 11, 10, 7), now), 0);
  assert.equal(restDays(new Date(2026, 10, 9, 23, 30).getTime(), now), 1);
  assert.equal(restDays(at(2026, 11, 6), now), 4);
  assert.equal(restDays(0, now), null);
  assert.equal(restDays(at(2026, 11, 11), now), 0); // 기기 시계보다 늦은 기록 — 음수 없음
});

test('orderByRest — 3일 이상만 위로(오래 쉰 순) · 나머지는 원래 순서 · 기록 보기 꺼짐은 제자리', () => {
  const now = at(2026, 11, 10);
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const digest = new Map([
    ['a', { memberId: 'a', logView: true, lastWorkoutAt: at(2026, 11, 9) }], // 1일
    ['b', { memberId: 'b', logView: true, lastWorkoutAt: at(2026, 11, 7) }], // 3일
    ['c', { memberId: 'c', logView: false, lastWorkoutAt: at(2026, 10, 1) }], // 꺼짐
    ['d', { memberId: 'd', logView: true, lastWorkoutAt: at(2026, 11, 1) }], // 9일
    // e — 점검 없음
  ]);
  assert.deepEqual(
    orderByRest(ids, (x) => x, digest, now),
    ['d', 'b', 'a', 'c', 'e'],
  );
});
