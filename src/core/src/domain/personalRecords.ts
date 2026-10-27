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

// ── PR 2종 칩(#50) — 중량 PR·볼륨 PR 이 **어느 세트**인지 ── @plm SRS-061
// snapshotFromSets 와 같은 규칙(워밍업·실패 제외 · 유효무게)으로 세트를 고른다 — 칩에 보이는 값과 PR 판정이 같아야 한다.
// 중량: 유효무게 최대(같으면 횟수 많은 것) · 볼륨: 세트 볼륨 최대(같으면 무거운 것).
export function pickPrSets<T extends LoggedSet>(sets: T[]): { weight: T | null; volume: T | null } {
  let weight: T | null = null;
  let volume: T | null = null;
  for (const s of sets) {
    if (s.isWarmup || s.isFailed) continue;
    const w = effectiveWeightKg(s);
    const r = effectiveReps(s);
    if (w <= 0 && r <= 0) continue;
    if (!weight) weight = s;
    else {
      const bw = effectiveWeightKg(weight);
      if (w > bw || (w === bw && r > effectiveReps(weight))) weight = s;
    }
    const v = setVolumeKg(s);
    if (v > 0) {
      if (!volume) volume = s;
      else {
        const bv = setVolumeKg(volume);
        if (v > bv || (v === bv && w > effectiveWeightKg(volume))) volume = s;
      }
    }
  }
  return { weight, volume };
}

// ── PR 수 다시 세기(#51 · QA Q2) — 과거 세트를 고친 뒤 운동의 pr_count 를 맞춘다 ── @plm SRS-061
// completeWorkout 의 판정(종목×칸마다 detectMajorPRs)과 같은 규칙. historyBest 는 **그 운동보다 앞선** 기록만.
export function countMajorPrs(groups: { current: LoggedSet[]; historyBest: PRSnapshot }[]): number {
  return groups.reduce((n, g) => n + detectMajorPRs(snapshotFromSets(g.current), g.historyBest).length, 0);
}

// ── PR 수 다시 세기 — 한 번 훑기(prefix sweep · /qa code M1) ── @plm SRS-061
// 완료 운동을 (completedAt, id) 순으로 한 번 훑으며 칸(key)별 「앞선 최고」를 누적한다 — 운동마다 전체 이력을 다시
// 읽던 O(이후 운동 × 종목 × 전체 운동)를 O(운동 수 + 칸 수)로. 판정 규칙은 countMajorPrs 와 같다.
// 같은 운동 안에 같은 칸 블록이 여럿이면 호출자가 한 그룹으로 합쳐 넘긴다.
export interface PrSweepWorkout {
  id: string;
  completedAt: number;
  groups: { key: string; current: PRSnapshot }[];
}
export function sweepPrCounts(workouts: PrSweepWorkout[]): Map<string, number> {
  const order = [...workouts].sort((a, b) => a.completedAt - b.completedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const best = new Map<string, PRSnapshot>();
  const out = new Map<string, number>();
  for (const w of order) {
    let n = 0;
    for (const g of w.groups) n += detectMajorPRs(g.current, best.get(g.key) ?? EMPTY_PR).length;
    for (const g of w.groups) best.set(g.key, mergeSnapshots(best.get(g.key) ?? EMPTY_PR, g.current));
    out.set(w.id, n);
  }
  return out;
}
