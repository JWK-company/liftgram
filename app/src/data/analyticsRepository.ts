// 분석 집계 (SRS-005). 완료 세션 로그 → 볼륨·추정1RM·PR·근육군 분포·추세.
// 모든 수치는 사실 집계만 표시(웰니스 가드레일 — 1RM은 항상 "추정치"로 라벨). @plm SRS-005
import { Q } from '@nozbe/watermelondb';
import type { Query } from '@nozbe/watermelondb';
import { database } from '../db/database';
import { Workout, WorkoutExercise, SetLog, Exercise } from '../db/models';
import {
  setVolumeKg,
  effectiveWeightKg,
  estimateOneRepMax,
  bestEstimatedOneRepMax,
  legacyMachineVariantToV6,
  resolveLoadMode,
  type LoadMode,
  type LoggedSet,
  type MuscleGroup,
} from '../domain';
import { getUserBodyweightKg } from './workoutRepository'; // v12: 어시스트/맨몸 유효무게 @plm SRS-033

const workouts = () => database.get<Workout>('workouts');
const workoutExercises = () => database.get<WorkoutExercise>('workout_exercises');
const setLogs = () => database.get<SetLog>('set_logs');
const exercises = () => database.get<Exercise>('exercises');

interface EnrichedSet {
  workoutId: string;
  completedAt: number;
  exerciseId: string;
  set: LoggedSet;
}

async function getCompletedSets(sinceMs?: number): Promise<EnrichedSet[]> {
  const wClauses: Q.Clause[] = [Q.where('state', 'completed')];
  if (sinceMs) wClauses.push(Q.where('completed_at', Q.gte(sinceMs)));
  const ws = await workouts().query(...wClauses).fetch();
  if (!ws.length) return [];
  const wById = new Map(ws.map((w) => [w.id, w]));
  const wes = await workoutExercises().query(Q.where('workout_id', Q.oneOf(ws.map((w) => w.id)))).fetch();
  if (!wes.length) return [];
  const weById = new Map(wes.map((we) => [we.id, we]));
  // v12: 종목 하중모드 + 사용자 체중 → 어시스트(체중-무게)/맨몸(체중+무게) 유효무게 반영. @plm SRS-033
  const bw = await getUserBodyweightKg();
  const exList = await exercises().query(Q.where('id', Q.oneOf([...new Set(wes.map((w) => w.exerciseId))]))).fetch();
  const modeByEx = new Map<string, LoadMode>(exList.map((e) => [e.id, resolveLoadMode(e)]));
  const sets = await setLogs().query(Q.where('workout_exercise_id', Q.oneOf(wes.map((x) => x.id)))).fetch();
  const out: EnrichedSet[] = [];
  for (const s of sets) {
    const we = weById.get(s.workoutExerciseId);
    if (!we) continue;
    const w = wById.get(we.workoutId);
    if (!w) continue;
    out.push({
      workoutId: w.id,
      completedAt: w.completedAt ?? w.startedAt,
      exerciseId: we.exerciseId,
      set: {
        weightKg: s.weightKg,
        reps: s.reps,
        rpe: s.rpe,
        isWarmup: s.isWarmup,
        isFailed: s.isFailed,
        loadMode: modeByEx.get(we.exerciseId) ?? null,
        bodyweightKg: bw,
      },
    });
  }
  return out;
}

async function exerciseMeta(ids: string[]): Promise<Map<string, { nameKo: string; primary: MuscleGroup | null }>> {
  const map = new Map<string, { nameKo: string; primary: MuscleGroup | null }>();
  if (!ids.length) return map;
  const list = await exercises().query(Q.where('id', Q.oneOf(ids))).fetch();
  for (const e of list) map.set(e.id, { nameKo: e.nameKo, primary: e.primaryMuscles[0] ?? null });
  return map;
}

// ── 개요 ───────────────────────────────────────────────────────────
export interface AnalyticsOverview {
  totalVolumeKg: number;
  sessionCount: number;
  workingSets: number;
  topOneRM: { exerciseId: string; exerciseName: string; estimated1RM: number }[];
}

