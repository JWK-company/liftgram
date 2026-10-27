// @plm SRS-082  다른 탭 가드(P5-1) — 가져오기·되돌리기는 이 브라우저에 리프트그램 탭이 하나만 열려 있을 때만 한다.
//
// ─────────────────────────────────────────────────────────────────────────────
// 왜: LokiJS 증분 IndexedDB 어댑터는 다른 탭이 디스크를 바꾼 것을 보면 자기 메모리 사본으로 DB 전체를 덮어쓴다.
//     가져오기를 끝낸 뒤 이미 열려 있던 다른 탭에서 한 번 저장하면 가져온 행이 디스크에서 전부 사라졌다(/qa code P5-1 실측).
//
// 어떻게(두 겹):
//   · Web Locks — 탭마다 공유 잠금 `liftgram-tab` 을 평생 쥔다 → `locks.query()` 의 held 수 − 1 = 다른 탭 수.
//     가져오기·되돌리기는 배타 잠금 `liftgram-import` 를 시작부터 flush·동기 재개까지 쥔다 → 새로 열린 탭은 그것을 보고 쓰지 않는다.
//   · BroadcastChannel `liftgram-tabs` — 탭이 열리고 닫힐 때 알린다(가져오기 화면이 곧바로 다시 판정) · 가져오기 시작/끝 알림.
//     Web Locks 가 없는 브라우저는 핑(250ms 안에 답한 탭 수 · 답에 「가져오는 중」을 싣는다)으로 대신한다.
//   · 둘 다 없으면 막지 않는다(판정할 방법이 없다 — fail-open).
// 이 탭이 「다른 탭에서 가져오는 중」을 알게 되면 동기를 멈추고(풀지 않는다) 화면 전체 안내만 띄운다(ImportElsewhereNotice) —
// 이 탭의 메모리 사본은 낡았으므로 어떤 쓰기도 디스크를 덮어쓴다. 끝나면 새로고침해야 한다.
//
// 범위: 가져오기·되돌리기만 지킨다. 앱 전체(운동 기록끼리)의 다중 탭 덮어쓰기는 별도 작업이다(보고서 참고).
// ─────────────────────────────────────────────────────────────────────────────
import type { ImportTabGuard } from "@app/core/data/importTabGuard";

const CHANNEL = "liftgram-tabs";
const PRESENCE_LOCK = "liftgram-tab";
const IMPORT_LOCK = "liftgram-import";
/** 핑 답을 기다리는 시간(Web Locks 없는 브라우저만) */
const PING_MS = 250;

type Msg =
  | { t: "hello"; from: string }
  | { t: "bye"; from: string }
  | { t: "ping"; from: string; nonce: string }
  | { t: "pong"; from: string; nonce: string; importing: boolean }
  | { t: "import-start"; from: string }
  | { t: "import-end"; from: string };

/** 다른 탭의 가져오기 — none · importing(지금 쓰는 중) · ended(이 탭이 열린 뒤 끝났다 — 새로고침 필요) */
export type ElsewhereState = "none" | "importing" | "ended";

const tabId = Math.random().toString(36).slice(2) + Date.now().toString(36);
let started = false;
let channel: BroadcastChannel | null = null;
let importingHere = false;
let presenceGranted = false;
let presenceReady: Promise<void> = Promise.resolve();
let elsewhere: ElsewhereState = "none";
const tabsListeners = new Set<() => void>();
const elsewhereListeners = new Set<(s: ElsewhereState) => void>();
const pongWaiters = new Map<string, (m: Extract<Msg, { t: "pong" }>) => void>();

function lockManager(): LockManager | null {
  if (typeof navigator === "undefined") return null;
  const lm = (navigator as Navigator & { locks?: LockManager }).locks;
  return lm && typeof lm.request === "function" && typeof lm.query === "function" ? lm : null;
}

type MsgBody = Msg extends infer M ? (M extends Msg ? Omit<M, "from"> : never) : never;
function post(m: MsgBody): void {
  try {
    channel?.postMessage({ ...m, from: tabId });
  } catch {
    // 닫힌 채널 — 무시
  }
}

function setElsewhere(next: ElsewhereState): void {
  if (elsewhere === next) return;
  // 한 번 「가져오는 중」을 본 탭은 none 으로 돌아가지 않는다 — 메모리 사본이 낡았다(새로고침만 푼다)
  if (elsewhere !== "none" && next === "none") return;
  const first = elsewhere === "none";
  elsewhere = next;
  if (first) {
    // 이 탭은 더 쓰지 않는다 — 동기도 멈춘 채 둔다(받은 것을 쓰면 낡은 사본으로 디스크를 덮어쓴다)
    void import("@app/core/sync/syncEngine").then(({ pauseSync }) => pauseSync()).catch(() => undefined);
  }
  for (const fn of elsewhereListeners) fn(elsewhere);
}

