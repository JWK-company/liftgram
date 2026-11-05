// 이용 기록 큐(SPEC-032 Phase 3) — 기능 이름과 나이만 보낸다. 내용·입력값은 담지 않는다.
//
// ── 절대 화면을 막지 않는다 ──
// 모든 함수는 던지지 않는다. 전송 실패는 큐에 남겼다가 다음에 보낸다(4xx 는 버린다).
//
// ── 주체 ──
// 로그인 중에는 device_id 를 보내지 않는다(계정과 기기를 잇지 않는다). 항목마다 주체를 적어 두고,
// 현재 신원과 다르면 버린다 — 다른 계정의 사용을 이 계정으로 세지 않는다.
//
// ── 토큰 ──
// 갱신하지 않는다(refresh 회전을 건드리지 않는다). 메모리에 토큰이 없거나 401 이면 다음 기회에 보낸다.
// keepalive fetch 만 쓴다 — sendBeacon 은 헤더를 못 붙인다.
//
// ── 탭 ──
// 큐는 localStorage 하나를 함께 쓰고, 보내는 것은 Web Locks 로 한 탭만 한다. 겹쳐도 서버가 client_event_id 로 거른다.
import { routes } from "@app/contracts";
import { useSyncExternalStore } from "react";
import { APP_VERSION } from "./appUpdate";
import { nativeOS } from "./native";
import { currentAccessToken } from "./session";

/** 건강 보고의 liftgram.device_id 와 일부러 나눈다 — 그쪽 ID 와 이어지지 않게. */
const DEVICE_KEY = "liftgram.usage.deviceId";
const QUEUE_KEY = "liftgram.usage.queue";
const OPT_OUT_KEY = "liftgram.usage.optOut";
const LOCK_NAME = "liftgram.usage.send";
const MAX_QUEUE = 200;
const BATCH = 50;

export const PERSIST_INTERVAL_MS = 30_000;
export const PRESENCE_INTERVAL_MS = 60_000;
export const FIRST_SEND_DELAY_MS = 3_000;
/** 이만큼 지나 돌아오면 새로 연 것으로 센다. */
export const APP_OPEN_GAP_MS = 30 * 60_000;

type Item = { id: string; e: string; t: number; a: string };

let pending: Omit<Item, "a">[] = [];
/** "g" 비로그인 · "u:<id>" 로그인 · null 아직 모름 */
let actor: string | null = null;
let disabledByServer = false;
const lastFired = new Map<string, number>();

function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function readQueue(): Item[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as Item[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: Item[]): void {
  try {
    if (items.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
    else localStorage.removeItem(QUEUE_KEY);
  } catch {
    // 저장할 수 없으면 이번 것은 버린다
  }
}

// ── 끄기 ──
const optListeners = new Set<() => void>();

export function usageOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

/** 끄면 쌓인 것도 지운다 — 전송과 접속 신호가 모두 멈춘다. */
export function setUsageOptedOut(off: boolean): void {
  try {
    if (off) localStorage.setItem(OPT_OUT_KEY, "1");
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    // 저장할 수 없으면 이번 실행에서만 적용되지 않는다
  }
  if (off) {
    pending = [];
    writeQueue([]);
  }
  for (const fn of optListeners) fn();
}

export function useUsageOptedOut(): boolean {
  return useSyncExternalStore(
    (fn) => {
      optListeners.add(fn);
      return () => optListeners.delete(fn);
    },
    usageOptedOut,
    () => false,
  );
}

// ── 쌓기 ──

/** 기능 사용 한 건. throttleMs 를 주면 그 안의 같은 이름은 세지 않는다(입력 한 글자마다 세지 않게). */
export function trackUsage(event: string, opts?: { throttleMs?: number }): void {
  try {
    if (typeof window === "undefined" || disabledByServer || usageOptedOut()) return;
    const now = Date.now();
    if (opts?.throttleMs) {
      const last = lastFired.get(event);
      if (last !== undefined && now - last < opts.throttleMs) return;
      lastFired.set(event, now);
    }
    pending.push({ id: uuid(), e: event, t: now });
    if (pending.length > MAX_QUEUE) pending = pending.slice(-MAX_QUEUE);
  } catch {
    // 화면을 막지 않는다
  }
}

/** 메모리의 것을 저장한다. 신원을 모르는 동안은 메모리에 둔다. */
export function persistUsage(): void {
  if (actor === null || pending.length === 0) return;
  const a = actor;
  const merged = [...readQueue(), ...pending.map((p) => ({ ...p, a }))];
  pending = [];
  writeQueue(merged.slice(-MAX_QUEUE));
}

/**
 * 신원이 정해지거나 바뀔 때. 바뀌기 전 항목은 옛 주체로 저장돼 보낼 때 버려진다.
 * null 은 아직 모름, "" 는 비로그인이다.
 */
export function setUsageActor(userId: string | null): void {
  persistUsage();
  actor = userId === null ? null : userId === "" ? "g" : `u:${userId}`;
}

function guestDeviceId(): string | null {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(DEVICE_KEY, id);
      // 저장이 안 되는 환경이면 매번 새 기기로 세게 된다 — 보내지 않는다.
      if (localStorage.getItem(DEVICE_KEY) !== id) return null;
    }
    return id;
  } catch {
    return null;
  }
}

