// 볼륨 계산 — 무게×횟수 합. 워밍업·실패 세트 제외. @plm SRS-005
import { LoggedSet } from './types';

export function isWorkingSet(s: LoggedSet): boolean {
  return !s.isWarmup && !s.isFailed;
}

// v9: reps=정자세 횟수(볼륨·PR 기준). 부분반복(partialReps=깔짝)은 별도 필드로 볼륨/PR 제외. @plm SRS-029
// (v6 보조·가중(loadAdjust)·정자세비중(strictReps)은 폐기 — 이 함수들은 하위호환 유지용.)
export function effectiveWeightKg(s: LoggedSet): number {
  return Math.max(0, s.weightKg);
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
