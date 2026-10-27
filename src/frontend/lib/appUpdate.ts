// @plm SRS-085  앱 업데이트 상태 저장소 + 「업데이트」 절차 — 프로필 버튼 하나로(2026-10-27)
//
// ─────────────────────────────────────────────────────────────────────────────
// 셸(ServiceWorker.tsx)이 워커를 등록·추적해 여기에 적고, 프로필 줄·탭 점·덮개가 여기서 읽는다.
// 새 버전은 **사람이 누를 때만** 적용한다(필수 업데이트 제외). 앱을 쓰는 동안 저절로 새로고침하지 않는다.
//
// 「업데이트」 절차(startUpdate) — 덮개가 입력을 막은 채로:
//   ① 기기 DB 에 진행 중 운동이 없는지 다시 확인(셸 상태는 부팅 직후 비어 있을 수 있다 · 확인 실패 = 하지 않음)
//   ② 기기 DB 내려쓰기(LokiJS 는 500ms 마다 내려쓴다 — 방금 적은 세트가 새로고침에 사라지지 않게)
//   ③ 새로고침 직후에도 덮개를 이어 가도록 sessionStorage 표식
//   ④ 기다리는 워커에 "skip-waiting" → controllerchange → 새로고침(한 번만)
//   ⑤ 15초 안에 ④에 이르지 못하면 실패 화면(무한 대기 금지)
// 판정 규칙은 core `domain/swUpdatePolicy.ts`(순수 함수 · 단위 테스트).
// ─────────────────────────────────────────────────────────────────────────────
import {
  BOOT_MARKER_KEY,
  UPDATE_TIMEOUT_MS,
  compareVersions,
  controllerChangeDecision,
  readBootMarker,
} from "@app/core/domain/swUpdatePolicy";
import { useSyncExternalStore } from "react";
import { activateWaiting } from "./swActivate";
import { version as APP_VERSION_RAW } from "../package.json";

export const APP_VERSION: string = APP_VERSION_RAW;

export type UpdatePhase = "idle" | "updating" | "failed";
export type FailReason = "timeout" | "workout" | "flush" | "no-worker" | "db";

export type AppUpdateState = {
  /** 기다리는 새 워커(옛 워커가 있던 문서에서만 — 첫 설치 제외) */
  waiting: ServiceWorker | null;
  /** 이 문서는 옛 번들인데 새 워커가 이미 자리 잡음(다른 탭이 적용 · 브라우저가 늦게 활성화) — 새로고침만 하면 된다 */
  activatedElsewhere: boolean;
  /** 새 워커가 답한 버전 */
  newVersion: string | null;
  /** 서버(/app-version)가 알려 준 배포 버전 · 최소 클라이언트 버전 */
  serverVersion: string | null;
  minVersion: string | null;
  phase: UpdatePhase;
  failReason: FailReason | null;
  /** 이 문서에서 사람이 실패 화면을 닫았다 — 필수 업데이트도 이 문서에서는 다시 띄우지 않는다(QA H-1·R7) */
  dismissed: boolean;
};

let state: AppUpdateState = {
  waiting: null,
  activatedElsewhere: false,
  newVersion: null,
  serverVersion: null,
  minVersion: null,
  phase: "idle",
  failReason: null,
  dismissed: false,
};
const listeners = new Set<() => void>();

