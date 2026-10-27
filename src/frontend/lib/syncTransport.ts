// @plm SRS-006  동기 전송 계층 — core의 규칙에 "말하는 방법"을 꽂는다
//
// ─────────────────────────────────────────────────────────────────────────────
// core는 Connect도 세션도 모른다. 여기서 그 둘을 이어 준다:
//   · 로그인 여부 → `lib/session.ts`
//   · pull/push  → `sync.v1.SyncService`
//   · 소유자 표시 → `lib/prefs.ts`(localStorage)
//
// ── 언제 동기하나 ───────────────────────────────────────────────────────────
// 저장소가 부르는 `scheduleSync()`(저장 뒤) 말고도 네 방아쇠를 여기서 건다:
//   ① 로그인 직후(소유자 대조 뒤)  ② 앱을 열 때  ③ 탭으로 돌아올 때  ④ 온라인 복귀
//
// 그리고 **주기적으로 한 번씩**(app과 같은 2분). 앞의 넷은 전부 "이 기기에서 무슨 일이
// 있었을 때"라, 열어 둔 채 가만히 있는 기기는 **다른 기기의 변경을 영영 받지 못한다** —
// 폰으로 기록하는 동안 노트북에 띄워 둔 화면이 그 경우다. 탭이 숨겨져 있으면 쉰다.
// ─────────────────────────────────────────────────────────────────────────────
import { SyncService } from "@app/contracts";
import { installImportTabGuard } from "@app/core/data/importTabGuard";
import { runBootPipeline } from "@app/core/migrations/runner";
import { PUSH_CHUNK_MAX, splitSyncChanges } from "@app/core/sync/pushChunks";
import {
  awaitFirstSync,
  installSyncTransport,
  scheduleSync,
  subscribeSyncHealth,
  syncWithServer,
  type SyncTableChanges,
} from "@app/core/sync/syncEngine";
import {
  clearSyncBlock,
  discardLocalAndAdopt,
  installOwnerStore,
  reconcileAccount,
  type ReconcileResult,
} from "@app/core/sync/syncOwner";
import { createClient } from "@connectrpc/connect";
import { invalidateExerciseNames } from "./exerciseNames";
import { getPref, setPref } from "./prefs";
import { importTabGuard, startTabGuard } from "./tabGuard";
import { authedTransport, hasSession } from "./session";

function client() {
  return createClient(SyncService, authedTransport());
}

/**
 * core에 전송 계층과 소유자 저장소를 꽂는다. **한 번만** 부른다(앱 셸에서).
 *
 * 꽂기 전까지 저장소의 `scheduleSync()`는 아무 일도 하지 않는다 — 로컬 저장은 그대로 동작한다.
 */
