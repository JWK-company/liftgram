// 세션 매니저 + 세트 로깅 데이터 접근 (SRS-003/004). 무결성의 핵심.
// 세트는 append-only(ADR-002), 완료 시 볼륨·시간·PR을 계산해 캐시. @plm SRS-003 SRS-004
import { Q } from '@nozbe/watermelondb';
import type { Query } from '@nozbe/watermelondb';
import { database } from '../db/database';
import { Workout, WorkoutExercise, SetLog, Routine, RoutineExercise } from '../db/models';
import { getExercise } from './exerciseRepository';
import {
  totalVolumeKg,
  snapshotFromSets,
  detectNewPRs,
  EMPTY_PR,
  type LoggedSet,
  type PRResult,
  type PRSnapshot,
} from '../domain';

const workouts = () => database.get<Workout>('workouts');
const workoutExercises = () => database.get<WorkoutExercise>('workout_exercises');
const setLogs = () => database.get<SetLog>('set_logs');
const routines = () => database.get<Routine>('routines');
const routineExercises = () => database.get<RoutineExercise>('routine_exercises');

function toLoggedSet(s: SetLog): LoggedSet {
  return { weightKg: s.weightKg, reps: s.reps, rpe: s.rpe, isWarmup: s.isWarmup, isFailed: s.isFailed };
}

// ── 조회 / 반응형 ──────────────────────────────────────────────────
export function getWorkout(id: string): Promise<Workout> {
  return workouts().find(id);
}

// 진행 중(active/paused) 세션 1건 — 앱 재시작 시 복구 대상 (SRS-004).
export async function getActiveWorkout(): Promise<Workout | null> {
  const res = await workouts()
    .query(Q.where('state', Q.oneOf(['active', 'paused'])), Q.sortBy('started_at', Q.desc), Q.take(1))
    .fetch();
  return res[0] ?? null;
}

export function queryWorkoutExercises(workoutId: string): Query<WorkoutExercise> {
  return workoutExercises().query(Q.where('workout_id', workoutId), Q.sortBy('sort_order', Q.asc));
}

export function querySetLogs(workoutExerciseId: string): Query<SetLog> {
  return setLogs().query(Q.where('workout_exercise_id', workoutExerciseId), Q.sortBy('set_number', Q.asc));
}

// 직전 세션의 같은 종목 마지막 세트(자동표시·자동채움용 — SRS-003).
export async function getPreviousExerciseSnapshot(
  exerciseId: string,
): Promise<{ weightKg: number; reps: number } | null> {
  const completed = await workouts()
    .query(Q.where('state', 'completed'), Q.sortBy('completed_at', Q.desc))
    .fetch();
  for (const w of completed) {
    const wes = await workoutExercises()
      .query(Q.where('workout_id', w.id), Q.where('exercise_id', exerciseId))
      .fetch();
    if (!wes.length) continue;
    const sets = await setLogs()
      .query(Q.where('workout_exercise_id', Q.oneOf(wes.map((x) => x.id))), Q.sortBy('set_number', Q.desc))
      .fetch();
    const last = sets.find((s) => !s.isWarmup && !s.isFailed) ?? sets[0];
    if (last) return { weightKg: last.weightKg, reps: last.reps };
  }
  return null;
}

// 세션이 시작된 루틴의 종목별 목표 반복범위(점진 제안용 — SRS-010). 블랭크 세션이면 빈 맵.
export async function getWorkoutExerciseTargets(
  workoutId: string,
): Promise<Map<string, { repMin: number; repMax: number }>> {
  const map = new Map<string, { repMin: number; repMax: number }>();
  const w = await workouts().find(workoutId);
  if (!w.routineId) return map;
  const res = await routineExercises().query(Q.where('routine_id', w.routineId)).fetch();
  for (const re of res) {
    const min = re.targetRepsMin ?? 0;
    const max = re.targetRepsMax ?? 0;
    if (min > 0 || max > 0) {
      map.set(re.exerciseId, { repMin: min || max, repMax: max || min });
    }
  }
  return map;
}

