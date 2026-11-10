"use client";
// 홈 「담당 회원 N명」 카드(SPEC-050 P2) — 활성 회원이 1명 이상인 코치에게만, 누르면 /coaching.
//
// [원본] ListGrants 를 한 번만 묻는다(로그인·온라인일 때만).
// [개선] 홈을 열 때마다 묻지 않게 모듈 메모리에 60초 담는다(사용자가 바뀌면 버린다) · 코치 의향이 없는 사용자는 묻지 않는다
//   (프로필 User.trainer_intent — 코드 리뷰 L-2). 저장소(localStorage 등)에는 쓰지 않는다.
// [개선] SPEC-050 P4 — 회원이 있으면 점검(ListMemberDigest)도 같이 읽어 「N명이 3일 이상 쉬는 중이에요」를 힌트 자리에(같은 60초 메모리).
//   점검이 실패하면 옛 힌트 그대로. 점검을 다 읽은 뒤에 카드를 그린다(힌트 글자가 바뀌며 깜빡이지 않게).
// 실패·0명·읽는 중에는 **아무것도 그리지 않는다** —
// 홈 맨 아래에 두어 나중에 나타나도 위 줄이 밀리지 않는다(레이아웃 들썩임 없음).
import { GrantStatus, Side } from "@app/contracts";
import { REST_ALERT_DAYS, restDays, weekStartMs } from "@app/core/domain/coachDigest";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useDayKey } from "@/lib/useDayKey";
import { coachingClient } from "@/lib/coachingClient";
import { useAuth } from "../AuthProvider";
import { Icon } from "../ui/Icon";
import { AppText } from "../ui/primitives";

const TTL_MS = 60_000;
/** 마지막으로 센 담당 회원 수(사용자별 하나 · 메모리만) */
// [원본] let memo: { userId: string; at: number; count: number } | null = null;
// [개선] day — 센 날(기기 날짜). 자정을 넘기면 「3일 이상 쉬는 중」을 다시 센다(리뷰 낮음)
let memo: { userId: string; at: number; count: number; resting: number; day: string } | null = null;

export function HomeMembersCard() {
  const { user, loading } = useAuth();
  const userId = user?.id;
  const coach = !!user?.trainerIntent;
  const dayKey = useDayKey();
  const fresh = () =>
    memo && memo.userId === userId && memo.day === dayKey && Date.now() - memo.at < TTL_MS ? memo : null;
  const [count, setCount] = useState(() => fresh()?.count ?? 0);
  const [resting, setResting] = useState(() => fresh()?.resting ?? 0);

  useEffect(() => {
    if (loading || !userId || !coach) {
      setCount(0);
      return;
    }
    if (memo && memo.userId !== userId) memo = null; // 사용자가 바뀌면 버린다
    if (memo && memo.day === dayKey && Date.now() - memo.at < TTL_MS) {
      setCount(memo.count);
      setResting(memo.resting);
      return;
    }
    // [원본] setCount(0); setResting(0); — 날이 바뀌어 다시 셀 때 카드가 사라졌다 나타났다
    // [개선] 같은 사용자의 지난 값(memo)이 있으면 새 값이 올 때까지 그대로 둔다
    if (!memo) {
      setCount(0);
      setResting(0);
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    let closed = false;
    coachingClient()
      .listGrants({})
      .then(async (r) => {
        const n = r.grants.filter(
          (g) => g.roleOfMe === Side.TRAINER && g.status === GrantStatus.ACTIVE,
        ).length;
        // 쉬는 회원 수(3일 이상) — 실패하면 0(옛 힌트)
        let rest = 0;
        if (n > 0) {
          try {
            const d = await coachingClient().listMemberDigest({ weekStart: BigInt(weekStartMs()) });
            rest = d.members.filter((m) => {
              const days = m.logView ? restDays(Number(m.lastWorkoutAt)) : null;
              return days !== null && days >= REST_ALERT_DAYS;
            }).length;
          } catch {
            rest = 0;
          }
        }
        memo = { userId, at: Date.now(), count: n, resting: rest, day: dayKey };
        if (!closed) {
          setCount(n);
          setResting(rest);
        }
      })
      .catch(() => {});
    return () => {
      closed = true;
    };
  }, [loading, userId, coach, dayKey]);

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
        <AppText
          variant="caption"
          color="textMuted"
          className="block truncate"
          data-testid="home-members-hint"
        >
          {/* [원본] {t("coaching.homeCardHint")} */}
          {/* [원본] resting > 0 ? t("coaching.homeCardRest", …) — 영어 「1 clients」(리뷰 중간-3) */}
          {resting === 1
            ? t("coaching.homeCardRestOne")
            : resting > 0
              ? t("coaching.homeCardRest", { count: resting })
              : t("coaching.homeCardHint")}
        </AppText>
      </div>
      <Icon name="chevron-forward" size={16} color="var(--color-ink3)" />
    </a>
  );
}