async function sendOnce(presence: boolean): Promise<void> {
  if (disabledByServer || usageOptedOut() || actor === null) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  persistUsage();
  const all = readQueue();
  // 다른 주체의 것은 버린다.
  const mine = all.filter((i) => i.a === actor);
  if (mine.length !== all.length) writeQueue(mine);
  const batch = mine.slice(0, BATCH);
  if (!presence && batch.length === 0) return;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    "connect-protocol-version": "1",
  };
  let deviceId = "";
  if (actor === "g") {
    const id = guestDeviceId();
    if (!id) {
      writeQueue([]);
      return;
    }
    deviceId = id;
  } else {
    const token = currentAccessToken();
    if (!token) return;
    headers.authorization = `Bearer ${token}`;
  }

  const now = Date.now();
  const res = await fetch(`${routes.apiPrefix}/usage.v1.UsageService/ReportUsage`, {
    method: "POST",
    keepalive: true,
    credentials: "omit",
    headers,
    body: JSON.stringify({
      deviceId,
      platform: nativeOS() ?? "web",
      appVersion: APP_VERSION,
      presence,
      events: batch.map((i) => ({ clientEventId: i.id, event: i.e, ageMs: String(Math.max(0, now - i.t)) })),
    }),
  });
  const sent = new Set(batch.map((i) => i.id));
  const drop = () => writeQueue(readQueue().filter((i) => !sent.has(i.id)));
  if (res.ok) {
    drop();
    const body = (await res.json().catch(() => null)) as { enabled?: boolean } | null;
    if (body && body.enabled === false) {
      disabledByServer = true;
      pending = [];
      writeQueue([]);
    }
    return;
  }
  // 401 은 토큰이 낡은 것, 429·5xx 는 일시적이다 — 큐를 지킨다. 나머지 4xx 는 다시 보내도 같다.
  if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 408 && res.status !== 429)
    drop();
}

/** 한 탭만 보낸다. 실패는 삼킨다. */
export async function flushUsage(presence: boolean): Promise<void> {
  try {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (locks?.request) {
      await locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
        if (lock) await sendOnce(presence);
      });
    } else {
      await sendOnce(presence);
    }
  } catch {
    // 다음 기회에
  }
}

/** 경로 → 화면 구역. 서버 허용 목록(usage/service.go)과 같은 이름이고, 입력값·ID 는 싣지 않는다. */
const ZONES: Record<string, string> = {
  workout: "workout",
  routines: "routines",
  exercises: "exercises",
  exercise: "exercises",
  history: "history",
  stats: "stats",
  calendar: "calendar",
  feed: "feed",
  discover: "explore",
  explore: "explore",
  hashtag: "explore",
  profile: "profile",
  u: "profile",
  messages: "messages",
  notifications: "notifications",
  coaching: "coaching",
  gyms: "gyms",
  program: "program",
  account: "account",
  signin: "account",
  signup: "account",
  gear: "gear",
};

export function screenEvent(pathname: string): string {
  const seg = pathname.split("/")[1] ?? "";
  if (!seg) return "screen_home";
  return `screen_${ZONES[seg] ?? "other"}`;
}
