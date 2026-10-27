// @plm SRS-059 SRS-060  운동 완료 시 루틴 반영 · 운동을 루틴으로 저장 — 저장소
//
// 규칙은 전부 domain/routineDiff.ts(순수 함수)에 있다. 여기는 기기 DB 를 읽어 그 입력을 만들고,
// 나온 계획을 **한 번의 쓰기**로 실행만 한다(QA Q2).
//
// 변경점은 completeWorkout **전에** 읽는다(QA Q1) — 완료가 세트 0 블록과 체크 안 한 세트를 지운다.
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import type { Exercise, Routine, RoutineExercise, SetLog, Workout, WorkoutExercise } from '../db/models';
import {
  dedupeName,
  diffRoutine,
  planRoutineApply,
  routineLinesFromWorkout,
  suggestRoutineName,
  type FinishPlan,
  type NewLine,
  type RoutineLine,
  type SessionBlock,
} from '../domain/routineDiff';
import type { AppLanguage, MuscleGroup } from '../domain/types';
import { scheduleSync } from '../sync/syncEngine';
import { randomId } from '../utils/id';

const workouts = () => database.get<Workout>('workouts');
const workoutExercises = () => database.get<WorkoutExercise>('workout_exercises');
const setLogs = () => database.get<SetLog>('set_logs');
const routines = () => database.get<Routine>('routines');
const routineExercises = () => database.get<RoutineExercise>('routine_exercises');
const exercises = () => database.get<Exercise>('exercises');

/** 오늘 운동의 블록들(완료 직전이든 뒤든 — 뒤에는 세트 0 블록이 이미 지워져 있다). */
export async function getSessionBlocks(workoutId: string): Promise<SessionBlock[]> {
  const wes = await workoutExercises().query(Q.where('workout_id', workoutId), Q.sortBy('sort_order', Q.asc)).fetch();
  if (wes.length === 0) return [];
  const sets = await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(wes.map((w) => w.id)))).fetch();
  const exIds = [...new Set(wes.map((w) => w.exerciseId))];
  const exRows = await exercises().query(Q.where('id', Q.oneOf(exIds))).fetch();
  const exById = new Map(exRows.map((e) => [e.id, e]));
  return wes.map((we) => {
    const mine = sets.filter((s) => s.workoutExerciseId === we.id && s.done !== false);
    const working = mine.filter((s) => !s.isWarmup);
    const ex = exById.get(we.exerciseId);
    return {
      id: we.id,
      exerciseId: we.exerciseId,
      routineExerciseId: we.routineExerciseId ?? null,
      sortOrder: we.sortOrder,
      supersetGroup: we.supersetGroup ?? null,
      doneSets: mine.length,
      doneWorkingSets: working.length,
      workingReps: working.map((s) => s.reps).filter((r) => r > 0),
      isCardio: ex?.kind === 'cardio',
      targetRepsMin: we.targetRepsMin ?? null,
      targetRepsMax: we.targetRepsMax ?? null,
      restSeconds: we.restSeconds ?? null,
      primaryMuscle: (ex?.primaryMuscles?.[0] as MuscleGroup | undefined) ?? null,
    };
  });
}

/** 시작한 루틴이 아직 있으면 그 루틴, 없으면 null(지웠거나 보관 — 빠른 운동처럼 다룬다). */
async function liveRoutineOf(workout: Workout): Promise<Routine | null> {
  if (!workout.routineId) return null;
  try {
    const r = await routines().find(workout.routineId);
    return r.isArchived ? null : r;
  } catch {
    return null;
  }
}

export interface FinishPrompt {
  /** routine = 루틴과 달라진 점이 있다 · quick = 빠른 운동(또는 루틴이 사라짐) · none = 묻지 않는다. */
  kind: 'routine' | 'quick' | 'none';
  routineName: string | null;
  plan: FinishPlan | null;
  blocks: SessionBlock[];
}

/**
 * 완료 **직전**에 부른다 — 무엇을 물을지와 그 근거(스냅샷)를 돌려준다.
 * 완료 세트가 하나도 없으면 묻지 않는다.
 */
export async function getFinishPrompt(workoutId: string): Promise<FinishPrompt> {
  const workout = await workouts().find(workoutId);
  const blocks = await getSessionBlocks(workoutId);
  if (!blocks.some((b) => b.doneSets > 0)) return { kind: 'none', routineName: null, plan: null, blocks };
  const routine = await liveRoutineOf(workout);
  if (!routine) return { kind: 'quick', routineName: null, plan: null, blocks };
  const res = await routineExercises().query(Q.where('routine_id', routine.id), Q.sortBy('sort_order', Q.asc)).fetch();
  const lines: RoutineLine[] = res.map((re) => ({
    id: re.id,
    exerciseId: re.exerciseId,
    targetSets: re.targetSets,
    sortOrder: re.sortOrder,
    supersetGroup: re.supersetGroup ?? null,
    hasPrescription: Array.isArray(re.prescription) && re.prescription.length > 0, // QA Q4 — 현재 루틴 기준
  }));
  const plan = diffRoutine(routine.id, lines, blocks);
  if (plan.changes.length === 0) return { kind: 'none', routineName: routine.name, plan, blocks };
  return { kind: 'routine', routineName: routine.name, plan, blocks };
}

/** 묶음 표식 → 새 그룹 id(세션 그룹 id 가 루틴으로 새지 않게 — QA Q7). */
function groupIdMapper() {
  const ids = new Map<string, string>();
  return (token: string | null | undefined): string | null => {
    if (!token) return null;
    let id = ids.get(token);
    if (!id) {
      id = randomId('ss_');
      ids.set(token, id);
    }
    return id;
  };
}

