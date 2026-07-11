// 개인 기록(PR) 스냅샷·검출 — 종목별 최대중량/최대반복/세트최대볼륨/추정1RM. @plm SRS-005
import { LoggedSet, PRType } from './types';
import { estimateOneRepMax } from './oneRepMax';
import { setVolumeKg, effectiveWeightKg, effectiveReps } from './volume';

export interface PRSnapshot {
  maxWeightKg: number;
  maxReps: number;
  maxVolumeSetKg: number;
  estimated1RM: number;
}

export const EMPTY_PR: PRSnapshot = {
  maxWeightKg: 0,
  maxReps: 0,
  maxVolumeSetKg: 0,
  estimated1RM: 0,
};

// 한 종목의 세트 목록에서 PR 스냅샷 추출(워밍업·실패 제외).
export function snapshotFromSets(sets: LoggedSet[]): PRSnapshot {
  const working = sets.filter((s) => !s.isWarmup && !s.isFailed);
  return {
    maxWeightKg: working.reduce((m, s) => Math.max(m, effectiveWeightKg(s)), 0),
    maxReps: working.reduce((m, s) => Math.max(m, effectiveReps(s)), 0),
    maxVolumeSetKg: working.reduce((m, s) => Math.max(m, setVolumeKg(s)), 0),
    estimated1RM: working.reduce((m, s) => Math.max(m, estimateOneRepMax(effectiveWeightKg(s), effectiveReps(s))), 0),
  };
}

export function mergeSnapshots(a: PRSnapshot, b: PRSnapshot): PRSnapshot {
  return {
    maxWeightKg: Math.max(a.maxWeightKg, b.maxWeightKg),
    maxReps: Math.max(a.maxReps, b.maxReps),
    maxVolumeSetKg: Math.max(a.maxVolumeSetKg, b.maxVolumeSetKg),
    estimated1RM: Math.max(a.estimated1RM, b.estimated1RM),
  };
}

export interface PRResult {
  type: PRType;
  previous: number;
  current: number;
}

// 이번 세션 스냅샷 vs 과거 최고치(이번 세션 제외) → 갱신된 PR 목록.
export function detectNewPRs(current: PRSnapshot, historicalBest: PRSnapshot): PRResult[] {
  const out: PRResult[] = [];
  const cmp: [PRType, number, number][] = [
    ['maxWeight', historicalBest.maxWeightKg, current.maxWeightKg],
    ['maxReps', historicalBest.maxReps, current.maxReps],
    ['maxVolumeSet', historicalBest.maxVolumeSetKg, current.maxVolumeSetKg],
    ['estimated1RM', historicalBest.estimated1RM, current.estimated1RM],
  ];
  const EPS = 1e-6;
  for (const [type, prev, cur] of cmp) {
    if (cur > prev + EPS) out.push({ type, previous: prev, current: cur });
  }
  return out;
}
