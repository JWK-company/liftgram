// @plm SRS-075 SRS-076  근육 집계 조회 — 루틴 계획 세트·운동 중 세션·기간 완료 세트를 domain/muscleLoad.setsByMuscle 하나로 센다(ADR-039).
//
// 조회 규칙:
//   · 종목 근육은 exercises 를 **한 번에**(id 일괄) 읽는다.
//   · 유산소(kind='cardio')는 세지 않는다 — 걷기·러닝이 종아리·전신 세트로 쌓여 근육 균형을 흐리지 않게
//     (기존 「부위별 분포」도 볼륨 0 이라 유산소가 빠졌다 — 같은 결과를 유지).
//   · 워밍업 제외는 setsByMuscle 이 한다(is_warmup · 처방 warmup).
// 화면이 많은 블록을 각각 폴링하지 않도록 세션 세트 전체를 한 질의로 주는 getWorkoutSetLogs 를 여기 둔다.
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import type { Exercise, RoutineExercise, SetLog, WorkoutExercise } from '../db/models';
import { isCardioKind } from '../domain/types';
import {
  emptyMuscleLoad,
  primarySecondaryMuscles,
  setsByMuscle,
  type MapMuscle,
  type MuscleLoad,
  type MuscleLoadItem,
} from '../domain/muscleLoad';
import { getCompletedSets } from './analyticsRepository';

interface ExerciseMuscles {
  primaryMuscles: Exercise['primaryMuscles'];
  secondaryMuscles: Exercise['secondaryMuscles'];
  cardio: boolean;
}

/** 종목 id → 근육(일괄 조회). 없는 종목은 빠진다(집계에서도 빠진다). */
export async function getExerciseMuscles(exerciseIds: readonly string[]): Promise<Map<string, ExerciseMuscles>> {
  const uniq = [...new Set(exerciseIds)];
  const map = new Map<string, ExerciseMuscles>();
  if (!uniq.length) return map;
  const list = await database.get<Exercise>('exercises').query(Q.where('id', Q.oneOf(uniq))).fetch();
  for (const e of list)
    map.set(e.id, {
      primaryMuscles: e.primaryMuscles ?? [],
      secondaryMuscles: e.secondaryMuscles ?? [],
      cardio: isCardioKind(e.kind),
    });
  return map;
}

/** 루틴 종목 한 줄의 계획 작업 세트 수 — 처방이 있으면 처방 중 워밍업 아닌 줄 수, 없으면 target_sets. */
export function plannedWorkingSets(re: Pick<RoutineExercise, 'targetSets' | 'prescription'>): number {
  const rx = re.prescription;
  if (rx && rx.length > 0) return rx.filter((s) => s.setType !== 'warmup').length;
  const n = re.targetSets;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}

export interface RoutineMuscleSummary {
  /** 계획 세트 기준 근육별 세트 */
  load: MuscleLoad;
  /** 미니 그림(2단계)용 주·보조 구역 */
  primary: MapMuscle[];
  secondary: MapMuscle[];
}

/** 루틴의 계획 세트 집계 + 미니 그림 구역(루틴 카드 TodayCard·RecoCard). */
export async function routineMuscleSummary(routineId: string): Promise<RoutineMuscleSummary> {
  const res = await database
    .get<RoutineExercise>('routine_exercises')
    .query(Q.where('routine_id', routineId))
    .fetch();
  if (!res.length) return { load: emptyMuscleLoad(), primary: [], secondary: [] };
  const muscles = await getExerciseMuscles(res.map((r) => r.exerciseId));
  const items: MuscleLoadItem[] = [];
  for (const r of res) {
    const m = muscles.get(r.exerciseId);
    if (!m || m.cardio) continue;
    const sets = plannedWorkingSets(r);
    if (sets <= 0) continue;
    items.push({ primaryMuscles: m.primaryMuscles, secondaryMuscles: m.secondaryMuscles, sets });
  }
  const ps = primarySecondaryMuscles(items);
  return { load: setsByMuscle(items), primary: ps.primary, secondary: ps.secondary };
}

