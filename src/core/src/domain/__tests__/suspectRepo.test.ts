// SRS-109 잘못 적은 기록 바로잡기 — 저장소(실제 WatermelonDB · LokiJS 메모리 · SPEC-044 · REV-079 T-3·T-4·T-5)
// 판정을 적는 곳(체크·완료·고치기), 바로잡기(제대로·lb·되돌리기·단위 바꾸기·종목 바꾸기·세트 추가), 재계산(고친 뒤·지운 뒤)·백필.
import './fixtures/wm/register.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { database } = await import('../../db/database');
const repo = await import('../../data/workoutRepository');
const analytics = await import('../../data/analyticsRepository');

type Raw = Record<string, unknown>;

async function reset(): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
  repo.__resetSuspectBackfillForTest();
  repo.invalidateLivePrCache();
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

async function exercise(name: string, extra: Raw = {}): Promise<string> {
  return create('exercises', {
    name_ko: name,
    equipment: 'barbell',
    kind: 'strength',
    is_custom: true,
    is_archived: false,
    primary_muscles: '[]',
    secondary_muscles: '[]',
    substitute_ids: '[]',
    aliases: '[]',
    similar: '[]',
    ...extra,
  });
}

/** 완료 운동 하나 — sets: [kg, reps][] (모두 수행) */
async function doneWorkout(at: number, exId: string, sets: [number, number][], opt: { unit?: 'kg' | 'lb'; state?: string } = {}) {
  const state = opt.state ?? 'completed';
  const workoutId = await create('workouts', {
    state,
    started_at: at - 3600_000,
    completed_at: state === 'completed' ? at : null,
    name: '운동',
    total_volume_kg: sets.reduce((n, [w, r]) => n + w * r, 0),
    pr_count: 0,
    accumulated_pause_ms: 0,
  });
  const weId = await create('workout_exercises', {
    workout_id: workoutId,
    exercise_id: exId,
    sort_order: 0,
    rest_seconds: 90,
    weight_unit: opt.unit ?? 'kg',
  });
  const setIds: string[] = [];
  for (let i = 0; i < sets.length; i++) {
    setIds.push(
      await create('set_logs', {
        workout_exercise_id: weId,
        set_number: i + 1,
        weight_kg: sets[i][0],
        reps: sets[i][1],
        is_warmup: false,
        is_failed: false,
        user_edited: true,
        done: state === 'completed',
        completed_at: state === 'completed' ? at : null,
      }),
    );
  }
  return { workoutId, weId, setIds };
}

const raw = async (table: string, id: string) => (await database.get(table).find(id))._raw as unknown as Raw;
const DAY = 86_400_000;

test('운동 중 체크 → 판정을 적고 축하하지 않는다 · 체크를 풀면 표시도 푼다', async () => {
  await reset();
  const ex = await exercise('벤치');
  await doneWorkout(1 * DAY, ex, [[60, 8]]);
  await doneWorkout(2 * DAY, ex, [[60, 8]]);
  const cur = await doneWorkout(3 * DAY, ex, [[60, 8], [60, 8]], { state: 'active' });
  // 화면에 132 를 쳤지만 아직 저장 전(값은 60) — 화면값으로 판정한다(REV-079 D-4)
  await repo.setSetDone(cur.setIds[1], true);
  const prs = await repo.evalLiveSetPr(cur.weId, cur.setIds[1], 132, 8);
  assert.deepEqual(prs, []);
  assert.equal((await raw('set_logs', cur.setIds[1])).check_state, 'suspect');
  await repo.setSetDone(cur.setIds[1], false);
  assert.equal((await raw('set_logs', cur.setIds[1])).check_state, null);
});

