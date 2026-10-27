// @plm SRS-073 SAD-023  다운그레이드 가드의 화면 쪽 — 막힘 상태 읽기 · 마이그레이션 직후 옛 셸 바꿔 넣기 · 새로고침
//
// 판정 자체는 DB 를 열기 **전에** core 가 한다(core/src/db/schemaGuard.ts · adapter.ts buildAdapter).
// 여기서는 그 결과를 읽고, 서비스워커 캐시처럼 창에서만 할 수 있는 일을 한다(D-5).
//
// 옛 세대 셸을 없애야 하는 이유: 옛 서비스워커는 기기에 남긴 옛 셸(HTML)을 먼저 준다. 그 셸이 부르는 옛 번들(v25)은
// 이 가드를 모르므로 v26 DB 를 열면 전부 지운다.
// [원본] 그래서 `liftgram-pages-*` 를 전부 지웠다 — 그런데 지금 세대 셸·/offline 까지 사라져 오프라인 탭 열기가 깨졌다(QA CD-3).
// [개선] 지우지 않고 **덮어쓴다**(lib/shellCache.ts): 온라인이면 서비스워커의 셸 목록을 새로 받아 모든 페이지 캐시에 넣는다.
//   옛 셸은 지금 셸로 바뀌고 오프라인 열기는 그대로 된다. 오프라인이면 아무것도 하지 않고, 다 받지 못했으면 표시를 남기지 않아
//   다음 온라인 부팅에 다시 한다.
//
// 기다리는 서비스워커의 skip-waiting 은 이미 components/ServiceWorker.tsx 가 「운동 중이 아닐 때」 보낸다 — 여기서 또 보내지 않는다.

import { activateWaiting } from "./swActivate";
import { SCHEMA_VERSION } from "@app/core/db/schema";
import { getSchemaGuardState, PAGES_CACHE_CLEANED_KEY } from "@app/core/db/schemaGuard";
import { PAGES_CACHE_PREFIX, refreshShellCaches, type ShellRefreshResult } from "./shellCache";

/** 창에서 셸을 바꿔 넣는다(온라인일 때만 — 오프라인이면 아무것도 하지 않는다). */
export function refreshShellsNow(): Promise<ShellRefreshResult> {
  return refreshShellCaches({
    caches: typeof caches === "undefined" ? undefined : caches,
    fetch: (u, init) => fetch(u, init),
    onLine: typeof navigator === "undefined" ? true : navigator.onLine !== false,
  });
}

/** DB 모듈을 불러 부팅 판정을 끝낸 뒤 막혔는지 돌려준다(DB 모듈은 처음 불릴 때 판정한다). */
export async function resolveSchemaGuard(): Promise<{ blocked: boolean; seen: number | null }> {
  await import("@app/core/db"); // buildAdapter → checkSchemaGuardOnBoot
  const st = getSchemaGuardState();
  return { blocked: st?.blocked === true, seen: st?.seen ?? null };
}

/**
 * `liftgram-pages-*` 캐시를 전부 지운다. 지운 개수(캐시 API 가 없으면 0).
 * [원본] 마이그레이션 직후·가드 새로고침이 불렀다 — 지금은 부르지 않는다(CD-3 · refreshShellsNow 로 바뀜). 원복용으로 남긴다.
 */
export async function deletePageCaches(): Promise<number> {
  if (typeof caches === "undefined") return 0;
  const keys = (await caches.keys()).filter((k) => k.startsWith(PAGES_CACHE_PREFIX));
  await Promise.all(keys.map((k) => caches.delete(k)));
  return keys.length;
}

function readCleanedFor(): number {
  try {
    return Number(localStorage.getItem(PAGES_CACHE_CLEANED_KEY)) || 0;
  } catch {
    return SCHEMA_VERSION; // 저장소가 막혔으면 매번 지우지 않는다
  }
}

/**
 * 마이그레이션 직후 한 번 — 이 스키마 버전 기준으로 아직 안 했으면 페이지 캐시의 셸을 지금 셸로 바꿔 넣는다(CD-3).
 * DB 가 실제로 열린 뒤(=마이그레이션이 끝난 뒤) 부른다. 막힌 실행에서는 아무것도 하지 않는다.
 * 실패하면 표시를 남기지 않아 다음 부팅에 다시 한다.
 */
export async function cleanupAfterMigration(): Promise<void> {
  const st = getSchemaGuardState();
  if (!st || st.blocked) return;
  if (readCleanedFor() >= SCHEMA_VERSION) return;
  const { database } = await import("@app/core/db");
  // 첫 질의가 끝나면 어댑터 준비(=마이그레이션)가 끝난 것이다.
  await database.get("user_profiles").query().fetchCount();
  // [원본] await deletePageCaches();
  // [개선] 지우지 않고 지금 셸로 덮어쓴다 — 오프라인이거나 받다 실패한 셸이 있으면 표시를 남기지 않는다(다음 온라인 부팅에 다시). CD-3
  const r = await refreshShellsNow();
  if (r.status === "offline" || r.status === "partial") return;
  try {
    localStorage.setItem(PAGES_CACHE_CLEANED_KEY, String(SCHEMA_VERSION));
  } catch {
    // 다음 부팅에 다시 지운다 — 해롭지 않다.
  }
}

/**
 * 막힌 화면의 「새로고침」 — 셸을 새것으로 바꿔 넣고, 기다리는 새 워커가 있으면 바로 바꾸게 한 뒤 다시 연다.
 * 막힌 실행은 진짜 DB 를 열지 않았으므로 「운동 중」 판정이 필요 없다(진행 중인 세트는 DB 에 그대로 있다).
 */
export async function reloadToNewVersion(): Promise<void> {
  try {
    // [원본] await deletePageCaches(); — 오프라인에서 누르면 지금 셸·/offline 까지 지워 앱이 아예 안 열렸다(CD-3).
    await refreshShellsNow(); // 온라인이면 가장 새 셸로 바꿔 넣는다 · 오프라인이면 그대로(다시 열어도 이 화면 — 기록은 안전)
    const reg = await navigator.serviceWorker?.getRegistration?.();
    // [원본] reg?.waiting?.postMessage("skip-waiting"); — 곧바로 새로고침. 크롬은 load 직후 보내면 워커가 멈추고
    //        그 탭의 새로고침까지 20초 넘게 걸렸다(QA code M-1 · SRS-085)
    // [개선] 같은 헬퍼로 load+여유 뒤 보내고, 멈추면 숨은 iframe 으로 풀어 활성화를 기다린 뒤 새로고침(최대 6초 — 못 해도 새로고침은 한다)
    if (reg?.waiting) await activateWaiting(reg.waiting, { timeoutMs: 6_000 });
  } catch {
    // 정리에 실패해도 새로고침은 한다.
  }
  window.location.reload();
}
