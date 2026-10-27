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

// ── 받는 쪽: 남의 공유 데이터를 믿지 않는다(QA M-1) ─────────────────────────────
// 피드 「바로 시작」·「내 루틴으로 가져오기」는 남이 올린 운동을 내 기기에 쓴다. 조작한 클라이언트가 종목 300개 ×
// 세트 2,000개를 올리면 그대로 커스텀 종목·세트 수십만 행이 생겨 기기가 멈추고 동기로 서버에도 올라간다.
// 그래서 쓰기 전에 모양을 확인하고 상한에서 자른다(서버 CreatePost 도 같은 상한으로 자른다 — feed/handler.go). @plm SRS-065
export const SHARE_LIMITS = { exercises: 40, setsPerExercise: 50, nameLen: 80, noteLen: 500 } as const;

export interface ReceivedSet {
  weightKg: number;
  reps: number;
  loadMultiplier: number | null;
  isWarmup: boolean;
}
export interface ReceivedExercise {
  name: string;
  exerciseId?: string;
  note?: string;
  sets: ReceivedSet[];
}

const nonNeg = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** 남의 공유 운동 목록 → 상한 안의 깨끗한 목록. 이름이 비었거나 모양이 틀린 항목은 버린다. */
export function clampSharedExercises(raw: unknown): ReceivedExercise[] {
  if (!Array.isArray(raw)) return [];
  const out: ReceivedExercise[] = [];
  for (const item of raw) {
    if (out.length >= SHARE_LIMITS.exercises) break;
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, SHARE_LIMITS.nameLen) : '';
    if (!name) continue;
    const rawSets = Array.isArray(o.sets) ? o.sets.slice(0, SHARE_LIMITS.setsPerExercise) : [];
    const sets: ReceivedSet[] = rawSets
      .filter((st): st is Record<string, unknown> => typeof st === 'object' && st !== null)
      .map((st) => {
        const m = nonNeg(st.loadMultiplier);
        return { weightKg: nonNeg(st.weightKg), reps: Math.round(nonNeg(st.reps)), loadMultiplier: m || null, isWarmup: st.isWarmup === true };
      });
    const ex: ReceivedExercise = { name, sets };
    if (typeof o.exerciseId === 'string' && o.exerciseId.length <= 64) ex.exerciseId = o.exerciseId;
    if (typeof o.note === 'string' && o.note.trim()) ex.note = o.note.trim().slice(0, SHARE_LIMITS.noteLen);
    out.push(ex);
  }
  return out;
}

/**
 * 서버로 **실제로 보내는** 오운완 운동 객체(CreatePost.workout) — 화면이 필드를 따로 고르지 않고 이 함수만 쓴다.
 * 그래야 「총평은 새지 않는다」 테스트가 전송 경로를 지킨다(QA M-4). proto 의 기본값(빈 문자열·0)으로 채운다.
 */
export function toCreatePostWorkout(w: SharedWorkout): {
  workoutId: string;
  workoutName: string;
  totalVolumeKg: number;
  durationSeconds: number;
  workingSets: number;
  prCount: number;
  streakDays: number;
  exercises: { name: string; exerciseId: string; note: string; sets: { weightKg: number; reps: number; loadMultiplier: number }[] }[];
} {
  return {
    workoutId: w.workoutId,
    workoutName: w.workoutName,
    totalVolumeKg: w.totalVolumeKg,
    durationSeconds: w.durationSeconds,
    workingSets: w.workingSets,
    prCount: w.prCount,
    streakDays: w.streakDays,
    exercises: w.exercises.map((ex) => ({
      name: ex.name,
      exerciseId: ex.exerciseId ?? '',
      note: ex.note ?? '',
      sets: ex.sets.map((st) => ({ weightKg: st.weightKg, reps: st.reps, loadMultiplier: st.loadMultiplier ?? 0 })),
    })),
  };
}