export async function getOverview(sinceMs?: number): Promise<AnalyticsOverview> {
  const enriched = await getCompletedSets(sinceMs);
  const sessions = new Set(enriched.map((e) => e.workoutId));
  let totalVolume = 0;
  let workingSets = 0;
  const best1RM = new Map<string, number>();
  for (const e of enriched) {
    totalVolume += setVolumeKg(e.set);
    if (!e.set.isWarmup && !e.set.isFailed) {
      workingSets += 1;
      const oneRM = estimateOneRepMax(effectiveWeightKg(e.set), e.set.reps); // v12: 유효무게 기준 @plm SRS-033
      best1RM.set(e.exerciseId, Math.max(best1RM.get(e.exerciseId) ?? 0, oneRM));
    }
  }
  const meta = await exerciseMeta([...best1RM.keys()]);
  const topOneRM = [...best1RM.entries()]
    .map(([exerciseId, estimated1RM]) => ({
      exerciseId,
      exerciseName: meta.get(exerciseId)?.nameKo ?? '운동',
      estimated1RM,
    }))
    .sort((a, b) => b.estimated1RM - a.estimated1RM)
    .slice(0, 3);
  return { totalVolumeKg: totalVolume, sessionCount: sessions.size, workingSets, topOneRM };
}

// ── 주간 볼륨 추세 ─────────────────────────────────────────────────
function weekStartMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // 월요일=0
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export interface TrendPoint {
  bucketMs: number;
  label: string;
  value: number;
}

export async function getVolumeTrend(sinceMs?: number): Promise<TrendPoint[]> {
  const enriched = await getCompletedSets(sinceMs);
  const byWeek = new Map<number, number>();
  for (const e of enriched) {
    const wk = weekStartMs(e.completedAt);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + setVolumeKg(e.set));
  }
  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucketMs, value]) => {
      const d = new Date(bucketMs);
      return { bucketMs, label: `${d.getMonth() + 1}/${d.getDate()}`, value };
    });
}

// ── 근육군 분포(주근육 기준 볼륨 귀속) ─────────────────────────────
export async function getMuscleDistribution(sinceMs?: number): Promise<{ muscle: MuscleGroup; volumeKg: number }[]> {
  const enriched = await getCompletedSets(sinceMs);
  const meta = await exerciseMeta([...new Set(enriched.map((e) => e.exerciseId))]);
  const byMuscle = new Map<MuscleGroup, number>();
  for (const e of enriched) {
    const vol = setVolumeKg(e.set);
    if (vol <= 0) continue;
    const muscle = meta.get(e.exerciseId)?.primary ?? 'other';
    byMuscle.set(muscle, (byMuscle.get(muscle) ?? 0) + vol);
  }
  return [...byMuscle.entries()]
    .map(([muscle, volumeKg]) => ({ muscle, volumeKg }))
    .sort((a, b) => b.volumeKg - a.volumeKg);
}

// ── 종목별 추정 1RM 추세 ───────────────────────────────────────────
export async function getExercise1RMTrend(exerciseId: string): Promise<TrendPoint[]> {
  const enriched = (await getCompletedSets()).filter((e) => e.exerciseId === exerciseId);
  const byWorkout = new Map<string, { completedAt: number; sets: LoggedSet[] }>();
  for (const e of enriched) {
    const cur = byWorkout.get(e.workoutId) ?? { completedAt: e.completedAt, sets: [] };
    cur.sets.push(e.set);
    byWorkout.set(e.workoutId, cur);
  }
  return [...byWorkout.values()]
    .map((w) => ({ completedAt: w.completedAt, value: bestEstimatedOneRepMax(w.sets) }))
    .filter((p) => p.value > 0)
    .sort((a, b) => a.completedAt - b.completedAt)
    .map((p) => {
      const d = new Date(p.completedAt);
      return { bucketMs: p.completedAt, label: `${d.getMonth() + 1}/${d.getDate()}`, value: p.value };
    });
}

// ── 최근 PR(추정1RM 갱신 시점) ─────────────────────────────────────
export interface RecentPR {
  exerciseId: string;
  exerciseName: string;
  completedAt: number;
  estimated1RM: number;
}

