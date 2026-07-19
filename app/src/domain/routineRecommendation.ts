// 오늘의 추천 루틴 (SRS-034) — 완료 운동 이력으로 "오늘 할 부위"를 예측하고 그 부위의
// 가장 최신 수행 루틴을 추천한다. 분할은 타겟 근육(대표근육) 기준으로 돌고, 실제 추천 루틴은
// 해당 근육묶음의 가장 최근 수행 버전을 고른다. RN 의존성 0 — 순수 계산(테스트 가능).
// @plm SRS-034
import { ALL_MUSCLE_GROUPS, type MuscleGroup } from './types';
import { dayNumber } from './streak';

// 추천 성립을 위한 "꾸준함" 게이트 — 일주일 이상 꾸준히 운동해야 예측 신뢰도가 생긴다.
export const RECO_MIN_WORKOUT_DAYS = 4; // 최소 운동 '일수'(중복일 제외)
export const RECO_MIN_SPAN_DAYS = 6; // 첫 운동 ~ 마지막 운동 사이 ≥6일(≈일주일 이상 지속)

// repo가 채워 넘기는 완료 운동 1건. routineId/routineName은 프리스타일이거나 루틴이 삭제됐으면 null.
export interface RecoWorkout {
  completedAtMs: number;
  routineId: string | null;
  routineName: string | null;
  primaryMuscles: MuscleGroup[]; // 그 세션 각 종목의 주근육(종목당 1개) — 정렬순서 유지
}

export interface RoutineRecommendation {
  status: 'ok' | 'insufficient';
  routineId?: string;
  routineName?: string;
  muscle?: MuscleGroup; // 추천된 타겟 부위(대표근육)
  lastPerformedMs?: number; // 그 루틴을 마지막으로 수행한 시각
}

// 세션의 대표 부위 = 주근육이 가장 많이 등장한 근육(동률이면 먼저 등장한 쪽). 종목 없으면 null.
export function dominantMuscle(muscles: MuscleGroup[]): MuscleGroup | null {
  if (!muscles.length) return null;
  const counts = new Map<MuscleGroup, number>();
  for (const m of muscles) counts.set(m, (counts.get(m) ?? 0) + 1);
  let best: MuscleGroup | null = null;
  let bestN = 0;
  for (const [m, n] of counts) {
    if (n > bestN) {
      bestN = n;
      best = m;
    }
  }
  return best;
}

interface Row {
  completedAtMs: number;
  day: number;
  routineId: string | null;
  routineName: string | null;
  bucket: MuscleGroup;
}

// entries = 최근(예: 35일) 완료 운동들. nowMs = 현재 시각.
// 반환: status 'ok'면 오늘 추천 루틴, 'insufficient'면 기록 부족(버튼 비활성 + 안내).
export function recommendTodayRoutine(entries: RecoWorkout[], nowMs: number): RoutineRecommendation {
  const today = dayNumber(nowMs);
  const rows: Row[] = [];
  for (const e of entries) {
    if (!Number.isFinite(e.completedAtMs)) continue;
    const bucket = dominantMuscle(e.primaryMuscles);
    if (!bucket) continue; // 대표 부위 없는 세션(전부 종목 미상)은 사이클에서 제외
    const day = dayNumber(e.completedAtMs);
    if (day > today) continue;
    rows.push({ completedAtMs: e.completedAtMs, day, routineId: e.routineId, routineName: e.routineName, bucket });
  }
  rows.sort((a, b) => a.completedAtMs - b.completedAtMs); // 시간 오름차순

  // 꾸준함 게이트 — 오늘 세션 포함 전체로 판정.
  const distinctDays = new Set(rows.map((r) => r.day)).size;
  const span = rows.length ? rows[rows.length - 1].day - rows[0].day : 0;
  if (distinctDays < RECO_MIN_WORKOUT_DAYS || span < RECO_MIN_SPAN_DAYS) {
    return { status: 'insufficient' };
  }

  // 예측은 "다음 세션"이므로 오늘 이미 한 세션은 제외.
  const past = rows.filter((r) => r.day < today);
  if (!past.length) return { status: 'insufficient' };

  // 부위 → 마지막 수행일 / 가장 최근 (존재하는) 루틴. past가 오름차순이라 뒤가 최신.
  const bucketLastDay = new Map<MuscleGroup, number>();
  const bucketRoutine = new Map<MuscleGroup, { routineId: string; routineName: string; completedAtMs: number }>();
  for (const r of past) {
    bucketLastDay.set(r.bucket, r.day);
    if (r.routineId && r.routineName) {
      bucketRoutine.set(r.bucket, { routineId: r.routineId, routineName: r.routineName, completedAtMs: r.completedAtMs });
    }
  }

  // 전이 모델 — 사용자는 보통 루틴을 반복하므로, "직전 부위 다음에 무엇을 했는가"가 최선의 신호.
  const lastBucket = past[past.length - 1].bucket;
  const successor = new Map<MuscleGroup, number>();
  for (let i = 1; i < past.length; i += 1) {
    if (past[i - 1].bucket === lastBucket && past[i].bucket !== lastBucket) {
      const nb = past[i].bucket;
      successor.set(nb, (successor.get(nb) ?? 0) + 1);
    }
  }

  const lastDayOf = (m: MuscleGroup) => bucketLastDay.get(m) ?? -Infinity;
  const muscleOrder = (m: MuscleGroup) => ALL_MUSCLE_GROUPS.indexOf(m);

  // 후보 순서: ① 직전 부위의 최빈 다음 부위(전이) → ② 가장 오래 안 한 부위(오래 쉰 순) → ③ 최후로 직전 부위.
  const candidates: MuscleGroup[] = [];
  if (successor.size) {
    const ranked = [...successor.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]; // 전이 빈도 높은 순
      if (lastDayOf(a[0]) !== lastDayOf(b[0])) return lastDayOf(a[0]) - lastDayOf(b[0]); // 오래 쉰 순
      return muscleOrder(a[0]) - muscleOrder(b[0]);
    });
    for (const [m] of ranked) candidates.push(m);
  }
  const lru = [...bucketLastDay.entries()]
    .sort((a, b) => (a[1] !== b[1] ? a[1] - b[1] : muscleOrder(a[0]) - muscleOrder(b[0])))
    .map(([m]) => m);
  for (const m of lru) if (m !== lastBucket && !candidates.includes(m)) candidates.push(m);
  for (const m of lru) if (!candidates.includes(m)) candidates.push(m); // 단일 부위 반복 등 최후 폴백

  // 추천 가능한(현존 루틴이 있는) 첫 후보를 채택.
  for (const bucket of candidates) {
    const routine = bucketRoutine.get(bucket);
    if (routine) {
      return {
        status: 'ok',
        routineId: routine.routineId,
        routineName: routine.routineName,
        muscle: bucket,
        lastPerformedMs: routine.completedAtMs,
      };
    }
  }
  return { status: 'insufficient' };
}
