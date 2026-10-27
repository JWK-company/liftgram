// @plm SRS-080  성과 요약 보내기 대기열 — 오프라인에서 보낸 요약을 연결되면 **한 번만** 보낸다(client_id · ADR-041).
//
// ─────────────────────────────────────────────────────────────────────────────
// 계정 분리(S-4 · U-16 · D-13):
//   · 키는 사용자마다 `liftgram.summaryOutbox:<userId>`. 항목마다 ownerUserId 를 적고, 보낼 때 지금 사용자와 다르면 버린다.
//   · 로그아웃·계정 전환(syncOwner wipeFor·discardLocalAndAdopt)·다른 사람 로그인 때 지운다(syncTransport 가 부른다).
//   · 대기 ≤ 10개 · 7일이 지나면 보내지 않고 「못 보냄 · 7일 동안 연결되지 않았어요」로 옮긴다.
// 실패 분류(서버 보고 p4-server-report):
//   · 영구 실패 = PermissionDenied·InvalidArgument·AlreadyExists·ResourceExhausted·NotFound·FailedPrecondition
//     → 대기열에서 빼고 실패 목록에 이유만 남긴다(스냅샷은 지운다 — 기기에 남길 이유가 없다). 무한 재전송 없음.
//   · 그 밖(망 끊김·Unavailable·Internal·Unauthenticated…) = 다시 보낼 것 → 같은 client_id·같은 내용 그대로 다시.
//   · 섹션을 바꿔 다시 보내면 **새 client_id** 다(같은 client_id 에 다른 내용 = AlreadyExists). 화면이 매번 새로 만든다.
// 재전송 방아쇠: 앱 시작·로그인(syncTransport.onLoggedIn) · 온라인 복귀(window online) · 보내기 직후.
// ─────────────────────────────────────────────────────────────────────────────
import { Code, ConnectError } from "@connectrpc/connect";
import { coachingClient } from "./coachingClient";
import { hasSession } from "./session";

export const OUTBOX_PREFIX = "liftgram.summaryOutbox:";
export const OUTBOX_MAX = 10;
export const OUTBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FAILED_MAX = 20;
const EVENT = "liftgram:summaryOutbox";

export type FailReason = "ended" | "invalid" | "conflict" | "dailyLimit" | "expired" | "full" | "unknown";

export interface OutboxItem {
  clientId: string;
  ownerUserId: string;
  trainerId: string;
  periodStart: number;
  periodEnd: number;
  schemaVersion: number;
  snapshotJson: string;
  queuedAt: number;
}

/** 못 보낸 것 — 스냅샷 없이 무엇을·누구에게·왜만 */
export interface FailedItem {
  clientId: string;
  trainerId: string;
  periodStart: number;
  periodEnd: number;
  reason: FailReason;
  at: number;
}

export interface CoachRef {
  id: string;
  name: string;
}

interface Box {
  v: 1;
  pending: OutboxItem[];
  failed: FailedItem[];
  /** 마지막으로 본 코칭 중 코치(오프라인에서 연 화면이 받을 사람을 고를 수 있게 — 내 관계 정보만) */
  coaches?: CoachRef[];
}

const keyOf = (userId: string) => OUTBOX_PREFIX + userId;

function emptyBox(): Box {
  return { v: 1, pending: [], failed: [] };
}

function readBox(userId: string): Box {
  try {
    const s = localStorage.getItem(keyOf(userId));
    if (!s) return emptyBox();
    const v = JSON.parse(s) as Partial<Box> | null;
    if (!v || typeof v !== "object") return emptyBox();
    const pending = Array.isArray(v.pending) ? v.pending.filter(isItem) : [];
    const failed = Array.isArray(v.failed) ? v.failed.filter(isFailed) : [];
    const coaches = Array.isArray(v.coaches)
      ? v.coaches.filter((c): c is CoachRef => !!c && typeof c.id === "string" && typeof c.name === "string")
      : undefined;
    return { v: 1, pending, failed, coaches };
  } catch {
    return emptyBox();
  }
}

