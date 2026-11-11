"use client";
// 탭별 ? 사용법 안내 덮개(SPEC-058) — 실제 화면 짚기 + 연습 블록
//
// booktarae TutorialOverlay 를 본떴다(대상 둘레를 어둡게 · 링 + 물결 · [이전]·[다음] · 우상단 ×).
// 다른 점: **짚은 실제 버튼도 눌리지 않는다.** 화면 전체를 투명 판이 덮어 모든 누름을 막는다 —
// 「빠른 운동 시작」 같은 버튼을 눌러 진짜 기록이 생기면 안 되기 때문이다. 눌러 보는 건 연습 블록에서만.
//
// REV-140 반영: 뒤로 가기 = 닫기(useBackToClose 규약) · 초점은 설명 띠 안에서 돈다 · 닫으면 ? 로 초점을 돌려준다 ·
//   움직임 줄이기 설정이면 물결을 끈다(motion-safe) · sticky 머리(56px)에 가린 대상은 스크롤을 보정한다.
// aria-modal="true" 라 첫 안내(CoachMark)가 이 위로 뜨지 않는다(lib/overlayPresence.ts).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GUIDE_SCRIPTS, GUIDE_TAB_LABEL, type GuideTab } from "@/lib/tabGuide";
import { useBackToClose } from "@/lib/useBackToClose";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { PracticeBlock } from "./PracticeBlock";

/** 구멍 둘레 여유 */
const PAD = 6;
/** sticky 앱바 높이(AppBar min-h-14) — 대상이 이 밑에 가리면 스크롤을 내린다 */
const HEADER_H = 56;

/** 어둡게 판 */
const DIM = "absolute bg-black/55";

type Rect = { top: number; left: number; width: number; height: number };

