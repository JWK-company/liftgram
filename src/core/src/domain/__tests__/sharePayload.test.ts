// @plm SRS-064  운동 총평은 공유에 실리지 않는다(QA R5) — 공유 데이터의 키를 고정한다
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSharedWorkout, SHARED_WORKOUT_KEYS } from '../sharePayload';

test('공유 데이터는 고정된 키만 — 운동 총평(notes)이 원본에 있어도 싣지 않는다', () => {
  // 원본 요약·운동에 총평이 붙어 있어도(누군가 펼쳐 넣는 실수를 흉내) 결과에는 없다
  const summary = {
    workoutId: 'w1',
    totalVolumeKg: 1200,
    durationSeconds: 1800,
    workingSets: 6,
    prCount: 1,
    notes: '오늘 어깨가 아팠다 — 나만 보는 총평',
  } as unknown as Parameters<typeof buildSharedWorkout>[0]['summary'];
  const out = buildSharedWorkout({
    summary,
    workoutName: '가슴',
    streakDays: 3,
    exercises: [
      {
        exerciseName: '바벨 벤치프레스',
        exerciseId: 'seed-bench',
        note: '팔꿈치 45도',
        sets: [
          { weightKg: 40, reps: 10, isWarmup: true, isFailed: false },
          { weightKg: 80, reps: 8, isWarmup: false, isFailed: false, loadMultiplier: null },
          { weightKg: 85, reps: 3, isWarmup: false, isFailed: true },
        ],
      },
    ],
  });
  assert.deepEqual(Object.keys(out).sort(), [...SHARED_WORKOUT_KEYS].sort());
  assert.ok(!JSON.stringify(out).includes('총평'));
  assert.ok(!('notes' in out));
  // 종목 메모(작성자 팁)는 원래대로 간다 · 워밍업·실패는 빠진다
  assert.equal(out.exercises[0].note, '팔꿈치 45도');
  assert.deepEqual(out.exercises[0].sets, [{ weightKg: 80, reps: 8, loadMultiplier: null }]);
});
