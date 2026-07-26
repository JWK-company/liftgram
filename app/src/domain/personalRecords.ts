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

// PR 재개편(2026-07): 종목별 '중량 PR(maxWeight)'·'볼륨 PR(maxVolumeSet)' 2종만 인정.
// 반복·추정1RM은 파생 지표라 PR로 세지 않는다(개수 부풀림 방지 — 사용자 피드백).
export const MAJOR_PR_TYPES: readonly PRType[] = ['maxWeight', 'maxVolumeSet'];

export function detectMajorPRs(current: PRSnapshot, historicalBest: PRSnapshot): PRResult[] {
  return detectNewPRs(current, historicalBest).filter((r) => MAJOR_PR_TYPES.includes(r.type));
}

// 이번 세션 스냅샷 vs 과거 최고치(이번 세션 제외) → 갱신된 PR 목록(4종 전체 — 레거시·분석용).
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
