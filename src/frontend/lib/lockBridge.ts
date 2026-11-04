// 잠금화면 운동 카드 — 웹 셸 쪽 적용기·스냅샷 생성기(SPEC-017 Phase 3 §5·§6·§7·§9 · SRS-096 · ADR-046)
//
// 정본은 웹의 로컬 기록이다. 이 모듈이 하는 일:
//   · drain   — 네이티브 대기열의 조작을 seq 순서로 기록에 반영(core lockDrain) → 내려쓰기 "saved" 확인 → ack
//   · 스냅샷  — 기록이 바뀌면 300ms 디바운스로 카드 사본을 만들어 보낸다(core buildLockSnapshot)
//   · 휴식    — 웹의 휴식 변경은 스냅샷과 따로 즉시(sendLockRest) · 네이티브 휴식은 drain 결과로 받아 LWW 로 합친다
// drain 과 스냅샷은 **한 줄 실행기**에서만 돈다 — 스냅샷이 drain 도중의 반쯤 된 기록을 읽지 않고,
// appliedThroughSeq(워터마크)를 DB 읽기 **전에** 잡는다(§6).
// 다리가 없으면(웹 브라우저·낡은 껍데기) startLockBridge 는 곧바로 「준비됨」만 알리고 아무 호출도 하지 않는다.
import type { RestState } from "@app/core/domain/lockScreen";
import type { LockDrainMismatch, LockDrainFault } from "@app/core/domain/lockDrain";
import { E2E_FAULTS } from "./e2eFlags";
import { lock, lockAvailable, onAppState } from "./native";
import { PREFS_EVENT } from "./prefs";
import { getTheme } from "./theme"; // theme → lockBridge 는 동적이라 순환이 아니다 · 이 청크 실패로 스냅샷이 버려지지 않게(REV-022 데이터)

export interface LockBridgeHooks {
  getRest: () => RestState | null;
  mergeRest: (rest: RestState | null) => void;
  /** 버린 조작이 있었다 — 화면에 한 번 알린다(§6 L-5). */
  onDiscarded: (count: number) => void;
}

// ── 화면에 보일 상태(첫 drain 끝남 · 기대값 어긋남) ─────────────────────────────
let ready = false;
const readyListeners = new Set<(v: boolean) => void>();
function setReady(v: boolean): void {
  if (ready === v) return;
  ready = v;
  for (const fn of readyListeners) fn(v);
}
/** 첫 drain 이 끝났나 — 그 전에는 세션 화면이 입력을 받지 않는다(§6 「세트는 남고 워터마크 없음」 kill 대비). */
export function isLockReady(): boolean {
  return ready;
}
export function subscribeLockReady(fn: (v: boolean) => void): () => void {
  readyListeners.add(fn);
  fn(ready);
  return () => readyListeners.delete(fn);
}

let mismatches: LockDrainMismatch[] = [];
const mismatchListeners = new Set<(m: LockDrainMismatch[]) => void>();
function setMismatches(next: LockDrainMismatch[]): void {
  mismatches = next;
  for (const fn of mismatchListeners) fn(next);
}
/** 「잠금화면에서 본 값과 다름」 표식 재료(로컬 전용 · 닫거나 바꾸면 사라진다). */
export function subscribeLockMismatches(fn: (m: LockDrainMismatch[]) => void): () => void {
  mismatchListeners.add(fn);
  fn(mismatches);
  return () => mismatchListeners.delete(fn);
}
export function dismissLockMismatches(setIds: string[]): void {
  const drop = new Set(setIds);
  setMismatches(mismatches.filter((m) => !drop.has(m.setId)));
}

// ── 한 줄 실행기 ──────────────────────────────────────────────────────────────
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

