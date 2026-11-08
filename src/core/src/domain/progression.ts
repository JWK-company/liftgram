// 점진적 과부하 — 더블 프로그레션 제안 + 정체 감지 (순수 로직·테스트 대상). @plm SRS-010
// 규칙은 사용자에게 투명하게(각 제안에 reasonKey). 진단·치료·의료 표현 없음(웰니스 — SRS-015).
//
// 더블 프로그레션: 목표 반복범위(repMin~repMax) 안에서 반복을 쌓다가, 상한(repMax)을 채우면
// 무게를 한 증분 올리고 반복을 하한(repMin)으로 리셋한다. 하한 미달이면 무게를 유지하며 반복을 확보.

export type ProgressionAction = 'increaseWeight' | 'addRep' | 'hold';

export interface ProgressionSuggestion {
  weightKg: number;
  reps: number;
  action: ProgressionAction;
  reasonKey: string; // i18n 키 — 제안 근거를 투명하게 설명
}

export interface ProgressionInput {
  lastWeightKg: number | null; // 직전 세션 기준 세트의 무게(kg)
  lastReps: number | null; // 직전 세션 기준 세트의 반복
  repMin: number; // 목표 반복 하한
  repMax: number; // 목표 반복 상한
  incrementKg: number; // 무게 증분(kg)
}

// 직전 수행을 목표 반복범위와 대조해 다음 세트 목표를 제안한다. 이력 없으면 null.
export function suggestNextSet(input: ProgressionInput): ProgressionSuggestion | null {
  const { lastWeightKg, lastReps, repMin, repMax, incrementKg } = input;
  if (lastWeightKg == null || lastReps == null || lastWeightKg <= 0 || lastReps <= 0) return null;

  const lo = Math.max(1, Math.min(repMin, repMax));
  const hi = Math.max(lo, Math.max(repMin, repMax));

  if (lastReps >= hi) {
    return {
      weightKg: lastWeightKg + Math.max(0, incrementKg),
      reps: lo,
      action: 'increaseWeight',
      reasonKey: 'progression.reason.increaseWeight',
    };
  }
  if (lastReps < lo) {
    return { weightKg: lastWeightKg, reps: lo, action: 'hold', reasonKey: 'progression.reason.hold' };
  }
  return {
    weightKg: lastWeightKg,
    reps: Math.min(lastReps + 1, hi),
    action: 'addRep',
    reasonKey: 'progression.reason.addRep',
  };
}

export interface StallResult {
  stalled: boolean;
  reasonKey: string | null;
}

// 정체 감지: 최근 minSessions 세션의 추정 1RM이 의미있게(>1%) 향상되지 않으면 정체로 본다.
// 권고는 디로드/회복 등 웰니스 범위(진단·치료 표현 금지). 시계열은 오래된→최신 순.
export function detectStall(recentE1RMs: number[], minSessions = 3): StallResult {
  const vals = recentE1RMs.filter((v) => v > 0);
  if (vals.length < minSessions) return { stalled: false, reasonKey: null };
  const window = vals.slice(-minSessions);
  const best = Math.max(...window);
  const first = window[0];
  const improved = best > first * 1.01;
  return improved ? { stalled: false, reasonKey: null } : { stalled: true, reasonKey: 'progression.reason.stall' };
}

// ── 루틴 횟수 범위 → 운동 중 목표·결과·다음 무게(SPEC-043 · SRS-108) ──
// 범위 = 목표, 칸 = 실제 결과. 지난번 작업 세트가 모두 범위 위쪽 값을 채웠으면 무게를 한 단계 올리고 아래쪽 값부터,
// 아래쪽 값에 못 미친 세트가 있으면 같은 무게로 아래쪽 값을 채우고, 범위 안이면 같은 무게로 한 회씩 더.

export type RepResult = 'below' | 'inRange' | 'top';

