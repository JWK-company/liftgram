// 볼륨 계산 — 무게×횟수 합. 워밍업·실패 세트 제외. @plm SRS-005
import { LoggedSet } from './types';

export function isWorkingSet(s: LoggedSet): boolean {
  return !s.isWarmup && !s.isFailed;
}

// v6: 유효 무게(보정 반영, 음수 클램프)·유효 반복(정자세만) — 총중량/PR 정확도. @plm SRS-029
export function effectiveWeightKg(s: LoggedSet): number {
  return Math.max(0, s.weightKg + (s.loadAdjustKg ?? 0));
}
export function effectiveReps(s: LoggedSet): number {
  return s.strictReps ?? s.reps;
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
