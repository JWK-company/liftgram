"use client";
// @plm SRS-089  「다른 탭에서 열려 있어요」 덮개 — 쓰기 주인을 빼앗겼거나 디스크가 바깥에서 바뀌어 봉인된 탭.
//
// 이 탭의 기기 DB 는 봉인됐다(core db/writeGate — 어떤 저장도 디스크에 닿지 않는다). 그래도 화면을 누를 수 있으면 사용자는
// 저장되지 않을 기록을 계속 적는다. 그래서 화면 전체를 덮고(뒤 화면 inert) 「여기서 계속하기」(= 새로고침 · 새로 연 탭과 같은 절차)만 둔다.
// 모양은 ImportElsewhereNotice·SchemaGuard 와 같은 규칙: body 바로 아래 portal · 버튼으로 초점.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "@/lib/i18n";
import { subscribeLegacyTabs, subscribeTabOverlay, type TabOverlayState, takeOverHere } from "@/lib/tabGuard";

export function TabElsewhereOverlay() {
  const [state, setState] = useState<TabOverlayState>("none");
  const [portalReady, setPortalReady] = useState(false);
  const host = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const shown = state !== "none";

  useEffect(() => subscribeTabOverlay(setState), []);

  useLayoutEffect(() => {
    if (!shown) return;
    const el = document.createElement("div");
    el.dataset.tabElsewhereHost = "";
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
    if (shown && portalReady) buttonRef.current?.focus();
  }, [shown, portalReady]);

  if (!shown || !portalReady || !host.current) return null;
  const external = state === "external";

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="tab-elsewhere-title"
      aria-describedby="tab-elsewhere-body"
      data-testid="tab-elsewhere"
      data-state={state}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-(--color-bg) px-6 text-(--color-ink)"
    >
      <div className="flex max-w-[360px] flex-col items-center gap-4 text-center">
        <h1 id="tab-elsewhere-title" className="font-semibold text-lg" aria-live="polite">
          {external ? t("tabs.external.title") : t("tabs.elsewhere.title")}
        </h1>
        <p id="tab-elsewhere-body" className="text-(--color-ink2) text-sm">
          {external ? t("tabs.external.body") : t("tabs.elsewhere.body")}
        </p>
        <button
          ref={buttonRef}
          type="button"
          data-testid="btn-tab-take-over"
          className="min-h-11 rounded-md bg-(--color-brand) px-5 font-semibold text-(--color-on-brand)"
          onClick={() => takeOverHere()}
        >
          {t("tabs.takeOver")}
        </button>
      </div>
    </div>,
    host.current,
  );
}

/**
 * 「옛 버전 탭」 띠 — 배포 과도기에 옛 번들이 다른 탭에 열려 있어 얼렸다(/qa code P4 M-3). 이 탭은 그대로 쓴다.
 * 얼린 탭은 「끝났어요 — 새로고침」 안내를 띄우고 있으니 그 탭을 새로고침하라고만 알린다. 닫으면 다시 뜨지 않는다. @plm SRS-089
 */
export function LegacyTabBand() {
  const [shown, setShown] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => subscribeLegacyTabs(setShown), []);
  if (!shown || dismissed) return null;
  return (
    <div
      role="status"
      data-testid="legacy-tab-band"
      className="fixed inset-x-0 top-0 z-[900] flex items-center gap-3 border-b border-(--color-line) bg-(--color-card) px-4 py-2 text-(--color-ink) text-sm shadow"
    >
      <p className="flex-1">{t("tabs.legacy.body")}</p>
      <button
        type="button"
        data-testid="btn-legacy-tab-dismiss"
        className="min-h-11 rounded-md px-3 font-semibold"
        onClick={() => setDismissed(true)}
      >
        {t("common.ok")}
      </button>
    </div>
  );
}
