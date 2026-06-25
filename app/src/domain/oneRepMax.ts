// 추정 1RM — Epley 공식 단일 SSOT. @plm SRS-005, ADR-010
//   1RM = w × (1 + reps/30),  reps=1 이면 w.
// ADR-010: 전 모듈이 이 함수 하나만 사용(PR 판정·분석·향후 AI 강도계산 일관성).
// 항상 "추정치"로 라벨링할 것(웰니스 가드레일 — domain/wellness.ts WELLNESS.oneRepMaxCaption).
import { LoggedSet } from './types';

export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

// 세트 목록에서 최고 추정 1RM(워밍업·실패 세트 제외).
export function bestEstimatedOneRepMax(sets: LoggedSet[]): number {
  return sets
    .filter((s) => !s.isWarmup && !s.isFailed)
    .reduce((max, s) => Math.max(max, estimateOneRepMax(s.weightKg, s.reps)), 0);
}
