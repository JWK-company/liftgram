"use client";
// 첫 안내 말풍선(SPEC-046 · SRS-111 R4) — lib/coachMarks.ts 의 useCoachMark 가 open 을 정한다.
//
// 운동 중 방해 금지: 화면 아래 막대들(휴식 · 운동 중 · 아래 탭 · data-coach-anchor) 위에 뜨고, 뒤 화면을 막지 않으며
// (말풍선 밖은 그대로 눌린다), 포커스를 옮기지 않는다. 떠 있는 동안 --coach-h 에 높이를 실어 화면이 그만큼 아래를 비운다
// (마지막 버튼이 말풍선 밑에 갇히지 않게). Esc 로 닫힌다(창이 열려 있지 않을 때만). 뒤로 가기는 가로채지 않는다.
// 낭독기: 늘 붙어 있는 sr-only 알림 칸에 **처음 뜰 때 한 번만** 글을 넣는다 — 창·입력에 가려 숨었다 다시 떠도 다시 읽지 않는다(P3 리뷰).
// [원본] 나타나는 움직임은 두지 않는다.
// [개선] 화면 지도 #T18(S-159 h.prev) — 「알겠어요」 버튼을 없앴다. 안내는
//   · anchor(선택자)가 있으면 그 버튼 바로 위/아래(공간 있는 쪽)에 꼬리 달린 말풍선으로 겹쳐 뜨고 스크롤을 따라간다
//     (anchor 가 없으면 예전처럼 아래 막대 위)
//   · 약 5초(글이 길면 8초까지) 뒤 저절로 사라지고, 화면 어디를 눌러도(그 버튼 자체를 눌러도 — 버튼 동작은 그대로) 누름이 끝나면
//     사라진다 · Esc 도. 말풍선은 누름을 받지 않는다(pointer-events:none — 덮은 자리의 버튼이 그대로 눌림) · 스크롤은 닫지 않음
//   · 사라지면 본 것(onDismiss) — 다시 뜨지 않는다. 창·입력에 가려 잠시 숨은 동안은 시간을 멈췄다가 다시 뜰 때 새로 센다
//   · 줄임 모션이 아니면 짧게 나타나고 사라진다(투명도만). 낭독기는 위의 알림 칸이 읽는다(말풍선은 aria-hidden — 두 번 읽지 않게)
import { useEffect, useId, useRef, useState } from "react";
// [원본] import { t } from "@/lib/i18n";
// [개선] #T18 — 「알겠어요」 버튼이 없어져 사전을 쓰지 않는다
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

/** #T18 — 저절로 사라지기까지(ms) 바닥값. 글이 길면 글자당 150ms 를 더해 8초까지(천천히 읽는 사람 · REV-109 #7).
 *  e2e 만 localStorage `liftgram.hint.ms` 로 바꾼다(500~60000 밖이면 무시). */
export const COACH_MARK_MS = 5000;
const HINT_MS_KEY = "liftgram.hint.ms";
function hintMs(text: string): number {
  const byText = Math.min(8000, Math.max(COACH_MARK_MS, text.length * 150));
  try {
    const v = Number(localStorage.getItem(HINT_MS_KEY));
    return Number.isFinite(v) && v >= 500 && v <= 60_000 ? v : byText;
  } catch {
    return byText;
  }
}
/** #T18 — 「누름」으로 치는 한계: 이만큼 넘게 움직였으면 스크롤(사라지지 않음 · REV-109 #3) */
const TAP_SLOP = 10;
// 화면 위쪽에 붙은 머리(운동 화면 머리 · ScreenHeader) — 말풍선이 그 위로 올라가 버튼을 덮지 않게(REV-109 #4)
const TOP_BARS = 'header, [data-testid="session-header"]';
const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

const TAIL = 8; // 꼬리 높이(px) — 말풍선 바깥 칸이 이만큼 anchor 쪽으로 늘어 꼬리 끝이 anchor 에 닿는다
const EDGE = 16; // 화면 옆 여백(360px 에서도 넘치지 않게)
const MAX_W = 300;

type Place = { left: number; top: number; width: number; below: boolean; tailX: number };

/** 위 머리 아랫변 — 없으면 0 */
function topLimit(): number {
  let bottom = 0;
  for (const el of Array.from(document.querySelectorAll(TOP_BARS))) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.top <= 1 && r.bottom < window.innerHeight / 2 && r.bottom > bottom)
      bottom = r.bottom;
  }
  return bottom;
}