let started = false;
let hooks: LockBridgeHooks | null = null;
let storeId = "";
let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
let snapshotWaiters: (() => void)[] = [];
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryStep = 0;
let ended = false; // 고아 카드 정리를 한 번만(활성 운동이 없는 동안) — 보내기에 성공한 뒤에만 true
let lastSnapshotJson = "";
const RETRY_MS = [2000, 5000, 15000];
/** 조작별 연속 실패 수 — 독 조작 판정(core POISON_LIMIT) */
const failCounts = new Map<string, number>();
const WRITER_WAIT_MS = 10_000;
/** 네이티브 호출 한 번의 상한 — 응답이 빠져도 실행기가 영구 정지하지 않게(REV-006 동시성 M-3) */
const CALL_CAP_MS = 5000;
/** 「확인 중」 덮개의 독립 상한 — drain 이 끝내 못 끝나도 화면에 갇히지 않게(진단 로그 · REV-006 동시성 M-2) */
const READY_CAP_MS = 20_000;

/** 상한 붙은 기다림 — 넘으면 throw(백오프로 다시). */
function capped<T>(p: Promise<T>, what: string, ms = CALL_CAP_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`[lock] ${what} ${ms}ms 넘음`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** e2e 빌드 전용 결함 주입 — 운영 빌드에서는 상수로 접혀 죽은 코드(lib/e2eFlags.ts). */
function fault(): LockDrainFault | "flush-sealed" | null {
  if (!E2E_FAULTS) return null;
  try {
    const v = localStorage.getItem("liftgram.e2e.lockFault");
    return v === "kill-before-watermark" || v === "flush-sealed" ? v : null;
  } catch {
    return null;
  }
}

/** 쓰기 주인 판정 — owner 면 "owner", lost·framed 면 "gone"(덮개가 화면을 막는다), 상한까지 unknown 이면 "unknown". */
async function waitWriter(): Promise<"owner" | "gone" | "unknown"> {
  const { getWriterState } = await import("./tabGuard");
  const until = Date.now() + WRITER_WAIT_MS;
  for (;;) {
    const w = getWriterState();
    if (w === "owner") return "owner";
    if (w === "lost" || w === "framed") return "gone";
    if (Date.now() > until) return "unknown";
    await new Promise((r) => setTimeout(r, 150));
  }
}

async function isOwner(): Promise<boolean> {
  const { getWriterState } = await import("./tabGuard");
  return getWriterState() === "owner";
}

function scheduleRetry(): void {
  if (retryTimer || !started) return;
  const ms = RETRY_MS[Math.min(retryStep, RETRY_MS.length - 1)];
  retryStep += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void requestLockDrain();
  }, ms);
}

/** drain 을 깨운다 — resume·첫 로드·앞에 있을 때의 조작 이벤트가 모두 이것만 부른다(seq 순서 · 한 줄).
 *  실패해도 던지지 않는다 — 백오프로 다시 시도하고, 스냅샷은 늘 뒤따른다(REV-006 동시성 M-1). */
export function requestLockDrain(): Promise<void> {
  if (!started) return Promise.resolve();
  return exclusive(drainOnce)
    .catch((e) => {
      console.warn("[lock] drain 실패 — 다시 시도", e);
      scheduleRetry();
    })
    .then(() => requestLockSnapshot(true));
}