export function installSync(): void {
  // 다른 탭 가드(P5-1) — 부팅 파이프라인보다 먼저: 다른 탭이 가져오는 중이면 이 탭은 부팅 정리를 하지 않는다. @plm SRS-082
  startTabGuard();
  installImportTabGuard(importTabGuard);
  // 부팅 데이터 파이프라인(시드 top-up → 백필 → 기록 정규화) — 첫 동기가 이것을 기다린다(QA H3).
  // 표식은 기기 로컬(localStorage)에만 둔다 — 계정과 함께 동기되는 곳에 두면 다른 기기가 건너뛴다(QA B2).
  void runBootPipeline({
    get: (k) => getPref(k),
    set: (k, v) => setPref(k, v),
    remove: (k) => {
      if (typeof localStorage !== "undefined") localStorage.removeItem(k);
    },
  });
  // 첫 동기가 끝나면 서버 카탈로그를 한 번 받는다(예전엔 종목 탭에서만 — 이제 시드 행이 사용자 동기로 오지 않는다, D10).
  void awaitFirstSync(15_000).then(async () => {
    try {
      const { syncCatalogToLocal } = await import("./catalogSync");
      await syncCatalogToLocal();
    } catch {
      // 오프라인 — 종목 탭이 열릴 때 다시 시도한다.
    }
  });

  // 동기가 성공할 때마다 표시 이름 캐시를 비운다 — 다른 기기에서 고른 별칭·정규화가 심은 이름이 새로고침 없이 보이게(/qa code L-6)
  let lastSuccess: number | null = null;
  subscribeSyncHealth((h) => {
    if (h.lastSuccessAt != null && h.lastSuccessAt !== lastSuccess) {
      if (lastSuccess != null) invalidateExerciseNames();
      lastSuccess = h.lastSuccessAt;
    }
  });

  installOwnerStore({
    get: (k) => getPref(k),
    set: (k, v) => setPref(k, v),
  });

  installSyncTransport({
    // 토큰이 없으면 서버에 말 걸지 않는다 — 익명 사용자의 기록은 이 기기의 것이다.
    isLoggedIn: async () => hasSession(),

    pull: async (lastPulledAt: number) => {
      const res = await client().pull({ lastPulledAt: BigInt(lastPulledAt) });
      const changes: Record<string, SyncTableChanges> = {};
      for (const [table, t] of Object.entries(res.changes)) {
        changes[table] = { created: t.created, updated: t.updated, deleted: t.deleted };
      }
      // 계약은 int64라 bigint로 온다. 커서는 밀리초라 Number로 안전하다(2255년까지).
      return { changes, timestamp: Number(res.timestamp) };
    },

    // @plm SRS-081 SRS-082  나눠 보내기(D-1) — 서버 상한 5000건. ≤2000건씩 순서대로, 하나라도 실패하면 그대로 던진다
    // (WatermelonDB 가 synced 로 표시하지 않아 다음 회차에 전부 다시 보낸다 — 서버 upsert 가 멱등이라 결과가 같다).
    // 작은 동기는 예전과 똑같이 한 번이다(splitSyncChanges 가 받은 객체를 그대로 돌려준다).
    push: async (changes: Record<string, SyncTableChanges>) => {
      const c = client();
      for (const part of splitSyncChanges(changes, PUSH_CHUNK_MAX)) {
        const payload: Record<string, { created: string[]; updated: string[]; deleted: string[] }> = {};
        for (const [table, t] of Object.entries(part)) {
          payload[table] = { created: t.created ?? [], updated: t.updated ?? [], deleted: t.deleted ?? [] };
        }
        await c.push({ changes: payload });
      }
    },

    // 받은 것을 IndexedDB로 내려쓴다. 웹에서 화면 전환은 JS 컨텍스트를 갈아치우므로,
    // 메모리에만 있던 동기 결과는 그때 사라진다(그런데 커서는 전진해 있다 — 조용한 유실).
    flush: async () => {
      const { flushLocalDb } = await import("./localDb");
      await flushLocalDb();
    },

    // 마지막 성공 시각을 앱을 다시 열어도 기억한다 — "며칠째 백업이 안 됐다"를 말하려면 필요하다.
    store: { get: (k) => getPref(k), set: (k, v) => setPref(k, v) },
  });
}

/**
 * 로그인 직후에 부른다. **대조가 먼저다** — 다른 계정이면 이전 사람의 기록이 올라가면 안 된다.
 *
 * `blocked`면 동기를 걸지 않는다 — 이 기기에 다른 계정의 올라가지 않은 기록이 있다.
 * 화면(AccountGuard)이 사람에게 고르게 한다.
 */
export async function onLoggedIn(userId: string): Promise<ReconcileResult> {
  const result = await reconcileAccount(userId);
  // 비웠으면 서버에서 받아 채우고, 아니면 로컬 변경을 밀어 올린다 — 어느 쪽이든 동기 한 번이다.
  if (result.kind !== "blocked") scheduleSync(0);
  return result;
}

/** "백업 파일을 내보냈고, 이 기기 기록을 비운 뒤 이 계정으로 계속" — AccountGuard가 부른다. */
export async function discardAndAdopt(userId: string): Promise<void> {
  await discardLocalAndAdopt(userId);
  scheduleSync(0);
}

/** 로그아웃 — 멈춤을 푼다(이 기기 주인은 그대로라, 원래 계정으로 로그인하면 올라간다). */
export async function onLoggedOut(): Promise<void> {
  await clearSyncBlock();
}

/** 주기 동기 간격. app(`setInterval(…, 120_000)`)과 같은 값이다. */
const POLL_MS = 120_000;

/**
 * 앱이 살아 있는 동안의 방아쇠를 건다. 정리 함수를 돌려준다.
 *
 * 탭 복귀와 온라인 복귀를 함께 보는 이유: 지하철에서 기록하고 올라오는 순간이 그 둘이다.
 * 주기 방아쇠는 **보이는 동안만** 돈다 — 안 보는 탭을 2분마다 깨울 이유가 없다.
 */
export function watchSyncTriggers(): () => void {
  const onVisible = () => {
    if (document.visibilityState === "visible") scheduleSync();
  };
  const onOnline = () => scheduleSync(0);
  const tick = () => {
    if (document.visibilityState === "visible") scheduleSync(0);
  };

  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", onOnline);
  const timer = setInterval(tick, POLL_MS);
  return () => {
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onOnline);
    clearInterval(timer);
  };
}

/** 사람이 '지금 동기'를 눌렀다 — 실패를 **보여 줘야** 하므로 삼키지 않는다. */
export function syncNow(): Promise<void> {
  return syncWithServer();
}