/** 위 머리와 아래 막대 사이에 다 보이는 anchor 인가(머리·휴식 막대 뒤에 가린 것은 빼고 · REV-109 #4·#5) */
function anchorVisible(el: Element, top: number, bottom: number): boolean {
  if (!el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.top >= top && r.bottom <= bottom;
}

// [원본] /** 화면 안에 보이는 첫 anchor */
// [원본] function findAnchor(selector: string): Element | null {
// [원본]   for (const el of Array.from(document.querySelectorAll(selector))) {
// [원본]     const r = el.getBoundingClientRect();
// [원본]     if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight) return el;
// [원본]   }
// [원본]   return null;
// [원본] }
// [개선] 머리와 아래 막대 사이에 다 보이는 첫 anchor
function findAnchor(selector: string, top: number, bottom: number): Element | null {
  for (const el of Array.from(document.querySelectorAll(selector)))
    if (anchorVisible(el, top, bottom)) return el;
  return null;
}

/** 아래 막대(휴식·운동 중·탭) 가장 위 — 말풍선이 그 밑으로 들어가지 않게 */
function bottomLimit(): number {
  let top = window.innerHeight;
  for (const el of Array.from(document.querySelectorAll(BOTTOM_BARS))) {
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.top > window.innerHeight / 2 && r.top < top) top = r.top;
  }
  return top;
}