async function drainOnce(): Promise<void> {
  const h = hooks;
  if (!lockAvailable() || !h) {
    setReady(true);
    return;
  }
  // [원본] try { … } finally { setReady(true) } — drain 을 하지 않았는데도(쓰기 주인 대기 초과·예외) 입력 막음이 풀렸다
  // [개선] 실제로 대기열을 다 처리했을 때(또는 이 탭이 주인이 아니어서 덮개가 대신 막을 때)만 「준비됨」(REV-006 동시성 M-2 · 화면 M-4)
  const writer = await waitWriter();
  if (writer === "gone") {
    setReady(true); // 다른 탭이 주인 — 탭 덮개가 화면을 막는다. 재시도도 하지 않는다(REV-006 동시성 M-4)
    return;
  }
  if (writer === "unknown") {
    scheduleRetry();
    return;
  }
  // 적용 직전에 입력 중 값을 저장한다(§9 M-8)
  const { commitAllDrafts } = await import("@/app/components/session/setDrafts");
  await capped(commitAllDrafts(), "입력 중 값 저장", 3000).catch((e) => console.warn(e));
  const q = await capped(lock.queueDrain(), "queueDrain");
  if (!q) {
    setReady(true);
    return;
  }
  storeId = q.storeId || storeId;
  const repo = await import("@app/core/data/workoutRepository");
  const { drainLockActions } = await import("@app/core/domain/lockDrain");
  // dbEpoch 는 drain 만 만든다 — 스냅샷이 먼저 만들어 「새 DB」 신호(created)를 버리지 않게(REV-006 동시성 H-1)
  const ep = await repo.getLockDbEpoch();
  if (ep.created) {
    // 만든 epoch 가 디스크에 닿기 전에 죽으면 그 사이 조작이 「다른 dbEpoch」로 버려진다(REV-006 동시성 L-7)
    const { flushLocalDbResult } = await import("./localDb");
    await flushLocalDbResult();
  }
  const f = fault();
  let res: Awaited<ReturnType<typeof drainLockActions>>;
  try {
    res = await drainLockActions(repo, {
      actions: q.actions,
      dbEpoch: ep.epoch,
      fault: f === "kill-before-watermark" ? f : null,
      failCounts,
    });
  } catch (e) {
    if (f === "kill-before-watermark") {
      // 「앱이 죽었다」 흉내 — 세트 쓰기만 디스크에 남기고 그 뒤(워터마크·ack·스냅샷)는 하지 않는다
      const { flushLocalDbResult } = await import("./localDb");
      await flushLocalDbResult();
      document.documentElement.dataset.lockKilled = "1";
      await new Promise(() => {}); // 영영 멈춘다(실행기도 함께 — 새로고침이 다음 실행)
    }
    throw e;
  }
  if (ep.created) await capped(lock.queueClear(), "queueClear"); // 새 DB — 옛 DB 의 조작은 위에서 전부 버렸다(§6)
  // 네이티브 휴식(잠금 중 +30초·끝내기)을 합친다(§7)
  h.mergeRest(q.rest);
  if (res.discarded > 0) h.onDiscarded(res.discarded);
  if (res.mismatches.length)
    setMismatches([
      ...mismatches.filter((m) => !res.mismatches.some((x) => x.setId === m.setId)),
      ...res.mismatches,
    ]);
  for (const e of res.fillErrors) console.warn("[lock] 적용·채우기 오류", e);
  if (res.stalled) scheduleRetry(); // 남은 조작은 다음 drain 에서 — 처리한 것은 아래에서 ack 한다
  setReady(true); // 대기열을 기록에 반영했다 — 입력을 열어도 된다(ack 는 아래 · 이미 적용된 조작은 다시 오지 않는다)
  // ack — 워터마크까지 디스크에 내려썼고 이 탭이 여전히 주인일 때만(§6)
  if (res.handled.length) {
    const { flushLocalDbResult } = await import("./localDb");
    const flushed = f === "flush-sealed" ? "sealed" : await flushLocalDbResult();
    const { getWriterState } = await import("./tabGuard");
    const w = getWriterState();
    if (flushed !== "saved" || w === "lost" || w === "framed") {
      console.warn(`[lock] ack 보류 — 내려쓰기 ${flushed} · 쓰기 주인 ${w}`);
      if (w !== "lost" && w !== "framed") scheduleRetry();
      return;
    }
    try {
      await capped(lock.queueAck(res.handled), "queueAck");
      retryStep = 0;
    } catch (e) {
      console.warn("[lock] ack 실패 — 다시 시도", e);
      scheduleRetry();
    }
  } else retryStep = 0;
}

