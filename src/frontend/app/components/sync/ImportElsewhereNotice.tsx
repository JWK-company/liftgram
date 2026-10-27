"use client";
// @plm SRS-082  「다른 탭에서 가져오는 중」 안내(P5-1) — 가져오는 동안 새로 열린 탭은 부팅 정리를 하지 않고 이것만 띄운다.
//
// 이 탭의 메모리 사본은 다른 탭이 쓰는 중인 디스크를 반쯤 읽은 것이다. 여기서 무엇이든 저장하면 LokiJS 가 그 낡은 사본으로
// 디스크를 덮어써 가져온 기록이 사라진다. 그래서 화면 전체를 덮어 아무것도 누르지 못하게 하고(뒤 화면 inert), 동기도 멈춘다
// (lib/tabGuard 가 멈춘다 · 풀지 않는다). 다른 탭이 끝나면 문구가 「끝났어요 — 새로고침」으로 바뀐다. 새로고침만 푼다.
// 모양은 다운그레이드 가드(SchemaGuard)와 같은 규칙: body 바로 아래 portal · 새로고침 버튼으로 초점.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "@/lib/i18n";
import { type ElsewhereState, subscribeElsewhere } from "@/lib/tabGuard";

export function ImportElsewhereNotice() {
  const [state, setState] = useState<ElsewhereState>("none");
  const [portalReady, setPortalReady] = useState(false);
  const host = useRef<HTMLDivElement | null>(null);
  const reloadRef = useRef<HTMLButtonElement>(null);
  const shown = state !== "none";

  useEffect(() => subscribeElsewhere(setState), []);

  useLayoutEffect(() => {
    if (!shown) return;
    const el = document.createElement("div");
    el.dataset.importElsewhereHost = "";
    document.body.appendChild(el);
    host.current = el;
    const others = Array.from(document.body.children).filter(
      (c): c is HTMLElement => c instanceof HTMLElement && c !== el && !c.hasAttribute("inert"),
    );
    for (const c of others) c.setAttribute("inert", "");
    setPortalReady(true);
    return () => {
      for (const c of others) c.removeAttribute("inert");
      el.remove();
      host.current = null;
      setPortalReady(false);
    };
  }, [shown]);

  useEffect(() => {
    if (shown && portalReady) reloadRef.current?.focus();
  }, [shown, portalReady]);

  if (!shown || !portalReady || !host.current) return null;
  const ended = state === "ended";

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="import-elsewhere-title"
      aria-describedby="import-elsewhere-body"
      data-testid="import-elsewhere-notice"
      data-state={state}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-(--color-bg) px-6 text-(--color-ink)"
    >
      <div className="flex max-w-[360px] flex-col items-center gap-4 text-center">
        <h1 id="import-elsewhere-title" className="font-semibold text-lg" aria-live="polite">
          {ended ? t("import.elsewhere.endedTitle") : t("import.elsewhere.title")}
        </h1>
        <p id="import-elsewhere-body" className="text-(--color-ink2) text-sm">
          {ended ? t("import.elsewhere.endedBody") : t("import.elsewhere.body")}
        </p>
        <button
          ref={reloadRef}
          type="button"
          data-testid="import-elsewhere-reload"
          className="min-h-11 rounded-md bg-(--color-brand) px-5 font-semibold text-(--color-on-brand)"
          onClick={() => location.reload()}
        >
          {t("import.reload")}
        </button>
      </div>
    </div>,
    host.current,
  );
}
