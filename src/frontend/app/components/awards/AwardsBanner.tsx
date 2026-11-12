"use client";
// 이달의 리프터 피드 띠(SPEC-063) — 추천·팔로잉 탭 StoryTray 아래 한 줄.
// 로그인했고 이번 달 운동한 날(서버 기준)이 1일 이상일 때만 · 닫은 달은 다시 안 보인다.
// 저장소를 읽기 전·숫자를 받기 전에는 그리지 않는다(깜빡임 · REV-153 화면 M2).
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { awardClient, bannerDismissed, dismissBanner, kstMonth } from "@/lib/awardClient";
import { Icon } from "../ui/Icon";

// [원본] ({ signedIn }: { signedIn: boolean }) — 계정이 바뀌어도 다시 읽지 않았다
// [개선] userId 로 받는다(REV-155 상태 8)
export function AwardsBanner({ userId }: { userId: string | null }) {
  const signedIn = !!userId;
  const [month] = useState(() => kstMonth());
  const [days, setDays] = useState<number | null>(null);
  const [closed, setClosed] = useState<boolean | null>(null);

  useEffect(() => {
    setClosed(bannerDismissed(month));
  }, [month]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 사람이 바뀌면 다시 읽는다
  useEffect(() => {
    setDays(null);
    if (!signedIn || closed !== false) return;
    let alive = true;
    awardClient()
      .getMonth({})
      .then((v) => {
        if (alive) setDays(v.myDays);
      })
      .catch(() => {
        // 띠는 덤이다 — 실패하면 그리지 않는다
      });
    return () => {
      alive = false;
    };
  }, [userId, closed]);

  if (!signedIn || closed !== false || days === null || days < 1) return null;
  return (
    <div
      className="mx-[var(--spacing-lg)] mt-[var(--spacing-sm)] flex items-center border-(--color-line) border-b"
      data-testid="awards-banner"
    >
      <a
        href="/awards"
        className="flex min-h-11 min-w-0 flex-1 items-center gap-[var(--spacing-sm)]"
        data-testid="awards-banner-open"
      >
        <Icon name="trophy-outline" size={20} color="var(--color-ink)" />
        <span className="min-w-0 flex-1 truncate font-semibold text-[length:var(--text-sm)]">
          {t("awards.banner.text", { n: days })}
        </span>
        <Icon name="chevron-forward" size={18} color="var(--color-ink3)" />
      </a>
      <button
        type="button"
        aria-label={t("awards.banner.close")}
        data-testid="awards-banner-close"
        className="flex h-11 w-11 shrink-0 items-center justify-center"
        onClick={() => {
          dismissBanner(month);
          setClosed(true);
        }}
      >
        <Icon name="close" size={20} color="var(--color-ink2)" />
      </button>
    </div>
  );
}
