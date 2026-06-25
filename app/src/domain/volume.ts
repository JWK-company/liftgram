// 볼륨 계산 — 무게×횟수 합. 워밍업·실패 세트 제외. @plm SRS-005
import { LoggedSet } from './types';

export function isWorkingSet(s: LoggedSet): boolean {
  return !s.isWarmup && !s.isFailed;
}

export function setVolumeKg(s: LoggedSet): number {
  return isWorkingSet(s) ? s.weightKg * s.reps : 0;
}

export function totalVolumeKg(sets: LoggedSet[]): number {
  return sets.reduce((sum, s) => sum + setVolumeKg(s), 0);
}

export function workingSetCount(sets: LoggedSet[]): number {
  return sets.filter(isWorkingSet).length;
}

export function totalReps(sets: LoggedSet[]): number {
  return sets.filter(isWorkingSet).reduce((n, s) => n + s.reps, 0);
}