function set(patch: Partial<AppUpdateState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function getAppUpdateState(): AppUpdateState {
  return state;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

const SERVER_SNAPSHOT = state;

/** 화면이 읽는 훅 — available = 기다리는 워커가 있거나, 이미 활성화돼 새로고침만 남았다. */
export function useAppUpdate(): AppUpdateState & { available: boolean; displayNewVersion: string | null } {
  const s = useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_SNAPSHOT,
  );
  const fromServer = compareVersions(s.serverVersion, APP_VERSION) === 1 ? s.serverVersion : null;
  return {
    ...s,
    available: s.waiting != null || s.activatedElsewhere,
    displayNewVersion: s.newVersion ?? fromServer,
  };
}

/** 지금 필수 업데이트 대상인가(서버 최소 버전 > 현재 · 서버가 그 버전을 가짐) — 프로필 줄 문구용. */
export function isMandatoryNow(s: Pick<AppUpdateState, "minVersion" | "serverVersion">): boolean {
  return (
    compareVersions(APP_VERSION, s.minVersion) === -1 &&
    (compareVersions(s.serverVersion, s.minVersion) ?? -1) >= 0
  );
}

// ── 워커와 이야기하기 ─────────────────────────────────────────────────────────

let registration: ServiceWorkerRegistration | null = null;
// 셸의 register() 가 끝났다는 신호 — skip-waiting 은 등록을 다 읽은 뒤 보낸다(보내는 시점·멈춤 복구는 lib/swActivate.ts).
let resolveRegReady: (r: ServiceWorkerRegistration) => void = () => {};
const regReady: Promise<ServiceWorkerRegistration> = new Promise((r) => {
  resolveRegReady = r;
});
let hadController = false;
let applying = false;
let reloaded = false;
let timer: ReturnType<typeof setTimeout> | null = null;
/** 지금 이 문서를 제어하는 워커의 빌드 — 새로고침 뒤 「정말 바뀌었나」 확인에 쓴다 */
let controllerBuild: string | null = null;

/** 워커에 버전을 묻는다 — 옛 워커(v0.45.0 이전 템플릿)는 답하지 않으므로 짧게 기다리고 null. */
export function askWorkerVersion(
  sw: ServiceWorker | null | undefined,
  ms = 1_000,
): Promise<{ version: string; build: string } | null> {
  if (!sw) return Promise.resolve(null);
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(null), ms);
    ch.port1.onmessage = (e) => {
      clearTimeout(t);
      const d = e.data as { version?: unknown; build?: unknown } | null;
      resolve(
        d && typeof d.version === "string" ? { version: d.version, build: String(d.build ?? "") } : null,
      );
    };
    try {
      sw.postMessage({ type: "version" }, [ch.port2]);
    } catch {
      clearTimeout(t);
      resolve(null);
    }
  });
}

/**
 * 셸이 등록을 **시작하기 전에** 부른다 — 처음 로드 때 옛 워커가 이 문서를 제어했는가.
 * 등록이 끝나기 전에 필수 업데이트가 시작돼도 controllerchange 판정이 첫 설치로 오인하지 않게(등록 완료를 기다리지 않는다).
 */
export function initUpdateTracking(controlled: boolean): void {
  hadController = controlled;
}

/** 셸이 등록을 마치면 부른다. */
export function attachRegistration(reg: ServiceWorkerRegistration, controlled: boolean): void {
  registration = reg;
  hadController = controlled;
  resolveRegReady(reg);
  void askWorkerVersion(navigator.serviceWorker.controller).then((v) => {
    controllerBuild = v?.build ?? null;
  });
}

export function getControllerBuild(): string | null {
  return controllerBuild;
}

/** 새 워커가 설치를 마치고 기다린다(controller 가 있을 때만 부른다). 죽으면(redundant) 비운다 — QA H-2. */
export function setWaiting(sw: ServiceWorker | null): void {
  if (state.waiting === sw) return;
  set({ waiting: sw, newVersion: sw ? state.newVersion : null });
  if (!sw) return;
  sw.addEventListener("statechange", () => {
    // 다른 탭·다른 클라이언트가 활성화시켰는데 이 문서에 controllerchange 가 안 온 경우의 대비(QA code M-1 재현 중 실측)
    if (sw.state === "activated" && state.waiting === sw && !applying) {
      set({ waiting: registration?.waiting ?? null, activatedElsewhere: true });
      return;
    }
    if (sw.state !== "redundant" || state.waiting !== sw) return;
    const next = registration?.waiting ?? null;
    set({ waiting: next && next !== sw ? next : null, newVersion: null });
    if (next && next !== sw) void askWorkerVersion(next).then((v) => v && set({ newVersion: v.version }));
  });
  void askWorkerVersion(sw).then((v) => {
    if (v && state.waiting === sw) set({ newVersion: v.version });
  });
}

/** 새 워커가 자리를 잡았다(controllerchange) — 누른 업데이트일 때만 새로고침, 그 밖은 표시만. */
export function onControllerChange(): void {
  const act = controllerChangeDecision({ hadController, applying });
  if (act === "ignore") return;
  if (act === "reload") {
    reloadOnce();
    return;
  }
  // 다른 탭이 적용했거나 브라우저가 활성화했다 — 이 문서는 옛 번들이다. 새로고침하지 않는다(확정 3).
  set({ waiting: registration?.waiting ?? null, activatedElsewhere: true });
  void askWorkerVersion(navigator.serviceWorker.controller).then((v) => v && set({ newVersion: v.version }));
}

function reloadOnce(): void {
  if (reloaded) return;
  reloaded = true;
  if (timer) clearTimeout(timer);
  timer = null;
  window.location.reload();
}

