// @plm SRS-088  기기 동기 건강 보고 — 동기를 시도한 **뒤** 이 기기의 상태를 운영진에게 알린다 (2026-10-28)
//
// 2026-10 사고에서 경고는 사용자 화면에만 있었다. 그래서 동기가 끝날 때마다(성공·실패 모두) 짧은 보고를 보낸다:
//   · 방아쇠 = 시도가 끝났을 때(lastSuccessAt·consecutiveFailures·lastError 가 바뀐 순간 — qa spec H-1). 끝난 직후
//     엔진이 미동기 수를 다시 세므로(refreshPendingCount) 그 값이 올 때까지(최대 2초) 기다렸다 보낸다.
//   · 즉시: 실패 0→양수 · 연속 실패 3 이상이 된 순간 · 실패→성공 · blocked 변화 · 그 밖은 10분에 한 번(core/domain/syncStall).
//   · 로그인했을 때만 · 오프라인이면 건너뜀(다음 시도에) · 보고 실패는 삼킨다.
//   · **동기와 다른 길**(OpsService)이다 — 동기가 죽어 있을 때가 가장 중요한 보고다.
// device_id: 이 기기의 무작위 id(`liftgram.device_id` · 계정 전환·기기 비우기에도 남는다)를 그대로 보내지 않고
//   sha256(device_id + user_id) 앞 16자로 보낸다 — 운영 화면에서 두 계정이 같은 기기임이 드러나지 않게(qa spec L-6).
// 시각은 「나이」(지금 − 그 시각)로 보낸다 — 서버가 자기 시계로 다시 계산한다(qa spec H-2).
import {
  ageMs,
  attemptFinished,
  shouldReportHealth,
  type SentHealth,
  type SyncHealthLike,
} from "@app/core/domain/syncStall";
import { getSyncHealth, subscribeSyncHealth } from "@app/core/sync/syncEngine";
import { version as APP_VERSION } from "../package.json";
import { opsClient } from "./opsClient";
import { hasSession } from "./session";

const DEVICE_KEY = "liftgram.device_id";
const SENT_KEY = "liftgram.health.sent";
/** 시도가 끝난 뒤 미동기 수 갱신을 기다리는 최대 시간 */
const SETTLE_MS = 2000;

let userId: string | null = null;
let stop: (() => void) | null = null;
let seen: SyncHealthLike | null = null;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let sending = false;
/** 보내는 중에 끝난 시도 — 보낸 뒤 다시 판단한다(3회째 실패가 첫 보고의 왕복에 묻히지 않게). */
let queued: SyncHealthLike | null = null;

/** AuthProvider 가 신원이 바뀔 때마다 알려 준다(null = 로그아웃). */
export function setClientHealthUser(id: string | null): void {
  userId = id;
}

/** 앱 시작 때 한 번(동기 전송을 꽂은 뒤). 정리 함수를 돌려준다. */
export function installClientHealthReport(): () => void {
  if (typeof window === "undefined") return () => {};
  if (stop) return stop;
  const unsubscribe = subscribeSyncHealth(onHealth);
  stop = () => {
    unsubscribe();
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = null;
    seen = null;
    stop = null;
  };
  return stop;
}

function onHealth(h: SyncHealthLike): void {
  const prev = seen;
  seen = { ...h };
  if (!prev) return; // 첫 값은 비교 기준일 뿐이다(앱을 연 것만으로는 보내지 않는다)
  const finished = attemptFinished(prev, h);
  if (settleTimer && !finished) {
    // 끝난 시도 뒤에 온 다음 값 = 미동기 수 갱신 → 지금 보낸다.
    settle();
    return;
  }
  if (finished) {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(settle, SETTLE_MS);
  }
}

function settle(): void {
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = null;
  void report(getSyncHealth());
}

function readSent(uid: string): SentHealth | null {
  try {
    const raw = localStorage.getItem(SENT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as SentHealth & { user?: string };
    // 다른 계정이 보낸 기록은 이 계정의 쓰로틀이 아니다.
    if (v.user !== uid || typeof v.at !== "number") return null;
    return { at: v.at, failures: Number(v.failures) || 0, blocked: !!v.blocked };
  } catch {
    return null;
  }
}

function writeSent(uid: string, s: SentHealth): void {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify({ ...s, user: uid }));
  } catch {
    // 저장이 막혀도(사생활 모드) 보고는 이미 갔다 — 다음에 조금 일찍 다시 보낼 뿐이다.
  }
}

/** 이 기기의 무작위 id — 없으면 만든다. 계정 전환·기기 비우기에도 지우지 않는다. */
function rawDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "nostorage";
  }
}

/** sha256(device_id + user_id) 앞 16자(16진). 보안 문맥이 아니면(crypto.subtle 없음) 가벼운 해시로 대신한다. */
export async function hashedDeviceId(uid: string): Promise<string> {
  const text = rawDeviceId() + uid;
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 16);
    }
  } catch {
    // 아래로
  }
  // FNV-1a 두 갈래(32비트 × 2) — 보안이 아니라 「같은 기기·다른 계정이 같은 값이 아니게」가 목적이다.
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x811c9dc5) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

async function report(h: SyncHealthLike): Promise<void> {
  const uid = userId;
  if (!uid || !hasSession()) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const now = Date.now();
  if (sending) {
    queued = h;
    return;
  }
  if (!shouldReportHealth({ sent: readSent(uid), next: h, now })) return;
  sending = true;
  try {
    const successAge = ageMs(h.lastSuccessAt, now);
    const attemptAge = ageMs(h.lastAttemptAt, now);
    const res = await opsClient().reportClientHealth({
      deviceId: await hashedDeviceId(uid),
      appVersion: APP_VERSION,
      successAgeMs: successAge === undefined ? undefined : BigInt(successAge),
      attemptAgeMs: attemptAge === undefined ? undefined : BigInt(attemptAge),
      consecutiveFailures: Math.max(0, Math.min(h.consecutiveFailures, 10_000)),
      pending: h.pending == null ? undefined : Math.max(0, h.pending),
      blocked: h.blocked,
      // 서버가 200자로 자른다 — 계약 상한(4000) 안으로만 줄여 보낸다.
      lastError: (h.lastError ?? "").slice(0, 1000),
    });
    // 보낸 뒤에만 적는다 — 실패한 보고는 다음 시도가 끝날 때 다시 간다.
    // [원본] writeSent(uid, { at: now, failures: h.consecutiveFailures, blocked: h.blocked });
    // [개선] 서버가 받았을 때만(qa code M-1) — 분당 상한에 걸려 버려진 보고를 「보냈다」고 적으면
    //   3회째 실패(멈춤 문턱) 같은 급한 변화가 쓰로틀(10분)에 묻혀 사라진다. 안 받았으면 다음 시도 끝에 다시 보낸다.
    if (res.accepted) writeSent(uid, { at: now, failures: h.consecutiveFailures, blocked: h.blocked });
  } catch {
    // 삼킨다(보고는 안내다 · 동기와 무관)
  } finally {
    sending = false;
    const next = queued;
    queued = null;
    if (next) void report(next);
  }
}
