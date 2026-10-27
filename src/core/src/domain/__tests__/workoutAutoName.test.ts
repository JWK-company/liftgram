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

// ── P3 QA M3·M4·L3 ──
import { inheritedWorkoutName, isAutoWorkoutName } from '../workoutAutoName';

test('영어 기본 이름도 기본 — 「Quick workout」 은 자동 이름으로 바뀐다(M4)', () => {
  assert.equal(isDefaultWorkoutName('Quick workout'), true);
  assert.equal(isDefaultWorkoutName('하체 데이'), false);
});

test('자동 이름 모양 판정 — 사용자가 지은 이름은 아니다(M3)', () => {
  assert.equal(isAutoWorkoutName('가슴·삼두 · 2종목'), true);
  assert.equal(isAutoWorkoutName('3종목'), true);
  assert.equal(isAutoWorkoutName('Chest·Triceps · 2 exercises'), true);
  assert.equal(isAutoWorkoutName('1 exercise'), true);
  assert.equal(isAutoWorkoutName('하체 데이'), false);
  assert.equal(isAutoWorkoutName('5x5 스트렝스'), false);
});

test('이어받는 이름 — 자동·기본 이름은 「빠른 운동」 으로 시작해 완료 때 다시 짓는다, 사용자 이름은 지킨다(M3)', () => {
  assert.equal(inheritedWorkoutName('가슴·삼두 · 2종목'), '빠른 운동');
  assert.equal(inheritedWorkoutName('Quick workout'), '빠른 운동');
  assert.equal(inheritedWorkoutName(''), '빠른 운동');
  assert.equal(inheritedWorkoutName(null), '빠른 운동');
  assert.equal(inheritedWorkoutName('  하체 데이 '), '하체 데이');
});

test('종목 수는 종목 기준 — 같은 종목 블록 둘이면 1종목(L3)', () => {
  assert.equal(
    autoWorkoutName([
      { exerciseId: 'e1', primaryMuscle: 'chest', workingSets: 3 },
      { exerciseId: 'e1', primaryMuscle: 'chest', workingSets: 2 },
    ]),
    '가슴 · 1종목',
  );
});
