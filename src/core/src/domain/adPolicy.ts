// 광고 자리 규칙(SPEC-022 · ADR-050) — 실광고 없이 자리와 가드를 먼저 둔다.
// 빈도 규칙(첫 7일·하루 상한·서포터)은 ADR-050 에 있고, 실광고를 붙일 때 저장소와 함께 만든다.

export type AdPlacement = "home" | "summary" | "feed" | "history" | "stats" | "exercise";

/** 피드에서 광고 사이의 게시물 수(ADR-050). */
export const FEED_AD_EVERY = 6;

/** 추천 탭의 광고 간격(ADR-053) — 첫 칸은 팔로잉과 같은 6번째 글 뒤, 그다음부터 글 3개마다. */
export const RECOMMENDED_AD_EVERY = 3;

/** 추천 탭을 여는 시각 — 개인정보처리방침 시행일(2026-11-12 KST). */
export const FEED_RECOMMENDED_START_MS = Date.parse("2026-11-12T00:00:00+09:00");

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

/** 추천 탭: 5, 8, 11 … 번째 글 뒤에 광고 칸. */
export function recommendedAdAfter(index: number): boolean {
  return index >= FEED_AD_EVERY - 1 && (index + 1 - FEED_AD_EVERY) % RECOMMENDED_AD_EVERY === 0;
}
