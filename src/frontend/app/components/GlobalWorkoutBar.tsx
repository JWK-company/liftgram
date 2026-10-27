"use client";
// @plm SRS-004  전역 운동 바 — app의 components/GlobalWorkoutBar.tsx를 웹으로
//
// ─────────────────────────────────────────────────────────────────────────────
// 운동 중이면 **어느 화면에 있든** 하단에 경과 시간이 떠 있고, 누르면 세션으로 돌아간다.
// 종목을 찾으러 카탈로그로 갔다가 돌아오지 못하는 일을 막는 자리다.
//
// 휴식 중에는 골드로 바뀌고 남은 시간을 보여 준다 — 휴식은 전역이라 화면을 옮겨도 계속 흐른다.
//
// 세션 화면에서는 **숨긴다**: 거기엔 자체 헤더 타이머와 휴식 바가 이미 있다.
// ─────────────────────────────────────────────────────────────────────────────
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useSession } from "./SessionProvider";
import { Icon } from "./ui/Icon";
import { AppText } from "./ui/primitives";

/** `MM:SS` — app과 같이 분도 두 자리로 채운다. */
function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function GlobalWorkoutBar() {
  const pathname = usePathname();
  const { activeWorkoutId, activeStartedAt, activeName, restRemaining } = useSession();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!activeWorkoutId) return;
    setNow(Date.now());
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [activeWorkoutId]);

  // 막대가 떠 있는 동안 그 높이를 셸 변수로 알린다 — 화면 안의 sticky 하단(댓글·DM 입력, 루틴 편집 하단)이
  // 막대 밑에 깔리지 않고 그만큼 위에 앉는다(SRS-066 — sticky 가 화면 기준으로 붙게 된 뒤 필요해졌다).
  const visible = !!activeWorkoutId && !pathname.startsWith("/workout");
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--shell-workout-bar", visible ? "60px" : "0px");
    return () => {
      root.style.setProperty("--shell-workout-bar", "0px");
    };
  }, [visible]);

  if (!visible) return null;

  const elapsed = activeStartedAt && now ? Math.round((now - activeStartedAt) / 1000) : 0;
  const resting = restRemaining != null;

  return (
    <>
      {/* 막대 높이만큼 흐름에 자리를 낸다 — 화면 맨 아래 내용이 막대 밑에 깔리지 않게. */}
      <div aria-hidden className="h-[60px] shrink-0" />
      {/* 진행 중 막대(SRS-054 시안 11 · 결정 D2) — 운동 화면을 ⌄ 로 내리면 **모든 탭 위에** 붙는다(음악 앱의 재생 막대).
          탭바 바로 위에 떠 있고, 폰 폭 칼럼 안에 맞춘다. 휴식 중이면 남은 시간이 주인공이다. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[560px] lg:bottom-4">
        <a
          href="/workout"
          data-testid="global-workout-bar"
          className="pointer-events-auto flex items-center gap-[var(--spacing-md)] border-(--color-line) border-t bg-(--color-surface) px-[var(--spacing-lg)] py-[var(--spacing-sm)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: resting ? "var(--color-pr-soft)" : "var(--color-brand-muted)" }}
          >
            <Icon
              name={resting ? "timer-outline" : "barbell-outline"}
              size={18}
              color={resting ? "var(--color-pr)" : "var(--color-brand)"}
            />
          </span>
          <span className="min-w-0 flex-1">
            <AppText variant="label" className="block truncate">
              {t("session.inProgressBar", { name: activeName || t("routines.activeWorkout") })}
            </AppText>
            <AppText
              variant="caption"
              color={resting ? "pr" : "textMuted"}
              className="block truncate tabular-nums"
            >
              {resting
                ? t("session.restingBar", { time: clock(restRemaining ?? 0) })
                : t("session.elapsedBar", { time: clock(elapsed) })}
            </AppText>
          </span>
          <span className="rounded-full bg-(--color-brand) px-[var(--spacing-md)] py-[6px] font-semibold text-(--color-on-brand) text-[length:var(--text-sm)]">
            {t("session.openBar")}
          </span>
        </a>
      </div>
    </>
  );
}
