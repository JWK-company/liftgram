// 브라우저 쪽 운영 세션(SPEC-033). access 는 메모리에만, refresh 는 스크립트가 못 읽는 쿠키에 있다.
//
// 넓은 표를 여러 탭으로 보는 도구라 탭 경합 규칙이 필수다. 앱의 세션(SRS-083)과 같은 규칙이다:
//   · 탭 사이 Web Locks 로 갱신을 줄 세운다(없으면 저장소 대체 잠금).
//   · 401 은 한 번 600ms 뒤 다시 시도한다. 그사이 다른 탭이 새 쿠키를 구웠을 수 있다.
//   · 401 은 로그아웃이지만 503 은 아니다. 백엔드 장애가 로그아웃이 되면 안 된다.
import { routes, type User, UserSchema } from "@app/contracts";
import { fromJson, type JsonValue } from "@bufbuild/protobuf";
import { Code, ConnectError, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

const GUARD = { "x-liftgram-admin-session": "1" } as const;
const FLAG = "liftgram.admin.session";
const OK_AT = "liftgram.admin.session.okAt";
const REFRESHING = "liftgram.admin.session.refreshing";
const USER = "liftgram.admin.session.user";
const PROBE = "liftgram.admin.session.probe";

const RETRY_AFTER_401_MS = 600;
const REFRESH_TIMEOUT_MS = 10_000;
const LOGIN_TIMEOUT_MS = 20_000;
const LOCK_WAIT_MS = 15_000;
const RECENT_OK_MS = 10_000;
const STALE_LOCK_MS = REFRESH_TIMEOUT_MS + 2_000;

export type RefreshResult = "ok" | "out" | "denied" | "unavailable";

let accessToken: string | null = null;
let refreshing: Promise<RefreshResult> | null = null;
/** 이 탭이 그리고 있는 계정. 다른 탭에서 다른 계정으로 로그인하면 쿠키는 그 계정 것이 된다. */
let tabUser: string | null = null;
/** 방금 갱신 응답에 함께 온 내 정보. 첫 화면이 Me 왕복 없이 쓴다(SPEC-035). */
let refreshedUser: User | null = null;
let refreshedAt = 0;

/** 방금 받은 갱신 응답의 내 정보를 한 번만 꺼낸다. 없거나 오래됐으면 부르는 쪽이 Me 로 묻는다. */
export function takeRefreshedUser(): User | null {
  const user = Date.now() - refreshedAt < RECENT_OK_MS ? refreshedUser : null;
  refreshedUser = null;
  return user;
}

/** 형식이 어긋나도 세션을 끊지 않는다. 내 정보만 Me 로 다시 묻게 된다. */
function parseUser(raw: unknown): User | null {
  if (!raw) return null;
  try {
    return fromJson(UserSchema, raw as JsonValue, { ignoreUnknownFields: true });
  } catch {
    return null;
  }
}

const listeners = new Set<(r: RefreshResult) => void>();
/** 세션이 끝났거나 권한이 회수됐을 때 화면이 따라오게 한다. */
export function onSessionEnd(fn: (r: RefreshResult) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const changeListeners = new Set<(user: User | null) => void>();
/** 토큰을 갱신했거나 서버가 권한을 거절했다. 갱신 응답에 내 정보가 있으면 함께 주고, 없으면 화면이 다시 읽는다. */
export function onSessionChange(fn: (user: User | null) => void): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

function store(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function setFlag(on: boolean): void {
  try {
    if (on) store()?.setItem(FLAG, "1");
    else store()?.removeItem(FLAG);
  } catch {}
}

function storageWritable(): boolean {
  try {
    const s = store();
    if (!s) return false;
    s.setItem(PROBE, "1");
    s.removeItem(PROBE);
    return true;
  } catch {
    return false;
  }
}

/** 저장소에 쓸 수 없으면 깃발로 판단할 수 없다. 있다고 보고 갱신에 맡긴다(쿠키가 없으면 401 로 끝난다). */
export function hasSession(): boolean {
  if (!storageWritable()) return true;
  return store()?.getItem(FLAG) === "1";
}

/** 이 탭의 계정을 적는다. 값이 바뀌면 다른 탭이 storage 이벤트로 알아챈다. */
export function rememberUser(id: string): void {
  tabUser = id;
  try {
    store()?.setItem(USER, id);
  } catch {}
}

// 다른 탭의 로그아웃·세션 종료·계정 교체를 따라간다. 이 이벤트는 값을 바꾼 탭 말고 다른 탭에만 온다.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    const flagGone = (e.key === FLAG && e.newValue === null) || e.key === null;
    if (flagGone) {
      endSession("out");
      return;
    }
    if (e.key === USER && e.newValue && tabUser && e.newValue !== tabUser) location.reload();
  });
}

