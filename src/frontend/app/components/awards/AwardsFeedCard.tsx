"use client";
// 이달의 리프터 피드 카드(사용자 지시 2626) — 추천·팔로잉 탭 맨 위에 늘 보인다(로그인 · 운동한 날과 무관).
// [원본] AwardsBanner — 로그인 + 이번 달 운동한 날 ≥ 1 일 때만 한 줄 띠라, 발표 전엔 /awards 를 주소로만 열 수 있었다.
// 발표된 달이 있으면 가장 최근 수상자, 없으면 「예시」 수상자(앱 코드의 고정 글 · DB 행 아님 · 링크 없음)를 함께 보인다.
// 카드 전체가 /awards 로 가는 링크 하나다(이름 줄에 따로 링크를 두지 않는다).
// [원본] 닫으면 그 달엔 다시 안 보인다(띠와 같은 열쇠) → [개선] X = 「피드에 보이기」 끄기, 프로필 설정에서 다시 켬.
import type { AwardMonth } from "@app/contracts";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
// [원본] import { awardClient, bannerDismissed, dismissBanner, FIRST_MONTH, … } — 닫음은 이제 「피드에 보이기」 설정(lib/feedCardsPref.ts)
import {
  awardClient,
  FIRST_MONTH,
  kstMonth,
  monthLabel,
  nextMonth,
  prevMonth,
  STEADY_GOAL,
} from "@/lib/awardClient";
import { useFeedCard } from "@/lib/feedCardsPref";
import { FeedCardClose } from "../feed/FeedCardClose";
import { Icon } from "../ui/Icon";
import { categoryLabel } from "./parts";

const CATS = ["steady", "popular", "pick"] as const;

function winnerName(w: AwardMonth["winners"][number]): string {
  if (w.hidden) return t("awards.hiddenWinner");
  if (w.withdrawn) return t("awards.withdrawnWinner");
  return w.displayName;
}

type Loaded = { latest: AwardMonth | null; days: number | null; goal: number };
// 탭을 오가며 카드가 다시 붙어도 사라졌다 나타나지 않게 — 달·사람별로 받은 값을 기억한다(리뷰 중간 3)
const cache = new Map<string, Loaded>();

