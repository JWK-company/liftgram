// 동기 멈춤 판정·기기 건강 보고 시점 순수 테스트 (SRS-088) — `npm test`.
// 멈춤 경계 표는 backend/internal/ops/service_test.go TestIsStalled_경계표 와 **같은 줄**이다(qa spec H-1).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HEALTH_REPORT_THROTTLE_MS,
  ageMs,
  attemptFinished,
  isBackupStalled,
  shouldReportHealth,
  type SyncHealthLike,
} from '../syncStall';

const NOW = 1_800_000_000_000;
const H = 3600_000;
const base: SyncHealthLike = {
  lastSuccessAt: null,
  lastAttemptAt: null,
  lastError: null,
  consecutiveFailures: 0,
  pending: null,
  blocked: false,
};
const h = (p: Partial<SyncHealthLike>): SyncHealthLike => ({ ...base, ...p });

test('isBackupStalled: Go 와 같은 경계 표', () => {
  const rows: [string, SyncHealthLike, boolean][] = [
    ['미동기 0 이면 아니다', h({ pending: 0, blocked: true, consecutiveFailures: 9 }), false],
    ['미동기 모름이면 아니다', h({ pending: null, blocked: true }), false],
    ['blocked', h({ pending: 1, blocked: true }), true],
    ['연속 실패 3', h({ pending: 1, consecutiveFailures: 3, lastSuccessAt: NOW - 60_000 }), true],
    ['연속 실패 2·최근 성공', h({ pending: 1, consecutiveFailures: 2, lastSuccessAt: NOW - H, lastAttemptAt: NOW }), false],
    ['23h59m 전 성공·실패 1', h({ pending: 1, consecutiveFailures: 1, lastSuccessAt: NOW - (23 * H + 59 * 60_000), lastAttemptAt: NOW }), false],
    ['24h1m 전 성공·실패 1', h({ pending: 1, consecutiveFailures: 1, lastSuccessAt: NOW - (24 * H + 60_000), lastAttemptAt: NOW }), true],
    ['24h1m 전 성공·실패 0(방금 시도 중)', h({ pending: 1, lastSuccessAt: NOW - (24 * H + 60_000), lastAttemptAt: NOW }), false],
    ['성공 없음·시도 없음은 제외', h({ pending: 5, consecutiveFailures: 1 }), false],
    ['성공 없음·시도 있음·실패 1', h({ pending: 5, consecutiveFailures: 1, lastAttemptAt: NOW }), true],
  ];
  for (const [name, input, want] of rows) assert.equal(isBackupStalled(input, NOW), want, name);
});

test('attemptFinished: 시작(lastAttemptAt 만)·미동기 수 갱신은 끝이 아니다', () => {
  const prev = h({ lastSuccessAt: NOW - H, pending: 2 });
  assert.equal(attemptFinished(prev, { ...prev, lastAttemptAt: NOW }), false);
  assert.equal(attemptFinished(prev, { ...prev, pending: 0 }), false);
  assert.equal(attemptFinished(prev, { ...prev, lastSuccessAt: NOW }), true);
  assert.equal(attemptFinished(prev, { ...prev, consecutiveFailures: 1, lastError: 'x' }), true);
  // 같은 횟수로 이어진 실패도 오류 문구가 바뀌면 끝난 시도다.
  const f = h({ consecutiveFailures: 2, lastError: 'a' });
  assert.equal(attemptFinished(f, { ...f, lastError: 'b' }), true);
});

test('shouldReportHealth: 보낸 적 없으면 보낸다 · 시계 되돌림도 보낸다', () => {
  assert.equal(shouldReportHealth({ sent: null, next: base, now: NOW }), true);
  assert.equal(shouldReportHealth({ sent: { at: NOW + H, failures: 0, blocked: false }, next: base, now: NOW }), true);
});

test('shouldReportHealth: 10분 쓰로틀', () => {
  const sent = { at: NOW, failures: 0, blocked: false };
  assert.equal(shouldReportHealth({ sent, next: base, now: NOW + HEALTH_REPORT_THROTTLE_MS - 1 }), false);
  assert.equal(shouldReportHealth({ sent, next: base, now: NOW + HEALTH_REPORT_THROTTLE_MS }), true);
});

test('shouldReportHealth: 즉시 조건 — 0→양수 · 3 문턱 · 실패→성공 · blocked', () => {
  const at = NOW;
  const soon = NOW + 1000;
  const ok = (failures: number, blocked = false) => ({ at, failures, blocked });
  assert.equal(shouldReportHealth({ sent: ok(0), next: h({ consecutiveFailures: 1 }), now: soon }), true, '0→1');
  assert.equal(shouldReportHealth({ sent: ok(1), next: h({ consecutiveFailures: 2 }), now: soon }), false, '1→2 는 쓰로틀');
  assert.equal(shouldReportHealth({ sent: ok(1), next: h({ consecutiveFailures: 3 }), now: soon }), true, '→3 문턱');
  assert.equal(shouldReportHealth({ sent: ok(2), next: h({ consecutiveFailures: 3 }), now: soon }), true, '2→3 문턱');
  assert.equal(shouldReportHealth({ sent: ok(3), next: h({ consecutiveFailures: 4 }), now: soon }), false, '3→4 는 쓰로틀');
  assert.equal(shouldReportHealth({ sent: ok(4), next: h({ consecutiveFailures: 0 }), now: soon }), true, '실패→성공');
  assert.equal(shouldReportHealth({ sent: ok(0), next: h({ blocked: true }), now: soon }), true, 'blocked 켜짐');
  assert.equal(shouldReportHealth({ sent: ok(0, true), next: h({ blocked: false }), now: soon }), true, 'blocked 꺼짐');
  assert.equal(shouldReportHealth({ sent: ok(0), next: h({}), now: soon }), false, '성공→성공 은 쓰로틀');
});

test('ageMs: 없으면 undefined · 미래(기기 시계)는 0', () => {
  assert.equal(ageMs(null, NOW), undefined);
  assert.equal(ageMs(NOW - 5000, NOW), 5000);
  assert.equal(ageMs(NOW + 5000, NOW), 0);
});