/** 스냅샷을 만든다 — immediate 면 디바운스 없이(앱이 뒤로 갈 때 · drain 직후). 실패해도 던지지 않는다. */
export function requestLockSnapshot(immediate = false): Promise<void> {
  if (!started || !lockAvailable()) return Promise.resolve();
  if (snapshotTimer) {
    clearTimeout(snapshotTimer);
    snapshotTimer = null;
  }
  const run = () =>
    exclusive(snapshotOnce).catch((e) => {
      console.warn("[lock] 스냅샷 실패", e);
    });
  // 지운 디바운스의 기다림도 다음 실행에 묶는다(영영 끝나지 않는 Promise 없음 · REV-006 동시성 L-2)
  return new Promise((resolve) => {
    snapshotWaiters.push(resolve);
    const flush = () => {
      const ws = snapshotWaiters;
      snapshotWaiters = [];
      void run().finally(() => {
        for (const w of ws) w();
      });
    };
    if (immediate) flush();
    else
      snapshotTimer = setTimeout(() => {
        snapshotTimer = null;
        flush();
      }, 300);
  });
}

async function snapshotOnce(): Promise<void> {
  const h = hooks;
  if (!h) return;
  // 쓰기 주인이 아닌 탭은 낡은 사본을 보내지 않는다(REV-006 동시성 M-4)
  if (!(await isOwner())) return;
  const repo = await import("@app/core/data/workoutRepository");
  // 워터마크는 DB 읽기 **전에** — 이 스냅샷이 반영한 조작의 끝(§6)
  const wm = await repo.getLockWatermark();
  // epoch 는 만들지 않는다 — 아직 없으면(리셋 직후) drain 이 만들고 대기열을 비운 뒤 다시 온다(REV-006 동시성 H-1)
  const epoch = await repo.peekLockDbEpoch();
  const active = await repo.getActiveWorkout();
  if (!active) {
    if (!ended) {
      await capped(lock.sessionEnd(), "sessionEnd"); // 고아 카드 정리(§11) · 운동 끝
      ended = true; // 보내기 성공 뒤에만(REV-006 동시성 M-5)
      lastSnapshotJson = "";
    }
    return;
  }
  // 아직 epoch·저장소를 모른다(리셋 직후·첫 drain 전) — 내지 않는다. drain 이 끝나면 곧바로 스냅샷이 뒤따른다(여기서 drain 을 깨우면 실패 때 고리가 된다)
  if (!epoch || !storeId) return;
  const inp = await repo.loadLockSnapshotInput(active.id);
  if (!inp) return;
  const { buildLockSnapshot } = await import("@app/core/domain/lockScreen");
  const { restSecondsForSetType } = await import("@app/core/domain/prescription");
  const { getRestSoundKind, getRestVolumeLevel } = await import("./restSound");
  const { t } = await import("./i18n");
  const vol = getRestVolumeLevel();
  const snap = buildLockSnapshot({
    sessionId: active.id,
    // 이름이 비면 웹이 번역해 채운다(네이티브가 따로 번역하지 않게 · REV-006 저장소 L-6)
    title: inp.title || t("session.lockTitleFallback"),
    rows: inp.rows,
    blocks: inp.blocks,
    rest: h.getRest() ?? { endsAt: null, totalSec: null, setAt: 0, by: "web" },
    appliedThroughSeq: wm && wm.storeId === storeId && wm.dbEpoch === epoch ? wm.seq : 0,
    storeId,
    dbEpoch: epoch,
    paused: inp.paused,
    sound: { enabled: true, preset: getRestSoundKind(), volume: vol === "mid" ? 1 : vol === "loud" ? 2 : 3 },
    now: Date.now(),
    restAfter: (s, b) =>
      restSecondsForSetType((s.setType ?? null) as Parameters<typeof restSecondsForSetType>[0], b.restSec),
    // 잠금 운동 화면의 운동 시간·테마(SPEC-021)
    clock: { startedAt: inp.startedAt, accumulatedPauseMs: inp.accumulatedPauseMs, pausedAt: inp.pausedAt },
    theme: getTheme(),
  });
  // 같은 사본이면 보내지 않는다(updatedAt 만 다른 것 — 쓰기·동기 폭주 방지)
  const json = JSON.stringify({ ...snap, updatedAt: 0 });
  if (json === lastSnapshotJson) return;
  // [원본] await capped(lock.sessionUpdate(snap), "sessionUpdate");
  // [개선] 네이티브가 거절(accepted false — 끝난 세션·거꾸로 가는 seq)하면 「보냄」으로 치지 않는다 — 다음 상태 변화 때 다시 보낸다(REV-007 계약 M-5)
  const res = await capped(lock.sessionUpdate(snap), "sessionUpdate");
  if (res && res.accepted === false) return;
  // 보내기에 성공한 뒤에만 기억한다 — 실패한 사본을 「보냄」으로 치지 않게(REV-006 동시성 M-5)
  lastSnapshotJson = json;
  ended = false;
}

