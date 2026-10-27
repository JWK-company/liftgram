// @plm SRS-075 SRS-076  근육 집계 조회 — 루틴 계획 세트·운동 중 세션·기간 완료 세트를 domain/muscleLoad.setsByMuscle 하나로 센다(ADR-039).
//
// 조회 규칙:
//   · 종목 근육은 exercises 를 **한 번에**(id 일괄) 읽는다.
//   · 유산소(kind='cardio')는 세지 않는다 — 걷기·러닝이 종아리·전신 세트로 쌓여 근육 균형을 흐리지 않게
//     (기존 「부위별 분포」도 볼륨 0 이라 유산소가 빠졌다 — 같은 결과를 유지).
//   · 워밍업·실패 세트 제외는 setsByMuscle 이 한다(is_warmup · 처방 warmup · is_failed — 여기서는 값만 넘긴다).
// 화면이 많은 블록을 각각 폴링하지 않도록 세션 세트 전체를 한 질의로 주는 getWorkoutSetLogs 를 여기 둔다.
import { Q } from '@nozbe/watermelondb';
import { database } from '../db/database';
import type { Exercise, RoutineExercise, SetLog, WorkoutExercise } from '../db/models';
import { isCardioKind } from '../domain/types';
import {
  emptyMuscleLoad,
  isExcludedItem,
  plannedWorkingSets,
  primarySecondaryMuscles,
  setsByMuscle,
  type MapMuscle,
  type MuscleLoad,
  type MuscleLoadItem,
} from '../domain/muscleLoad';
import { getCompletedSets } from './analyticsRepository';
import { setVolumeKg } from '../domain/volume';

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

// 계획 작업 세트 수는 domain 순수 함수(단위 테스트) — 예전 import 경로를 위해 여기서도 내보낸다.
export { plannedWorkingSets };

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
      isFailed: s.isFailed,
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
      isFailed: e.set.isFailed,
    });
  }
  return setsByMuscle(items);
}

export interface PeriodMuscleBalance {
  /** 근육별 작업 세트(periodMuscleLoad 와 같은 값) */
  load: MuscleLoad;
  /** 근육별 볼륨 kg — **세트 수와 같은 세트**(완료·작업 세트·유산소 제외)를 **주근육 각각에** 전부 더한다. 보조근에는 더하지 않는다. */
  volumeKg: Map<MapMuscle, number>;
}

/**
 * 통계 「근육 균형」 카드 한 번의 조회 — 세트 집계와 볼륨 귀속을 **같은 세트·한 번의 getCompletedSets** 로 만든다(P2-4·P2-5).
 * 예전에는 periodMuscleLoad + getMuscleDistribution(첫 주근육 · 유산소 포함)을 따로 불러 같은 범위를 두 번 읽었고,
 * 한 줄 안에서 세트(모든 주근육)와 볼륨(첫 주근육)의 귀속이 달랐다.
 */
export async function periodMuscleBalance(startMs?: number, endMs?: number): Promise<PeriodMuscleBalance> {
  const volumeKg = new Map<MapMuscle, number>();
  const enriched = await getCompletedSets(startMs, endMs);
  if (!enriched.length) return { load: emptyMuscleLoad(), volumeKg };
  const muscles = await getExerciseMuscles(enriched.map((e) => e.exerciseId));
  const items: MuscleLoadItem[] = [];
  for (const e of enriched) {
    if (e.done === false) continue;
    const m = muscles.get(e.exerciseId);
    if (!m || m.cardio) continue;
    const item: MuscleLoadItem = {
      primaryMuscles: m.primaryMuscles,
      secondaryMuscles: m.secondaryMuscles,
      isWarmup: e.isWarmup,
      setType: e.setType,
      isFailed: e.set.isFailed,
    };
    items.push(item);
    if (isExcludedItem(item)) continue;
    const vol = setVolumeKg(e.set);
    if (!(vol > 0)) continue;
    for (const g of new Set(m.primaryMuscles)) {
      if (g === 'fullBody' || g === 'other') continue;
      const mm = g as MapMuscle;
      volumeKg.set(mm, (volumeKg.get(mm) ?? 0) + vol);
    }
  }
  return { load: setsByMuscle(items), volumeKg };
}

/**
 * 루틴 종목 줄이 바뀌면(이 기기 편집·다른 기기 동기) 알린다 — 루틴 카드 그림이 낡지 않게(/qa P2-9).
 * 처음 구독할 때 한 번 바로 부르고, 종목·계획 세트가 달라질 때만 다시 부른다(서명 문자열이 같으면 부르지 않음).
 * @returns 구독 해제
 */
export function watchRoutineExercises(routineId: string, onChange: (signature: string) => void): () => void {
  let last: string | null = null;
  const sub = database
    .get<RoutineExercise>('routine_exercises')
    .query(Q.where('routine_id', routineId))
    .observeWithColumns(['exercise_id', 'target_sets', 'prescription'])
    .subscribe((rows) => {
      const sig = rows
        .map((r) => `${r.id}:${r.exerciseId}:${plannedWorkingSets(r)}`)
        .sort()
        .join(',');
      if (sig === last) return;
      last = sig;
      onChange(sig);
    });
  return () => sub.unsubscribe();
}