test('운동 완료 — 확인 필요 세트는 PR 이 아니고 표시가 완료와 함께 남는다 · 「제대로 적었어요」 뒤 PR 수가 다시 맞는다', async () => {
  await reset();
  const ex = await exercise('벤치');
  await doneWorkout(1 * DAY, ex, [[60, 8]]);
  await doneWorkout(2 * DAY, ex, [[60, 8]]);
  const cur = await doneWorkout(3 * DAY, ex, [[60, 8], [132, 8]], { state: 'active' });
  for (const id of cur.setIds) await repo.setSetDone(id, true);
  const sum = await repo.completeWorkout(cur.workoutId);
  assert.equal(sum.prCount, 0);
  assert.equal((await raw('set_logs', cur.setIds[1])).check_state, 'suspect');
  const list = await repo.listSuspectSets({ workoutId: cur.workoutId });
  assert.equal(list.length, 1);
  assert.equal(list[0].lbPlausible, true);
  const prev = await repo.confirmSuspectSet(cur.setIds[1]);
  assert.equal(prev.checkState, 'suspect');
  assert.match(String((await raw('set_logs', cur.setIds[1])).check_state), /^confirmed:132x8$/);
  const w = await raw('workouts', cur.workoutId);
  assert.equal(w.pr_count, 2, `PR 수 ${w.pr_count}`); // 무게·1RM 두 종(정확히)
  const rebuilt = await repo.rebuildWorkoutSummary(cur.workoutId);
  assert.equal(rebuilt.prCount, w.pr_count);
  // 되돌리기 — 다시 확인 필요 · PR 수 0
  await repo.undoSuspectFix(cur.setIds[1], prev);
  assert.equal((await raw('set_logs', cur.setIds[1])).check_state, 'suspect');
  assert.equal((await raw('workouts', cur.workoutId)).pr_count, 0);
});

test('「lb로 적었어요」 — 132 → 59.874kg · 두 번 눌러도 한 번만 · 확인함은 값을 고치면 다시 판정', async () => {
  await reset();
  const ex = await exercise('벤치');
  await doneWorkout(1 * DAY, ex, [[60, 8]]);
  await doneWorkout(2 * DAY, ex, [[60, 8]]);
  const cur = await doneWorkout(3 * DAY, ex, [[132, 8]], { state: 'active' });
  await repo.setSetDone(cur.setIds[0], true);
  await repo.completeWorkout(cur.workoutId);
  const r1 = await repo.fixSuspectAsLb(cur.setIds[0]);
  assert.equal(r1.after, 59.874);
  const r2 = await repo.fixSuspectAsLb(cur.setIds[0]);
  assert.equal(r2.after, 59.874); // 거듭 줄이지 않는다
  const s = await raw('set_logs', cur.setIds[0]);
  assert.equal(s.weight_kg, 59.874);
  assert.equal(s.check_state, null);
  // 확인함 → 무게를 바꾸면 지문이 달라져 다시 판정
  await repo.updateSetLog(cur.setIds[0], { weightKg: 140 });
  assert.equal((await raw('set_logs', cur.setIds[0])).check_state, 'suspect');
  await repo.confirmSuspectSet(cur.setIds[0]);
  await repo.updateSetLog(cur.setIds[0], { rir: 2 }); // 무게·횟수가 아니면 그대로
  assert.match(String((await raw('set_logs', cur.setIds[0])).check_state), /^confirmed:/);
  await repo.updateSetLog(cur.setIds[0], { reps: 9 });
  assert.equal((await raw('set_logs', cur.setIds[0])).check_state, 'suspect');
});

test('단위 바꾸기 왕복 — 적은 숫자는 그대로 · 62.5 · 102.5 · 볼륨 다시 계산', async () => {
  await reset();
  const ex = await exercise('스쿼트');
  const w = await doneWorkout(1 * DAY, ex, [[62.5, 5], [102.5, 3]]);
  await repo.reinterpretBlockUnit(w.weId, 'lb');
  const lbSets = await Promise.all(w.setIds.map((id) => raw('set_logs', id)));
  assert.ok(Math.abs((lbSets[0].weight_kg as number) - 62.5 * 0.45359237) < 1e-9);
  assert.equal((await raw('workout_exercises', w.weId)).weight_unit, 'lb');
  const vol = (await raw('workouts', w.workoutId)).total_volume_kg as number;
  assert.ok(Math.abs(vol - (62.5 * 5 + 102.5 * 3) * 0.45359237) < 1e-6, `볼륨 ${vol}`);
  await repo.reinterpretBlockUnit(w.weId, 'kg');
  const back = await Promise.all(w.setIds.map((id) => raw('set_logs', id)));
  assert.deepEqual(back.map((x) => x.weight_kg), [62.5, 102.5]);
  assert.equal((await raw('workout_exercises', w.weId)).weight_unit, 'kg');
});

