// @plm SRS-091  importRoutine 확장 회귀(qa M-6) — 새 선택 인자가 없으면 결과가 예전과 같고, 있으면 반복 위쪽·휴식·메모가 들어간다.
// 실제 WatermelonDB(LokiJS 메모리) — fixtures/wm 이 데코레이터 모델·어댑터를 바꿔 끼운다.
import './fixtures/wm/register.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { database } = await import('../../db/database');
const routineRepo = await import('../../data/routineRepository');

type RoutineRaw = { id: string; name: string; notes: string | null };
type ReRaw = {
  routine_id: string;
  exercise_id: string;
  target_sets: number;
  target_reps_min: number | null;
  target_reps_max: number | null;
  rest_seconds: number;
  note: string | null;
  sort_order: number;
};

async function reset(): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}
async function exercisesOf(routineId: string): Promise<ReRaw[]> {
  const all = await database.get('routine_exercises').query().fetch();
  return all
    .map((r) => r._raw as unknown as ReRaw)
    .filter((r) => r.routine_id === routineId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

test('선택 인자 없음 = 기존 결과(반복 위쪽 12 · 휴식 120 · 메모 null)', async () => {
  await reset();
  const r = await routineRepo.importRoutine('예전 방식', [
    { exerciseId: 'seed-barbell-squat' },
    { exerciseId: 'seed-leg-press', targetSets: 4, targetRepsMin: 6, note: '팁' },
  ]);
  assert.equal((r._raw as unknown as RoutineRaw).notes, null);
  const rows = await exercisesOf(r.id);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((x) => [x.exercise_id, x.target_sets, x.target_reps_min, x.target_reps_max, x.rest_seconds, x.note]),
    [
      ['seed-barbell-squat', 3, 8, 12, 120, null],
      ['seed-leg-press', 4, 6, 12, 120, '팁'],
    ],
  );
});

test('새 인자 — 반복 범위·휴식·루틴 메모가 저장된다', async () => {
  await reset();
  const r = await routineRepo.importRoutine(
    '어깨 미니멀 — 어깨',
    [{ exerciseId: 'seed-side-lateral-raise', targetSets: 4, targetRepsMin: 12, targetRepsMax: 15, restSeconds: 60 }],
    { notes: '  출처: 채널 「제목」 https://www.youtube.com/watch?v=bZbfXY0-BhA  ' },
  );
  assert.equal((r._raw as unknown as RoutineRaw).notes, '출처: 채널 「제목」 https://www.youtube.com/watch?v=bZbfXY0-BhA');
  const [row] = await exercisesOf(r.id);
  assert.deepEqual([row.target_sets, row.target_reps_min, row.target_reps_max, row.rest_seconds], [4, 12, 15, 60]);
});
