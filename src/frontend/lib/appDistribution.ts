// SPEC-018 §5·§6·§8  앱 배포 안내 — 화면(배너·프로필 카드·시트·/app)이 쓰는 웹 쪽 다리
//
// · 서버 `/downloads/android.json` 읽기(no-store · 모양은 core parseLatest 가 좁힌다)
// · 지금 셸 판별(웹 브라우저 갈래 / 스토어 앱 · 다리 `LiftgramUpdate` 3상태)
// · 다리 감싸기(info · state · download · install · …) — 실패는 닫힌 코드(core updateErrorCode)로만
// · 「나중에」 기록 · 시트 단계 저장
// · 기록 확인(바꾸기·재설치 1단계) · 설치 직전 저장
// 판정 규칙 자체는 core `domain/appDistribution.ts`(순수 · 단위 시험).
import {
  type Dismissed,
  type Latest,
  type RecordCheck,
  type RecordCheckFail,
  recordCheckVerdict,
  type Shell,
  type UpdateErrorCode,
  browserKind,
  nextDismiss,
  parseLatest,
  updateErrorCode,
  webOs,
} from "@app/core/domain/appDistribution";
import { nativeOS } from "./native";

// ── 서버 최신판 ────────────────────────────────────────────────────────────────

export const LATEST_URL = "/downloads/android.json";
let latestCache: { at: number; value: Latest | null } | null = null;
const LATEST_TTL_MS = 5 * 60_000;