function writeBox(userId: string, box: Box): void {
  try {
    if (!box.pending.length && !box.failed.length && !box.coaches?.length)
      localStorage.removeItem(keyOf(userId));
    else localStorage.setItem(keyOf(userId), JSON.stringify(box));
  } catch {
    // 저장소를 못 쓰면 대기열 없이 — 보내기는 온라인에서만 된다
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { userId } }));
}

function isItem(x: unknown): x is OutboxItem {
  const o = x as OutboxItem;
  return (
    !!o &&
    typeof o.clientId === "string" &&
    typeof o.ownerUserId === "string" &&
    typeof o.trainerId === "string" &&
    typeof o.snapshotJson === "string" &&
    Number.isFinite(o.periodStart) &&
    Number.isFinite(o.periodEnd) &&
    Number.isFinite(o.queuedAt)
  );
}

function isFailed(x: unknown): x is FailedItem {
  const o = x as FailedItem;
  return (
    !!o && typeof o.clientId === "string" && typeof o.trainerId === "string" && typeof o.reason === "string"
  );
}

function toFailed(it: OutboxItem, reason: FailReason, at: number): FailedItem {
  return {
    clientId: it.clientId,
    trainerId: it.trainerId,
    periodStart: it.periodStart,
    periodEnd: it.periodEnd,
    reason,
    at,
  };
}

/** 주인이 다른 항목은 버리고, 7일 지난 것은 실패로 옮긴다(읽을 때마다). */
function prune(userId: string, box: Box, now: number): Box {
  const pending: OutboxItem[] = [];
  const failed = [...box.failed];
  for (const it of box.pending) {
    if (it.ownerUserId !== userId) continue; // 다른 사람 것 — 보내지도 보이지도 않는다
    if (now - it.queuedAt > OUTBOX_TTL_MS) failed.push(toFailed(it, "expired", now));
    else pending.push(it);
  }
  return { ...box, pending, failed: failed.filter((f) => now - f.at <= OUTBOX_TTL_MS).slice(-FAILED_MAX) };
}

/** 화면용 — 지금 사용자의 대기·실패 목록 */
export function readOutbox(userId: string): {
  pending: OutboxItem[];
  failed: FailedItem[];
  coaches: CoachRef[];
} {
  const box = readBox(userId);
  const pruned = prune(userId, box, Date.now());
  if (pruned.pending.length !== box.pending.length || pruned.failed.length !== box.failed.length)
    writeBox(userId, pruned);
  return { pending: pruned.pending, failed: pruned.failed, coaches: pruned.coaches ?? [] };
}

/** 마지막으로 본 코칭 중 코치를 기억한다(오프라인 화면용). */
export function rememberCoaches(userId: string, coaches: CoachRef[]): void {
  const box = readBox(userId);
  const next = coaches.slice(0, 20);
  if (JSON.stringify(box.coaches ?? []) === JSON.stringify(next)) return; // 같으면 쓰지 않는다(변경 알림도 없음)
  writeBox(userId, { ...box, coaches: next });
}

export function onOutboxChange(fn: () => void): () => void {
  const onLocal = () => fn();
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(OUTBOX_PREFIX)) fn();
  };
  window.addEventListener(EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

/** 이 사용자 것을 빼고 모든 대기열을 지운다(keep 이 없으면 전부). */
export function clearSummaryOutboxes(keep?: string | null): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(OUTBOX_PREFIX) && (!keep || k !== keyOf(keep))) localStorage.removeItem(k);
    }
  } catch {
    // 저장소가 없으면 지울 것도 없다
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail: {} }));
}

/** 서버 오류 → 영구 실패 이유(null = 다시 보낼 것) */
export function permanentReason(e: unknown): FailReason | null {
  const code = e instanceof ConnectError ? e.code : ConnectError.from(e).code;
  switch (code) {
    case Code.PermissionDenied:
    case Code.NotFound:
    case Code.FailedPrecondition:
      return "ended";
    case Code.InvalidArgument:
      return "invalid";
    case Code.AlreadyExists:
      return "conflict";
    case Code.ResourceExhausted:
      return "dailyLimit";
    default:
      return null;
  }
}

async function sendOnce(it: OutboxItem): Promise<void> {
  await coachingClient().sendProgressSummary({
    trainerId: it.trainerId,
    periodStart: BigInt(it.periodStart),
    periodEnd: BigInt(it.periodEnd),
    schemaVersion: it.schemaVersion,
    snapshotJson: it.snapshotJson,
    clientId: it.clientId,
  });
}