function writeMarker(): void {
  try {
    sessionStorage.setItem(
      BOOT_MARKER_KEY,
      JSON.stringify({ at: Date.now(), fromBuild: controllerBuild, fromVersion: APP_VERSION }),
    );
  } catch {
    // 표식이 없으면 새 문서의 첫 그림 전 덮개만 빠진다 — 업데이트는 그대로.
  }
}

function clearMarker(): void {
  try {
    sessionStorage.removeItem(BOOT_MARKER_KEY);
  } catch {
    // 무시
  }
}

function fail(reason: FailReason): void {
  if (state.phase !== "updating") return;
  if (timer) clearTimeout(timer);
  timer = null;
  applying = false; // QA M-2 — 실패 뒤 늦게 활성화돼도 사용 중 새로고침하지 않는다
  clearMarker();
  set({ phase: "failed", failReason: reason });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// [원본] 3초 대기(QA M-1 로 lib/swActivate.ts 의 load+여유·iframe 찌르기로 바뀜)
// /**
//  * 문서가 열린 뒤 이만큼 지나서야 skip-waiting 을 보낸다.
//  * 실측(2026-10-27 · 크롬 · 로컬 운영 빌드): 새로고침이 끝난 바로 그 순간 보내면 페이지 코드와 무관하게(테스트가 직접 보내도)
//  * 새 워커가 「installed」 에 멈춰 **영영 활성화되지 않는** 경우가 있다(직접 4번 중 1번 · 앱 경로 8번 중 최대 6번).
//  * 0.8초 뒤부터는 실패가 드물고 3초 뒤는 매번 정상이었다. 사람이 누르는 경우는 대개 이보다 늦고, 부팅 직후 시작하는
//  * 필수 업데이트를 위해 둔다(덮개는 그동안 이미 떠 있다 · 15초 상한 안).
//  */
// const BOOT_SETTLE_MS = 3_000;
/** await 사이에 타이머가 실패로 바꿨을 수 있다 — 매번 새로 읽는다. */
const stillUpdating = (): boolean => getAppUpdateState().phase === "updating";

/** 기다리는 워커를 찾는다 — 없으면 설치 중인 것이 끝나길, 그것도 없으면 서버에 새로 묻는다. */
async function findWaiting(): Promise<ServiceWorker | null> {
  // 셸의 등록이 끝나길 기다린다(위 regReady 주석) — 등록이 실패해 영영 안 오면 5초 뒤 지금 등록을 직접 읽는다
  const reg =
    (await Promise.race([regReady, sleep(5_000).then(() => null)])) ??
    (await navigator.serviceWorker?.getRegistration?.()) ??
    null;
  if (!reg) return null;
  if (reg.waiting) return reg.waiting;
  if (!reg.installing) {
    try {
      await reg.update();
    } catch {
      // 오프라인 등 — 아래에서 없음으로 끝난다
    }
  }
  if (reg.waiting) return reg.waiting;
  if (!reg.installing) return null;
  // 설치(정적 파일 미리 받기)가 끝나길 기다린다 — 15초 타이머가 상한이다
  while (stillUpdating()) {
    if (reg.waiting) return reg.waiting;
    if (!reg.installing && !reg.waiting) return null;
    await sleep(200);
  }
  return null;
}

/** 프로필 「업데이트」(또는 필수 업데이트)가 부른다. 덮개는 phase 를 보고 그려진다. */
export async function startUpdate(): Promise<void> {
  if (state.phase === "updating") return;
  set({ phase: "updating", failReason: null });
  applying = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => fail("timeout"), UPDATE_TIMEOUT_MS);

  // ① 진행 중 운동 — 기기 DB 로 다시 본다(확인 못 하면 하지 않는다 · QA L-5)
  try {
    const repo = await import("@app/core/data/workoutRepository");
    if (await repo.getActiveWorkout()) return fail("workout");
  } catch {
    return fail("db");
  }
  // ② 내려쓰기 — 실패면 한 번 더, 그래도 실패면 새로고침하지 않는다(마지막 세트 보호)
  try {
    const { flushLocalDbResult } = await import("@/lib/localDb");
    let r = await flushLocalDbResult();
    if (r === "failed") r = await flushLocalDbResult();
    if (r === "failed") return fail("flush");
    if (r === "unreachable") await sleep(600); // 자동 저장 주기(500ms)를 한 번 넘겨 기다린다
  } catch {
    return fail("flush");
  }
  if (!stillUpdating()) return;

  // ③ 새 문서에서도 덮개를 잇는 표식
  writeMarker();

  // ④ 이미 새 워커가 제어 중(다른 탭이 적용)이고 기다리는 것이 없으면 새로고침만
  //    보던 대기 워커가 이미 activated 가 됐으면(이벤트를 놓쳤어도) 같은 경우다
  if (state.waiting?.state === "activated" && !registration?.waiting) return reloadOnce();
  if (state.activatedElsewhere && !registration?.waiting) return reloadOnce();
  const w = await findWaiting();
  if (!stillUpdating()) return;
  if (!w) {
    if (state.activatedElsewhere) return reloadOnce();
    return fail("no-worker");
  }
  // [원본] 문서가 열린 지 3초(performance.now 기준) 뒤 보내기만 했다 — 느린 기기에선 여전히 load 직후일 수 있고, 멈추면 복구가 없었다
  // const settle = BOOT_SETTLE_MS - performance.now();
  // if (settle > 0) await sleep(settle);
  // if (!stillUpdating()) return;
  // w.addEventListener("statechange", () => { if (w.state === "activated" && applying) reloadOnce(); });
  // w.postMessage("skip-waiting");
  // [개선 QA code M-1] load+여유 뒤 보내고, 1.5초 안에 활성화가 안 되면 숨은 iframe 으로 찔러 푼다(「다시 시도」도 이 길)
  // controllerchange 가 오지 않는 경우(이 문서가 제어받지 않는 등)의 대비 — 활성화되면 새로고침
  w.addEventListener("statechange", () => {
    if (w.state === "activated" && applying) reloadOnce();
  });
  await activateWaiting(w, { stillWanted: stillUpdating, timeoutMs: UPDATE_TIMEOUT_MS });
  // 활성화되면 controllerchange(또는 위 activated 대비)가 새로고침한다. 못 하면 15초 타이머가 실패 화면으로 바꾼다(상한은 그 하나).
}

