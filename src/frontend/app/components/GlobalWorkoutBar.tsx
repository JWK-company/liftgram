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

  if (!activeWorkoutId || pathname.startsWith("/workout")) return null;

  const elapsed = activeStartedAt && now ? Math.round((now - activeStartedAt) / 1000) : 0;
  const resting = restRemaining != null;
  const fg = resting ? "var(--color-bg)" : "var(--color-on-brand)";

  return (
    // app처럼 **탭 바 위에 떠 있는** 오버레이다(문서 흐름을 차지하지 않는다).
    // 탭 바 높이(61px)만큼 띄우고, 폰 폭 칼럼 안에 맞춰 가운데 정렬한다.
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(61px+var(--spacing-md))] z-40 mx-auto max-w-[560px] px-[var(--spacing-md)]">
      <a
        href="/workout"
        data-testid="global-workout-bar"
        style={{ backgroundColor: resting ? "var(--color-pr)" : "var(--color-brand)" }}
        className="pointer-events-auto flex items-center gap-[var(--spacing-sm)] rounded-[var(--radius-lg)] px-[var(--spacing-md)] py-[var(--spacing-sm)] shadow-lg"
      >
        <Icon name={resting ? "timer-outline" : "barbell-outline"} size={18} color={fg} />
        <span className="min-w-0 flex-1">
          <AppText variant="label" style={{ color: fg }} className="block truncate">
            {resting
              ? t("session.restingBar", { time: clock(restRemaining ?? 0) })
              : activeName || t("routines.activeWorkout")}
          </AppText>
          <AppText variant="caption" style={{ color: fg, opacity: 0.9 }} className="block truncate">
            {t("session.elapsedBar", { time: clock(elapsed) })}
          </AppText>
        </span>
        <Icon name="chevron-forward" size={18} color={fg} />
      </a>
    </div>
  );
}
