"use client";
// @plm SRS-085  업데이트 덮개 — 누른 뒤 새 문서가 뜰 때까지 모든 입력을 막고 기다린다 · 15초 넘으면 실패 화면
//
// 다운그레이드 가드(SchemaGuard.tsx)와 같은 방식: body 바로 아래 포털 + 뒤 화면(body 의 다른 자식)에 `inert`
// → 클릭·Tab·Enter 가 뒤의 앱에 닿지 않는다(띠 방식에서 「누르는 동안 다른 동작」이 끼던 자리).
// 진행 중 = 로고 스피너 + 「업데이트하는 중이에요」 · 실패 = 「업데이트하지 못했어요」 + 다시 시도(화면의 유일한 빨강) + 닫기(회색).
// 새로고침 직후 첫 그림 전 덮개는 layout.tsx 의 정적 덮개(#update-boot-cover)가 맡는다 — 같은 모양.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dismissUpdateFailure, startUpdate, useAppUpdate } from "@/lib/appUpdate";
import { tw } from "@/lib/i18n";
import { LogoSpinner } from "./ui/LogoSpinner";

export function UpdateOverlay() {
  const { phase, failReason } = useAppUpdate();
  const open = phase !== "idle";
  const host = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const el = document.createElement("div");
    el.dataset.updateOverlayHost = "";
    document.body.appendChild(el);
    host.current = el;
    const others = Array.from(document.body.children).filter(
      (c): c is HTMLElement => c instanceof HTMLElement && c !== el && !c.hasAttribute("inert"),
    );
    for (const c of others) c.setAttribute("inert", "");
    setReady(true);
    return () => {
      for (const c of others) c.removeAttribute("inert");
      el.remove();
      host.current = null;
      setReady(false);
    };
  }, [open]);

  // 초점 — 진행 중 = 제목 · 실패 = 「다시 시도」(운동 중이라 못 하면 「닫기」)
  const focusKey = `${phase}:${failReason ?? ""}`;
  useEffect(() => {
    if (!ready || !focusKey) return;
    (retryRef.current ?? closeRef.current ?? titleRef.current)?.focus();
  }, [ready, focusKey]);

  if (!open || !ready || !host.current) return null;
  const failed = phase === "failed";
  const workout = failReason === "workout";

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-busy={!failed}
      aria-labelledby="update-overlay-title"
      aria-describedby="update-overlay-body"
      data-testid="update-overlay"
      data-phase={phase}
      data-reason={failReason ?? ""}
      className="fixed inset-0 z-[900] flex items-center justify-center bg-(--color-bg) px-6 text-(--color-ink)"
    >
      <div className="flex max-w-[360px] flex-col items-center gap-[var(--spacing-md)] text-center">
        {failed ? null : <LogoSpinner size={56} />}
        <h1
          id="update-overlay-title"
          ref={titleRef}
          tabIndex={-1}
          className="font-semibold text-[length:var(--text-lg)] outline-none"
          data-testid={failed ? "update-overlay-failed" : "update-overlay-progress"}
        >
          {failed ? tw("web.sw.failed") : tw("web.sw.updating")}
        </h1>
        <p id="update-overlay-body" className="text-(--color-ink2) text-[length:var(--text-sm)]">
          {failed
            ? workout
              ? tw("web.sw.blockedWorkout")
              : failReason === "timeout"
                ? tw("web.sw.failedHintReopen") // 새 워커가 기다리는 채 — 완전히 닫았다 열면 적용(QA code M-1)
                : tw("web.sw.failedHint")
            : tw("web.sw.updatingHint")}
        </p>
        {failed ? (
          <div className="mt-[var(--spacing-sm)] flex w-full flex-col gap-[var(--spacing-sm)]">
            {workout ? null : (
              <button
                ref={retryRef}
                type="button"
                data-testid="update-retry"
                className="min-h-11 rounded-[var(--radius-sm)] bg-(--color-brand) px-5 font-semibold text-(--color-on-brand)"
                onClick={() => void startUpdate()}
              >
                {tw("web.sw.retry")}
              </button>
            )}
            <button
              ref={closeRef}
              type="button"
              data-testid="update-close"
              className="min-h-11 rounded-[var(--radius-sm)] px-5 font-semibold text-(--color-ink2) hover:bg-(--color-surface-alt) active:bg-(--color-surface-alt)"
              onClick={dismissUpdateFailure}
            >
              {tw("web.sw.close")}
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    host.current,
  );
}
