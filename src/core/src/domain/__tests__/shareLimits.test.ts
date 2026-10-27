// @plm SRS-065  피드 「바로 시작」·「가져오기」가 남의 공유 데이터를 믿지 않는다(QA M-1) — 상한·모양 검증
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampSharedExercises, SHARE_LIMITS } from '../sharePayload';
import { planFromSpec, START_MAX_SETS } from '../replay';

test('종목 수·세트 수·이름 길이에 상한 — 조작한 300종목×2,000세트 글도 기기를 멈추지 못한다', () => {
  const huge = Array.from({ length: 300 }, (_, i) => ({
    name: `x${i}`.repeat(200),
    exerciseId: `id${i}`,
    sets: Array.from({ length: 2000 }, () => ({ weightKg: 10, reps: 5 })),
  }));
  const out = clampSharedExercises(huge);
  assert.equal(out.length, SHARE_LIMITS.exercises);
  assert.ok(out.every((e) => e.sets.length <= SHARE_LIMITS.setsPerExercise));
  assert.ok(out.every((e) => e.name.length <= SHARE_LIMITS.nameLen));
});

test('모양이 틀린 항목은 버린다 — 배열 아님·이름 없음·세트가 배열 아님·숫자 아님', () => {
  assert.deepEqual(clampSharedExercises(null), []);
  assert.deepEqual(clampSharedExercises({ length: 3 }), []);
  const out = clampSharedExercises([
    { name: '  ', sets: [] },
    { name: '벤치', sets: 'many' },
    { name: '스쿼트', sets: [{ weightKg: 'a', reps: 5 }, { weightKg: 100, reps: -3 }, { weightKg: 100, reps: 5 }] },
    7,
  ]);
  assert.deepEqual(
    out.map((e) => [e.name, e.sets.length]),
    [
      ['벤치', 0],
      ['스쿼트', 3],
    ],
  );
  // 숫자가 아니거나 음수면 0 으로
  assert.deepEqual(out[1].sets[0], { weightKg: 0, reps: 5, loadMultiplier: null, isWarmup: false });
  assert.equal(out[1].sets[1].reps, 0);
});

test('바로 시작의 세트 수도 상한 — 남의 글이 한 종목 2,000세트를 시켜도 START_MAX_SETS', () => {
  const rows = planFromSpec([{ exerciseId: 'a', sets: 2000 }]);
  assert.equal(rows[0].targetSets, START_MAX_SETS);
});
