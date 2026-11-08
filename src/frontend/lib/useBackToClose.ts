"use client";
// 뒤로 가기 = 맨 위 창만 닫기(SPEC-042 · SRS-107) — 바닥 시트·확인창·선택 창이 떠 있을 때 기기·브라우저 뒤로를 누르면
// 밑 화면이 다른 화면으로 바뀌지 않고 그 창만 닫힌다.
//
// 규약은 ExercisePickerScreen·WeighInSheet 와 같다:
//   · 열 때 같은 주소로 한 칸 쌓는다(history.state 에 칸마다 고유 토큰 liftgramTop · Next 의 상태 키만 옮긴다)
//   · popstate 로 우리 칸이 빠지면 닫는다. 위 칸이 닫혀 우리 칸으로 돌아온 것(state 의 토큰 = 우리)은 무시한다
//   · 버튼으로 닫으면 맨 위가 우리 칸일 때만 그 칸을 걷는다(history.back) — 바로 뒤의 이동을 되돌리지 않게
// REV-077 반영:
//   · 넘겨주기 — 시트가 닫히며 확인창이 바로 열리면(같은 커밋) 칸을 걷지 않고 새 창이 그 칸을 이어받는다
//     (걷은 뒤의 popstate 가 막 열린 확인창을 닫던 것 · 개발 StrictMode 의 열기→닫기→열기도 같은 길)
//   · 이동 줄 세우기 — 창이 떠 있거나 칸을 걷는 중에 화면 이동(lib/nav.ts navigate)이 오면, 창이 닫히고 칸이 걷힌 뒤에 이동한다
//     (걷기의 popstate 가 Next 의 진행 중 이동을 버리던 것)
//   · 묻힌 칸 — 그래도 걷지 못하고 다른 화면 밑에 묻히면 「묵은 칸」으로 적어 두고, 뒤로 가다 닿으면 한 번 더 뒤로 건너뛴다
import { useEffect, useRef } from "react";

const stale = new Set<string>();
let skipperInstalled = false;
let openCount = 0;
/** 버튼으로 닫혀 이번 커밋 끝에 걷을 칸 — 그사이 새 창이 열리면 이어받는다 */
let pendingRelease: string | null = null;
/** 걷기(history.back)가 끝나기를 기다리는 약속 */
let inflight: Promise<void> | null = null;

function installSkipper() {
  if (skipperInstalled || typeof window === "undefined") return;
  skipperInstalled = true;
  window.addEventListener("popstate", () => {
    const tok = history.state?.liftgramTop;
    if (typeof tok === "string" && stale.has(tok)) {
      stale.delete(tok);
      history.back();
    }
  });
}

/** Next 가 쓰는 상태 키만 옮긴다 — 다른 가드의 표식(ImportFlow 보초·피커)까지 물려받지 않게(REV-077 M-4) */
function nextStateOnly(): Record<string, unknown> {
  const s = (history.state ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(s)) if (k.startsWith("__")) out[k] = s[k];
  return out;
}

function walkBack(): void {
  inflight = new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.removeEventListener("popstate", finish);
      inflight = null;
      resolve();
    };
    window.addEventListener("popstate", finish);
    setTimeout(finish, 500);
    history.back();
  });
}

/**
 * 화면 이동을 창 정리 뒤로 미룬다 — 창이 없고 걷는 중도 아니면 바로 한다.
 * 창의 선택지가 이동하고 곧바로 창이 닫히는 순서(ActionSheet: onPress → onClose)를 기다린다(최대 150ms).
 */
export function runAfterOverlays(fn: () => void): void {
  if (typeof window === "undefined" || (openCount === 0 && !inflight && !pendingRelease)) {
    fn();
    return;
  }
  const start = Date.now();
  const tick = () => {
    if (inflight) {
      void inflight.then(() => setTimeout(tick, 0));
      return;
    }
    if ((openCount > 0 || pendingRelease) && Date.now() - start < 150) {
      setTimeout(tick, 10);
      return;
    }
    fn();
  };
  setTimeout(tick, 0);
}

export function useBackToClose(onClose: () => void, enabled = true): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    installSkipper();
    openCount += 1;
    const token = `ov-${Math.random().toString(36).slice(2)}`;
    let pushed = false;
    let cancelled = false;
    const onPop = () => {
      if (history.state?.liftgramTop === token) return; // 위 칸이 닫혀 우리 칸으로 돌아왔다
      if (!pushed) return;
      pushed = false;
      closeRef.current();
    };
    const arm = (replace: boolean) => {
      if (cancelled) return;
      if (replace) history.replaceState({ ...nextStateOnly(), liftgramTop: token }, "");
      else history.pushState({ ...nextStateOnly(), liftgramTop: token }, "");
      pushed = true;
      window.addEventListener("popstate", onPop);
    };
    const handoff = pendingRelease && history.state?.liftgramTop === pendingRelease;
    if (handoff) {
      // 방금 닫힌 창의 칸을 이어받는다 — 걷지도 쌓지도 않는다
      pendingRelease = null;
      arm(true);
    } else if (inflight) {
      // 앞 창이 칸을 걷는 중 — 걷기가 끝난 뒤 쌓는다(그 뒤로 가기가 새 창의 칸을 빼 곧바로 닫던 것 · 시트 → 기다린 뒤 여는 시트)
      void inflight.then(() => arm(false));
    } else {
      arm(false);
    }
    return () => {
      openCount -= 1;
      cancelled = true;
      window.removeEventListener("popstate", onPop);
      if (!pushed) return;
      pushed = false;
      if (history.state?.liftgramTop !== token) {
        stale.add(token); // 다른 화면으로 이동해 묻혔다 — 뒤로 가다 닿으면 건너뛴다
        return;
      }
      // 이번 커밋에서 새 창이 열리면 이어받게 한 박자(마이크로태스크) 기다린다
      pendingRelease = token;
      queueMicrotask(() => {
        if (pendingRelease !== token) return; // 이어받았다
        pendingRelease = null;
        if (history.state?.liftgramTop === token) walkBack();
        else stale.add(token);
      });
    };
  }, [enabled]);
}
