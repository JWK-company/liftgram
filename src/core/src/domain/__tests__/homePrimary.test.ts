// @plm SRS-072  운동 홈 주 행동 고르기(화면 정리 M-2) — 순수 함수
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type HomePrimaryInput, pickHomePrimary } from '../homePrimary';

const base: HomePrimaryInput = {
  active: false,
  routineIds: ['r1', 'r2', 'r3'],
  plan: { kind: 'none' },
  workedOutToday: false,
  recoRoutineId: null,
  recentRoutineId: null,
};

test('운동 중이면 홈에는 주 행동이 없다(하단 막대 「열기」)', () => {
  assert.deepEqual(pickHomePrimary({ ...base, active: true, recoRoutineId: 'r2' }), { kind: 'active' });
});

test('루틴이 없으면 빠른 운동 시작', () => {
  assert.deepEqual(pickHomePrimary({ ...base, routineIds: [] }), { kind: 'quick', reason: 'noRoutines' });
});

test('오늘 이미 운동했으면 빠른 운동 시작(오늘 할 루틴은 끝났다)', () => {
  assert.deepEqual(
    pickHomePrimary({ ...base, workedOutToday: true, plan: { kind: 'routine', routineId: 'r2' } }),
    { kind: 'quick', reason: 'workedOutToday' },
  );
});

test('스케줄상 휴식일이면 빠른 운동 시작 — 추천·최근이 있어도', () => {
  assert.deepEqual(
    pickHomePrimary({ ...base, plan: { kind: 'rest' }, recoRoutineId: 'r2', recentRoutineId: 'r3' }),
    { kind: 'quick', reason: 'restDay' },
  );
});

test('순위: 스케줄 배정 > 추천 > 최근 수행 > 첫 루틴', () => {
  const all = { plan: { kind: 'routine', routineId: 'r3' } as const, recoRoutineId: 'r2', recentRoutineId: 'r1' };
  assert.deepEqual(pickHomePrimary({ ...base, ...all }), { kind: 'routine', routineId: 'r3', source: 'schedule' });
  assert.deepEqual(pickHomePrimary({ ...base, recoRoutineId: 'r2', recentRoutineId: 'r1' }), {
    kind: 'routine',
    routineId: 'r2',
    source: 'reco',
  });
  assert.deepEqual(pickHomePrimary({ ...base, recentRoutineId: 'r3' }), {
    kind: 'routine',
    routineId: 'r3',
    source: 'recent',
  });
  assert.deepEqual(pickHomePrimary(base), { kind: 'routine', routineId: 'r1', source: 'first' });
});

test('지운 루틴은 건너뛰고 다음 순위로', () => {
  assert.deepEqual(
    pickHomePrimary({ ...base, plan: { kind: 'routine', routineId: 'gone' }, recoRoutineId: 'gone2', recentRoutineId: 'r2' }),
    { kind: 'routine', routineId: 'r2', source: 'recent' },
  );
});

// /qa M-2 M-6-5 — 경계
test('오늘 운동함 + 휴식일이 겹치면 이유는 「오늘 운동함」(먼저 걸리는 규칙)', () => {
  assert.deepEqual(pickHomePrimary({ ...base, workedOutToday: true, plan: { kind: 'rest' } }), {
    kind: 'quick',
    reason: 'workedOutToday',
  });
});

test('스케줄 배정 루틴이 추천·최근과 같은 id 여도 근거는 스케줄', () => {
  assert.deepEqual(
    pickHomePrimary({ ...base, plan: { kind: 'routine', routineId: 'r2' }, recoRoutineId: 'r2', recentRoutineId: 'r2' }),
    { kind: 'routine', routineId: 'r2', source: 'schedule' },
  );
});

test('첫 루틴은 넘겨준 목록 순서를 따른다(화면 순서 — 폴더 묶음이 먼저)', () => {
  assert.deepEqual(pickHomePrimary({ ...base, routineIds: ['f1', 'l1'] }), {
    kind: 'routine',
    routineId: 'f1',
    source: 'first',
  });
});