/** 새 루틴 줄 하나를 준비한다 — 변형 칸은 비워 둔다(다음 시작 때 지난 조합이 뜬다 — D4). */
function prepareLine(routineId: string, l: NewLine, group: string | null, cardioFrom: Map<string, WorkoutExercise>) {
  return routineExercises().prepareCreate((re) => {
    re.routineId = routineId;
    re.exerciseId = l.exerciseId;
    re.targetSets = l.targetSets;
    re.targetRepsMin = l.targetRepsMin;
    re.targetRepsMax = l.targetRepsMax;
    re.targetWeightKg = null; // 무게는 담지 않는다(D4)
    re.restSeconds = l.restSeconds;
    re.machineVariant = null;
    re.supersetGroup = group;
    re.sortOrder = l.sortOrder;
    re.note = null;
    re.cardioTarget = cardioFrom.get(l.fromBlockId)?.cardioTarget ?? null;
  });
}

async function blockRecords(lines: NewLine[]): Promise<Map<string, WorkoutExercise>> {
  const ids = [...new Set(lines.map((l) => l.fromBlockId))];
  if (ids.length === 0) return new Map();
  const rows = await workoutExercises().query(Q.where('id', Q.oneOf(ids))).fetch();
  return new Map(rows.map((r) => [r.id, r]));
}

/**
 * 고른 변경만 루틴에 반영한다 — 한 번의 쓰기(원자적). 처방 루틴이면 아무것도 하지 않는다(D5).
 * 계획은 완료 전에 뜬 스냅샷이라, 완료가 지운 블록이 있어도 그대로 반영된다.
 */
export async function applyRoutineChanges(plan: FinishPlan, selectedIds: string[]): Promise<number> {
  if (!plan.canApply) return 0;
  const ap = planRoutineApply(plan, new Set(selectedIds));
  const cardioFrom = await blockRecords(ap.creates);
  const toGroup = groupIdMapper();
  await database.write(async () => {
    const lineIds = [...ap.updates.map((u) => u.lineId), ...ap.deletes];
    const rows = lineIds.length ? await routineExercises().query(Q.where('id', Q.oneOf(lineIds))).fetch() : [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ops = [
      ...ap.deletes.flatMap((id) => {
        const r = byId.get(id);
        return r ? [r.prepareMarkAsDeleted()] : [];
      }),
      ...ap.updates.flatMap((u) => {
        const r = byId.get(u.lineId);
        if (!r) return [];
        return [
          r.prepareUpdate((rec) => {
            rec.sortOrder = u.sortOrder;
            if (u.exerciseId !== undefined && u.exerciseId !== rec.exerciseId) {
              rec.exerciseId = u.exerciseId;
              // 종목이 바뀌면 그 종목의 칸이 아니다 — 비워 두면 다음 시작 때 지난 조합이 뜬다(D1)
              rec.variantKey = null;
              rec.variantEquipment = null;
              rec.variantGrip = null;
              rec.variantArm = null;
              rec.variantLoad = null;
              rec.variantAttach = null;
              rec.machineVariant = null;
            }
            if (u.targetSets !== undefined) rec.targetSets = u.targetSets;
            if (u.group !== undefined) rec.supersetGroup = toGroup(u.group);
          }),
        ];
      }),
      ...ap.creates.map((l) => prepareLine(plan.routineId, l, toGroup(l.group), cardioFrom)),
    ];
    if (ops.length) await database.batch(...ops);
  });
  scheduleSync();
  return ap.updates.length + ap.creates.length + ap.deletes.length;
}

async function existingRoutineNames(): Promise<string[]> {
  const rs = await routines().query(Q.where('is_archived', false)).fetch();
  return rs.map((r) => r.name);
}

/** 기본 이름 — 루틴 운동이면 「원래 이름 (수정)」, 아니면 「M/D 주 근육 2개」(중복이면 (2)). */
export async function suggestNameForWorkout(workoutId: string, lang: AppLanguage = 'ko'): Promise<string> {
  const workout = await workouts().find(workoutId);
  const routine = await liveRoutineOf(workout);
  const blocks = await getSessionBlocks(workoutId);
  return suggestRoutineName({
    routineName: routine?.name ?? null,
    date: new Date(workout.startedAt),
    blocks,
    existing: await existingRoutineNames(),
    lang,
  });
}

/**
 * 운동 하나를 새 루틴으로 저장한다(SRS-060) — 완료 세트가 있는 종목·순서·묶음·세트 수·횟수 범위. 무게·변형은 담지 않는다.
 * 완료 전 스냅샷(blocks)을 주면 그것으로, 아니면 기기 DB 의 (완료된) 운동을 읽는다.
 */
export async function saveWorkoutAsRoutine(
  workoutId: string,
  name: string,
  snapshot?: SessionBlock[],
): Promise<Routine | null> {
  const workout = await workouts().find(workoutId);
  const blocks = snapshot ?? (await getSessionBlocks(workoutId));
  const lines = routineLinesFromWorkout(blocks, workout.routineId != null);
  if (lines.length === 0) return null;
  const finalName = dedupeName(name.trim() || (await suggestNameForWorkout(workoutId)), await existingRoutineNames());
  const cardioFrom = await blockRecords(lines);
  const toGroup = groupIdMapper();
  const routine = await database.write(async () => {
    const count = await routines().query(Q.where('is_archived', false)).fetchCount();
    const r = routines().prepareCreate((rec) => {
      rec.name = finalName;
      rec.folder = null;
      rec.notes = null;
      rec.sortOrder = count;
      rec.isArchived = false;
      rec.userId = null;
    });
    await database.batch(r, ...lines.map((l) => prepareLine(r.id, l, toGroup(l.group), cardioFrom)));
    return r;
  });
  scheduleSync();
  return routine;
}