function visibleTarget(ids: string[] | undefined): HTMLElement | null {
  if (!ids) return null;
  for (const id of ids) {
    const els = document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`);
    for (const el of els) {
      // 안내 덮개 자신 안의 것은 빼고(연습 블록이 같은 이름을 쓸 일은 없지만 안전하게)
      if (el.closest("[data-guide-overlay]")) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  }
  return null;
}

function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function GuideOverlay({ tab, onClose }: { tab: GuideTab; onClose: () => void }) {
  const steps = GUIDE_SCRIPTS[tab];
  const [i, setI] = useState(0);
  const [spot, setSpot] = useState<Rect | null>(null);
  const [spotId, setSpotId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const step = steps[i];
  const last = i === steps.length - 1;

  useEffect(() => setHost(document.getElementById("modal-root") ?? document.body), []);
  useBackToClose(onClose, true);

  // 짚기 단계가 화면을 스크롤한다 — 닫으면 연 자리로 돌려준다(코드 리뷰 REV-141 1)
  useEffect(() => {
    const y = window.scrollY;
    return () => window.scrollTo({ top: y });
  }, []);

  // 단계가 바뀌면 대상을 찾아 화면 안으로 데려오고 잰다
  useLayoutEffect(() => {
    setDone(false);
    const el = step.practice ? null : visibleTarget(step.targets);
    targetRef.current = el;
    setSpotId(el?.dataset.testid ?? null);
    if (!el) {
      setSpot(null);
      return;
    }
    el.scrollIntoView({ block: "center", inline: "nearest" });
    const r = el.getBoundingClientRect();
    if (r.top < HEADER_H + PAD) window.scrollBy(0, r.top - HEADER_H - PAD * 2);
    setSpot(rectOf(el));
  }, [step]);

  // 스크롤·크기 바뀜에 다시 잰다
  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const el = targetRef.current;
      if (el?.isConnected) setSpot(rectOf(el));
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    window.addEventListener("scroll", on, true);
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on, true);
      window.removeEventListener("resize", on);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // 열릴 때·단계가 바뀔 때 설명 띠에 초점
  // [원본] deps [i] — 첫 그림은 host 가 없어 띠가 아직 없었다 → 초점이 ? 에 남아 Esc 가 덮개에 닿지 않았다(e2e)
  // [개선] host 가 생긴 뒤에도 다시 잡는다
  // biome-ignore lint/correctness/useExhaustiveDependencies: 단계(i)·host 가 바뀔 때마다 다시 잡는 것이 목적
  useEffect(() => {
    panelRef.current?.focus();
  }, [i, host]);

  // Esc 는 초점이 어디 있든 닫는다(덮개가 맨 위 창이므로) — 캡처 단계에서 받아 밑 화면의 Esc 처리보다 먼저
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [onClose]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    // 초점 가두기 — aria-modal 인 동안 Tab 이 밑 화면으로 빠지지 않게
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const lastEl = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && active === lastEl) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  if (!host) return null;

  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  // 띠 자리 — 대상이 위 절반이면 아래, 아래 절반이면 위. 대상 없고 연습도 아니면 가운데.
  const place: "bottom" | "top" | "center" = step.practice
    ? "bottom"
    : spot
      ? spot.top + spot.height / 2 < vh / 2
        ? "bottom"
        : "top"
      : "center";
  const hole = spot
    ? {
        x: Math.max(0, spot.left - PAD),
        y: Math.max(0, spot.top - PAD),
        w: spot.width + PAD * 2,
        h: spot.height + PAD * 2,
      }
    : null;

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: Esc·Tab 을 덮개 전체에서 받는다(대화상자는 안쪽 띠)
    <div
      data-guide-overlay
      data-testid="guide-overlay"
      data-step={i}
      data-spot={spotId ?? ""}
      className="fixed inset-0 z-[90]"
      onKeyDown={onKeyDown}
    >
      {/* 누름 막기 + 어둡게 — 구멍은 보이기만 하고 눌리지 않는다 */}
      <div
        aria-hidden
        data-testid="guide-blocker"
        className="absolute inset-0"
        onPointerDown={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* [원본] SVG 마스크 한 장 — 운영 빌드에서 어둡게 칠이 그려지지 않았다(사진 확인) */}
        {/* [개선] 어둡게 판 4장(위·아래·왼·오른) — booktarae 와 같은 방식 · 구멍이 없으면 한 장 */}
        {hole ? (
          <>
            <div className={DIM} style={{ left: 0, top: 0, right: 0, height: hole.y }} />
            <div className={DIM} style={{ left: 0, top: hole.y + hole.h, right: 0, bottom: 0 }} />
            <div className={DIM} style={{ left: 0, top: hole.y, width: hole.x, height: hole.h }} />
            <div className={DIM} style={{ left: hole.x + hole.w, top: hole.y, right: 0, height: hole.h }} />
          </>
        ) : (
          <div className={DIM} style={{ inset: 0 }} />
        )}
      </div>
      {hole ? (
        <div
          aria-hidden
          data-testid="guide-ring"
          className="pointer-events-none absolute rounded-[var(--radius-sm)] border-2 border-(--color-brand)"
          style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }}
        >
          {/* 손짓 물결 — 「여기를 누르는 것」 시연(움직임 줄이기면 끔) */}
          <span className="absolute top-1/2 left-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--color-brand) opacity-40 motion-safe:animate-ping" />
        </div>
      ) : null}

      {/* 설명 띠 */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-step-title"
        aria-describedby="guide-step-body"
        tabIndex={-1}
        data-testid="guide-panel"
        data-place={place}
        className={`absolute right-[var(--spacing-lg)] left-[var(--spacing-lg)] mx-auto flex max-h-[calc(100dvh-32px)] max-w-[480px] flex-col overflow-y-auto rounded-[var(--radius-lg)] border border-(--color-line) bg-(--color-surface) p-[var(--spacing-lg)] shadow-lg outline-none ${
          place === "bottom"
            ? "bottom-[calc(var(--spacing-lg)+env(safe-area-inset-bottom))]"
            : place === "top"
              ? "top-[calc(var(--spacing-lg)+env(safe-area-inset-top))]"
              : "top-1/2 -translate-y-1/2"
        }`}
      >
        <div className="flex items-center gap-[var(--spacing-sm)]">
          <span
            data-testid="guide-step-count"
            className="text-(--color-ink2) text-[length:var(--text-xs)] font-semibold"
          >
            {GUIDE_TAB_LABEL[tab]} 탭 사용법 · {i + 1} / {steps.length}
          </span>
          <button
            type="button"
            data-testid="guide-close"
            aria-label="사용법 안내 닫기"
            onClick={onClose}
            className="-my-[10px] -mr-[10px] ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-(--color-surface-alt)"
          >
            <Icon name="close" size={22} color="var(--color-ink2)" />
          </button>
        </div>
        <h2
          id="guide-step-title"
          data-testid="guide-step-title"
          className="mt-[var(--spacing-xs)] font-bold text-(--color-ink) text-[length:var(--text-lg)]"
        >
          {step.title}
        </h2>
        <p
          id="guide-step-body"
          className="mt-[var(--spacing-xs)] text-(--color-ink2) text-[length:var(--text-sm)] leading-relaxed"
        >
          {step.body}
        </p>
        {!step.practice && !spot && step.targets ? (
          // 대상이 지금 화면에 없다 — 설명만(그런 기능이 있다는 것을 알리는 게 목적)
          <p
            data-testid="guide-not-here"
            className="mt-[var(--spacing-xs)] text-(--color-ink3) text-[length:var(--text-xs)]"
          >
            지금 화면에는 보이지 않아요 — 조건이 맞으면 나타나요.
          </p>
        ) : null}
        {step.practice ? (
          <div className="mt-[var(--spacing-md)]">
            <p className="mb-[var(--spacing-xs)] text-(--color-ink3) text-[length:var(--text-xs)]">
              연습 — 기록되지 않아요
            </p>
            <PracticeBlock key={i} kind={step.practice} onDone={() => setDone(true)} />
            <p
              data-testid="guide-practice-done"
              aria-live="polite"
              className="mt-[var(--spacing-xs)] min-h-[20px] font-semibold text-(--color-ok) text-[length:var(--text-sm)]"
            >
              {done ? "잘했어요 ✓" : ""}
            </p>
          </div>
        ) : null}
        <div className="mt-[var(--spacing-md)] flex gap-[var(--spacing-sm)]">
          <Button
            title="이전"
            variant="secondary"
            size="sm"
            disabled={i === 0}
            testId="guide-prev"
            onPress={() => setI((x) => Math.max(0, x - 1))}
          />
          <Button
            title={last ? "마치기" : "다음"}
            size="sm"
            testId="guide-next"
            onPress={() => (last ? onClose() : setI((x) => x + 1))}
          />
        </div>
      </div>
    </div>,
    host,
  );
}
