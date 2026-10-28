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
// [원본] 범위: 가져오기·되돌리기만 지킨다. 앱 전체(운동 기록끼리)의 다중 탭 덮어쓰기는 별도 작업이다(보고서 참고).
// [개선] 앱 전체의 다중 탭 덮어쓰기는 아래 「쓰기 주인」(SRS-089)이 맡는다 — 소실 방지 자체는 lokijs 패치·core 쓰기 문(db/writeGate)이,
//        여기는 「나중에 연 탭이 주인 · 진 탭은 마지막 변경을 내려쓰고 멈춤」 UX 와 거부 뒤 규칙을 맡는다.
// ─────────────────────────────────────────────────────────────────────────────
import type { ImportTabGuard } from "@app/core/data/importTabGuard";
import {
  closeLocalDbWrites,
  isLocalDbSealed,
  type SealInfo,
  sealLocalDb,
  subscribeSeal,
} from "@app/core/db/writeGate";

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
  | { t: "import-end"; from: string }
  | { t: "claim"; from: string };

/** 다른 탭의 가져오기 — none · importing(지금 쓰는 중) · ended(이 탭이 열린 뒤 끝났다 — 새로고침 필요) */
export type ElsewhereState = "none" | "importing" | "ended";

const tabId = Math.random().toString(36).slice(2) + Date.now().toString(36);
let started = false;
let channel: BroadcastChannel | null = null;
let importingHere = false;
let presenceGranted = false;
let presenceReady: Promise<void> = Promise.resolve();
/** presence 잠금을 놓는다(봉인된 탭 — 「쓰기 가능한 다른 탭 수」에서 빠진다 · 재검토 M-5) */
let releasePresence: (() => void) | null = null;
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
    // 봉인도 한다 — 안내 화면만으로는 autosave·숨김 flush 가 디스크에 닿는 것을 못 막는다(재검토 M-9) @plm SRS-089
    sealLocalDb("import_elsewhere");
  }
  for (const fn of elsewhereListeners) fn(elsewhere);
}