/** 웹의 휴식 변경 — 스냅샷과 따로 즉시(§7). */
export function sendLockRest(rest: RestState): void {
  if (!started || !lockAvailable()) return;
  void capped(lock.sessionSetRest(rest), "sessionSetRest").catch(() => {});
  // 사본의 rest 도 맞춘다(디바운스 — 같은 mergeRest 를 네이티브가 지난다)
  void requestLockSnapshot();
}

/**
 * 셸이 한 번 건다. 다리가 없으면 곧바로 준비됨 — 웹 브라우저에서는 아무 호출도 없다.
 * 돌려준 함수로 뗀다(e2e·핫리로드).
 */
export function startLockBridge(h: LockBridgeHooks): () => void {
  hooks = h;
  if (started) return () => {};
  if (!lockAvailable()) {
    setReady(true);
    return () => {
      hooks = null;
    };
  }
  started = true;
  let stopped = false;
  const offs: (() => void)[] = [];
  const keep = (off: () => void) => (stopped ? off() : offs.push(off)); // 뗀 뒤 늦게 붙은 구독은 바로 뗀다(REV-006 동시성 L-3)
  // 기록이 바뀌면(저장소 함수 밖의 쓰기 포함 · §9) 디바운스 스냅샷 — 종목 이름·프로필 단위도(REV-006 저장소 L-5)
  void import("@app/core/db").then(({ database }) => {
    const sub = database
      .withChangesForTables([
        "set_logs",
        "workout_exercises",
        "workouts",
        "exercise_user_prefs",
        "exercises",
        "user_profiles",
      ])
      .subscribe(() => void requestLockSnapshot());
    keep(() => sub.unsubscribe());
  });
  void lock.onAction(() => void requestLockDrain()).then((l) => l && keep(() => void l.remove()));
  // 다른 기기에서 내려온 테마·소리 설정 — user_profiles 구독은 localStorage 반영보다 먼저 읽을 수 있어 같은 사본으로 끝난다(REV-021 데이터 M-1)
  const onPrefs = () => void requestLockSnapshot();
  window.addEventListener(PREFS_EVENT, onPrefs);
  offs.push(() => window.removeEventListener(PREFS_EVENT, onPrefs));
  const toBack = () => {
    // 뒤로 갈 때 — ① 입력 중 값 커밋 → ② 스냅샷 즉시(§9)
    void import("@/app/components/session/setDrafts")
      .then((m) => capped(m.commitAllDrafts(), "입력 중 값 저장", 3000))
      .catch(() => {})
      .finally(() => void requestLockSnapshot(true));
  };
  void onAppState((active) => (active ? void requestLockDrain() : toBack())).then(
    (l) => l && keep(() => void l.remove()),
  );
  const onVis = () => (document.visibilityState === "visible" ? void requestLockDrain() : toBack());
  document.addEventListener("visibilitychange", onVis);
  offs.push(() => document.removeEventListener("visibilitychange", onVis));
  // 「확인 중」 덮개의 독립 상한 — 진단을 남기고 연다
  const cap = setTimeout(() => {
    if (!ready) {
      console.warn("[lock] 첫 drain 이 상한 안에 끝나지 않았다 — 입력 막음을 연다");
      setReady(true);
    }
  }, READY_CAP_MS);
  offs.push(() => clearTimeout(cap));
  void requestLockDrain(); // 첫 로드
  return () => {
    stopped = true;
    for (const f of offs) f();
    if (retryTimer) clearTimeout(retryTimer);
    if (snapshotTimer) clearTimeout(snapshotTimer);
    retryTimer = null;
    snapshotTimer = null;
    started = false;
    hooks = null;
  };
}
