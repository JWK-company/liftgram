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
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { useSession } from "./SessionProvider";
import { useToast } from "./Toast";
import { ConfirmDialog } from "./ui/Dialog";
import { Icon } from "./ui/Icon";
import { AppText } from "./ui/primitives";

/** `MM:SS` — app과 같이 분도 두 자리로 채운다. */
function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function GlobalWorkoutBar() {
  const pathname = usePathname();
  const { activeWorkoutId, activeStartedAt, activeName, restRemaining, setActive, clearRest } = useSession();
  const [now, setNow] = useState<number | null>(null);
  // 막대에서 바로 운동 취소(2026-10-27) — 운동 화면 ⋯ 「운동 취소」와 **같은 확인창**을 거친다(잘못 눌러도 안 지워진다). @plm SRS-068
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const toast = useToast();
  const discard = () => {
    if (!activeWorkoutId || discarding) return;
    const id = activeWorkoutId;
    setDiscarding(true);
    void (async () => {
      try {
        // 순서는 운동 화면과 같다: 폐기 → 내려쓰기 → 셸 상태 해제 → 휴식 정리. 화면은 그대로 둔다.
        const repo = await import("@app/core/data/workoutRepository");
        await repo.discardWorkout(id);
        const { flushLocalDb } = await import("@/lib/localDb");
        await flushLocalDb();
        setActive(null);
        clearRest();
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), "error");
      } finally {
        setDiscarding(false);
        setConfirmDiscard(false);
      }
    })();
  };

  useEffect(() => {
    if (!activeWorkoutId) return;
    setNow(Date.now());
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [activeWorkoutId]);

  // 막대가 떠 있는 동안 그 높이를 셸 변수로 알린다 — 화면 안의 sticky 하단(댓글·DM 입력, 루틴 편집 하단)이
  // 막대 밑에 깔리지 않고 그만큼 위에 앉는다(SRS-066 — sticky 가 화면 기준으로 붙게 된 뒤 필요해졌다).
  const visible = !!activeWorkoutId && !pathname.startsWith("/workout");
  const barRef = useRef<HTMLDivElement>(null);
  // [원본] 높이를 60px 로 박아 두었다 — 데스크톱(lg)에서는 막대가 바닥에서 16px 떠 있어 아래 요소가 9px 깔렸다(QA M-2)
  // root.style.setProperty("--shell-workout-bar", visible ? "60px" : "0px");
  // [개선] 막대가 **실제로 차지하는 높이**를 잰다(ResizeObserver · 창 크기 변화). 기준은 하단 요소가 앉는 바닥:
  //   · 폰(탭바가 아래): 탭바 위끝 − 막대 위끝(하단 요소는 `56px + 이 값` 에 앉는다)
  //   · 넓은 화면(탭바가 왼쪽 세로): 화면 아래끝 − 막대 위끝(하단 요소는 `이 값` 에 앉는다)
  // 글자를 키우거나 이름이 길어 두 줄이 돼도 맞는다.
  useEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.style.setProperty("--shell-workout-bar", "0px");
      return;
    }
    const el = barRef.current;
    const measure = () => {
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const nav = document.querySelector<HTMLElement>('[data-testid="shell-nav"]');
      const wide = window.matchMedia("(min-width: 1024px)").matches;
      const base = !wide && nav ? nav.getBoundingClientRect().top : window.innerHeight;
      root.style.setProperty("--shell-workout-bar", `${Math.max(0, Math.ceil(base - top))}px`);
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (el && ro) ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
      root.style.setProperty("--shell-workout-bar", "0px");
    };
  }, [visible]);

  if (!visible) return null;

  const elapsed = activeStartedAt && now ? Math.round((now - activeStartedAt) / 1000) : 0;
  const resting = restRemaining != null;

  return (
    <>
      {/* 막대 높이만큼 흐름에 자리를 낸다 — 화면 맨 아래 내용이 막대 밑에 깔리지 않게. */}
      <div aria-hidden className="shrink-0" style={{ height: "var(--shell-workout-bar, 60px)" }} />
      {/* 진행 중 막대(SRS-054 시안 11 · 결정 D2) — 운동 화면을 ⌄ 로 내리면 **모든 탭 위에** 붙는다(음악 앱의 재생 막대).
          탭바 바로 위에 떠 있고, 폰 폭 칼럼 안에 맞춘다. 휴식 중이면 남은 시간이 주인공이다. */}
      <div
        ref={barRef}
        className="pointer-events-none fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-[560px] lg:bottom-4"
      >
        {/* 링크와 취소 버튼은 **형제**다 — 링크 안에 버튼을 두면 누르는 순간 운동 화면으로 가 버린다(/qa spec Q5) @plm SRS-068 */}
        <div className="pointer-events-auto flex items-center border-(--color-line) border-t bg-(--color-surface) pr-[var(--spacing-sm)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
          <a
            href="/workout"
            data-testid="global-workout-bar"
            className="flex min-w-0 flex-1 items-center gap-[var(--spacing-md)] py-[var(--spacing-sm)] pl-[var(--spacing-lg)]"
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
          <button
            type="button"
            data-testid="global-workout-cancel"
            aria-label={t("session.cancelBarLabel")}
            onClick={() => setConfirmDiscard(true)}
            className="ml-[var(--spacing-xs)] shrink-0 rounded-full border border-(--color-line) px-[var(--spacing-md)] py-[5px] font-semibold text-(--color-ink2) text-[length:var(--text-sm)] active:bg-(--color-surface-alt)"
          >
            {t("session.cancelBar")}
          </button>
        </div>
      </div>

      {confirmDiscard ? (
        // 운동 화면 ⋯ 「운동 취소」와 같은 확인창 — 같은 문구·같은 파괴 버튼(ActiveWorkout confirm-discard) @plm SRS-068
        <ConfirmDialog
          testId="confirm-discard"
          title={t("session.discardWorkout.title")}
          message={t("session.discardWorkout.message")}
          confirmLabel={t("common.delete")}
          destructive
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={discard}
        />
      ) : null}
    </>
  );
}