function onMessage(m: Msg | null): void {
  if (!m || typeof m !== "object" || m.from === tabId) return;
  switch (m.t) {
    case "ping":
      // 봉인된 탭은 「쓰는 탭」으로 세지 않는다(Web Locks 없는 브라우저의 탭 수 · 재검토 M-5) @plm SRS-089
      if (isLocalDbSealed()) break;
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
    case "claim":
      // Web Locks 가 있으면 잠금 steal(AbortError)이 권위다 — 채널은 잠금 없는 브라우저에서만 「나중 탭 우선」
      if (!lockManager()) void onWriterLost("channel");
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
        // [원본] return new Promise<void>(() => {}); // 탭이 살아 있는 동안 쥔다(닫히면 브라우저가 푼다)
        // [개선] 탭이 살아 있는 동안 쥔다(닫히면 브라우저가 푼다) — 봉인되면 스스로 놓는다 @plm SRS-089
        if (isLocalDbSealed()) {
          presenceGranted = false;
          return undefined;
        }
        return new Promise<void>((release) => {
          releasePresence = () => {
            presenceGranted = false;
            releasePresence = null;
            release();
          };
        });
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
  // 봉인되면(거부·빼앗김·가져오는 중) 이 탭을 멈춘다 — 거부 뒤 규칙은 onSealed @plm SRS-089
  subscribeSeal((info) => void onSealed(info));
  // bfcache 로 되살아난 문서의 메모리 사본은 낡았을 수 있다 — 거짓 덮개 대신 새로 읽는다(재검토 H-3) @plm SRS-089
  window.addEventListener("pageshow", (e) => {
    if ((e as PageTransitionEvent).persisted) location.reload();
  });
  // [원본] 새로 열린 탭 — 다른 탭이 지금 가져오는 중이면 안내만 띄운다
  // void isImportRunningElsewhere().then((v) => v && setElsewhere("importing"));
  // [개선] presence → 가져오기 판정 → (아니면) 쓰기 주인 빼앗기(재검토 M-7 순서) · 주소창 미리 렌더 중에는 시작하지 않는다(L-2) @plm SRS-089
  const begin = () =>
    void isImportRunningElsewhere()
      .catch(() => false)
      .then((v) => (v ? setElsewhere("importing") : claimWriter()));
  const doc = document as Document & { prerendering?: boolean };
  if (doc.prerendering) document.addEventListener("prerenderingchange", begin, { once: true });
  else begin();
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

// ── 쓰기 주인(SRS-089 · 스펙 data-safety-2 §11.5) ─────────────────────────────────────────────
//
// 소실 방지는 아래 두 겹이 한다(이 파일이 어긋나도 남의 기록은 지워지지 않는다):
//   · lokijs 패치 — 저장 트랜잭션 안에서 디스크 versionId 가 다르면 덮지 않고 중단(LOKI_STALE)
//   · core 쓰기 문(db/writeGate) — 거부되는 순간 봉인 → 그 문서의 어떤 저장도 디스크에 닿지 않는다
// 여기는 UX 다: 문서가 열리면 곧바로 Web Lock `liftgram-writer` 를 빼앗는다(나중에 연 탭이 주인). 빼앗긴 탭은
// 새 쓰기를 닫고 → 줄 선 쓰기를 기다리고 → 바뀐 것이 있으면 내려쓰고(안전망을 통과하면 저장 · 아니면 그 자리에서 봉인) → 봉인 → 덮개.
// 새 탭은 기다리지 않는다 — 넘겨주기 경합으로 새 탭의 저장이 거부되면 아래 「거부 뒤 규칙」이 1회 새로고침으로 흡수한다.
//
// 거부 뒤 규칙(재검토 B-2 (다)):
//   · 쓰기 주인(또는 아직 모름)인 탭이 거부됨 = 「내가 주인인데 디스크가 바뀜」(넘겨주기 경합) → **1회 새로고침**(디스크 최신본으로 다시 읽기).
//     같은 탭에서 60초 안에 또 거부되면 새로고침하지 않고 중립 문구 덮개(「저장소가 바깥에서 바뀌었어요」).
//   · 주인을 빼앗긴 탭 → 봉인 + 덮개 `tab-elsewhere`. 「여기서 계속하기」 = 새로고침(새로 연 탭과 같은 절차).

const WRITER_LOCK = "liftgram-writer";
/** 거부 뒤 1회 새로고침 표식(sessionStorage · 같은 탭 반복 방지) */
const STALE_RELOAD_KEY = "liftgram.tabs.staleReload";
const STALE_RELOAD_WINDOW_MS = 60_000;
/** 빼앗긴 탭이 줄 선 쓰기를 기다리는 최대 시간 — 넘으면 그냥 봉인한다(디스크는 문이 지킨다) */
const BARRIER_MAX_MS = 3_000;

/** 이 탭의 쓰기 주인 상태 — unknown: 아직 빼앗지 않음/판정 수단 없음 */
export type WriterState = "unknown" | "owner" | "lost";
/** 덮개 — elsewhere: 다른 탭이 주인 · external: 주인인데 디스크가 바깥에서 바뀜(새로고침 뒤에도) */
export type TabOverlayState = "none" | "elsewhere" | "external";

let writer: WriterState = "unknown";
let writerClaimed = false;
let overlay: TabOverlayState = "none";
const overlayListeners = new Set<(s: TabOverlayState) => void>();

function setWriter(next: WriterState): void {
  writer = next;
  // e2e·진단용 표시(화면에는 영향 없음)
  if (typeof document !== "undefined") document.documentElement.dataset.tabWriter = next;
}

function setOverlay(next: TabOverlayState): void {
  if (overlay === next) return;
  overlay = next;
  for (const fn of overlayListeners) fn(next);
}

/** 쓰기 주인을 빼앗는다(문서마다 한 번). 가져오는 중인 탭이 있으면 부르지 않는다. */
function claimWriter(): void {
  if (writerClaimed || isLocalDbSealed()) return;
  writerClaimed = true;
  const lm = lockManager();
  if (lm) {
    setWriter("owner");
    lm.request(WRITER_LOCK, { steal: true }, () => new Promise<void>(() => {})).catch((e: unknown) => {
      // steal 당하면 이 약속이 AbortError 로 끝난다 = 다른 탭이 주인이 됐다
      if ((e as { name?: string } | null)?.name === "AbortError") void onWriterLost("lock");
      else console.warn("[tabs] 쓰기 잠금 요청 실패", e);
    });
  } else if (channel) {
    setWriter("owner"); // 잠금 없는 브라우저 — 채널의 claim 이 「나중 탭 우선」을 대신한다
  }
  post({ t: "claim" });
}

/** 쓰기 주인을 빼앗겼다 — 새 쓰기 닫기 → 대기열 장벽 → (바뀐 게 있으면) 마지막 내려쓰기 → 봉인 */
async function onWriterLost(via: "lock" | "channel"): Promise<void> {
  if (writer === "lost") return;
  setWriter("lost");
  if (isLocalDbSealed()) return;
  closeLocalDbWrites(); // 장벽보다 먼저 — 장벽은 이미 줄 선 쓰기만 기다린다(재검토 L-3)
  try {
    const { writeQueueBarrier } = await import("@app/core/db");
    await Promise.race([writeQueueBarrier(), new Promise((r) => setTimeout(r, BARRIER_MAX_MS))]);
  } catch {
    // 장벽 실패 — 그래도 내려쓰기·봉인으로 간다
  }
  let flushed = "failed";
  try {
    const { flushLocalDbIfDirty } = await import("./localDb");
    flushed = await flushLocalDbIfDirty();
  } catch {
    // 아래에서 봉인
  }
  console.info("[tabs] 쓰기 주인을 다른 탭에 넘겼다", { via, flushed });
  sealLocalDb("writer_lost");
}

function recentStaleReload(): boolean {
  try {
    const at = Number(sessionStorage.getItem(STALE_RELOAD_KEY));
    return Number.isFinite(at) && at > 0 && Math.abs(Date.now() - at) < STALE_RELOAD_WINDOW_MS;
  } catch {
    return true; // 표식을 못 쓰는 환경 — 새로고침 고리를 만들지 않는다
  }
}

/** 봉인됐다 — 이 탭을 멈추고(동기·자동 저장·소리·presence) 거부 뒤 규칙을 따른다 */
async function onSealed(info: SealInfo): Promise<void> {
  console.warn("[tabs] 이 탭의 기기 DB 를 봉인했다", {
    ...info,
    writer,
    visibility: typeof document !== "undefined" ? document.visibilityState : null,
  });
  void import("@app/core/sync/syncEngine").then(({ pauseSync }) => pauseSync()).catch(() => undefined);
  void import("./localDb").then(({ stopLocalDbAutosave }) => stopLocalDbAutosave()).catch(() => undefined);
  void import("./restSound").then(({ silenceRestSound }) => silenceRestSound()).catch(() => undefined);
  releasePresence?.();
  post({ t: "bye" }); // 가져오기 화면이 탭 수를 다시 센다
  // 「다른 탭에서 가져오는 중」은 ImportElsewhereNotice 가 그린다
  if (info.reason === "import_elsewhere") return;
  if (info.reason === "writer_lost" || writer === "lost") {
    setOverlay("elsewhere");
    return;
  }
  // 주인(또는 아직 모름)인데 디스크가 바뀌었다 — 1회 새로고침(디스크 최신본으로)
  if (!recentStaleReload()) {
    try {
      sessionStorage.setItem(STALE_RELOAD_KEY, String(Date.now()));
    } catch {
      // 위 recentStaleReload 가 이미 걸렀다
    }
    location.reload();
    return;
  }
  setOverlay("external");
}

/** 「여기서 계속하기」 — 새로고침이 곧 새로 연 탭의 절차다(봉인 탭 전용 모드 없음 · 재검토 B-3) */
export function takeOverHere(): void {
  try {
    sessionStorage.removeItem(STALE_RELOAD_KEY);
  } catch {
    // 무시
  }
  location.reload();
}

export function getWriterState(): WriterState {
  return writer;
}

export function subscribeTabOverlay(fn: (s: TabOverlayState) => void): () => void {
  overlayListeners.add(fn);
  fn(overlay);
  return () => overlayListeners.delete(fn);
}