export async function getRecentPRs(limit = 10): Promise<RecentPR[]> {
  const enriched = await getCompletedSets();
  // 종목 → 세션별 최고 1RM (시간순)
  const byExercise = new Map<string, Map<string, { completedAt: number; best: number }>>();
  for (const e of enriched) {
    if (e.set.isWarmup || e.set.isFailed) continue;
    const oneRM = estimateOneRepMax(e.set.weightKg, e.set.reps);
    const sessions = byExercise.get(e.exerciseId) ?? new Map();
    const cur = sessions.get(e.workoutId) ?? { completedAt: e.completedAt, best: 0 };
    cur.best = Math.max(cur.best, oneRM);
    sessions.set(e.workoutId, cur);
    byExercise.set(e.exerciseId, sessions);
  }
  const prs: RecentPR[] = [];
  for (const [exerciseId, sessions] of byExercise) {
    let runningMax = 0;
    const ordered = [...sessions.values()].sort((a, b) => a.completedAt - b.completedAt);
    for (const s of ordered) {
      if (s.best > runningMax + 1e-6) {
        runningMax = s.best;
        prs.push({ exerciseId, exerciseName: '', completedAt: s.completedAt, estimated1RM: s.best });
      }
    }
  }
  const meta = await exerciseMeta([...new Set(prs.map((p) => p.exerciseId))]);
  return prs
    .map((p) => ({ ...p, exerciseName: meta.get(p.exerciseId)?.nameKo ?? '운동' }))
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, limit);
}

// ── 히스토리 ───────────────────────────────────────────────────────
export function queryWorkoutHistory(): Query<Workout> {
  return workouts().query(Q.where('state', 'completed'), Q.sortBy('completed_at', Q.desc));
}

export interface WorkoutExerciseDetail {
  workoutExerciseId: string;
  exerciseId: string;
  exerciseName: string;
  machineVariant: string | null; // 머신 기구/브랜드 키(null=기본, 레거시)
  variantKey: string | null; // v6 변형 버킷 키(기구·그립·팔). @plm SRS-028
  note: string | null; // 세션 종목 메모(그날 느낌·포인트). @plm SRS-004
  sets: { setNumber: number; weightKg: number; reps: number; rpe: number | null; isWarmup: boolean; isFailed: boolean; arm: string | null; partialReps: number | null }[];
  volumeKg: number;
  bestEstimated1RM: number;
}

export interface WorkoutDetail {
  workout: Workout;
  exercises: WorkoutExerciseDetail[];
  totalVolumeKg: number;
}

export async function getWorkoutDetail(workoutId: string): Promise<WorkoutDetail> {
  const workout = await workouts().find(workoutId);
  const wes = await workoutExercises()
    .query(Q.where('workout_id', workoutId), Q.sortBy('sort_order', Q.asc))
    .fetch();
  const meta = await exerciseMeta(wes.map((w) => w.exerciseId));
  // v12: 하중모드 + 체중 → 유효무게(어시스트/맨몸) 반영. @plm SRS-033
  const bw = await getUserBodyweightKg();
  const exList = await exercises().query(Q.where('id', Q.oneOf([...new Set(wes.map((w) => w.exerciseId))]))).fetch();
  const modeByEx = new Map<string, LoadMode>(exList.map((e) => [e.id, resolveLoadMode(e)]));
  const details: WorkoutExerciseDetail[] = [];
  let total = 0;
  for (const we of wes) {
    const sets = await setLogs()
      .query(Q.where('workout_exercise_id', we.id), Q.sortBy('set_number', Q.asc))
      .fetch();
    const loadMode = modeByEx.get(we.exerciseId) ?? null;
    const logged: LoggedSet[] = sets.map((s) => ({
      weightKg: s.weightKg,
      reps: s.reps,
      rpe: s.rpe,
      isWarmup: s.isWarmup,
      isFailed: s.isFailed,
      loadMode,
      bodyweightKg: bw,
    }));
    const volumeKg = logged.reduce((sum, s) => sum + setVolumeKg(s), 0);
    total += volumeKg;
    details.push({
      workoutExerciseId: we.id,
      exerciseId: we.exerciseId,
      exerciseName: meta.get(we.exerciseId)?.nameKo ?? '운동',
      machineVariant: we.machineVariant,
      variantKey: we.variantKey ?? legacyMachineVariantToV6(we.machineVariant).key, // 레거시 행 즉석 승계
      note: we.note ?? null,
      sets: sets.map((s) => ({
        setNumber: s.setNumber,
        weightKg: s.weightKg,
        reps: s.reps,
        rpe: s.rpe,
        isWarmup: s.isWarmup,
        isFailed: s.isFailed,
        arm: s.arm ?? null,
        partialReps: s.partialReps ?? null,
      })),
      volumeKg,
      bestEstimated1RM: bestEstimatedOneRepMax(logged),
    });
  }
  return { workout, exercises: details, totalVolumeKg: total };
}
