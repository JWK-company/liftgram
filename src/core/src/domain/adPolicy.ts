// 광고 자리 규칙(SPEC-022 · ADR-050) — 실광고 없이 자리와 가드를 먼저 둔다.
// 빈도 규칙(첫 7일·하루 상한·서포터)은 ADR-050 에 있고, 실광고를 붙일 때 저장소와 함께 만든다.

export type AdPlacement = "home" | "summary" | "feed" | "history" | "stats" | "exercise";

/** 피드에서 광고 사이의 게시물 수(ADR-050). */
export const FEED_AD_EVERY = 6;

export type AdGuardInput = {
  /** 진행 중 운동을 저장소에서 **읽어 냈는가**. 읽기 실패·읽기 전이면 false 다. */
  activeKnown: boolean;
  activeWorkoutId: string | null;
};

/** 운동 중 광고 0 — 운동 중이거나, 운동 중인지 모르면 비운다. 모든 슬롯이 이 판정을 거친다. */
export function adGuard(input: AdGuardInput): boolean {
  return input.activeKnown && input.activeWorkoutId === null;
}

/** 0부터 세는 게시물 순번 뒤에 광고가 오는가(5, 11, 17 …). */
export function feedAdAfter(index: number): boolean {
  return index >= 0 && (index + 1) % FEED_AD_EVERY === 0;
}
