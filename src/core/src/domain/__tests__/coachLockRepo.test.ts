// SPEC-050 P3a 코치 루틴 잠금 — 저장소(실제 WatermelonDB · LokiJS 메모리).
// 코치가 보낸 루틴(origin coach)은 이름·메모·종목·세트를 못 바꾸고 폴더·삭제만 된다 · 운동 끝 「루틴에 반영」을 묻지 않는다 ·
// 「루틴에도 교체」는 0줄 · 복사본·가져온 루틴·새 루틴의 출처 칸 · 끝난 코칭(coach_ended)은 다 풀린다.
import './fixtures/wm/register.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { database } = await import('../../db/database');
const routineRepo = await import('../../data/routineRepository');
const finish = await import('../../data/finishRoutine');

type Raw = Record<string, unknown>;

async function reset(): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}

async function create(table: string, raw: Raw): Promise<string> {
  let id = '';
  await database.write(async () => {
    const rec = await database.get(table).create((r) => {
      Object.assign(r._raw as unknown as Raw, raw);
    });
    id = rec.id;
  });
  return id;
}

async function rawOf(table: string, id: string): Promise<Raw> {
  return (await database.get(table).find(id))._raw as unknown as Raw;
}

/** 동기로 받은 것처럼 — 출처 칸을 날것으로 심는다 */
async function routineWithLine(origin: string | null, exerciseId = 'ex-a') {
  const routineId = await create('routines', {
    name: '코치 상체',
    notes: '코치 메모',
    sort_order: 0,
    is_archived: false,
    origin,
    coach_id: origin ? 'u-coach' : null,
    coach_name: origin ? '김코치' : null,
  });
  const lineId = await create('routine_exercises', {
    routine_id: routineId,
    exercise_id: exerciseId,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 120,
    sort_order: 0,
  });
  return { routineId, lineId };
}

async function rejectsLocked(p: Promise<unknown>) {
  await assert.rejects(p, (e: Error) => e.message === routineRepo.COACH_LOCKED);
}

test('코치 루틴 — 이름·메모·종목·세트·묶음 쓰기는 COACH_LOCKED · 폴더·삭제는 된다', async () => {
  await reset();
  const { routineId, lineId } = await routineWithLine('coach');
  assert.equal(routineRepo.isCoachLocked(await routineRepo.getRoutine(routineId)), true);
  assert.equal(await routineRepo.isCoachLockedId(routineId), true);

  await rejectsLocked(routineRepo.updateRoutine(routineId, { name: '바꿈' }));
  await rejectsLocked(routineRepo.updateRoutine(routineId, { notes: '바꿈' }));
  await rejectsLocked(routineRepo.addExerciseToRoutine(routineId, 'ex-b'));
  await rejectsLocked(routineRepo.addExercisesToRoutine(routineId, ['ex-b']));
  await rejectsLocked(routineRepo.updateRoutineExercise(lineId, { targetSets: 5 }));
  await rejectsLocked(
    routineRepo.setRoutineExerciseSets(lineId, {
      targetSets: 5,
      targetWeightKg: null,
      targetRepsMin: 5,
      targetRepsMax: 5,
      prescription: null,
    }),
  );
  await rejectsLocked(routineRepo.setRoutineExercisePrescription(lineId, null));
  await rejectsLocked(routineRepo.removeRoutineExercise(lineId));
  await rejectsLocked(routineRepo.swapRoutineExercise(lineId, 'ex-b'));
  await rejectsLocked(routineRepo.groupAsSuperset([lineId]));
  await rejectsLocked(routineRepo.reorderRoutineExercises([lineId]));

  const r = await rawOf('routines', routineId);
  assert.deepEqual([r.name, r.notes], ['코치 상체', '코치 메모']);
  const l = await rawOf('routine_exercises', lineId);
  assert.deepEqual([l.exercise_id, l.target_sets, l._status], ['ex-a', 3, 'created']);

  // 운동 중 「루틴에도 교체」 = 0줄(이번 운동만)
  assert.equal(await routineRepo.swapExerciseInRoutine(routineId, 'ex-a', 'ex-b'), 0);
  assert.equal((await rawOf('routine_exercises', lineId)).exercise_id, 'ex-a');

  // 폴더는 회원 것
  await routineRepo.updateRoutine(routineId, { folder: '받은 루틴' });
  assert.equal((await rawOf('routines', routineId)).folder, '받은 루틴');
  // 삭제도 된다
  await routineRepo.deleteRoutine(routineId);
  assert.equal((await rawOf('routines', routineId))._status, 'deleted');
});

