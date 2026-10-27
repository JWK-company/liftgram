// @plm SRS-073 SAD-023  다운그레이드 가드의 화면 쪽 — 막힘 상태 읽기 · 마이그레이션 직후 옛 페이지 캐시 정리 · 새로고침
//
// 판정 자체는 DB 를 열기 **전에** core 가 한다(core/src/db/schemaGuard.ts · adapter.ts buildAdapter).
// 여기서는 그 결과를 읽고, 서비스워커 캐시처럼 창에서만 할 수 있는 일을 한다(D-5).
//
// 옛 세대 페이지 캐시(`liftgram-pages-*`)를 지우는 이유: 옛 서비스워커는 기기에 남긴 옛 셸(HTML)을 먼저 준다.
// 그 셸이 부르는 옛 번들(v25)은 이 가드를 모르므로 v26 DB 를 열면 전부 지운다. 셸이 없으면 네트워크에서 새 셸을 받는다.
// 대가: 정리 직후에는 아직 다시 열지 않은 탭의 오프라인 셸·/offline 이 비어 있다(온라인에서 한 번 열면 다시 채워진다).
// 「어느 캐시가 새 세대인가」는 창에서 알 수 없어(이름의 빌드 ID 순서를 모른다) 전부 지운다 — 옛 셸이 남는 쪽이 더 위험하다.
//
// 기다리는 서비스워커의 skip-waiting 은 이미 components/ServiceWorker.tsx 가 「운동 중이 아닐 때」 보낸다 — 여기서 또 보내지 않는다.

import { SCHEMA_VERSION } from "@app/core/db/schema";
import { getSchemaGuardState, PAGES_CACHE_CLEANED_KEY } from "@app/core/db/schemaGuard";

const PAGES_CACHE_PREFIX = "liftgram-pages-";

/** DB 모듈을 불러 부팅 판정을 끝낸 뒤 막혔는지 돌려준다(DB 모듈은 처음 불릴 때 판정한다). */
export async function resolveSchemaGuard(): Promise<{ blocked: boolean; seen: number | null }> {
  await import("@app/core/db"); // buildAdapter → checkSchemaGuardOnBoot
  const st = getSchemaGuardState();
  return { blocked: st?.blocked === true, seen: st?.seen ?? null };
}

/** `liftgram-pages-*` 캐시를 전부 지운다. 지운 개수(캐시 API 가 없으면 0). */
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
 * 마이그레이션 직후 한 번 — 이 스키마 버전 기준으로 아직 안 지웠으면 옛 페이지 캐시를 지운다.
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
  await deletePageCaches();
  try {
    localStorage.setItem(PAGES_CACHE_CLEANED_KEY, String(SCHEMA_VERSION));
  } catch {
    // 다음 부팅에 다시 지운다 — 해롭지 않다.
  }
}

/**
 * 막힌 화면의 「새로고침」 — 옛 셸을 지우고, 기다리는 새 워커가 있으면 바로 바꾸게 한 뒤 다시 연다.
 * 막힌 실행은 진짜 DB 를 열지 않았으므로 「운동 중」 판정이 필요 없다(진행 중인 세트는 DB 에 그대로 있다).
 */
export async function reloadToNewVersion(): Promise<void> {
  try {
    await deletePageCaches();
    const reg = await navigator.serviceWorker?.getRegistration?.();
    reg?.waiting?.postMessage("skip-waiting");
  } catch {
    // 정리에 실패해도 새로고침은 한다.
  }
  window.location.reload();
}
