// 열린 창 신호(SPEC-046 · SRS-111 R4) — 첫 안내(CoachMark)가 시트·확인창·전체 화면 창 위로 뜨지 않게.
//
// [설계와 다르게] 스펙은 Overlay 와 전체 화면 창이 openOverlay() 로 하나씩 등록하는 방식이었다. 실제로는 그런 창이 거의 다
// aria-modal="true" 를 이미 달고 있어(Dialog Overlay · 종목 피커 · 찾기 · 체중 입력 · 업데이트 · 다른 탭 · 판 확인 · 변형 고르기),
// 등록을 빠뜨릴 걱정이 없는 **화면 표식 하나**로 판단한다. aria-modal 이 없는 덮개(PR 축하 · 잠금 안내 · 스토리 · 첫 실행 안내)는
// data-overlay 를 단다. 새 전체 화면 창은 둘 중 하나만 달면 된다.
import { useEffect, useState } from "react";

export const OVERLAY_SELECTOR = '[aria-modal="true"], [data-overlay]';

export function anyOverlayOpen(): boolean {
  return typeof document !== "undefined" && document.querySelector(OVERLAY_SELECTOR) != null;
}

/**
 * 화면에 그 선택자에 맞는 요소가 있는가 — DOM 이 바뀔 때마다 다시 본다.
 * @param enabled false 면 지켜보지 않는다(안내가 필요 없을 때 운동 화면 전체를 지켜보지 않게)
 */
export function useSelectorPresent(selector: string, enabled = true, visibleOnly = false): boolean {
  const [present, setPresent] = useState(false);
  useEffect(() => {
    if (!enabled || typeof document === "undefined") {
      setPresent(false);
      return;
    }
    let raf = 0;
    const check = () => {
      raf = 0;
      // visibleOnly — 화면 안에 실제로 보이는 것만(접힌 블록·display:none·화면 밖은 빼고 · P3 리뷰)
      setPresent(
        visibleOnly
          ? Array.from(document.querySelectorAll(selector)).some((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
            })
          : document.querySelector(selector) != null,
      );
    };
    check();
    // 한 그림에 바뀜이 여러 번 와도 한 번만 잰다
    const mo = new MutationObserver(() => {
      if (!raf) raf = requestAnimationFrame(check);
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-modal", "data-overlay", "disabled", "data-testid"],
    });
    // 화면 안에 있는지는 스크롤로도 바뀐다
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    if (visibleOnly) {
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onScroll);
    }
    return () => {
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [selector, enabled, visibleOnly]);
  return present;
}

export function useOverlayOpen(enabled = true): boolean {
  return useSelectorPresent(OVERLAY_SELECTOR, enabled);
}

// 글자를 넣는 칸만 — 체크박스·라디오·슬라이더에 포커스가 가도 숨지 않게(P3 리뷰 6)
const TEXT_TYPES = new Set(["", "text", "number", "search", "email", "tel", "password", "url"]);
const isTextInput = (el: Element | null): boolean =>
  !!el &&
  ((el instanceof HTMLInputElement && TEXT_TYPES.has(el.type)) ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable));

/** 입력칸에 포커스가 있나 — 입력 중에는 안내를 띄우지 않는다(운동 중 방해 금지) */
export function useInputFocused(enabled = true): boolean {
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!enabled || typeof document === "undefined") {
      setFocused(false);
      return;
    }
    const update = () => setFocused(isTextInput(document.activeElement));
    update();
    // focusout 직후에는 activeElement 가 body 라 다음 틱에 잰다
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onOut = () => {
      clearTimeout(timer);
      timer = setTimeout(update, 0);
    };
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", onOut);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", onOut);
    };
  }, [enabled]);
  return focused;
}
