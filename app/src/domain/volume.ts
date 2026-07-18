// 볼륨 계산 — 무게×횟수 합. 워밍업·실패 세트 제외. @plm SRS-005
import { LoggedSet, type LoadMode } from './types';

// 종목의 하중모드 결정 — 명시 load_mode 우선, 없으면 기구로 파생(맨몸=bodyweight, 그 외=external). @plm SRS-033
export function resolveLoadMode(ex: { loadMode?: LoadMode | null; equipment: string }): LoadMode {
  if (ex.loadMode === 'assisted' || ex.loadMode === 'bodyweight') return ex.loadMode;
  return ex.equipment === 'bodyweight' ? 'bodyweight' : 'external';
}

export function isWorkingSet(s: LoggedSet): boolean {
  return !s.isWarmup && !s.isFailed;
}

// v9: reps=정자세 횟수(볼륨·PR 기준). 부분반복(partialReps=깔짝)은 별도 필드로 볼륨/PR 제외. @plm SRS-029
// v12: 하중모드 반영 — 어시스트는 체중-무게, 맨몸±가중은 체중+무게. 체중 미입력(bodyweightKg null)이면
//      raw 무게로 폴백(기존 동작 보존). external(기본)은 항상 raw 무게. @plm SRS-033
export function effectiveWeightKg(s: LoggedSet): number {
  const w = Math.max(0, s.weightKg);
  const bw = s.bodyweightKg;
  if (bw != null && bw > 0) {
    if (s.loadMode === 'assisted') return Math.max(0, bw - w); // 보조하중 클수록 실무게↓
    if (s.loadMode === 'bodyweight') return bw + w; // 자체중 + 가중분
  }
  return w;
}
export function effectiveReps(s: LoggedSet): number {
  return s.reps;
}

export function setVolumeKg(s: LoggedSet): number {
  return isWorkingSet(s) ? effectiveWeightKg(s) * effectiveReps(s) : 0;
}

export function totalVolumeKg(sets: LoggedSet[]): number {
  return sets.reduce((sum, s) => sum + setVolumeKg(s), 0);
}

export function workingSetCount(sets: LoggedSet[]): number {
  return sets.filter(isWorkingSet).length;
}

export function totalReps(sets: LoggedSet[]): number {
  return sets.filter(isWorkingSet).reduce((n, s) => n + effectiveReps(s), 0);
}
