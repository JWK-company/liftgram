// SPEC-051 세트별 휴식 — 저장소(실제 WatermelonDB · LokiJS 메모리 · 리뷰 반영)
// 기억으로 실린 값은 「루틴에 반영」을 띄우지 않는다 · 오늘 바꾸면 띄운다 · 방식 바꾸기에 칸 값 옮기기 · 다시 시작은 원본 휴식 대신 내 기억.
import './fixtures/wm/register.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { database } = await import('../../db/database');
const repo = await import('../../data/workoutRepository');
const finish = await import('../../data/finishRoutine');
const { schemeRows } = await import('../setSchemes');
const { withRestOverrides, restOverridesOf } = await import('../restPlan');

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

const tb = () => schemeRows('topBackoff', { allowLoad: true });

async function exercise(): Promise<string> {
  return create('exercises', {
    name_ko: '벤치',
    equipment: 'barbell',
    kind: 'strength',
    is_custom: true,
    is_archived: false,
    primary_muscles: '["chest"]',
    secondary_muscles: '[]',
    substitute_ids: '[]',
    aliases: '[]',
    similar: '[]',
  });
}

/** 끝낸 운동 하나 — 그 블록 처방(칸 값 포함) · 세트는 처방 줄 수만큼 모두 수행 */
async function doneWorkout(at: number, exId: string, rx: unknown[], routineId: string | null = null) {
  const workoutId = await create('workouts', {
    state: 'completed',
    started_at: at - 3600_000,
    completed_at: at,
    name: '운동',
    total_volume_kg: 0,
    pr_count: 0,
    accumulated_pause_ms: 0,
    routine_id: routineId,
  });
  const weId = await create('workout_exercises', {
    workout_id: workoutId,
    exercise_id: exId,
    sort_order: 0,
    rest_seconds: 120,
    weight_unit: 'kg',
    prescription: JSON.stringify(rx),
    created_at: at - 3600_000,
  });
  for (let i = 0; i < rx.length; i++)
    await create('set_logs', {
      workout_exercise_id: weId,
      set_number: i + 1,
      weight_kg: 60,
      reps: 5,
      is_warmup: false,
      is_failed: false,
      user_edited: true,
      done: true,
      completed_at: at,
    });
  return { workoutId, weId };
}

async function routineWith(exId: string, rx: unknown[]) {
  const routineId = await create('routines', { name: '가슴', sort_order: 0, is_archived: false });
  const lineId = await create('routine_exercises', {
    routine_id: routineId,
    exercise_id: exId,
    target_sets: rx.length,
    rest_seconds: 120,
    sort_order: 0,
    prescription: JSON.stringify(rx),
  });
  return { routineId, lineId };
}

async function blockOf(workoutId: string) {
  const { Q } = await import('@nozbe/watermelondb');
  const rows = await database.get('workout_exercises').query(Q.where('workout_id', workoutId)).fetch();
  return rows[0] as unknown as { id: string; prescription: ReturnType<typeof tb> | null };
}

async function doAllSets(weId: string) {
  const { Q } = await import('@nozbe/watermelondb');
  const sets = await database.get('set_logs').query(Q.where('workout_exercise_id', weId)).fetch();
  for (const s of sets) await repo.setSetDone(s.id, true);
}

const changeKinds = async (workoutId: string) =>
  ((await finish.getFinishPrompt(workoutId)).plan?.changes ?? []).map((c) => c.kind);

test('루틴 시작에 실린 기억값은 「루틴에 반영」이 아니다 · 오늘 시트에서 바꾸면 뜬다', async () => {
  await reset();
  const ex = await exercise();
  const { routineId } = await routineWith(ex, tb());
  await doneWorkout(1_000_000, ex, withRestOverrides(tb(), { beforeTop: 300 }));
  const w = await repo.startWorkoutFromRoutine(routineId);
  const we = await blockOf(w.id);
  assert.equal(restOverridesOf(we.prescription).beforeTop, 300); // 기억이 실렸다
  await doAllSets(we.id);
  assert.ok(!(await changeKinds(w.id)).includes('rest'), '안 바꾼 운동엔 뜨지 않는다');
  await repo.setWorkoutExerciseRestOverrides(we.id, { beforeTop: 330 });
  assert.ok((await changeKinds(w.id)).includes('rest'), '오늘 바꾸면 뜬다');
});

test('방식 바꾸기 — 지금 칸 값을 새 틀로 옮긴다 · 새 틀에 없는 칸은 버린다', async () => {
  await reset();
  const ex = await exercise();
  const { routineId } = await routineWith(ex, withRestOverrides(tb(), { beforeTop: 270, afterTop: 200, warmup: 60 }));
  const w = await repo.startWorkoutFromRoutine(routineId);
  const we = await blockOf(w.id);
  assert.equal(await repo.changeWorkoutScheme(we.id, 'fiveByFive'), 'done');
  const after = await blockOf(w.id);
  // 5×5 에는 웜업 칸만 겹친다 — 탑 칸 값은 없어진다
  assert.deepEqual(restOverridesOf(after.prescription), { warmup: 60 });
  assert.equal(await repo.changeWorkoutScheme(we.id, 'reversePyramid'), 'done');
  assert.deepEqual(restOverridesOf((await blockOf(w.id)).prescription), { warmup: 60 });
});

test('다시 시작 — 원본 세션의 휴식 값은 지우고 내 기억(가장 최근)을 싣는다', async () => {
  await reset();
  const ex = await exercise();
  const old = await doneWorkout(1_000_000, ex, withRestOverrides(tb(), { afterTop: 111 }));
  await doneWorkout(2_000_000, ex, withRestOverrides(tb(), { beforeTop: 300 }));
  const w = await repo.startWorkoutFromWorkout(old.workoutId);
  const we = await blockOf(w.id);
  assert.deepEqual(restOverridesOf(we.prescription), { beforeTop: 300 });
});
