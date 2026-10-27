// @plm SRS-071  빠른 운동 자동 이름(화면 정리 F7) — 순수 함수
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoWorkoutName, isDefaultWorkoutName } from '../workoutAutoName';

test('주 근육 상위 2개 + 종목 수 — 「가슴·삼두 · 2종목」', () => {
  assert.equal(
    autoWorkoutName([
      { primaryMuscle: 'chest', workingSets: 3 },
      { primaryMuscle: 'triceps', workingSets: 2 },
    ]),
    '가슴·삼두 · 2종목',
  );
});

test('세트가 많은 부위가 앞 · 셋째 부위는 이름에서 빠지고 종목 수에는 든다', () => {
  assert.equal(
    autoWorkoutName([
      { primaryMuscle: 'chest', workingSets: 1 },
      { primaryMuscle: 'back', workingSets: 4 },
      { primaryMuscle: 'biceps', workingSets: 2 },
    ]),
    '등·이두 · 3종목',
  );
});

test('같은 부위 여러 종목은 합산 · 수행하지 않은 종목은 세지 않는다', () => {
  assert.equal(
    autoWorkoutName([
      { primaryMuscle: 'chest', workingSets: 2 },
      { primaryMuscle: 'chest', workingSets: 2 },
      { primaryMuscle: 'back', workingSets: 0 },
    ]),
    '가슴 · 2종목',
  );
});

test('부위를 모르면 종목 수만 · 아무것도 안 했으면 null', () => {
  assert.equal(autoWorkoutName([{ primaryMuscle: 'other', workingSets: 2 }]), '1종목');
  assert.equal(autoWorkoutName([{ primaryMuscle: 'chest', workingSets: 0 }]), null);
  assert.equal(autoWorkoutName([]), null);
});

test('기본 이름일 때만 바꾼다 — 사용자가 바꾼 이름은 지킨다', () => {
  assert.equal(isDefaultWorkoutName('빠른 운동'), true);
  assert.equal(isDefaultWorkoutName('  '), true);
  assert.equal(isDefaultWorkoutName(null), true);
  assert.equal(isDefaultWorkoutName('하체 데이'), false);
});
