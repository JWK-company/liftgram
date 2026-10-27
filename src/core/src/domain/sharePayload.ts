// @plm SRS-007 SRS-064  오운완 공유에 싣는 운동 한 벌 — 무엇을 싣고 **무엇을 싣지 않는가**(순수 함수)
//
// 운동 총평(workouts.notes)은 나만 보는 기록이다(SRS-064 · 피드 글과 별개). 공유 데이터는 아래 키만 만든다 —
// 원본 객체를 펼쳐 넣지 않고 필드를 하나씩 고르므로, 운동 행에 새 칸이 생겨도 공유로 새지 않는다(테스트가 키를 고정).

export interface ShareSourceSet {
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  isFailed: boolean;
  loadMultiplier?: number | null;
}
export interface ShareSourceExercise {
  exerciseName: string;
  exerciseId: string;
  /** 종목 메모(작성자 팁) — 공유에 함께 가는 것이 원래 동작이다. 운동 총평과 다르다. */
  note: string | null;
  sets: ShareSourceSet[];
}

export interface SharedExercise {
  name: string;
  exerciseId?: string;
  sets: { weightKg: number; reps: number; loadMultiplier?: number | null }[];
  note?: string;
}

export interface SharedWorkout {
  workoutId: string;
  workoutName: string;
  totalVolumeKg: number;
  durationSeconds: number;
  workingSets: number;
  prCount: number;
  streakDays: number;
  exercises: SharedExercise[];
}

/** 공유 데이터의 최상위 키 — 여기에 없는 것은 싣지 않는다(총평 notes 포함). */
export const SHARED_WORKOUT_KEYS = [
  'workoutId',
  'workoutName',
  'totalVolumeKg',
  'durationSeconds',
  'workingSets',
  'prCount',
  'streakDays',
  'exercises',
] as const;

export function buildSharedWorkout(input: {
  summary: { workoutId: string; totalVolumeKg: number; durationSeconds: number; workingSets: number; prCount: number };
  workoutName: string;
  streakDays: number;
  exercises: ShareSourceExercise[];
}): SharedWorkout {
  return {
    workoutId: input.summary.workoutId,
    workoutName: input.workoutName,
    totalVolumeKg: input.summary.totalVolumeKg,
    durationSeconds: input.summary.durationSeconds,
    workingSets: input.summary.workingSets,
    prCount: input.summary.prCount,
    streakDays: input.streakDays,
    exercises: input.exercises.map((ex) => ({
      name: ex.exerciseName,
      exerciseId: ex.exerciseId,
      note: ex.note ?? undefined,
      // 워밍업·실패 세트는 빼고 보낸다 — 카드에 실리는 것은 실제로 해낸 세트다.
      sets: ex.sets
        .filter((st) => !st.isWarmup && !st.isFailed)
        .map((st) => ({ weightKg: st.weightKg, reps: st.reps, loadMultiplier: st.loadMultiplier })),
    })),
  };
}
