// 추정 1RM — Epley 공식 단일 SSOT. @plm SRS-005, ADR-010
//   1RM = w × (1 + reps/30),  reps=1 이면 w.
// ADR-010: 전 모듈이 이 함수 하나만 사용(PR 판정·분석·향후 AI 강도계산 일관성).
// 항상 "추정치"로 라벨링할 것(웰니스 가드레일 — domain/wellness.ts WELLNESS.oneRepMaxCaption).
import { LoggedSet } from './types';
import { effectiveWeightKg } from './volume';

export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

// 세트 목록에서 최고 추정 1RM(워밍업·실패 세트 제외).
// v12: raw 무게가 아니라 유효무게(어시스트=체중−보조 · 맨몸=체중+가중)로 산출한다 — 그러지 않으면
// "보조무게를 키울수록 1RM이 커지는" 역설이 종목 상세 추세 차트에 그대로 노출된다. @plm SRS-033
export function bestEstimatedOneRepMax(sets: LoggedSet[]): number {
  return sets
    .filter((s) => !s.isWarmup && !s.isFailed)
    // [원본] 원복 시 아래를 주석 해제하고 새 호출을 주석 처리
    // .reduce((max, s) => Math.max(max, estimateOneRepMax(s.weightKg, s.reps)), 0);
    // [개선] 유효무게 기준
    .reduce((max, s) => Math.max(max, estimateOneRepMax(effectiveWeightKg(s), s.reps)), 0);
}
