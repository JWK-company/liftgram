"use client";
// 첫 안내 말풍선(SPEC-046 · SRS-111 R4) — lib/coachMarks.ts 의 useCoachMark 가 open 을 정한다.
//
// 운동 중 방해 금지: 화면 아래 막대들(휴식 · 운동 중 · 아래 탭 · data-coach-anchor) 위에 뜨고, 뒤 화면을 막지 않으며
// (말풍선 밖은 그대로 눌린다), 포커스를 옮기지 않는다. 떠 있는 동안 --coach-h 에 높이를 실어 화면이 그만큼 아래를 비운다
// (마지막 버튼이 말풍선 밑에 갇히지 않게). Esc 로 닫힌다(창이 열려 있지 않을 때만). 뒤로 가기는 가로채지 않는다.
// 낭독기: 늘 붙어 있는 sr-only 알림 칸에 **처음 뜰 때 한 번만** 글을 넣는다 — 창·입력에 가려 숨었다 다시 떠도 다시 읽지 않는다(P3 리뷰).
// 나타나는 움직임은 두지 않는다.
import { useEffect, useId, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { anyOverlayOpen } from "@/lib/overlayPresence";
import { AppText } from "./primitives";

const GAP = 8;
// 화면 아래 막대들 — 말풍선은 가장 위에 있는 것 위로(P3 리뷰)
const BOTTOM_BARS =
  '[data-testid="rest-bar"], [data-testid="global-workout-bar"], [data-testid="shell-nav"], [data-coach-anchor]';

/** 아래 막대가 보이면 그 위, 아니면 화면 아래 safe-area 위 16px */
function useBottomOffset(open: boolean): string {
  const [px, setPx] = useState<number | null>(null);
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      let top = Number.POSITIVE_INFINITY;
      for (const el of Array.from(document.querySelectorAll(BOTTOM_BARS))) {
        const r = el.getBoundingClientRect();
        // 보이고, 화면 아래쪽 절반에 있는 막대만
        if (r.height > 0 && r.top > window.innerHeight / 2 && r.top < window.innerHeight)
          top = Math.min(top, r.top);
      }
      setPx(Number.isFinite(top) ? Math.max(0, window.innerHeight - top) + GAP : null);
    };
    measure();
    // 막대는 sticky·등장 애니메이션이 있어 스크롤·크기에 따라 자리가 바뀐다 — 열린 동안만 잰다
    const id = window.setInterval(measure, 400);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open]);
  return px == null ? "calc(16px + env(safe-area-inset-bottom))" : `${px}px`;
}

export function CoachMark({
  open,
  text,
  onDismiss,
  testId,
}: {
  open: boolean;
  text: string;
  onDismiss: () => void;
  testId: string;
}) {
  const bottom = useBottomOffset(open);
  const textId = useId();
  const card = useRef<HTMLDivElement>(null);

  // Esc — 창이 열린 순간(감지가 한 프레임 늦다)이나 다른 곳이 이미 처리한 Esc 는 건드리지 않는다
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !anyOverlayOpen()) onDismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onDismiss]);

  // 떠 있는 동안 높이를 화면에 알린다(--coach-h)
  useEffect(() => {
    if (!open) return;
    const el = card.current;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--coach-h", `${(el?.offsetHeight ?? 0) + GAP * 2}px`);
    set();
    const ro = el ? new ResizeObserver(set) : null;
    if (el) ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--coach-h");
    };
  }, [open]);

  // 처음 뜰 때 한 번만 읽힌다 — 붙은 알림 칸에 조금 늦게 글을 넣는다(붙자마자 넣으면 놓치는 낭독기가 있다)
  const [announced, setAnnounced] = useState("");
  const said = useRef(false);
  useEffect(() => {
    if (!open || said.current) return;
    const id = window.setTimeout(() => {
      said.current = true;
      setAnnounced(text);
    }, 200);
    return () => window.clearTimeout(id);
  }, [open, text]);

  return (
    <>
      <span role="status" aria-live="polite" className="sr-only" data-testid={`${testId}-live`}>
        {announced}
      </span>
      <div
        className="pointer-events-none fixed inset-x-0 z-[44] flex justify-center px-[var(--spacing-lg)]"
        style={{ bottom }}
      >
        {open ? (
          <div
            ref={card}
            data-testid={testId}
            className="pointer-events-auto flex w-full max-w-[520px] items-center gap-[var(--spacing-sm)] rounded-[var(--radius-md)] bg-(--color-ink) py-[var(--spacing-xs)] pr-[var(--spacing-xs)] pl-[var(--spacing-md)] shadow-lg"
          >
            {/* 글은 위 알림 칸이 읽었다 — 여기서는 버튼 설명으로만 쓴다 */}
            <AppText
              id={textId}
              variant="caption"
              className="flex-1 py-[6px]"
              style={{ color: "var(--color-surface)" }}
            >
              {text}
            </AppText>
            <button
              type="button"
              data-testid={`${testId}-ok`}
              aria-label={t("hint.okAria")}
              aria-describedby={textId}
              onClick={onDismiss}
              className="min-h-[44px] shrink-0 rounded-[var(--radius-sm)] bg-(--color-surface)/15 px-[var(--spacing-md)] font-bold text-(--color-surface) text-[length:var(--text-sm)] focus-visible:outline-2 focus-visible:outline-(--color-surface)"
            >
              {t("hint.ok")}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