test('끝난 코칭(coach_ended)·가져온 루틴은 잠기지 않는다', async () => {
  await reset();
  for (const origin of ['coach_ended', 'import', null]) {
    const { routineId, lineId } = await routineWithLine(origin);
    assert.equal(await routineRepo.isCoachLockedId(routineId), false, String(origin));
    await routineRepo.updateRoutine(routineId, { name: `고침-${origin}` });
    await routineRepo.updateRoutineExercise(lineId, { targetSets: 4 });
    assert.equal((await rawOf('routines', routineId)).name, `고침-${origin}`);
    assert.equal((await rawOf('routine_exercises', lineId)).target_sets, 4);
  }
});

test('내 루틴으로 복사 — 복사본은 출처·코치 칸이 비고 고칠 수 있다 · 줄은 그대로', async () => {
  await reset();
  const { routineId } = await routineWithLine('coach');
  const copy = await routineRepo.duplicateRoutine(routineId);
  const c = copy._raw as unknown as Raw;
  assert.deepEqual([c.origin, c.coach_id, c.coach_name, c.coach_for], [null, null, null, null]);
  assert.equal(routineRepo.isCoachLocked(copy), false);
  const lines = await routineRepo.queryRoutineExercises(copy.id).fetch();
  assert.deepEqual(
    lines.map((x) => [x.exerciseId, x.targetSets]),
    [['ex-a', 3]],
  );
  await routineRepo.updateRoutine(copy.id, { name: '내 것' });
  // 원본은 그대로 잠김
  assert.equal(await routineRepo.isCoachLockedId(routineId), true);
});

test('가져오기 = origin import · 새 루틴 = 출처 없음', async () => {
  await reset();
  const imported = await routineRepo.importRoutine('가져온', [{ exerciseId: 'ex-a' }]);
  assert.equal((imported._raw as unknown as Raw).origin, 'import');
  assert.equal((imported._raw as unknown as Raw).coach_name, null);
  const mine = await routineRepo.createRoutine({ name: '새 루틴' });
  assert.equal((mine._raw as unknown as Raw).origin, null);
});

/** 루틴으로 시작해 루틴에 없는 종목을 한 운동 — 내 루틴이면 「루틴에 반영」(종목 추가)을 묻는다 */
async function workoutAddingExercise(routineId: string) {
  const at = Date.now();
  const workoutId = await create('workouts', {
    state: 'active',
    started_at: at - 3600_000,
    name: '운동',
    total_volume_kg: 0,
    pr_count: 0,
    accumulated_pause_ms: 0,
    routine_id: routineId,
  });
  const weId = await create('workout_exercises', {
    workout_id: workoutId,
    exercise_id: 'ex-b',
    sort_order: 0,
    rest_seconds: 120,
    weight_unit: 'kg',
    created_at: at - 3600_000,
  });
  await create('set_logs', {
    workout_exercise_id: weId,
    set_number: 1,
    weight_kg: 60,
    reps: 5,
    is_warmup: false,
    is_failed: false,
    user_edited: true,
    done: true,
    completed_at: at,
  });
  return workoutId;
}

test('운동 끝 — 내 루틴은 「루틴에 반영」을 묻고, 코치 루틴은 묻지 않는다 · 반영도 0', async () => {
  await reset();
  const mine = await routineWithLine(null);
  const minePrompt = await finish.getFinishPrompt(await workoutAddingExercise(mine.routineId));
  assert.equal(minePrompt.kind, 'routine');

  const coach = await routineWithLine('coach');
  const w = await workoutAddingExercise(coach.routineId);
  const p = await finish.getFinishPrompt(w);
  assert.equal(p.kind, 'none');
  assert.equal(p.plan, null);

  // 묻는 사이 코치 루틴이 된 경우 — 내 루틴 계획을 코치 루틴에 반영하려 해도 0
  const plan = minePrompt.plan;
  assert.ok(plan);
  await database.write(async () => {
    const r = await database.get('routines').find(mine.routineId);
    await r.update((rec) => {
      (rec._raw as unknown as Raw).origin = 'coach';
    });
  });
  assert.equal(await finish.applyRoutineChanges(plan, plan.changes.map((c) => c.id)), 0);
  const lines = await routineRepo.queryRoutineExercises(mine.routineId).fetch();
  assert.deepEqual(
    lines.map((x) => x.exerciseId),
    ['ex-a'],
  );
});

test('운동을 루틴으로 저장 — 코치 루틴으로 시작한 운동이라도 새 루틴은 출처 없음(내 것)', async () => {
  await reset();
  const coach = await routineWithLine('coach');
  const w = await workoutAddingExercise(coach.routineId);
  const saved = await finish.saveWorkoutAsRoutine(w, '저장한 루틴');
  assert.ok(saved);
  const s = saved._raw as unknown as Raw;
  assert.deepEqual([s.origin, s.coach_id, s.coach_name, s.coach_for], [null, null, null, null]);
  assert.equal(routineRepo.isCoachLocked(saved), false);
});