function onMessage(m: Msg | null): void {
  if (!m || typeof m !== "object" || m.from === tabId) return;
  switch (m.t) {
    case "ping":
      post({ t: "pong", nonce: m.nonce, importing: importingHere });
      break;
    case "pong":
      pongWaiters.get(m.nonce)?.(m);
      break;
    case "hello":
      if (importingHere) post({ t: "import-start" }); // 새로 열린 탭에 다시 알린다
      for (const fn of tabsListeners) fn();
      break;
    case "bye":
      for (const fn of tabsListeners) fn();
      break;
    case "import-start":
      if (!importingHere) setElsewhere("importing");
      break;
    case "import-end":
      if (elsewhere === "importing") setElsewhere("ended");
      break;
  }
}

/** 핑을 보내고 PING_MS 안에 답한 다른 탭들 */
function ping(): Promise<Array<Extract<Msg, { t: "pong" }>>> {
  if (!channel) return Promise.resolve([]);
  const nonce = Math.random().toString(36).slice(2);
  const got = new Map<string, Extract<Msg, { t: "pong" }>>();
  return new Promise((resolve) => {
    pongWaiters.set(nonce, (m) => got.set(m.from, m));
    post({ t: "ping", nonce });
    setTimeout(() => {
      pongWaiters.delete(nonce);
      resolve([...got.values()]);
    }, PING_MS);
  });
}

/** 앱 시작 때 한 번(부팅 파이프라인보다 먼저). 여러 번 불러도 한 번. */
export function startTabGuard(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const lm = lockManager();
  if (lm) {
    presenceReady = new Promise<void>((resolve) => {
      lm.request(PRESENCE_LOCK, { mode: "shared" }, () => {
        presenceGranted = true;
        resolve();
        return new Promise<void>(() => {}); // 탭이 살아 있는 동안 쥔다(닫히면 브라우저가 푼다)
      }).catch(() => resolve());
      // 공유 잠금은 곧바로 주어진다 — 그래도 늦으면 기다리지 않는다
      setTimeout(resolve, 500);
    });
  }
  if (typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (e: MessageEvent<Msg>) => onMessage(e.data);
      post({ t: "hello" });
    } catch {
      channel = null;
    }
  }
  window.addEventListener("pagehide", () => post({ t: "bye" }));
  // 새로 열린 탭 — 다른 탭이 지금 가져오는 중이면 안내만 띄운다
  void isImportRunningElsewhere().then((v) => v && setElsewhere("importing"));
}

/** 이 탭 말고 열려 있는 앱 탭 수(판정할 방법이 없으면 0) */
export async function countOtherTabs(): Promise<number> {
  const lm = lockManager();
  if (lm) {
    await presenceReady;
    const snap = await lm.query();
    const held = (snap.held ?? []).filter((l) => l.name === PRESENCE_LOCK).length;
    const pending = (snap.pending ?? []).filter((l) => l.name === PRESENCE_LOCK).length;
    return Math.max(0, held + pending - (presenceGranted ? 1 : 0));
  }
  return (await ping()).length;
}

/** 다른 탭에서 가져오기·되돌리기가 진행 중인가 */
export async function isImportRunningElsewhere(): Promise<boolean> {
  if (importingHere) return false;
  const lm = lockManager();
  if (lm) {
    const snap = await lm.query();
    return (snap.held ?? []).some((l) => l.name === IMPORT_LOCK);
  }
  return (await ping()).some((p) => p.importing);
}

/**
 * 이 탭 혼자면 「가져오는 중」 잠금을 쥐고 푸는 함수를 돌려준다. 다른 탭이 열려 있거나 다른 탭이 가져오는 중이면 null.
 * 잠금을 **먼저** 쥐고 센다 — 센 뒤에 열린 탭은 잠금을 보고 쓰지 않는다.
 */
export async function acquireImportLock(): Promise<(() => void) | null> {
  if (importingHere) return null;
  const lm = lockManager();
  let unlock: () => void = () => undefined;
  if (lm) {
    const got = await new Promise<boolean>((resolve) => {
      lm.request(IMPORT_LOCK, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return undefined;
        }
        const held = new Promise<void>((r) => {
          unlock = r;
        });
        resolve(true);
        return held;
      }).catch(() => resolve(false));
    });
    if (!got) return null;
  } else if ((await ping()).some((p) => p.importing)) return null;
  if ((await countOtherTabs()) > 0) {
    unlock();
    return null;
  }
  importingHere = true;
  post({ t: "import-start" });
  let done = false;
  return () => {
    if (done) return;
    done = true;
    importingHere = false;
    unlock();
    post({ t: "import-end" });
  };
}

/** 다른 탭이 열리거나 닫힐 때(가져오기 화면이 다시 판정한다). 정리 함수를 돌려준다 */
export function subscribeTabs(fn: () => void): () => void {
  tabsListeners.add(fn);
  return () => tabsListeners.delete(fn);
}

export function getElsewhereState(): ElsewhereState {
  return elsewhere;
}

export function subscribeElsewhere(fn: (s: ElsewhereState) => void): () => void {
  elsewhereListeners.add(fn);
  fn(elsewhere);
  return () => elsewhereListeners.delete(fn);
}

/** core 가 쓰는 모양(importRepository.installImportTabGuard) */
export const importTabGuard: ImportTabGuard = {
  countOtherTabs,
  acquire: acquireImportLock,
  isRunningElsewhere: isImportRunningElsewhere,
};