/** 화면이 다시 보이면 「닫음」을 푼다 — 필수 업데이트가 다음 보임에 다시 시작(스펙 §6 · QA code L-1). */
export function resetDismissedOnVisible(): void {
  if (state.dismissed && state.phase === "idle") set({ dismissed: false });
}

/** 실패 화면 「닫기」 — 덮개를 내리고 버튼 상태로 돌아간다. */
export function dismissUpdateFailure(): void {
  if (state.phase !== "failed") return;
  applying = false;
  set({ phase: "idle", failReason: null, dismissed: true });
}

// ── 새로고침 직후(부팅) ─────────────────────────────────────────────────────

/**
 * 새 문서가 하이드레이션을 마치면 부른다 — 표식을 지우고, 첫 칠하기 전부터 보이던 정적 덮개를 2프레임 뒤 내린다.
 * 같은 빌드로 돌아왔고 아직 기다리는 워커가 있으면(적용 실패) 실패 화면으로 잇는다.
 */
export function finishBootCover(): void {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(BOOT_MARKER_KEY);
    sessionStorage.removeItem(BOOT_MARKER_KEY);
  } catch {
    raw = null;
  }
  const marker = readBootMarker(raw, Date.now());
  const release = (): void => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.documentElement.removeAttribute("data-updating")),
    );
  };
  if (!marker) {
    release();
    return;
  }
  void (async () => {
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      const now = await askWorkerVersion(navigator.serviceWorker?.controller);
      if (marker.fromBuild && now?.build === marker.fromBuild && reg?.waiting) {
        set({ phase: "updating" });
        fail("timeout");
      }
    } catch {
      // 확인 못 해도 덮개는 내린다
    }
    release();
  })();
}

// ── 서버 버전(필수 업데이트) ───────────────────────────────────────────────

let lastServerCheck = 0;

/** /app-version 을 읽는다 — 60초에 한 번까지 · 오프라인·오류면 아무것도 바꾸지 않는다(필수 아님 유지). */
export async function checkServerVersion(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastServerCheck < 60_000) return;
  lastServerCheck = now;
  try {
    const r = await fetch("/app-version", { cache: "no-store" });
    if (!r.ok) return;
    const d = (await r.json()) as { version?: unknown; minClientVersion?: unknown };
    set({
      serverVersion: typeof d.version === "string" ? d.version : null,
      minVersion: typeof d.minClientVersion === "string" && d.minClientVersion ? d.minClientVersion : null,
    });
  } catch {
    // 오프라인 — 판정 생략
  }
}
