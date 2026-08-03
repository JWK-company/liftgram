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
import {
  installSyncTransport,
  scheduleSync,
  syncWithServer,
  type SyncTableChanges,
} from "@app/core/sync/syncEngine";
import { installOwnerStore, reconcileAccount } from "@app/core/sync/syncOwner";
import { createClient } from "@connectrpc/connect";
import { getPref, setPref } from "./prefs";
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

    push: async (changes: Record<string, SyncTableChanges>) => {
      const payload: Record<string, { created: string[]; updated: string[]; deleted: string[] }> = {};
      for (const [table, t] of Object.entries(changes)) {
        payload[table] = { created: t.created ?? [], updated: t.updated ?? [], deleted: t.deleted ?? [] };
      }
      await client().push({ changes: payload });
    },

    // 받은 것을 IndexedDB로 내려쓴다. 웹에서 화면 전환은 JS 컨텍스트를 갈아치우므로,
    // 메모리에만 있던 동기 결과는 그때 사라진다(그런데 커서는 전진해 있다 — 조용한 유실).
    flush: async () => {
      const { flushLocalDb } = await import("./localDb");
      await flushLocalDb();
    },
  });
}

/**
 * 로그인 직후에 부른다. **대조가 먼저다** — 다른 계정이면 로컬을 비우고 나서 받아야
 * 이전 사람의 기록이 새 계정으로 올라가지 않는다.
 *
 * @returns 이 기기의 예전 기록을 지웠으면 true(화면이 알린다)
 */
export async function onLoggedIn(userId: string): Promise<boolean> {
  const wiped = await reconcileAccount(userId);
  // 비웠으면 서버에서 받아 채운다. 아니면 로컬 변경을 밀어 올린다 — 어느 쪽이든 동기 한 번이다.
  scheduleSync(0);
  return wiped;
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