/** 최신판 — 5분 동안 같은 값을 쓴다(force 면 다시 읽음) · 못 읽으면 null(안내 없음). */
let inflight: Promise<Latest | null> | null = null;
const FORCE_MIN_MS = 60_000;
export async function fetchLatest(force = false): Promise<Latest | null> {
  const age = latestCache ? Date.now() - latestCache.at : Number.POSITIVE_INFINITY;
  // 강제도 60초에 한 번까지 · 진행 중이면 같은 약속(REV-013 화면 L-1 — 배너·카드 두 훅)
  if (latestCache && age < (force ? FORCE_MIN_MS : LATEST_TTL_MS)) return latestCache.value;
  if (inflight) return inflight;
  inflight = fetchLatestNow().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function fetchLatestNow(): Promise<Latest | null> {
  try {
    const r = await fetch(LATEST_URL, { cache: "no-store", credentials: "omit" });
    const value = r.ok ? parseLatest(await r.json()) : null;
    latestCache = { at: Date.now(), value };
    return value;
  } catch {
    return latestCache?.value ?? null;
  }
}

/**
 * 브라우저 받기 링크 — 옛 서비스 워커(이 규칙 전 · v0.58 이하)는 `_rsc` 질의를 손대지 않는다(네트워크 그대로).
 * 정적 파일은 질의를 무시하고, 헤더 규칙(next.config.ts)도 경로로 맞는다(REV-010 웹 M-3 · REV-013 화면 M-10).
 */
export function apkHref(url: string): string {
  return `${url}?_rsc=apk`;
}

// ── 다리 ──────────────────────────────────────────────────────────────────────

export const UPDATE_PLUGIN = "LiftgramUpdate";

type Bridge = {
  info(): Promise<Record<string, unknown>>;
  state(): Promise<Record<string, unknown>>;
  ackJustUpdated(): Promise<unknown>;
  download(o: { url: string; sha256: string; size: number }): Promise<{ id?: unknown }>;
  cancelDownload(): Promise<unknown>;
  install(o: { id: string; mode?: "session" | "view" }): Promise<{ mode?: unknown; sessionId?: unknown }>;
  cancelInstall(): Promise<unknown>;
  openInstallSettings(): Promise<{ opened?: unknown }>;
  addListener(ev: string, fn: (d: Record<string, unknown>) => void): Promise<{ remove(): Promise<void> }>;
};

type CapWindow = Window & {
  Capacitor?: { isPluginAvailable?: (n: string) => boolean; Plugins?: Record<string, unknown> };
};

function bridge(): Bridge | null {
  if (typeof window === "undefined") return null;
  const c = (window as CapWindow).Capacitor;
  if (!c?.isPluginAvailable?.(UPDATE_PLUGIN)) return null;
  return (c.Plugins?.[UPDATE_PLUGIN] as Bridge | undefined) ?? null;
}

/** 다리 실패 → 닫힌 코드(시스템 문구는 보이지 않는다) */
export class UpdateError extends Error {
  constructor(readonly code: UpdateErrorCode) {
    super(code);
  }
}

function codeOf(e: unknown): UpdateErrorCode {
  const c = (e as { code?: unknown } | null)?.code;
  return updateErrorCode(typeof c === "string" ? c : undefined);
}

async function call<T>(fn: (b: Bridge) => Promise<T>): Promise<T> {
  const b = bridge();
  if (!b) throw new UpdateError("failure");
  try {
    return await fn(b);
  } catch (e) {
    throw new UpdateError(codeOf(e));
  }
}

export type NativeInfo = {
  versionName: string | null;
  versionCode: number | null;
  certSha256: string | null;
  expectedCertSha256: string | null;
  installer: string | null;
  debug: boolean;
  canInstall: boolean;
  sdk: number | null;
  metered: boolean;
  justUpdated: { from: number; to: number } | null;
  installStarted: { from: number; to: number } | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
function fromTo(v: unknown): { from: number; to: number } | null {
  const o = v as { from?: unknown; to?: unknown } | null;
  const from = int(o?.from);
  const to = int(o?.to);
  return from != null && to != null ? { from, to } : null;
}

export async function updateInfo(): Promise<NativeInfo> {
  const r = await call((b) => b.info());
  return {
    versionName: str(r.versionName),
    versionCode: int(r.versionCode),
    certSha256: str(r.certSha256),
    expectedCertSha256: str(r.expectedCertSha256),
    installer: str(r.installer),
    debug: r.debug === true,
    canInstall: r.canInstall === true,
    sdk: int(r.sdk),
    metered: r.metered === true,
    justUpdated: fromTo(r.justUpdated),
    installStarted: fromTo(r.installStarted),
  };
}

export type NativeState = {
  downloading: { id: string; received: number; total: number } | null;
  installing: { to: number; sessionId: number; at: number } | null;
  confirmWaiting: boolean;
  lastResult: { status: string; sessionId: number; at: number } | null;
};

export async function updateState(): Promise<NativeState> {
  const r = await call((b) => b.state());
  const d = r.downloading as Record<string, unknown> | null | undefined;
  const i = r.installing as Record<string, unknown> | null | undefined;
  const l = r.lastResult as Record<string, unknown> | null | undefined;
  return {
    downloading:
      d && str(d.id) ? { id: String(d.id), received: int(d.received) ?? 0, total: int(d.total) ?? 0 } : null,
    installing: i ? { to: int(i.to) ?? 0, sessionId: int(i.sessionId) ?? 0, at: int(i.at) ?? 0 } : null,
    confirmWaiting: r.confirmWaiting === true,
    lastResult:
      l && str(l.status)
        ? { status: String(l.status), sessionId: int(l.sessionId) ?? 0, at: int(l.at) ?? 0 }
        : null,
  };
}

export const updateBridge = {
  ackJustUpdated: () => call((b) => b.ackJustUpdated()).catch(() => undefined),
  /** 받기 — 같은 sha256 이 이미 있으면 진행 한 번으로 끝난다 · 돌려준 id = sha256 */
  async download(l: Latest): Promise<string> {
    const r = await call((b) => b.download({ url: l.url, sha256: l.sha256, size: l.size }));
    const id = str(r.id);
    if (!id) throw new UpdateError("failure");
    return id;
  },
  cancelDownload: () => call((b) => b.cancelDownload()).catch(() => undefined),
  async install(
    id: string,
    mode: "session" | "view" = "session",
  ): Promise<{ mode: string; sessionId: number | null }> {
    const r = await call((b) => b.install({ id, mode }));
    return { mode: str(r.mode) ?? mode, sessionId: int(r.sessionId) };
  },
  cancelInstall: () => call((b) => b.cancelInstall()).catch(() => undefined),
  async openInstallSettings(): Promise<boolean> {
    const r = await call((b) => b.openInstallSettings());
    return r.opened === true;
  },
  /** progress {received,total} · installResult {status,sessionId,at} · resume {} */
  async on(
    ev: "progress" | "installResult" | "resume",
    fn: (d: Record<string, unknown>) => void,
  ): Promise<() => void> {
    const b = bridge();
    if (!b?.addListener) return () => {};
    try {
      const h = await b.addListener(ev, fn);
      return () => void h.remove().catch(() => undefined);
    } catch {
      return () => {};
    }
  },
};

// ── 셸 판별 ───────────────────────────────────────────────────────────────────

/** 지금 셸 + (앱이면) 다리 info. 웹 브라우저·iOS 앱은 다리를 부르지 않는다. */
export async function readShell(): Promise<{ shell: Shell; info: NativeInfo | null }> {
  const os = nativeOS();
  if (os === "ios") {
    return {
      shell: {
        kind: "app",
        os: "ios",
        bridge: "missing",
        versionCode: null,
        certSha256: null,
        expectedCertSha256: null,
        installer: null,
      },
      info: null,
    };
  }
  if (os === "android") {
    if (!bridge()) {
      // 옛 앱(1.0.x·1.1.x) — 다리가 없다 = 디버그 키 앱 → 한 번 다시 설치
      return {
        shell: {
          kind: "app",
          os: "android",
          bridge: "missing",
          versionCode: null,
          certSha256: null,
          expectedCertSha256: null,
          installer: null,
        },
        info: null,
      };
    }
    try {
      const info = await updateInfo();
      return {
        shell: {
          kind: "app",
          os: "android",
          bridge: "ready",
          versionCode: info.versionCode,
          certSha256: info.certSha256,
          expectedCertSha256: info.expectedCertSha256,
          installer: info.installer,
          debug: info.debug,
        },
        info,
      };
    } catch {
      return {
        shell: {
          kind: "app",
          os: "android",
          bridge: "failed",
          versionCode: null,
          certSha256: null,
          expectedCertSha256: null,
          installer: null,
        },
        info: null,
      };
    }
  }
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  let standalone = false;
  try {
    standalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  } catch {
    standalone = false;
  }
  return { shell: { kind: "web", os: webOs(ua), browser: browserKind(ua), standalone }, info: null };
}

// ── 「나중에」 ─────────────────────────────────────────────────────────────────

export const DISMISS_KEY = "liftgram.appDist.dismissed";
type DismissRecord = { key: string; count: number; until: number; never: boolean };

export function readDismissed(): (DismissRecord & Dismissed) | null {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<DismissRecord>;
    if (typeof o.key !== "string" || typeof o.until !== "number") return null;
    return {
      key: o.key,
      count: typeof o.count === "number" ? o.count : 0,
      until: o.until,
      never: o.never === true,
    };
  } catch {
    return null;
  }
}

export function dismissOffer(key: string, never = false): void {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify(nextDismiss(readDismissed(), key, Date.now(), never)));
  } catch {
    // 저장소가 막혔다 — 이번 화면에서만 숨긴다(부르는 쪽 상태)
  }
}