export function AwardsFeedCard({ userId }: { userId: string | null }) {
  const [month] = useState(() => kstMonth());
  // [원본] const [closed, setClosed] = useState<boolean | null>(null); — 닫으면 그 달만 숨고 다시 켤 길이 없었다
  // [개선] 「피드에 보이기」 설정 — null = 읽기 전 · 끄면 프로필 설정에서 다시 켬(사용자 지시 3294)
  const shown = useFeedCard("awards");
  const closed: boolean | null = shown === null ? null : !shown;
  const key = `${month}:${userId ?? ""}`;
  // undefined = 아직(또는 실패 — 실패면 그리지 않는다: 발표가 있었는데 「첫 발표는…」을 말하지 않게 · 리뷰 중간 2)
  const [data, setData] = useState<Loaded | undefined>(() => cache.get(key));

  // [원본] useEffect(() => { setClosed(bannerDismissed(month)); }, [month]);

  useEffect(() => {
    const hit = cache.get(key);
    setData(hit);
    // 기억한 값이 있으면 먼저 그리고 뒤에서 새로 받는다(운동 뒤 숫자가 낡지 않게)
    if (closed !== false) return;
    let alive = true;
    const c = awardClient();
    // 두 값을 함께 받아 한 번에 그린다 — 늦게 붙는 줄로 피드가 두 번 밀리지 않게(리뷰 중간 3)
    Promise.all([
      c.listMonths({ limit: 1 }),
      userId ? c.getMonth({}).catch(() => null) : Promise.resolve(null),
    ])
      .then(([r, v]) => {
        const got: Loaded = {
          latest: r.months[0] ?? null,
          days: v ? v.myDays : null,
          // [원본] STEADY_GOAL 고정 — 서버 문턱을 따른다(/awards 와 같게 · 리뷰 중간 7)
          goal: v?.steadyThreshold || STEADY_GOAL,
        };
        cache.set(key, got);
        if (alive) setData(got);
      })
      .catch(() => {
        // 목록을 못 받으면 그리지 않는다(다음에 피드를 열 때 다시 받는다)
      });
    return () => {
      alive = false;
    };
  }, [key, userId, closed]);

  // 다 받기 전에는 그리지 않는다 — 예시가 실제 수상자로 바뀌어 보이는 깜빡임 방지
  if (closed !== false || !data) return null;
  const { latest, days, goal } = data;
  const last = prevMonth(month);
  const example = latest === null;
  // 지난 달이 아직 발표 전(다음 달 1~2일)이면 그 안내를 함께(/awards 의 preparingLast 와 같다 · 리뷰 중간 1)
  const preparingLast = latest !== null && latest.month !== last && last >= FIRST_MONTH;

  return (
    <section
      className="mx-[var(--spacing-lg)] mt-[var(--spacing-sm)] flex items-start border-(--color-line) border-b"
      data-testid="awards-banner"
      aria-label={t("awards.title")}
    >
      <a
        href="/awards"
        className="flex min-w-0 flex-1 flex-col gap-[var(--spacing-xs)] py-[var(--spacing-sm)] focus-visible:outline-2 focus-visible:outline-(--color-brand) active:opacity-70"
        data-testid="awards-banner-open"
      >
        <span className="flex min-h-7 items-center gap-[var(--spacing-sm)]">
          <Icon name="trophy-outline" size={20} color="var(--color-ink)" />
          <span className="min-w-0 flex-1 truncate font-semibold text-[length:var(--text-sm)]">
            {/* [원본] awards.titleMonth(이번 달) — 아래 수상자가 지난 달이라 헷갈렸다(리뷰 중간 1) */}
            {t("awards.title")}
          </span>
          <Icon name="chevron-forward" size={18} color="var(--color-ink3)" />
        </span>

        {example ? (
          <span className="flex flex-col gap-[2px]" data-testid="awards-feed-example">
            <span className="flex items-center gap-[var(--spacing-xs)] text-[length:var(--text-xs)] text-(--color-ink2)">
              {/* 카드 한 장만 봐도 예시임을 알게 — /awards 의 예시 카드와 같은 글자 표식 */}
              <span
                className="shrink-0 border border-(--color-line-strong) border-dashed px-[var(--spacing-xs)]"
                aria-hidden
              >
                {t("awards.exampleTag")}
              </span>
              <span className="min-w-0 truncate">{t("awards.exampleTitle")}</span>
            </span>
            {CATS.map((c) => (
              <span key={c} className="flex min-w-0 gap-[var(--spacing-sm)] text-[length:var(--text-sm)]">
                <span className="w-[5.5em] shrink-0 text-(--color-ink3)">{categoryLabel(c)}</span>
                <span className="min-w-0 text-(--color-ink2)">
                  {(c === "steady" ? ["A", "B", "C"] : c === "popular" ? ["D"] : ["E"])
                    .map((letter) => t("awards.exampleName", { letter }))
                    .join(" · ")}
                </span>
              </span>
            ))}
            <span
              className="text-[length:var(--text-xs)] text-(--color-ink3)"
              data-testid="awards-feed-announce"
            >
              {last >= FIRST_MONTH
                ? t("awards.preparing", { month: monthLabel(last) })
                : t("awards.firstAnnounce", { month: monthLabel(nextMonth(FIRST_MONTH)) })}
            </span>
          </span>
        ) : (
          <span className="flex flex-col gap-[2px]" data-testid="awards-feed-winners">
            <span className="text-[length:var(--text-xs)] text-(--color-ink2)">
              {t("awards.winnersTitle", { month: monthLabel(latest.month) })}
            </span>
            {CATS.map((c) => {
              const ws = latest.winners.filter((w) => w.category === c);
              if (ws.length === 0) return null;
              return (
                <span key={c} className="flex min-w-0 gap-[var(--spacing-sm)] text-[length:var(--text-sm)]">
                  <span className="w-[5.5em] shrink-0 text-(--color-ink3)">{categoryLabel(c)}</span>
                  <span className="min-w-0 break-words font-semibold">{ws.map(winnerName).join(" · ")}</span>
                </span>
              );
            })}
            {preparingLast ? (
              <span
                className="text-[length:var(--text-xs)] text-(--color-ink3)"
                data-testid="awards-feed-preparing"
              >
                {t("awards.preparing", { month: monthLabel(last) })}
              </span>
            ) : null}
          </span>
        )}

        {userId && days !== null ? (
          <span className="text-[length:var(--text-xs)] text-(--color-ink2)" data-testid="awards-feed-mydays">
            {t("awards.feed.myDays", { n: days, goal })}
          </span>
        ) : null}
      </a>
      {/* [원본] <button aria-label={t("awards.banner.close")} data-testid="awards-banner-close" onClick={() => { dismissBanner(month); setClosed(true); }}>
            <Icon name="close" size={20} color="var(--color-ink2)" /></button> */}
      {/* [개선] 두 카드가 같은 X(FeedCardClose) · 끄면 프로필 설정에서 다시 켬(사용자 지시 3294·3299) */}
      <FeedCardClose card="awards" label={t("awards.banner.close")} testId="awards-banner-close" />
    </section>
  );
}
