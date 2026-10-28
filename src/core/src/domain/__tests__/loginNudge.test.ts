// 로그인 권유·로컬 띠 판정 순수 테스트 (SRS-086) — `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LOCAL_ONLY_SNOOZE_MS,
  LOGIN_NUDGE_REPEAT_MS,
  localOnlyBannerVisible,
  shouldShowLoginNudge,
} from '../loginNudge';

const NOW = 1_800_000_000_000;

test('shouldShowLoginNudge: 1번째·3번째 완료에만 권한다', () => {
  const seen = [1, 2, 3].map((n) =>
    shouldShowLoginNudge({ anonCompletedCount: n, lastShownAt: n > 1 ? NOW - 1000 : null, now: NOW }),
  );
  assert.deepEqual(seen, [true, false, true]);
});

test('shouldShowLoginNudge: 3번째 뒤로는 마지막 표시에서 7일이 지나야 다시 권한다', () => {
  assert.equal(shouldShowLoginNudge({ anonCompletedCount: 4, lastShownAt: NOW - 1000, now: NOW }), false);
  assert.equal(
    shouldShowLoginNudge({ anonCompletedCount: 9, lastShownAt: NOW - LOGIN_NUDGE_REPEAT_MS + 1, now: NOW }),
    false,
  );
  assert.equal(
    shouldShowLoginNudge({ anonCompletedCount: 9, lastShownAt: NOW - LOGIN_NUDGE_REPEAT_MS, now: NOW }),
    true,
  );
});

test('shouldShowLoginNudge: 3번째에 못 띄웠다면(표시 기록 없음) 다음 완료에 권한다', () => {
  assert.equal(shouldShowLoginNudge({ anonCompletedCount: 5, lastShownAt: null, now: NOW }), true);
});

test('shouldShowLoginNudge: 0·음수·숫자 아님은 권하지 않는다', () => {
  for (const n of [0, -1, Number.NaN]) {
    assert.equal(shouldShowLoginNudge({ anonCompletedCount: n, lastShownAt: null, now: NOW }), false);
  }
});

test('shouldShowLoginNudge: 미래로 남은 표시 시각(시계 되돌림)은 없는 것으로 본다', () => {
  assert.equal(shouldShowLoginNudge({ anonCompletedCount: 6, lastShownAt: NOW + 3600_000, now: NOW }), true);
});

test('localOnlyBannerVisible: 운동을 한 번 마친 뒤 기록 1건부터 보인다', () => {
  const base = { dismissedAt: 0, now: NOW };
  assert.equal(localOnlyBannerVisible({ ...base, pending: 0, anonCompletedCount: 1 }), false);
  assert.equal(localOnlyBannerVisible({ ...base, pending: null, anonCompletedCount: 1 }), false);
  assert.equal(localOnlyBannerVisible({ ...base, pending: 1, anonCompletedCount: 1 }), true);
});

test('localOnlyBannerVisible: 마친 운동이 없으면(첫 운동 중) 예전 기준 5건 — 판정 전부터 쓰던 기기도 띠를 본다', () => {
  const base = { dismissedAt: 0, now: NOW, anonCompletedCount: 0 };
  assert.equal(localOnlyBannerVisible({ ...base, pending: 1 }), false);
  assert.equal(localOnlyBannerVisible({ ...base, pending: 4 }), false);
  assert.equal(localOnlyBannerVisible({ ...base, pending: 5 }), true);
});

test('localOnlyBannerVisible: 「나중에」는 24시간만 접는다', () => {
  assert.equal(localOnlyBannerVisible({ pending: 3, anonCompletedCount: 1, dismissedAt: NOW - LOCAL_ONLY_SNOOZE_MS, now: NOW }), false);
  assert.equal(localOnlyBannerVisible({ pending: 3, anonCompletedCount: 1, dismissedAt: NOW - LOCAL_ONLY_SNOOZE_MS - 1, now: NOW }), true);
});