// ── 시트 단계(새로고침·설정 다녀오기·설치하고 돌아오기에도 이어짐) ─────────────────────

export const UPDATE_STEP_KEY = "liftgram.appUpdate.step"; // sessionStorage(앱 · 이 실행 동안)
export const SWITCH_STEP_KEY = "liftgram.appSwitch.step"; // localStorage(PWA · 설치하고 돌아와도)

export function readStep<T extends string>(
  store: "session" | "local",
  key: string,
  allowed: readonly T[],
): T | null {
  try {
    const s = (store === "session" ? sessionStorage : localStorage).getItem(key);
    return s && (allowed as readonly string[]).includes(s) ? (s as T) : null;
  } catch {
    return null;
  }
}

export function writeStep(store: "session" | "local", key: string, step: string | null): void {
  try {
    const st = store === "session" ? sessionStorage : localStorage;
    if (step) st.setItem(key, step);
    else st.removeItem(key);
  } catch {
    // 단계를 못 남기면 처음부터 다시 — 기록 확인을 다시 할 뿐 위험은 없다
  }
}

// ── 기록 확인(바꾸기·재설치 1단계 — SPEC-018 §8) ─────────────────────────────────
// [원본] 판정을 여기서 바로 했다 — 조건마다 시험이 없었다(REV-013 시험 H-1). 판정은 core recordCheckVerdict(단위 표),
//        여기는 값만 모은다. 옛 본문은 git(SPEC-018 Phase 4 첫 판)에 있다 — 같은 단계 안의 첫 판이라 주석으로 두지 않는다.

export type { RecordCheck, RecordCheckFail };

function readPrefsPending(key: string): boolean {
  try {
    const p = localStorage.getItem(key);
    return !!p && p !== "{}";
  } catch {
    return true; // 못 읽으면 대기가 없다고 보지 않는다
  }
}

/**
 * 이 기기 기록이 모두 서버에 올라갔는가 — 판정은 core recordCheckVerdict.
 * 동기는 이번 확인이 시작한 것이어야 한다 — 이미 돌던 동기(시작이 더 이른)에 합류했으면 한 번 더 부른다.
 */