function removeItem(userId: string, clientId: string, fail?: FailedItem): void {
  const box = readBox(userId);
  const pending = box.pending.filter((p) => p.clientId !== clientId);
  const failed = fail
    ? [...box.failed.filter((f) => f.clientId !== clientId), fail].slice(-FAILED_MAX)
    : box.failed;
  writeBox(userId, { ...box, pending, failed });
}

export type SendResult = { kind: "sent" } | { kind: "queued" } | { kind: "failed"; reason: FailReason };

/**
 * 보낸다 — 온라인이면 곧바로, 아니면(또는 망 오류면) 대기열에 둔다. 영구 실패는 대기열에 두지 않는다.
 * 대기열이 가득 차면(10개) 실패로 돌려준다.
 */
export async function sendSummary(item: Omit<OutboxItem, "queuedAt">): Promise<SendResult> {
  const it: OutboxItem = { ...item, queuedAt: Date.now() };
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (!offline) {
    try {
      await sendOnce(it);
      return { kind: "sent" };
    } catch (e) {
      const reason = permanentReason(e);
      if (reason) {
        removeItem(it.ownerUserId, it.clientId, toFailed(it, reason, Date.now()));
        return { kind: "failed", reason };
      }
      // 다시 보낼 오류 — 아래 대기열로
    }
  }
  const box = prune(it.ownerUserId, readBox(it.ownerUserId), Date.now());
  if (box.pending.length >= OUTBOX_MAX) return { kind: "failed", reason: "full" };
  writeBox(it.ownerUserId, { ...box, pending: [...box.pending, it] });
  return { kind: "queued" };
}

let flushing: Promise<void> | null = null;
let currentUser: string | null = null;
let listening = false;

function onOnline(): void {
  if (currentUser) void flushSummaryOutbox(currentUser);
}

/** 대기열을 보낸다(한 번에 하나씩 · 겹쳐 부르면 진행 중인 것을 기다린다). */
export function flushSummaryOutbox(userId: string): Promise<void> {
  if (flushing) return flushing;
  // [주의] 비워 두는 일은 .finally(다음 마이크로태스크)에서 — 보낼 것이 없어 동기로 끝나도 「진행 중」이 남지 않게
  const p: Promise<void> = runFlush(userId).finally(() => {
    if (flushing === p) flushing = null;
  });
  flushing = p;
  return p;
}

async function runFlush(userId: string): Promise<void> {
  const { pending } = readOutbox(userId);
  for (const it of pending) {
    // 그 사이 로그아웃·계정 전환이면 멈춘다(다른 사람 세션으로 보내지 않는다)
    if (currentUser !== userId || !hasSession()) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    try {
      await sendOnce(it);
      removeItem(userId, it.clientId);
    } catch (e) {
      const reason = permanentReason(e);
      if (reason) removeItem(userId, it.clientId, toFailed(it, reason, Date.now()));
      else return; // 망 오류 — 다음 방아쇠에서 다시
    }
  }
}

/** 로그인(앱 시작 포함) 뒤 — 다른 사람 대기열을 지우고, 온라인 복귀를 듣고, 한 번 보낸다. */
export function startSummaryOutbox(userId: string, opts: { wiped?: boolean } = {}): void {
  currentUser = userId;
  // 계정 전환으로 기기 기록을 비웠으면 이 기기에서 만든 요약은 모두 버린다(다른 사람 기록으로 만들었을 수 있다)
  clearSummaryOutboxes(opts.wiped ? null : userId);
  if (!listening && typeof window !== "undefined") {
    window.addEventListener("online", onOnline);
    listening = true;
  }
  void flushSummaryOutbox(userId);
}

/** 로그아웃 — 모두 지우고 그만 듣는다. */
export function stopSummaryOutbox(): void {
  currentUser = null;
  clearSummaryOutboxes(null);
  if (listening) {
    window.removeEventListener("online", onOnline);
    listening = false;
  }
}

/** 지금 대기열이 따르는 사용자(화면이 보내기 직후 flush 할 때) */
export function outboxUser(): string | null {
  return currentUser;
}