/** 루틴의 계획 세트(routine_exercises.target_sets × 종목 근육) 집계. */
export async function routineMuscleLoad(routineId: string): Promise<MuscleLoad> {
  return (await routineMuscleSummary(routineId)).load;
}

/** 한 운동의 세트 전부를 한 번에(블록 순서 무관). 운동 중 근육 시트·요약이 블록마다 따로 읽지 않게. */
export async function getWorkoutSetLogs(
  workoutId: string,
): Promise<{ blocks: WorkoutExercise[]; sets: SetLog[] }> {
  const blocks = await database
    .get<WorkoutExercise>('workout_exercises')
    .query(Q.where('workout_id', workoutId), Q.sortBy('sort_order', Q.asc))
    .fetch();
  if (!blocks.length) return { blocks, sets: [] };
  const sets = await database
    .get<SetLog>('set_logs')
    .query(Q.where('workout_exercise_id', Q.oneOf(blocks.map((b) => b.id))), Q.sortBy('set_number', Q.asc))
    .fetch();
  return { blocks, sets };
}

export interface SessionMuscleLoad {
  /** 끝낸 작업 세트(done ≠ false — null 은 옛 세트 = 수행됨) */
  done: MuscleLoad;
  /** 이 운동에 잡힌 작업 세트 전부(끝낸 것 포함 — 「끝낸/계획」의 분모) */
  planned: MuscleLoad;
}

/** 운동 중(또는 끝난) 세션의 근육별 끝낸/계획 세트. */
export async function sessionMuscleLoad(workoutId: string): Promise<SessionMuscleLoad> {
  const { blocks, sets } = await getWorkoutSetLogs(workoutId);
  if (!sets.length) return { done: emptyMuscleLoad(), planned: emptyMuscleLoad() };
  const exByBlock = new Map(blocks.map((b) => [b.id, b.exerciseId]));
  const muscles = await getExerciseMuscles(blocks.map((b) => b.exerciseId));
  const done: MuscleLoadItem[] = [];
  const planned: MuscleLoadItem[] = [];
  for (const s of sets) {
    const exId = exByBlock.get(s.workoutExerciseId);
    const m = exId ? muscles.get(exId) : undefined;
    if (!m || m.cardio) continue;
    const item: MuscleLoadItem = {
      primaryMuscles: m.primaryMuscles,
      secondaryMuscles: m.secondaryMuscles,
      isWarmup: s.isWarmup,
      setType: s.setType ?? null,
    };
    planned.push(item);
    if (s.done !== false) done.push(item);
  }
  return { done: setsByMuscle(done), planned: setsByMuscle(planned) };
}

/**
 * 기간 안에 **완료한 운동**의 끝낸 작업 세트 집계(통계 MuscleBalanceCard · 성과 요약).
 * @param startMs 이 시각(포함) 이후 완료 — 0/미지정이면 처음부터
 * @param endMs   이 시각(제외) 전 완료 — 미지정이면 끝까지
 */
export async function periodMuscleLoad(startMs?: number, endMs?: number): Promise<MuscleLoad> {
  const enriched = await getCompletedSets(startMs, endMs);
  if (!enriched.length) return emptyMuscleLoad();
  const muscles = await getExerciseMuscles(enriched.map((e) => e.exerciseId));
  const items: MuscleLoadItem[] = [];
  for (const e of enriched) {
    if (e.done === false) continue;
    const m = muscles.get(e.exerciseId);
    if (!m || m.cardio) continue;
    items.push({
      primaryMuscles: m.primaryMuscles,
      secondaryMuscles: m.secondaryMuscles,
      isWarmup: e.isWarmup,
      setType: e.setType,
    });
  }
  return setsByMuscle(items);
}