test('지난 기록을 고치면 그 뒤 운동의 판정·PR 수도 다시 맞는다', async () => {
  await reset();
  const ex = await exercise('벤치');
  await doneWorkout(1 * DAY, ex, [[60, 8]]);
  const w2 = await doneWorkout(2 * DAY, ex, [[60, 8]]);
  const w3 = await doneWorkout(3 * DAY, ex, [[100, 8]]);
  await repo.backfillSuspectsV28(); // 옛 기록 백필(REV-079 D-1) — 100 은 60 기준으로 튄다
  assert.equal((await raw('set_logs', w3.setIds[0])).check_state, 'suspect');
  // w2 를 90 으로 고치면 100 은 정상 — 그 뒤 운동의 판정이 따라온다(REV-079 D-2)
  await repo.updateSetLog(w2.setIds[0], { weightKg: 90 });
  await repo.recomputeWorkoutTotals(w2.workoutId);
  assert.equal((await raw('set_logs', w3.setIds[0])).check_state, null);
  assert.equal((await raw('workouts', w3.workoutId)).pr_count, 2);
});

test('완료 운동을 지우면 그 뒤 운동의 PR 수가 다시 맞는다(SRS-109 R5)', async () => {
  await reset();
  const ex = await exercise('벤치');
  const w1 = await doneWorkout(1 * DAY, ex, [[80, 8]]);
  const w2 = await doneWorkout(2 * DAY, ex, [[70, 8]]);
  await repo.recomputeWorkoutTotals(w1.workoutId);
  assert.equal((await raw('workouts', w2.workoutId)).pr_count, 0); // 80 이 앞에 있어 PR 아님
  await repo.discardWorkout(w1.workoutId);
  assert.equal((await raw('workouts', w2.workoutId)).pr_count, 2, '앞 기록이 지워져 PR');
});

test('종목 바꾸기 — 옛 종목의 이후 운동 PR 수도 다시 센다(REV-079 T-5)', async () => {
  await reset();
  const bench = await exercise('벤치');
  const row = await exercise('로우');
  const w1 = await doneWorkout(1 * DAY, bench, [[80, 8]]);
  const w2 = await doneWorkout(2 * DAY, bench, [[70, 8]]);
  await repo.recomputeWorkoutTotals(w1.workoutId);
  assert.equal((await raw('workouts', w2.workoutId)).pr_count, 0);
  await repo.swapPastWorkoutExercise(w1.weId, row);
  assert.equal((await raw('workouts', w2.workoutId)).pr_count, 2, '벤치 기준이 사라져 w2 가 PR');
});

test('세트 추가 — 저장할 때 완료 세트로 · 운동 완료 시각 · 볼륨 다시 계산', async () => {
  await reset();
  const ex = await exercise('벤치');
  const w = await doneWorkout(5 * DAY, ex, [[60, 8]]);
  const id = await repo.addPastSet(w.weId, 60, 6);
  const s = await raw('set_logs', id);
  assert.equal(s.done, true);
  assert.equal(s.completed_at, 5 * DAY);
  assert.equal((await raw('workouts', w.workoutId)).total_volume_kg, 60 * 8 + 60 * 6);
});

test('분석 — 기록 상세 1RM·개요 최고 1RM 에서 확인 필요 세트가 빠진다 · 다음 운동 프리필은 옆 정상 세트 값', async () => {
  await reset();
  const ex = await exercise('벤치');
  await doneWorkout(1 * DAY, ex, [[60, 8]]);
  await doneWorkout(2 * DAY, ex, [[60, 8]]);
  const w3 = await doneWorkout(3 * DAY, ex, [[60, 8], [132, 8]]);
  await repo.backfillSuspectsV28();
  assert.equal((await raw('set_logs', w3.setIds[1])).check_state, 'suspect');
  const d = await analytics.getWorkoutDetail(w3.workoutId);
  assert.equal(Math.round(d.exercises[0].bestEstimated1RM), 76);
  assert.equal(d.exercises[0].sets[1].checkState, 'suspect');
  const ov = await analytics.getOverview();
  assert.equal(Math.round(ov.topOneRM[0].estimated1RM), 76);
  const prev = await repo.getPreviousExerciseSets(ex, null);
  assert.deepEqual(prev.map((x) => x.weightKg), [60, 60]);
  assert.deepEqual(await repo.getPreviousExerciseSnapshot(ex, null), { weightKg: 60, reps: 8 });
});