// ── 세션 시작 ──────────────────────────────────────────────────────
export async function startWorkoutFromRoutine(routineId: string): Promise<Workout> {
  const routine = await routines().find(routineId);
  const res = await routineExercises()
    .query(Q.where('routine_id', routineId), Q.sortBy('sort_order', Q.asc))
    .fetch();
  const prevByExercise = new Map<string, { weightKg: number; reps: number } | null>();
  for (const re of res) {
    if (!prevByExercise.has(re.exerciseId)) {
      prevByExercise.set(re.exerciseId, await getPreviousExerciseSnapshot(re.exerciseId));
    }
  }
  return database.write(async () => {
    const now = Date.now();
    const workout = await workouts().create((w) => {
      w.routineId = routineId;
      w.name = routine.name;
      w.state = 'active';
      w.startedAt = now;
      w.accumulatedPauseMs = 0;
      w.totalVolumeKg = 0;
      w.prCount = 0;
      w.userId = null;
    });
    await database.batch(
      ...res.map((re, i) =>
        workoutExercises().prepareCreate((we) => {
          we.workoutId = workout.id;
          we.exerciseId = re.exerciseId;
          we.sortOrder = i;
          const prev = prevByExercise.get(re.exerciseId) ?? null;
          we.prevWeightKg = prev?.weightKg ?? null;
          we.prevReps = prev?.reps ?? null;
        }),
      ),
    );
    return workout;
  });
}

export async function startBlankWorkout(): Promise<Workout> {
  return database.write(async () =>
    workouts().create((w) => {
      w.routineId = null;
      w.name = '빠른 운동';
      w.state = 'active';
      w.startedAt = Date.now();
      w.accumulatedPauseMs = 0;
      w.totalVolumeKg = 0;
      w.prCount = 0;
      w.userId = null;
    }),
  );
}

export async function addExerciseToWorkout(workoutId: string, exerciseId: string): Promise<WorkoutExercise> {
  const prev = await getPreviousExerciseSnapshot(exerciseId);
  return database.write(async () => {
    const count = await workoutExercises().query(Q.where('workout_id', workoutId)).fetchCount();
    return workoutExercises().create((we) => {
      we.workoutId = workoutId;
      we.exerciseId = exerciseId;
      we.sortOrder = count;
      we.prevWeightKg = prev?.weightKg ?? null;
      we.prevReps = prev?.reps ?? null;
    });
  });
}

export async function removeWorkoutExercise(id: string): Promise<void> {
  await database.write(async () => {
    const we = await workoutExercises().find(id);
    const sets = await setLogs().query(Q.where('workout_exercise_id', id)).fetch();
    await database.batch(...sets.map((s) => s.prepareMarkAsDeleted()), we.prepareMarkAsDeleted());
  });
}

// ── 세트 로깅 (append-only) ────────────────────────────────────────
export interface LogSetInput {
  weightKg: number;
  reps: number;
  rpe?: number | null;
  isWarmup?: boolean;
  isFailed?: boolean;
}

export async function logSet(workoutExerciseId: string, input: LogSetInput): Promise<SetLog> {
  return database.write(async () => {
    const count = await setLogs().query(Q.where('workout_exercise_id', workoutExerciseId)).fetchCount();
    return setLogs().create((s) => {
      s.workoutExerciseId = workoutExerciseId;
      s.setNumber = count + 1;
      s.weightKg = input.weightKg;
      s.reps = input.reps;
      s.rpe = input.rpe ?? null;
      s.isWarmup = input.isWarmup ?? false;
      s.isFailed = input.isFailed ?? false;
      s.completedAt = Date.now();
    });
  });
}

export async function updateSetLog(
  id: string,
  patch: { weightKg?: number; reps?: number; rpe?: number | null; isWarmup?: boolean; isFailed?: boolean },
): Promise<void> {
  await database.write(async () => {
    const s = await setLogs().find(id);
    await s.update((rec) => {
      if (patch.weightKg !== undefined) rec.weightKg = patch.weightKg;
      if (patch.reps !== undefined) rec.reps = patch.reps;
      if (patch.rpe !== undefined) rec.rpe = patch.rpe;
      if (patch.isWarmup !== undefined) rec.isWarmup = patch.isWarmup;
      if (patch.isFailed !== undefined) rec.isFailed = patch.isFailed;
    });
  });
}

// 세트 삭제 후 남은 세트 번호 재정렬.
export async function deleteSetLog(id: string): Promise<void> {
  await database.write(async () => {
    const target = await setLogs().find(id);
    const weId = target.workoutExerciseId;
    await target.markAsDeleted();
    const remaining = await setLogs()
      .query(Q.where('workout_exercise_id', weId), Q.sortBy('set_number', Q.asc))
      .fetch();
    await database.batch(...remaining.map((s, i) => s.prepareUpdate((rec) => { rec.setNumber = i + 1; })));
  });
}

