"use client";
// 홈 「담당 회원 N명」 카드(SPEC-050 P2) — 활성 회원이 1명 이상인 코치에게만, 누르면 /coaching.
//
// [원본] ListGrants 를 한 번만 묻는다(로그인·온라인일 때만).
// [개선] 홈을 열 때마다 묻지 않게 모듈 메모리에 60초 담는다(사용자가 바뀌면 버린다) · 코치 의향이 없는 사용자는 묻지 않는다
//   (프로필 User.trainer_intent — 코드 리뷰 L-2). 저장소(localStorage 등)에는 쓰지 않는다.
// 실패·0명·읽는 중에는 **아무것도 그리지 않는다** —
// 홈 맨 아래에 두어 나중에 나타나도 위 줄이 밀리지 않는다(레이아웃 들썩임 없음).
import { GrantStatus, Side } from "@app/contracts";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { coachingClient } from "@/lib/coachingClient";
import { useAuth } from "../AuthProvider";
import { Icon } from "../ui/Icon";
import { AppText } from "../ui/primitives";

const TTL_MS = 60_000;
/** 마지막으로 센 담당 회원 수(사용자별 하나 · 메모리만) */
let memo: { userId: string; at: number; count: number } | null = null;

export function HomeMembersCard() {
  const { user, loading } = useAuth();
  const userId = user?.id;
  const coach = !!user?.trainerIntent;
  const [count, setCount] = useState(() =>
    memo && memo.userId === userId && Date.now() - memo.at < TTL_MS ? memo.count : 0,
  );

  useEffect(() => {
    if (loading || !userId || !coach) {
      setCount(0);
      return;
    }
    if (memo && memo.userId !== userId) memo = null; // 사용자가 바뀌면 버린다
    if (memo && Date.now() - memo.at < TTL_MS) {
      setCount(memo.count);
      return;
    }
    setCount(0);
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    let closed = false;
    coachingClient()
      .listGrants({})
      .then((r) => {
        const n = r.grants.filter(
          (g) => g.roleOfMe === Side.TRAINER && g.status === GrantStatus.ACTIVE,
        ).length;
        memo = { userId, at: Date.now(), count: n };
        if (!closed) setCount(n);
      })
      .catch(() => {});
    return () => {
      closed = true;
    };
  }, [loading, userId, coach]);

  if (count < 1) return null;
  return (
    <a
      href="/coaching"
      data-testid="home-members-card"
      data-count={count}
      className="mt-[var(--spacing-lg)] mb-[var(--spacing-sm)] flex min-h-11 min-w-0 items-center gap-[var(--spacing-sm)] rounded-[var(--radius-md)] border border-(--color-line) border-l-4 border-l-(--color-coaching) bg-(--color-card) px-[var(--spacing-md)] py-[var(--spacing-sm)]"
    >
      <Icon name="people-outline" size={20} color="var(--color-coaching-ink)" />
      <div className="min-w-0 flex-1">
        <AppText variant="body" className="block truncate font-semibold!" data-testid="home-members-count">
          {/* [원본] {t("coaching.homeCard", { count })} — en 「1 clients」(코드 리뷰 L-6) */}
          {count === 1 ? t("coaching.homeCardOne") : t("coaching.homeCard", { count })}
        </AppText>
        <AppText variant="caption" color="textMuted" className="block truncate">
          {t("coaching.homeCardHint")}
        </AppText>
      </div>
      <Icon name="chevron-forward" size={16} color="var(--color-ink3)" />
    </a>
  );
}