/** anchor 옆 자리 — 위에 공간이 있으면 위(꼬리가 아래로 칩을 가리킴), 없으면 아래. 열린 동안 프레임마다 다시 잰다(스크롤·자리 바뀜을 따라감) */
function useAnchorPlace(
  open: boolean,
  selector: string | undefined,
  wrap: React.RefObject<HTMLDivElement | null>,
) {
  const [place, setPlace] = useState<Place | null>(null);
  useEffect(() => {
    if (!open || !selector) {
      setPlace(null);
      return;
    }
    let raf = 0;
    let anchor: Element | null = null;
    let last = "";
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const topEdge = topLimit();
      const bottomEdge = bottomLimit();
      // [원본] if (!anchor?.isConnected) anchor = findAnchor(selector);
      // [원본] if (!anchor) return;
      // [개선] 고른 칩이 화면 밖·머리 뒤로 가거나 접혀 숨으면 다시 고른다 · 보이는 칩이 없으면 숨긴다(시계도 멈춤 · REV-109 #5)
      if (!anchor || !anchorVisible(anchor, topEdge, bottomEdge))
        anchor = findAnchor(selector, topEdge, bottomEdge);
      if (!anchor) {
        if (last !== "") {
          last = "";
          setPlace(null);
        }
        return;
      }
      const a = anchor.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const width = Math.min(MAX_W, vw - EDGE * 2);
      const h = wrap.current?.offsetHeight ?? 0;
      const cx = a.left + a.width / 2;
      const left = Math.round(Math.min(Math.max(EDGE, cx - width / 2), vw - EDGE - width));
      // 위에 들어가면 위, 아니면 아래(아래도 막대 밑으로 들어가면 그래도 위 — 화면 위쪽이 넓다)
      // [원본] const fitsAbove = a.top - h >= EDGE;
      // [원본] const fitsBelow = a.bottom + h <= bottomLimit() - GAP;
      // [개선] 위 한계는 머리 아랫변(없으면 화면 위 여백)
      const fitsAbove = a.top - h >= Math.max(EDGE, topEdge + GAP);
      const fitsBelow = a.bottom + h <= bottomEdge - GAP;
      const below = !fitsAbove && fitsBelow;
      const top = Math.round(below ? a.bottom : a.top - h);
      const tailX = Math.round(Math.min(Math.max(14, cx - left), width - 14));
      const key = `${left}|${top}|${width}|${below}|${tailX}`;
      if (key !== last) {
        last = key;
        setPlace({ left, top, width, below, tailX });
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [open, selector, wrap]);
  return place;
}

export function CoachMark({
  open,
  text,
  onDismiss,
  testId,
  anchor,
}: {
  open: boolean;
  text: string;
  onDismiss: () => void;
  testId: string;
  /** #T18 — 설명하는 버튼(화면 안에 보이는 첫 것) 옆에 꼬리 달린 말풍선으로. 없으면 아래 막대 위 */
  anchor?: string;
}) {
  // [원본] const bottom = useBottomOffset(open);
  // [개선] #T18 — anchor 말풍선은 아래 막대 자리를 재지 않는다
  const bottom = useBottomOffset(open && !anchor);
  const textId = useId();
  const card = useRef<HTMLDivElement>(null);
  // [개선] #T18 — 말풍선 바깥 칸(꼬리 칸 포함) · anchor 자리
  const wrap = useRef<HTMLDivElement>(null);
  const place = useAnchorPlace(open, anchor, wrap);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  // #T18 — 보이는 동안만 센다·듣는다(anchor 자리를 못 찾아 숨은 동안 눌러도 본 것이 아니다 · REV-109 #6)
  const shown = open && (!anchor || place != null);

  // #T18 — 화면 어디를 눌러도(「누름」이 끝난 뒤) 사라진다. 캡처 단계에서 듣기만 하고 막지 않는다 — 누른 버튼의 동작은 그대로.
  //   · 누름이 끝난 다음 틱에 닫는다 — 누르는 도중 말풍선·--coach-h 여백이 빠져 화면이 밀리면 누름이 엉뚱한 곳에 떨어진다(REV-109 #2)
  //   · 10px 넘게 움직였거나(스크롤) 취소된 누름(pointercancel — 터치 스크롤)은 닫지 않는다(REV-109 #3)
  useEffect(() => {
    if (!shown) return;
    let start: { x: number; y: number; id: number } | null = null;
    let later = 0;
    const onDown = (e: PointerEvent) => {
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    };
    const onUp = (e: PointerEvent) => {
      const s0 = start;
      start = null;
      if (!s0 || s0.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - s0.x, e.clientY - s0.y) > TAP_SLOP) return;
      later = window.setTimeout(() => dismissRef.current(), 0);
    };
    const onCancel = () => {
      start = null;
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onCancel, true);
    return () => {
      window.clearTimeout(later);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("pointercancel", onCancel, true);
    };
  }, [shown]);

  // #T18 — 몇 초 뒤 저절로(줄임 모션이 아니면 투명도로 짧게 사라짐). 숨으면 시계를 멈추고 다시 뜨면 새로 센다
  useEffect(() => {
    if (!shown) return;
    let fade: Animation | undefined;
    const id = window.setTimeout(() => {
      const el = wrap.current;
      if (el && !reducedMotion() && typeof el.animate === "function") {
        fade = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" });
        fade.onfinish = () => dismissRef.current();
      } else dismissRef.current();
    }, hintMs(text));
    return () => {
      window.clearTimeout(id);
      fade?.cancel();
    };
  }, [shown, text]);

  // #T18 — 나타날 때 짧게(줄임 모션이면 없음)
  useEffect(() => {
    if (!shown || reducedMotion()) return;
    wrap.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
  }, [shown]);

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
    // [원본] if (!open) return;
    // [개선] #T18 — anchor 말풍선은 버튼 옆에 겹쳐 뜨니 화면 아래를 비울 필요가 없다
    if (!open || anchor) return;
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
  }, [open, anchor]);

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
      {/* [원본] 아래 막대 위 카드 + 「알겠어요」 버튼
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
            {/* 글은 위 알림 칸이 읽었다 — 여기서는 버튼 설명으로만 쓴다 * /}
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
      */}
      {/* [개선] #T18 — 「알겠어요」 없음. anchor 가 있으면 그 옆 말풍선(꼬리가 버튼을 가리킴), 없으면 아래 막대 위 */}
      {open && anchor ? (
        <div
          ref={wrap}
          data-testid={testId}
          data-place={place ? (place.below ? "below" : "above") : undefined}
          aria-hidden="true"
          className="pointer-events-none fixed z-[44]"
          style={{
            left: place?.left ?? 0,
            top: place?.top ?? 0,
            width: place?.width ?? MAX_W,
            visibility: place ? "visible" : "hidden",
            paddingTop: place?.below ? TAIL : 0,
            paddingBottom: place?.below ? 0 : TAIL,
          }}
        >
          <div
            ref={card}
            className="rounded-[var(--radius-md)] bg-(--color-ink) px-[var(--spacing-md)] py-[var(--spacing-sm)] shadow-lg"
          >
            <AppText id={textId} variant="caption" style={{ color: "var(--color-surface)" }}>
              {text}
            </AppText>
          </div>
          {/* 꼬리 — 바깥 칸의 TAIL 여백 안 · 끝이 anchor 가운데를 가리킨다 */}
          <span
            aria-hidden
            className="absolute h-0 w-0"
            style={{
              left: (place?.tailX ?? 0) - TAIL,
              ...(place?.below
                ? { top: 0, borderBottom: `${TAIL}px solid var(--color-ink)` }
                : { bottom: 0, borderTop: `${TAIL}px solid var(--color-ink)` }),
              borderLeft: `${TAIL}px solid transparent`,
              borderRight: `${TAIL}px solid transparent`,
            }}
          />
        </div>
      ) : (
        <div
          className="pointer-events-none fixed inset-x-0 z-[44] flex justify-center px-[var(--spacing-lg)]"
          style={{ bottom }}
        >
          {open ? (
            <div
              ref={(el) => {
                card.current = el;
                wrap.current = el;
              }}
              data-testid={testId}
              aria-hidden="true"
              className="pointer-events-none flex w-full max-w-[520px] items-center rounded-[var(--radius-md)] bg-(--color-ink) px-[var(--spacing-md)] py-[var(--spacing-sm)] shadow-lg"
            >
              <AppText
                id={textId}
                variant="caption"
                className="flex-1"
                style={{ color: "var(--color-surface)" }}
              >
                {text}
              </AppText>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
}