export async function checkRecordsUploaded(o: {
  userId: string | null;
  ownerConflict: boolean;
}): Promise<RecordCheck> {
  const startedAt = Date.now();
  const base = {
    loggedIn: !!o.userId,
    ownerConflict: o.ownerConflict,
    online: typeof navigator === "undefined" || navigator.onLine !== false,
    activeWorkout: false,
    elsewhere: false,
    syncOk: false,
    lastSuccessAt: null as number | null,
    startedAt,
    pending: -1,
    prefsPending: true,
    outboxPending: 0,
    uploaded: 0,
  };
  // 앞 조건이 걸리면 동기까지 가지 않는다
  const early = recordCheckVerdict(base);
  if (!early.ok && early.why !== "sync-failed") return early;
  const repo = await import("@app/core/data/workoutRepository");
  base.activeWorkout = !!(await repo.getActiveWorkout().catch(() => true));
  const { getElsewhereState } = await import("./tabGuard");
  base.elsewhere = getElsewhereState() !== "none";
  if (base.activeWorkout || base.elsewhere) return recordCheckVerdict(base);
  const sync = await import("@app/core/sync/syncEngine");
  for (let i = 0; i < 2; i++) {
    try {
      await sync.syncWithServer();
      base.syncOk = true;
    } catch {
      base.syncOk = false;
      break;
    }
    base.lastSuccessAt = sync.getSyncHealth().lastSuccessAt;
    if (base.lastSuccessAt != null && base.lastSuccessAt >= startedAt) break;
  }
  // 설정 대기를 먼저 보고 미동기를 센다(REV-013 보안 L-6 — 그 사이 생긴 설정 쓰기를 놓치지 않게)
  const { PENDING_KEY } = await import("./prefs");
  base.prefsPending = readPrefsPending(PENDING_KEY);
  base.pending = await sync.countPendingUserChanges().catch(() => -1);
  if (o.userId) {
    // [원본] const { readOutbox } = await import("./summaryOutbox");
    // [원본] base.outboxPending = readOutbox(o.userId).pending.length;
    // [개선] 대기열을 보거나 지울 화면이 없어졌다(ADR-051). 한 번 보내 보고, 남아도 설치를 막지 않는다 —
    //        운동 기록이 아니라 기록에서 다시 계산되는 요약이고, 막으면 최대 7일 앱을 못 바꾼다(REV-029).
    const { flushSummaryOutbox } = await import("./summaryOutbox");
    await Promise.race([
      flushSummaryOutbox(o.userId).catch(() => {}),
      new Promise((r) => setTimeout(r, 5_000)),
    ]);
    base.outboxPending = 0;
  }
  const { countFinishedWorkouts } = await import("@app/core/data/workoutCount");
  base.uploaded = await countFinishedWorkouts().catch(() => 0);
  return recordCheckVerdict(base);
}

// ── 설치 직전 저장(SPEC-018 §5 · 설치에 성공하면 프로세스가 죽는다) ───────────────────

export type PrepareFail = "workout" | "flush";

/** 운동 중이 아닌지 다시 보고 → 입력 중 값 저장 → 기기 DB 내려쓰기. 쿠키 flush 는 네이티브 install 이 한다. */
export async function prepareForInstall(): Promise<{ ok: true } | { ok: false; why: PrepareFail }> {
  try {
    const repo = await import("@app/core/data/workoutRepository");
    if (await repo.getActiveWorkout()) return { ok: false, why: "workout" };
  } catch {
    return { ok: false, why: "workout" };
  }
  try {
    const { commitAllDrafts } = await import("@/app/components/session/setDrafts");
    // [원본] await commitAllDrafts(); — 실패를 몰랐다(REV-013 화면 L-14)
    if ((await commitAllDrafts()) > 0) return { ok: false, why: "flush" };
    const { flushLocalDbResult } = await import("./localDb");
    let r = await flushLocalDbResult();
    if (r === "failed") r = await flushLocalDbResult();
    if (r === "failed" || r === "sealed") return { ok: false, why: "flush" };
    if (r === "unreachable") await new Promise((res) => setTimeout(res, 600)); // 자동 저장 주기(500ms)를 넘겨 기다린다
  } catch {
    return { ok: false, why: "flush" };
  }
  return { ok: true };
}

/** 시스템 브라우저로 열기(재설치 — 옛 앱 웹뷰 밖에서 APK 를 받게) */
export async function openInSystemBrowser(url: string): Promise<void> {
  const c = (window as CapWindow).Capacitor;
  const b = c?.isPluginAvailable?.("Browser")
    ? (c.Plugins?.Browser as { open?: (o: { url: string }) => Promise<void> } | undefined)
    : undefined;
  if (b?.open) {
    await b.open({ url }).catch(() => window.open(url, "_system"));
    return;
  }
  window.open(url, "_system");
}
