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