function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withStorageLock<T>(fn: () => Promise<T>): Promise<T> {
  const s = store();
  if (!s) return fn();
  const me = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  let owned = false;
  await sleep(Math.floor(Math.random() * 150));
  while (Date.now() < deadline) {
    const raw = s.getItem(REFRESHING);
    const at = raw ? Number(raw.split(":")[0]) : 0;
    if (!raw || Date.now() - at > STALE_LOCK_MS) {
      try {
        s.setItem(REFRESHING, `${Date.now()}:${me}`);
      } catch {
        return fn();
      }
      await sleep(40);
      if (s.getItem(REFRESHING)?.endsWith(`:${me}`)) {
        owned = true;
        break;
      }
    }
    await sleep(120 + Math.floor(Math.random() * 80));
  }
  try {
    return await fn();
  } finally {
    if (owned && s.getItem(REFRESHING)?.endsWith(`:${me}`)) s.removeItem(REFRESHING);
  }
}

async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  const signal = timeoutSignal(LOCK_WAIT_MS);
  if (!locks?.request || !signal) return withStorageLock(fn);
  try {
    return (await locks.request("liftgram-admin-refresh", { signal }, fn)) as T;
  } catch (e) {
    if (e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError")) {
      return withStorageLock(fn);
    }
    throw e;
  }
}

function refreshRequest(): Promise<Response | null> {
  return fetch("/api/session/refresh", {
    method: "POST",
    headers: GUARD,
    signal: timeoutSignal(REFRESH_TIMEOUT_MS),
  }).catch(() => null);
}

function endSession(result: RefreshResult): RefreshResult {
  accessToken = null;
  setFlag(false);
  for (const fn of listeners) fn(result);
  return result;
}