const setPr = async (id: string, n: number) => {
  await database.write(async () => {
    const w = await database.get('workouts').find(id);
    await w.update((r) => {
      (r._raw as unknown as Raw).pr_count = n;
    });
  });
};

test('백필은 같은 실행에서 한 번만 · 판정이 바뀐 종목이 없는 운동의 수치는 다시 쓰지 않는다(계산 리뷰 2)', async () => {
  await reset();
  const ex = await exercise('벤치');
  const other = await exercise('컬');
  const o = await doneWorkout(1 * DAY, other, [[20, 10]]);
  await setPr(o.workoutId, 99); // 옛 규칙으로 저장된 수치라고 치자
  await doneWorkout(2 * DAY, ex, [[60, 8]]);
  await doneWorkout(3 * DAY, ex, [[60, 8]]);
  const w3 = await doneWorkout(4 * DAY, ex, [[132, 8]]);
  assert.equal(await repo.backfillSuspectsV28(), 1);
  assert.equal(await repo.backfillSuspectsV28(), 0); // 두 번째는 돌지 않는다
  assert.equal((await raw('set_logs', w3.setIds[0])).check_state, 'suspect');
  assert.equal((await raw('workouts', o.workoutId)).pr_count, 99);
  assert.equal((await raw('workouts', w3.workoutId)).pr_count, 0);
});

test('완료 운동을 지우면 그 뒤 운동을 다시 판정한다 · 진행 중 운동을 지우면 아무것도 바꾸지 않는다', async () => {
  await reset();
  const ex = await exercise('벤치');
  await doneWorkout(1 * DAY, ex, [[60, 8]]);
  const w2 = await doneWorkout(2 * DAY, ex, [[100, 8]]);
  await doneWorkout(3 * DAY, ex, [[60, 8]]);
  const w4 = await doneWorkout(4 * DAY, ex, [[100, 8]]);
  await repo.backfillSuspectsV28();
  // w2 는 지난 1회뿐이라 판정 안 함 → 100 이 기준에 들어 w4 의 100 은 정상
  assert.equal((await raw('set_logs', w4.setIds[0])).check_state, null);
  const act = await doneWorkout(5 * DAY, ex, [[60, 8]], { state: 'active' });
  await setPr(w4.workoutId, 99);
  await repo.discardWorkout(act.workoutId);
  assert.equal((await raw('workouts', w4.workoutId)).pr_count, 99, '진행 중 운동 지우기는 다시 세지 않는다');
  await repo.discardWorkout(w2.workoutId);
  // 100 기준이 사라지자 w4 의 100 은 60 기준으로 튄다
  assert.equal((await raw('set_logs', w4.setIds[0])).check_state, 'suspect');
  assert.equal((await raw('workouts', w4.workoutId)).pr_count, 0);
});

test('같은 운동에서 「제대로 적었어요」 한 세트는 옆 세트의 기준 — 완료·다시 훑기 뒤에도 유지(계산 리뷰 1)', async () => {
  await reset();
  const ex = await exercise('벤치');
  await doneWorkout(1 * DAY, ex, [[60, 8]]);
  await doneWorkout(2 * DAY, ex, [[60, 8]]);
  const cur = await doneWorkout(3 * DAY, ex, [[132, 8], [132, 8]], { state: 'active' });
  await repo.setSetDone(cur.setIds[0], true);
  await repo.judgeSetSuspect(cur.setIds[0]);
  assert.equal((await raw('set_logs', cur.setIds[0])).check_state, 'suspect');
  await repo.confirmSuspectSet(cur.setIds[0]);
  await repo.setSetDone(cur.setIds[1], true);
  await repo.judgeSetSuspect(cur.setIds[1]);
  assert.equal((await raw('set_logs', cur.setIds[1])).check_state, null);
  await repo.completeWorkout(cur.workoutId);
  assert.match(String((await raw('set_logs', cur.setIds[0])).check_state), /^confirmed:/, '완료가 확인함을 덮지 않는다');
  assert.equal((await raw('set_logs', cur.setIds[1])).check_state, null);
  await repo.backfillSuspectsV28();
  assert.equal((await raw('set_logs', cur.setIds[1])).check_state, null, '다시 훑어도 정상');
});

