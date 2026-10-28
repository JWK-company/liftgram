// @plm SRS-088  운영 경보 상태 — admin 의 프로필 탭 빨간 점 · 프로필 「운영 상태」 줄의 점
//
// admin 일 때만 서버에 묻는다(비admin 은 부르지도 않는다 — qa spec L-5). 판정은 서버가 한다(GetOpsAlert · DB 역할 재확인).
// 묻는 때: 로그인 직후(신원이 admin 으로 정해진 순간) · 앱이 다시 보일 때(visibilitychange) · 보이는 동안 10분마다.
// 오프라인이면 건너뛴다. 실패하면 직전 값을 유지한다(점이 깜빡이지 않게) — 권한 거절이면 끈다.
import { Code, ConnectError } from "@connectrpc/connect";
import { useSyncExternalStore } from "react";
import { opsClient } from "./opsClient";

export const OPS_ALERT_INTERVAL_MS = 10 * 60_000;

export type OpsAlertState = { alert: boolean; count: number; checkedAt: number | null };

const EMPTY: OpsAlertState = { alert: false, count: 0, checkedAt: null };
let state: OpsAlertState = EMPTY;
const listeners = new Set<() => void>();
let viewer: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

function set(next: OpsAlertState): void {
  state = next;
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useOpsAlert(): OpsAlertState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => EMPTY,
  );
}

/** 운영 화면이 전체 상태를 읽었으면 점도 그 값으로 맞춘다(두 번 묻지 않게). */
export function setOpsAlertFromStatus(alert: boolean, count: number): void {
  if (!viewer) return;
  set({ alert, count, checkedAt: Date.now() });
}

export async function checkOpsAlert(): Promise<void> {
  if (!viewer || inFlight) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const asked = viewer;
  inFlight = true;
  try {
    const res = await opsClient().getOpsAlert({});
    if (viewer === asked) set({ alert: res.alert, count: res.count, checkedAt: Date.now() });
  } catch (e) {
    // 권한이 없어졌으면(역할 회수) 점을 끈다. 그 밖(오프라인·서버 오류)은 직전 값을 둔다.
    if (e instanceof ConnectError && (e.code === Code.PermissionDenied || e.code === Code.Unauthenticated)) {
      if (viewer === asked) set(EMPTY);
    }
  } finally {
    inFlight = false;
  }
}

function onVisible(): void {
  if (document.visibilityState === "visible") void checkOpsAlert();
}

/**
 * AuthProvider 가 신원이 바뀔 때마다 부른다. admin 이 아니면 아무것도 묻지 않고 점을 끈다.
 * 화면의 role 은 안내일 뿐 — 서버가 DB 역할로 다시 판정한다.
 */
export function setOpsAlertViewer(userId: string | null, isAdmin: boolean): void {
  const next = userId && isAdmin ? userId : null;
  if (next === viewer) return;
  viewer = next;
  if (timer) clearInterval(timer);
  timer = null;
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
  set(EMPTY);
  if (!viewer || typeof window === "undefined") return;
  document.addEventListener("visibilitychange", onVisible);
  timer = setInterval(() => {
    if (document.visibilityState === "visible") void checkOpsAlert();
  }, OPS_ALERT_INTERVAL_MS);
  void checkOpsAlert(); // 로그인 직후
}
