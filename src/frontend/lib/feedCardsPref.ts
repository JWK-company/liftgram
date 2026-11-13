// 「피드에 보이기」 설정 — 피드 맨 위의 이달의 리프터 카드·그룹 챌린지 카드를 켜고 끈다(기본 켬 · 사용자 지시 3294·3299).
//
// 옛날에는 카드의 X 가 이 기기 localStorage 에 「닫음」만 남겨, 한 번 닫으면 다시 켤 방법이 없었다
// (챌린지 소개 = 영영 · 이달의 리프터 = 그 달만). 이제 X 는 이 설정을 끄고, 프로필 설정에서 다시 켠다.
//
// muscleMapPref.ts 와 같은 구조: 값은 계정과 함께 옮기고(SYNCED_PREF_KEYS), 읽기는 localStorage 동기식,
// 바꾸면 PREFS_EVENT 를 쏴 열린 화면이 곧바로 따른다. "0" = 끔 · "1" = 켬 · 없음 = 옛 닫음 표식을 이어받음(없으면 켬).
import { useSyncExternalStore } from "react";
import { PREFS_EVENT, getPref, setPref } from "./prefs";

export type FeedCard = "awards" | "challenge";

export const FEED_CARD_KEYS: Record<FeedCard, string> = {
  awards: "liftgram.feedAwards",
  challenge: "liftgram.feedChallenge",
};

/** 옛 「닫음」 표식 — 설정이 아직 없을 때만 처음 값으로 이어받는다(이미 닫아 둔 사람에게 카드가 갑자기 다시 뜨지 않게) */
export const LEGACY_CHALLENGE_DISMISS_KEY = "challenge-feed-intro-dismissed";
// 이달의 리프터 옛 표식은 그 달 것만 본다 — 옛 규칙도 그 달만 숨겼으니 다음 달엔 켜짐으로 돌아오는 것이 의도다(리뷰 2).
// 옛 표식은 기기 단위라 같은 기기의 다른 계정도 이어받는다(옛 동작과 같음 · 알려진 한계 · 리뷰 3).
function legacyAwardsKey(ms: number = Date.now()): string {
  // awardClient.kstMonth 와 같은 계산(그 모듈을 끌어오지 않으려고 한 줄 복사)
  const d = new Date(ms + 9 * 3600_000);
  return `awards-banner-dismissed:${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function legacyOff(card: FeedCard): boolean {
  const k = card === "awards" ? legacyAwardsKey() : LEGACY_CHALLENGE_DISMISS_KEY;
  return localStorage.getItem(k) === "1";
}

function read(card: FeedCard): boolean {
  try {
    const v = getPref(FEED_CARD_KEYS[card]);
    if (v === "0") return false;
    if (v === "1") return true;
    return !legacyOff(card);
  } catch {
    return true; // 저장소를 못 쓰면 기본값(켬)
  }
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(PREFS_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(PREFS_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

const readAwards = () => read("awards");
const readChallenge = () => read("challenge");

/**
 * 지금 보이나 — null = 아직 클라이언트에서 읽기 전(서버 그림). 카드는 null 이면 그리지 않는다
 * (켜짐으로 먼저 그렸다가 꺼진 사람에게서 사라지는 깜빡임 방지).
 */
export function useFeedCard(card: FeedCard): boolean | null {
  return useSyncExternalStore<boolean | null>(
    subscribe,
    card === "awards" ? readAwards : readChallenge,
    () => null,
  );
}

/** 켜고 끈다 — 이 기기에 쓰고 프로필에도 올린다(동기). */
export function setFeedCard(card: FeedCard, on: boolean): void {
  try {
    setPref(FEED_CARD_KEYS[card], on ? "1" : "0");
  } catch {
    return;
  }
  window.dispatchEvent(new Event(PREFS_EVENT));
}
