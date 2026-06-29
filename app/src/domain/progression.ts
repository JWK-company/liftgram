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