function refreshOnce(): Promise<RefreshResult> {
  if (refreshing) return refreshing;
  refreshing = (async (): Promise<RefreshResult> => {
    try {
      let res = await withRefreshLock(refreshRequest);
      // 12시간 상한이 끝났다는 서버의 확답. 탭 경합이 아니므로 다시 시도하지 않는다.
      if (res?.headers.get("x-admin-session-ended")) return endSession("out");
      if (res?.status === 401) {
        await sleep(RETRY_AFTER_401_MS);
        res = await withRefreshLock(refreshRequest);
      }
      // 역할 거절만 권한 회수다. 입구(Access)나 CSRF 빗장의 403 으로 세션을 버리지 않는다.
      if (res?.status === 403) {
        return res.headers.get("x-admin-denied") ? endSession("denied") : "unavailable";
      }
      if (res?.status === 401) {
        // 다른 탭이 방금 성공했다면 이 401 은 낡은 쿠키 탓이다. 공유 깃발을 내리지 않는다.
        const at = Number(store()?.getItem(OK_AT) ?? 0);
        if (Date.now() - at < RECENT_OK_MS) {
          accessToken = null;
          return "unavailable";
        }
        return endSession("out");
      }
      if (!res?.ok) return "unavailable";
      const body = (await res.json()) as { accessToken?: string; userId?: string; user?: unknown };
      if (!body.accessToken) return "unavailable";
      // 다른 탭이 다른 계정으로 로그인했다. 이 탭의 화면으로 그 계정의 요청을 보내지 않는다.
      if (tabUser && body.userId && body.userId !== tabUser) {
        location.reload();
        return "unavailable";
      }
      accessToken = body.accessToken;
      setFlag(true);
      try {
        store()?.setItem(OK_AT, String(Date.now()));
      } catch {}
      refreshedUser = parseUser(body.user);
      refreshedAt = Date.now();
      for (const fn of changeListeners) fn(refreshedUser);
      return "ok";
    } catch {
      return "unavailable";
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function restoreSession(): Promise<RefreshResult> {
  if (accessToken) return "ok";
  if (!hasSession()) return "out";
  return refreshOnce();
}

export type LoginResult = "ok" | "credentials" | "role" | "limited" | "unavailable";

export async function logIn(email: string, password: string): Promise<LoginResult> {
  const res = await fetch("/api/session/login", {
    method: "POST",
    headers: { ...GUARD, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: timeoutSignal(LOGIN_TIMEOUT_MS),
  }).catch(() => null);
  if (!res) return "unavailable";
  if (res.ok) {
    // 입구 앞단의 HTML 응답(챌린지 페이지 등)은 JSON 이 아니다.
    const body = (await res.json().catch(() => null)) as { accessToken?: string; userId?: string } | null;
    if (!body?.accessToken) return "unavailable";
    accessToken = body.accessToken;
    setFlag(true);
    if (body.userId) rememberUser(body.userId);
    return "ok";
  }
  if (res.status === 403) return res.headers.get("x-admin-denied") ? "role" : "unavailable";
  if (res.status === 429) return "limited";
  if (res.status === 401 || res.status === 400) return "credentials";
  return "unavailable";
}

export async function logOut(): Promise<void> {
  accessToken = null;
  setFlag(false);
  await fetch("/api/session", { method: "DELETE", headers: GUARD }).catch(() => {});
}

export function authInterceptor(): Interceptor {
  return (next) => async (req) => {
    if (!accessToken && hasSession()) await refreshOnce();
    if (accessToken) req.header.set("Authorization", `Bearer ${accessToken}`);
    try {
      return await next(req);
    } catch (e) {
      if (!(e instanceof ConnectError)) throw e;
      if (e.code === Code.PermissionDenied) for (const fn of changeListeners) fn(null);
      if (e.code !== Code.Unauthenticated) throw e;
      // 깃발이 내려간 뒤의 401: 다른 탭이 세션을 끝냈다. 화면도 끝낸다.
      if (!hasSession()) {
        endSession("out");
        throw e;
      }
      if ((await refreshOnce()) !== "ok") throw e;
      req.header.set("Authorization", `Bearer ${accessToken}`);
      return await next(req);
    }
  };
}

let probingEntrance = false;

/**
 * 요청이 응답 없이 실패하면 입구(Access) 세션이 끝난 것인지 확인한다.
 * 메뉴 화면을 미리 받아 두므로 메뉴를 눌러도 문서 이동이 일어나지 않아 저절로 다시 인증되지 않는다(SPEC-035).
 * 끝났으면 「서버에 연결할 수 없습니다」 화면으로 옮긴다. 그 화면의 다시 시도가 전체 이동이라 다시 인증한다.
 */
async function probeEntrance(): Promise<void> {
  if (probingEntrance) return;
  probingEntrance = true;
  try {
    const res = await fetch("/login", { method: "HEAD", redirect: "manual", cache: "no-store" });
    if (res.type === "opaqueredirect") for (const fn of listeners) fn("unavailable");
  } catch {
    // 망이 끊긴 것이다. 입구와 상관없으므로 화면을 그대로 둔다.
  } finally {
    probingEntrance = false;
  }
}

const watchedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    return await fetch(input, init);
  } catch (e) {
    if (!init?.signal?.aborted) void probeEntrance();
    throw e;
  }
}) as typeof fetch;

export const transport = createConnectTransport({
  baseUrl: routes.apiPrefix,
  fetch: watchedFetch,
  interceptors: [authInterceptor()],
});

/** 사진 바이트용. JSON 이면 base64 로 3분의 1이 커진다. */
export const binaryTransport = createConnectTransport({
  baseUrl: routes.apiPrefix,
  useBinaryFormat: true,
  fetch: watchedFetch,
  interceptors: [authInterceptor()],
});
