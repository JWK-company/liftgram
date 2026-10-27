"use client";
// @plm SRS-073 SAD-023  다운그레이드 가드 화면 — 옛 번들이 새 스키마 DB 를 만나면 「새 버전으로 새로고침」만 보인다(D-5)
//
// 판정은 DB 를 열기 전에 core 가 했다(core/src/db/schemaGuard.ts). 막힌 실행은 진짜 기록 DB 대신 버리는 빈 DB 를 열었고
// 동기도 하지 않는다 — 그래서 이 화면은 나머지 화면 위를 통째로 덮어 아무것도 누르지 못하게 한다(빈 DB 에 쓰지 않게).
// 막히지 않은 실행에서는 아무것도 그리지 않고, 마이그레이션 직후 셸 바꿔 넣기만 한 번 한다(lib/schemaGuard.ts).
//
// 접근성(QA CU-6):
//   · 막히면 새로고침 버튼으로 초점을 옮긴다(스크린리더가 알림창을 읽는다).
//   · 뒤 화면(body 의 다른 자식)에 `inert` 를 건다 — Tab·Enter 로 빈 DB 위 앱을 움직이지 못하게. 가드는 body 바로 아래로 띄운다(portal).
//   · 첫 칠하기 전에 저장값으로 먼저 판정한다(useLayoutEffect · 같은 순수 판정 decideSchemaGuard) — 빈 앱(기록 없음)이 잠깐 보여
//     「기록이 사라졌다」고 오해하지 않게. 확정은 DB 모듈의 부팅 판정이 한다(다르면 그 값을 따른다).
//   · 누른 뒤에는 버튼이 흐려진다(busy).
import { SCHEMA_VERSION } from "@app/core/db/schema";
import { decideSchemaGuard, MAX_SCHEMA_SEEN_KEY } from "@app/core/db/schemaGuard";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "@/lib/i18n";
import { cleanupAfterMigration, reloadToNewVersion, resolveSchemaGuard } from "@/lib/schemaGuard";

/** 저장값만으로 미리 판정한다(DB 를 열지 않는다) — 저장소가 막혔으면 막지 않는다(부팅 판정과 같은 fail-open). */
function earlyBlocked(): boolean {
  try {
    return decideSchemaGuard(localStorage.getItem(MAX_SCHEMA_SEEN_KEY), SCHEMA_VERSION).blocked;
  } catch {
    return false;
  }
}

export function SchemaGuard() {
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const host = useRef<HTMLDivElement | null>(null);
  const reloadRef = useRef<HTMLButtonElement>(null);

  // 첫 칠하기 전 — 저장값으로 먼저 막는다(CU-6 ③)
  useLayoutEffect(() => {
    if (earlyBlocked()) setBlocked(true);
  }, []);

  useEffect(() => {
    let stop = false;
    void (async () => {
      try {
        const r = await resolveSchemaGuard();
        if (stop) return;
        setBlocked(r.blocked);
        if (r.blocked) return;
        await cleanupAfterMigration();
      } catch (e) {
        console.warn("[schema-guard] 확인·정리 실패 — 다음 부팅에 다시", e);
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  // 막힌 동안: 뒤 화면 inert + 초점 이동(CU-6 ①②). 풀리면 되돌린다.
  useLayoutEffect(() => {
    if (!blocked) return;
    const el = document.createElement("div");
    el.dataset.schemaGuardHost = "";
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
  }, [blocked]);

  useEffect(() => {
    if (blocked && portalReady) reloadRef.current?.focus();
  }, [blocked, portalReady]);

  if (!blocked || !portalReady || !host.current) return null;

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="schema-guard-title"
      aria-describedby="schema-guard-body"
      data-testid="schema-guard"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-(--color-bg) px-6 text-(--color-ink)"
    >
      <div className="flex max-w-[360px] flex-col items-center gap-4 text-center">
        <h1 id="schema-guard-title" className="font-semibold text-lg">
          {t("schemaGuard.title")}
        </h1>
        <p id="schema-guard-body" className="text-(--color-ink2) text-sm">
          {t("schemaGuard.body")} {t("schemaGuard.safe")}
        </p>
        <button
          ref={reloadRef}
          type="button"
          data-testid="schema-guard-reload"
          disabled={busy}
          aria-busy={busy}
          className="min-h-11 rounded-md bg-(--color-brand) px-5 font-semibold text-(--color-on-brand) disabled:opacity-60"
          onClick={() => {
            setBusy(true);
            void reloadToNewVersion();
          }}
        >
          {t("schemaGuard.reload")}
        </button>
      </div>
    </div>,
    host.current,
  );
}