/** 한 세트의 결과 — 범위 아래 · 범위 안 · 위쪽 값 이상. 범위가 없으면 null */
export function repResult(reps: number, repMin: number | null | undefined, repMax: number | null | undefined): RepResult | null {
  const lo = repMin ?? repMax ?? null;
  const hi = repMax ?? repMin ?? null;
  if (lo == null || hi == null || !(reps > 0)) return null;
  const a = Math.min(lo, hi);
  const b = Math.max(lo, hi);
  if (reps < a) return 'below';
  if (reps >= b) return 'top';
  return 'inRange';
}

export interface DoubleProgressionPlan {
  action: 'increaseWeight' | 'addRep' | 'hold';
  /** 오늘 작업 세트에 넣을 무게(kg) · 대표 횟수(첫 세트) */
  weightKg: number;
  reps: number;
  /** 작업 세트 순서대로의 오늘 횟수 — 범위 안이면 세트마다 지난번 +1(위쪽 값까지 · REV-078 D-5) */
  repsBySet: number[];
  /** 근거 — 지난번 주 세트의 횟수들 */
  lastReps: number[];
  lastWeightKg: number;
}

/**
 * 지난번 작업 세트(웜업 제외 · 순서대로)와 범위로 오늘 값을 정한다. 기록이 없거나 범위가 없으면 null.
 * 기준 무게 = 지난번 작업 세트 중 가장 무거운 무게 · 그 무게로 한 세트들만 본다(백오프·드롭이 섞여도 주 세트로 판단).
 * 주 세트에 실패(F)가 있으면 목표를 못 채운 것 — 무게를 올리지 않는다(REV-078 D-3).
 */
export function planDoubleProgression(input: {
  lastWork: { weightKg: number; reps: number; failed?: boolean }[];
  repMin: number | null | undefined;
  repMax: number | null | undefined;
  incrementKg: number;
}): DoubleProgressionPlan | null {
  const lo0 = input.repMin ?? input.repMax ?? null;
  const hi0 = input.repMax ?? input.repMin ?? null;
  if (lo0 == null || hi0 == null) return null;
  const lo = Math.max(1, Math.min(lo0, hi0));
  const hi = Math.max(lo, Math.max(lo0, hi0));
  const work = input.lastWork.filter((s) => s.weightKg > 0 && (s.reps > 0 || s.failed));
  if (!work.length) return null;
  const top = Math.max(...work.map((s) => s.weightKg));
  const main = work.filter((s) => Math.abs(s.weightKg - top) < 1e-6);
  const lastReps = main.map((s) => s.reps);
  const n = main.length;
  if (main.every((s) => !s.failed && s.reps >= hi)) {
    return { action: 'increaseWeight', weightKg: top + Math.max(0, input.incrementKg), reps: lo, repsBySet: Array(n).fill(lo), lastReps, lastWeightKg: top };
  }
  if (main.some((s) => s.failed || s.reps < lo)) {
    return { action: 'hold', weightKg: top, reps: lo, repsBySet: Array(n).fill(lo), lastReps, lastWeightKg: top };
  }
  const repsBySet = main.map((s) => Math.min(hi, s.reps + 1));
  return { action: 'addRep', weightKg: top, reps: repsBySet[0], repsBySet, lastReps, lastWeightKg: top };
}

/** 기구별 한 단계(kg) — 바벨류 2.5 · 덤벨·케틀벨 2 · 머신·케이블 5 · lb 블록은 바벨·덤벨 5lb · 머신 10lb(REV-078 D-6) */
export function progressionIncrementKg(equipment: string | null | undefined, unit: 'kg' | 'lb'): number {
  const LB = 0.45359237;
  const machine = equipment === 'machine' || equipment === 'cable';
  const dumb = equipment === 'dumbbell' || equipment === 'kettlebell';
  if (unit === 'lb') return (machine ? 10 : 5) * LB;
  return machine ? 5 : dumb ? 2 : 2.5;
}
