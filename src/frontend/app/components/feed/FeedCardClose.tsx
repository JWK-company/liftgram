"use client";
// 피드 맨 위 카드(이달의 리프터·그룹 챌린지)의 X — 두 카드가 같은 모양을 쓰게 한 곳에 둔다(사용자 지시 3299).
// 누르면 「피드에 보이기」 설정을 끄고, 프로필 설정에서 다시 켤 수 있다고 알린다(+ 되돌리기 · 사용자 지시 3294).
import { t } from "@/lib/i18n";
import { type FeedCard, setFeedCard } from "@/lib/feedCardsPref";
import { useToast } from "../Toast";
import { Icon } from "../ui/Icon";

export function FeedCardClose({ card, label, testId }: { card: FeedCard; label: string; testId: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      className="flex h-11 w-11 shrink-0 items-center justify-center focus-visible:outline-2 focus-visible:outline-(--color-brand) active:opacity-70"
      onClick={() => {
        setFeedCard(card, false);
        toast(t("feedCards.hiddenToast"), "info", {
          label: t("feedCards.undo"),
          testId: `feed-card-undo-${card}`, // 두 카드를 연달아 닫아도 겹치지 않게(리뷰 6)
          onPress: () => setFeedCard(card, true),
        });
        // 버튼이 카드와 함께 사라져 초점이 body 로 떨어지지 않게 — 토스트의 되돌리기로 옮긴다(리뷰 1 · 키보드·스크린리더)
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>(`[data-testid="feed-card-undo-${card}"]`)?.focus(),
        );
      }}
    >
      <Icon name="close" size={20} color="var(--color-ink2)" />
    </button>
  );
}
