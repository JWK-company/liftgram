"use client";
// @plm SRS-073 SAD-023  다운그레이드 가드 화면 — 옛 번들이 새 스키마 DB 를 만나면 「새 버전으로 새로고침」만 보인다(D-5)
//
// 판정은 DB 를 열기 전에 core 가 했다(core/src/db/schemaGuard.ts). 막힌 실행은 진짜 기록 DB 대신 버리는 빈 DB 를 열었고
// 동기도 하지 않는다 — 그래서 이 화면은 나머지 화면 위를 통째로 덮어 아무것도 누르지 못하게 한다(빈 DB 에 쓰지 않게).
// 막히지 않은 실행에서는 아무것도 그리지 않고, 마이그레이션 직후 옛 페이지 캐시 정리만 한 번 한다(lib/schemaGuard.ts).
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { cleanupAfterMigration, reloadToNewVersion, resolveSchemaGuard } from "@/lib/schemaGuard";

export function SchemaGuard() {
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    void (async () => {
      try {
        const r = await resolveSchemaGuard();
        if (stop) return;
        if (r.blocked) {
          setBlocked(true);
          return;
        }
        await cleanupAfterMigration();
      } catch (e) {
        console.warn("[schema-guard] 확인·정리 실패 — 다음 부팅에 다시", e);
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  if (!blocked) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="schema-guard-title"
      aria-describedby="schema-guard-body"
      data-testid="schema-guard"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-(--color-bg) px-6"
    >
      <div className="flex max-w-[360px] flex-col items-center gap-4 text-center">
        <h1 id="schema-guard-title" className="font-semibold text-lg">
          {t("schemaGuard.title")}
        </h1>
        <p id="schema-guard-body" className="text-(--color-ink2) text-sm">
          {t("schemaGuard.body")}
        </p>
        <button
          type="button"
          data-testid="schema-guard-reload"
          disabled={busy}
          className="min-h-11 rounded-md bg-(--color-brand) px-5 font-semibold text-(--color-on-brand)"
          onClick={() => {
            setBusy(true);
            void reloadToNewVersion();
          }}
        >
          {t("schemaGuard.reload")}
        </button>
      </div>
    </div>
  );
}
