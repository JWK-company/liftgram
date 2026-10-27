// @plm SRS-084 SRS-051  새 버전 자동 적용 판정(#64) — 운동 화면(요약·완료 시트 포함)에 있는 동안은 미룬다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controllerChangeAction, isUpdateHoldPath, shouldAutoApplyUpdate } from '../swUpdatePolicy';

test('운동 화면은 보류 경로 — 하위 경로·쿼리 포함, 비슷한 이름은 아니다', () => {
  assert.equal(isUpdateHoldPath('/workout'), true);
  assert.equal(isUpdateHoldPath('/workout/'), true);
  assert.equal(isUpdateHoldPath('/workout?x=1'), true);
  assert.equal(isUpdateHoldPath('/workouts'), false);
  assert.equal(isUpdateHoldPath('/'), false);
  assert.equal(isUpdateHoldPath('/history/abc'), false);
  assert.equal(isUpdateHoldPath(null), false);
});

test('완료 직후 요약 화면(진행 중 운동 없음 · /workout)에서는 자동 적용하지 않는다 — #64 재현 조건', () => {
  assert.equal(shouldAutoApplyUpdate({ hasWaiting: true, activeWorkoutId: null, pathname: '/workout' }), false);
});

test('요약을 닫고 홈으로 가면 적용한다', () => {
  assert.equal(shouldAutoApplyUpdate({ hasWaiting: true, activeWorkoutId: null, pathname: '/' }), true);
});

test('진행 중 운동이 있으면 어느 화면이든 적용하지 않는다 · 기다리는 워커가 없으면 할 일 없음', () => {
  assert.equal(shouldAutoApplyUpdate({ hasWaiting: true, activeWorkoutId: 'w1', pathname: '/' }), false);
  assert.equal(shouldAutoApplyUpdate({ hasWaiting: false, activeWorkoutId: null, pathname: '/' }), false);
});

test('controllerchange — 첫 설치·이미 새로고침은 무시, 운동 화면은 미룸, 그 밖은 새로고침', () => {
  assert.equal(controllerChangeAction({ hadController: false, reloaded: false, pathname: '/' }), 'ignore');
  assert.equal(controllerChangeAction({ hadController: true, reloaded: true, pathname: '/' }), 'ignore');
  assert.equal(controllerChangeAction({ hadController: true, reloaded: false, pathname: '/workout' }), 'defer');
  assert.equal(controllerChangeAction({ hadController: true, reloaded: false, pathname: '/history' }), 'reload');
});

// ── SRS-085 수동 업데이트(프로필 버튼 하나) — 2026-10-27 ─────────────────────────────
// @plm SRS-085
import {
  compareVersions,
  controllerChangeDecision,
  isBelowMinVersion,
  mandatoryUpdateAction,
  readBootMarker,
  updateRowState,
  BOOT_MARKER_TTL_MS,
  UPDATE_TIMEOUT_MS,
} from '../swUpdatePolicy';

test('SemVer 비교 — 자리마다 숫자로 · 접두 v 허용 · 모르는 모양은 null', () => {
  assert.equal(compareVersions('0.45.0', '0.46.0'), -1);
  assert.equal(compareVersions('0.10.0', '0.9.0'), 1);
  assert.equal(compareVersions('v1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('0.46.0-e2e.1', '0.46.0'), 0); // 꼬리표는 비교하지 않는다
  assert.equal(compareVersions('abc', '1.0.0'), null);
  assert.equal(compareVersions('', '1.0.0'), null);
});

test('최소 버전 — 비었거나 잘못된 값은 필수 아님(fail-open)', () => {
  assert.equal(isBelowMinVersion('0.45.0', ''), false);
  assert.equal(isBelowMinVersion('0.45.0', null), false);
  assert.equal(isBelowMinVersion('0.45.0', 'latest'), false);
  assert.equal(isBelowMinVersion('0.45.0', '0.46.0'), true);
  assert.equal(isBelowMinVersion('0.46.0', '0.46.0'), false);
  assert.equal(isBelowMinVersion('0.47.0', '0.46.0'), false);
});

test('controllerchange — 우리가 누른 업데이트만 새로고침, 그 밖(다른 탭·브라우저 활성화)은 표시만 · 경로 무관', () => {
  assert.equal(controllerChangeDecision({ hadController: false, applying: false }), 'ignore');
  assert.equal(controllerChangeDecision({ hadController: false, applying: true }), 'ignore');
  assert.equal(controllerChangeDecision({ hadController: true, applying: true }), 'reload');
  assert.equal(controllerChangeDecision({ hadController: true, applying: false }), 'mark');
});

test('프로필 줄 상태 — 대기 없음 · 판단 전 · 운동 중 · 가능', () => {
  assert.equal(updateRowState({ available: false, activeLoaded: true, activeWorkoutId: null }), 'none');
  assert.equal(updateRowState({ available: true, activeLoaded: false, activeWorkoutId: null }), 'checking');
  assert.equal(updateRowState({ available: true, activeLoaded: true, activeWorkoutId: 'w1' }), 'blocked');
  assert.equal(updateRowState({ available: true, activeLoaded: true, activeWorkoutId: null }), 'ready');
});

test('필수 업데이트 — 운동 중·운동 화면·판단 전은 기다리고, 서버가 그 버전을 가졌을 때만 시작', () => {
  const base = {
    currentVersion: '0.45.0',
    minVersion: '0.46.0',
    serverVersion: '0.46.0',
    phase: 'idle' as const,
    dismissed: false,
    activeLoaded: true,
    activeWorkoutId: null,
    pathname: '/',
  };
  assert.equal(mandatoryUpdateAction(base), 'start');
  assert.equal(mandatoryUpdateAction({ ...base, minVersion: '' }), 'none');
  assert.equal(mandatoryUpdateAction({ ...base, currentVersion: '0.46.0' }), 'none');
  // QA H-1 오설정(서버가 최소보다 낮음 · 모름) = 필수 아님 — 업데이트해도 여전히 미만인 루프 금지
  assert.equal(mandatoryUpdateAction({ ...base, serverVersion: '0.45.5' }), 'none');
  assert.equal(mandatoryUpdateAction({ ...base, serverVersion: null }), 'none');
  assert.equal(mandatoryUpdateAction({ ...base, activeWorkoutId: 'w1' }), 'wait');
  assert.equal(mandatoryUpdateAction({ ...base, pathname: '/workout' }), 'wait');
  assert.equal(mandatoryUpdateAction({ ...base, activeLoaded: false }), 'wait');
  assert.equal(mandatoryUpdateAction({ ...base, dismissed: true }), 'none');
  assert.equal(mandatoryUpdateAction({ ...base, phase: 'updating' }), 'none');
  assert.equal(mandatoryUpdateAction({ ...base, phase: 'failed' }), 'none');
});

test('부팅 표식 — 없음·깨짐·오래됨은 무시', () => {
  const now = 1_000_000;
  assert.equal(readBootMarker(null, now), null);
  assert.equal(readBootMarker('{', now), null);
  assert.equal(readBootMarker(JSON.stringify({ at: now - BOOT_MARKER_TTL_MS - 1, fromBuild: 'a' }), now), null);
  assert.deepEqual(readBootMarker(JSON.stringify({ at: now - 10, fromBuild: 'a', fromVersion: '0.45.0' }), now), {
    at: now - 10,
    fromBuild: 'a',
    fromVersion: '0.45.0',
  });
  assert.equal(UPDATE_TIMEOUT_MS, 15_000);
});