test('프로그램 채택 — 만든 루틴은 모두 origin import · 코치 칸 없음', async () => {
  await reset();
  const programRepo = await import('../../data/programRepository');
  await programRepo.adoptProgram('5일 분할', [
    { name: '가슴', slots: [{ exerciseId: 'ex-a', targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, restSeconds: 90 }] },
    { name: '등', slots: [{ exerciseId: 'ex-b', targetSets: 4, targetRepsMin: 6, targetRepsMax: 10, restSeconds: 120 }] },
  ] as Parameters<typeof programRepo.adoptProgram>[1]);
  const rows = (await database.get('routines').query().fetch()).map((r) => r._raw as unknown as Raw);
  assert.equal(rows.length, 2);
  for (const r of rows) assert.deepEqual([r.origin, r.coach_id, r.coach_name, r.folder], ['import', null, null, '5일 분할']);
});

test('백업 가져오기 — 이 기기의 코치 루틴과 그 줄은 덮지도 보태지도 않는다(skipped) · 내 루틴은 그대로 합친다', async () => {
  await reset();
  const backup = await import('../../sync/backup');
  const coach = await routineWithLine('coach');
  const mine = await routineWithLine(null);
  const future = Date.now() + 86_400_000; // 파일 쪽이 더 새것 — 잠금이 없으면 덮이는 경우
  const file = {
    format: 'liftgram-backup',
    version: 1,
    exportedAt: '',
    schemaVersion: 30,
    owner: null,
    tables: {
      routines: [
        { id: coach.routineId, name: '파일이 바꾼 이름', notes: null, sort_order: 0, is_archived: false, updated_at: future },
        { id: mine.routineId, name: '내 루틴 새 이름', notes: null, sort_order: 0, is_archived: false, updated_at: future },
      ],
      routine_exercises: [
        // 코치 루틴 줄 덮기
        { id: coach.lineId, routine_id: coach.routineId, exercise_id: 'ex-z', target_sets: 9, sort_order: 0, updated_at: future },
        // 코치 루틴에 줄 보태기
        { id: 'new-line-coach', routine_id: coach.routineId, exercise_id: 'ex-y', target_sets: 2, sort_order: 1, updated_at: future },
        // 내 루틴 줄 — 합쳐진다
        { id: mine.lineId, routine_id: mine.routineId, exercise_id: 'ex-a', target_sets: 6, sort_order: 0, updated_at: future },
      ],
    },
  };
  const report = await backup.importBackup(file);

  const r = await rawOf('routines', coach.routineId);
  assert.deepEqual([r.name, r.notes, r.origin], ['코치 상체', '코치 메모', 'coach']);
  const l = await rawOf('routine_exercises', coach.lineId);
  assert.deepEqual([l.exercise_id, l.target_sets], ['ex-a', 3]);
  await assert.rejects(database.get('routine_exercises').find('new-line-coach'));
  assert.equal((await routineRepo.queryRoutineExercises(coach.routineId).fetch()).length, 1);

  // 내 루틴은 합쳐진다
  assert.equal((await rawOf('routines', mine.routineId)).name, '내 루틴 새 이름');
  assert.equal((await rawOf('routine_exercises', mine.lineId)).target_sets, 6);
  assert.deepEqual(report.byTable.routines, [0, 1]);
  assert.deepEqual(report.byTable.routine_exercises, [0, 1]);
  assert.equal(report.skipped, 3);
});

test('백업 가져오기 — 끝난 코칭(coach_ended) 루틴은 잠금이 풀려 합쳐진다', async () => {
  await reset();
  const backup = await import('../../sync/backup');
  const ended = await routineWithLine('coach_ended');
  const future = Date.now() + 86_400_000;
  await backup.importBackup({
    format: 'liftgram-backup',
    version: 1,
    exportedAt: '',
    schemaVersion: 30,
    owner: null,
    tables: {
      routines: [{ id: ended.routineId, name: '고친 이름', sort_order: 0, is_archived: false, updated_at: future }],
      routine_exercises: [
        { id: ended.lineId, routine_id: ended.routineId, exercise_id: 'ex-a', target_sets: 5, sort_order: 0, updated_at: future },
      ],
    },
  });
  const r = await rawOf('routines', ended.routineId);
  // 출처 칸은 파일에서 받지 않으니 이 기기 값(coach_ended)이 남는다
  assert.deepEqual([r.name, r.origin], ['고친 이름', 'coach_ended']);
  assert.equal((await rawOf('routine_exercises', ended.lineId)).target_sets, 5);
});