test('세트 종류를 실패로 바꾸면 판정을 푼다 · 같은 운동의 두 블록은 지난 운동 1회로 센다', async () => {
  await reset();
  const ex = await exercise('벤치');
  // 지난 운동 하나에 같은 종목 블록 둘 — 운동 수는 1 이라 판정하지 않는다
  const w1 = await doneWorkout(1 * DAY, ex, [[60, 8]]);
  await create('workout_exercises', { workout_id: w1.workoutId, exercise_id: ex, sort_order: 1, rest_seconds: 90, weight_unit: 'kg' });
  const cur = await doneWorkout(2 * DAY, ex, [[132, 8]], { state: 'active' });
  await repo.setSetDone(cur.setIds[0], true);
  assert.equal((await repo.judgeSetSuspect(cur.setIds[0])).suspect, false);
  await doneWorkout(1.5 * DAY, ex, [[60, 8]]);
  repo.invalidateLivePrCache();
  assert.equal((await repo.judgeSetSuspect(cur.setIds[0])).suspect, true);
  await repo.setSetType(cur.setIds[0], 'failed');
  assert.equal((await raw('set_logs', cur.setIds[0])).check_state, null);
});

test('운동 중 PR 축하 — 정상 값은 PR 이 나온다(빈 결과가 판정 때문인지 대조)', async () => {
  await reset();
  const ex = await exercise('벤치');
  await doneWorkout(1 * DAY, ex, [[60, 8]]);
  await doneWorkout(2 * DAY, ex, [[60, 8]]);
  const cur = await doneWorkout(3 * DAY, ex, [[70, 8]], { state: 'active' });
  await repo.setSetDone(cur.setIds[0], true);
  const prs = await repo.evalLiveSetPr(cur.weId, cur.setIds[0], 70, 8);
  assert.ok(prs.length > 0);
  assert.equal((await raw('set_logs', cur.setIds[0])).check_state, null);
});

test('「lb로 적었어요」 되돌리기는 사람이 고침·값 출처도 되돌린다 · 기록 상세에 확인함이 보인다(계산 리뷰 6·7)', async () => {
  await reset();
  const ex = await exercise('벤치');
  await doneWorkout(1 * DAY, ex, [[60, 8]]);
  await doneWorkout(2 * DAY, ex, [[60, 8]]);
  const w3 = await doneWorkout(3 * DAY, ex, [[132, 8]]);
  await database.write(async () => {
    const s = await database.get('set_logs').find(w3.setIds[0]);
    await s.update((r) => {
      (r._raw as unknown as Raw).user_edited = false;
      (r._raw as unknown as Raw).value_source = 'rx,rx';
    });
  });
  await repo.backfillSuspectsV28();
  const prev = await repo.fixSuspectAsLb(w3.setIds[0]);
  assert.equal((await raw('set_logs', w3.setIds[0])).user_edited, true);
  await repo.undoSuspectFix(w3.setIds[0], prev);
  const s = await raw('set_logs', w3.setIds[0]);
  assert.equal(s.weight_kg, 132);
  assert.equal(s.user_edited, false);
  assert.equal(s.value_source, 'rx,rx');
  assert.equal(s.check_state, 'suspect');
  await repo.confirmSuspectSet(w3.setIds[0]);
  const d = await analytics.getWorkoutDetail(w3.workoutId);
  assert.equal(d.exercises[0].sets[0].checkState, 'confirmed');
});

test('프리필 — 지난 운동의 작업 세트가 모두 확인 필요면 웜업 값이 아니라 이전 운동 값(계산 리뷰 4)', async () => {
  await reset();
  const ex = await exercise('벤치');
  await doneWorkout(1 * DAY, ex, [[60, 8]]);
  await doneWorkout(2 * DAY, ex, [[60, 8]]);
  const w3 = await doneWorkout(3 * DAY, ex, [[40, 10], [132, 8]]);
  await database.write(async () => {
    const s = await database.get('set_logs').find(w3.setIds[0]);
    await s.update((r) => {
      (r._raw as unknown as Raw).is_warmup = true;
    });
  });
  await repo.backfillSuspectsV28();
  assert.equal((await raw('set_logs', w3.setIds[1])).check_state, 'suspect');
  assert.deepEqual(await repo.getPreviousExerciseSnapshot(ex, null), { weightKg: 60, reps: 8 });
  assert.deepEqual((await repo.getPreviousExerciseSets(ex, null)).map((x) => x.weightKg), [60]);
});
