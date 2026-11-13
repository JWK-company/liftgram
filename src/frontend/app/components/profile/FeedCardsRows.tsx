"use client";
// 프로필 설정 — 「피드에 이달의 리프터 보이기」·「피드에 그룹 챌린지 보이기」 스위치 두 줄(사용자 지시 3294·3299).
// 피드 카드의 X 로 끈 것을 여기서 다시 켠다. MuscleMapRow 와 같은 모양·같은 구조(줄 전체가 role="switch" 버튼 하나).
import { t } from "@/lib/i18n";
import { type FeedCard, setFeedCard, useFeedCard } from "@/lib/feedCardsPref";

function Row({ card, title, testId }: { card: FeedCard; title: string; testId: string }) {
  const on = useFeedCard(card) !== false; // 읽기 전(서버 그림)은 기본값(켬)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={title}
      data-testid={testId}
      onClick={() => setFeedCard(card, !on)}
      // ListRow(ui/rows.tsx)·MuscleMapRow 와 같은 줄 모양
      className="flex min-h-[52px] w-full items-center gap-[var(--spacing-md)] px-[var(--spacing-xs)] py-[var(--spacing-md)] text-left active:bg-(--color-surface-alt)"
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-(--color-ink) text-[length:var(--text-md)]">{title}</span>
      </span>
      <span aria-hidden className="flex h-[44px] w-[56px] shrink-0 items-center justify-center">
        <span
          style={{ backgroundColor: on ? "var(--color-brand)" : "var(--color-line-strong)" }}
          className="relative block h-[28px] w-[48px] rounded-[var(--radius-pill)] transition-colors"
        >
          <span
            style={{ transform: on ? "translateX(20px)" : "translateX(0)" }}
            className="absolute top-[2px] left-[2px] block h-[24px] w-[24px] rounded-full bg-(--color-on-brand) shadow transition-transform"
          />
        </span>
      </span>
    </button>
  );
}

/** 챌린지 카드는 로그인한 사람에게만 나오므로 그 줄도 로그인했을 때만 */
export function FeedCardsRows({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <Row card="awards" title={t("feedCards.awardsSetting")} testId="switch-feed-awards" />
      {signedIn ? (
        <Row card="challenge" title={t("feedCards.challengeSetting")} testId="switch-feed-challenge" />
      ) : null}
    </>
  );
}