// ── 일시정지 / 재개 (SRS-004) ──────────────────────────────────────
export async function pauseWorkout(id: string): Promise<void> {
  await database.write(async () => {
    const w = await workouts().find(id);
    if (w.state !== 'active') return;
    await w.update((rec) => {
      rec.state = 'paused';
      rec.pausedAt = Date.now();
    });
  });
}

export async function resumeWorkout(id: string): Promise<void> {
  await database.write(async () => {
    const w = await workouts().find(id);
    if (w.state !== 'paused') return;
    const pausedAt = w.pausedAt;
    const accumulated = w.accumulatedPauseMs;
    await w.update((rec) => {
      rec.state = 'active';
      if (pausedAt) rec.accumulatedPauseMs = accumulated + (Date.now() - pausedAt);
      rec.pausedAt = null;
    });
  });
}

export async function discardWorkout(id: string): Promise<void> {
  await database.write(async () => {
    const w = await workouts().find(id);
    const wes = await workoutExercises().query(Q.where('workout_id', id)).fetch();
    const weIds = wes.map((x) => x.id);
    const sets = weIds.length
      ? await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(weIds))).fetch()
      : [];
    await database.batch(
      ...sets.map((s) => s.prepareMarkAsDeleted()),
      ...wes.map((x) => x.prepareMarkAsDeleted()),
      w.prepareMarkAsDeleted(),
    );
  });
}

// ── 세션 종료 + 요약/PR (SRS-004/005) ──────────────────────────────
async function historicalSnapshotForExercise(exerciseId: string, excludeWorkoutId: string): Promise<PRSnapshot> {
  const completed = await workouts().query(Q.where('state', 'completed')).fetch();
  const ids = completed.map((w) => w.id).filter((id) => id !== excludeWorkoutId);
  if (!ids.length) return EMPTY_PR;
  const wes = await workoutExercises()
    .query(Q.where('exercise_id', exerciseId), Q.where('workout_id', Q.oneOf(ids)))
    .fetch();
  if (!wes.length) return EMPTY_PR;
  const sets = await setLogs()
    .query(Q.where('workout_exercise_id', Q.oneOf(wes.map((x) => x.id))))
    .fetch();
  return snapshotFromSets(sets.map(toLoggedSet));
}

export interface WorkoutPRDetail {
  exerciseId: string;
  exerciseName: string;
  prs: PRResult[];
}

export interface WorkoutSummary {
  workoutId: string;
  totalVolumeKg: number;
  durationSeconds: number;
  workingSets: number;
  prCount: number;
  prs: WorkoutPRDetail[];
}

export async function completeWorkout(id: string): Promise<WorkoutSummary> {
  const workout = await workouts().find(id);
  const wes = await workoutExercises()
    .query(Q.where('workout_id', id), Q.sortBy('sort_order', Q.asc))
    .fetch();

  let totalVolume = 0;
  let workingSets = 0;
  const prDetails: WorkoutPRDetail[] = [];

  for (const we of wes) {
    const sets = await setLogs().query(Q.where('workout_exercise_id', we.id)).fetch();
    const logged = sets.map(toLoggedSet);
    totalVolume += totalVolumeKg(logged);
    workingSets += logged.filter((s) => !s.isWarmup && !s.isFailed).length;

    const current = snapshotFromSets(logged);
    const hist = await historicalSnapshotForExercise(we.exerciseId, id);
    const prs = detectNewPRs(current, hist);
    if (prs.length) {
      let name = '운동';
      try {
        name = (await getExercise(we.exerciseId)).nameKo;
      } catch {
        /* 종목이 삭제된 경우 기본명 유지 */
      }
      prDetails.push({ exerciseId: we.exerciseId, exerciseName: name, prs });
    }
  }

  const now = Date.now();
  const durationSeconds = Math.max(
    0,
    Math.round((now - workout.startedAt - workout.accumulatedPauseMs) / 1000),
  );
  const prCount = prDetails.reduce((n, d) => n + d.prs.length, 0);

  await database.write(async () => {
    await workout.update((rec) => {
      rec.state = 'completed';
      rec.completedAt = now;
      rec.totalVolumeKg = totalVolume;
      rec.durationSeconds = durationSeconds;
      rec.prCount = prCount;
    });
  });

  return { workoutId: id, totalVolumeKg: totalVolume, durationSeconds, workingSets, prCount, prs: prDetails };
}
