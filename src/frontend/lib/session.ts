// @plm SRS-006  브라우저 쪽 세션 — 토큰을 어디에 두고 언제 갱신하는가
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 앱은 **로그인 없이도 완전히 돈다**(ADR-002). 계정은 여러 기기에서 이어 쓰기와
// 다른 사람이 있는 기능에만 필요하다 — 그래서 세션은 "있으면 쓰고 없으면 만다".
//
// ── 토큰을 어디에 두나 ──────────────────────────────────────────────────────
//   access   **메모리에만.** 15분이면 죽으므로 새로고침 때 다시 받으면 된다.
//            localStorage에 두면 XSS 한 번에 그대로 새어 나간다.
//   refresh  **httpOnly 쿠키.** 스크립트가 값을 읽지 못한다 — 이 파일도 못 읽는다.
//            담고 꺼내는 일은 `/api/session`(같은 출처의 라우트 핸들러)이 한다.
//
// refresh는 오래 사는 열쇠라 훔쳐 가면 계정을 무기한 유지할 수 있다. 그래서 access와
// **다른 곳**에 둔다: XSS가 나도 가져갈 수 있는 것은 15분짜리 access뿐이다.
// CSRF는 쿠키의 `SameSite=Strict`와 커스텀 헤더 요구로 막는다(라우트 주석 참고).
//
// 화면은 "로그인돼 있나?"를 알아야 하는데 쿠키를 못 읽는다. 그래서 **표시만** 하나
// localStorage에 남긴다(`liftgram.session`). 값이 아니라 있고 없음만 있는 깃발이라
// 새어 나가도 잃을 것이 없다.
//
// ── 갱신 ────────────────────────────────────────────────────────────────────
// access가 죽으면 서버가 401(unauthenticated)을 준다. 그때 **한 번만** 갱신하고 재시도한다.
// 동시에 여러 요청이 401을 받아도 갱신은 한 번만 돈다(같은 약속을 나눠 쓴다) —
// 아니면 refresh 회전이 서로를 무효로 만들어 로그아웃돼 버린다.
// ─────────────────────────────────────────────────────────────────────────────
import { AuthService, routes } from "@app/contracts";
import { Code, ConnectError, createClient, type Client, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

/** 세션이 있을 법하다는 **깃발**(값이 아니다). 쿠키를 읽을 수 없으니 화면은 이걸 본다. */
const SESSION_FLAG = "liftgram.session";
/** 옛 저장 자리. 한 번만 쿠키로 옮기고 지운다 — 없으면 기존 사용자가 전부 로그아웃된다. */
const LEGACY_REFRESH_KEY = "liftgram.refreshToken";
/** 남의 사이트가 붙일 수 없는 헤더 — 세션 라우트가 이걸 요구한다(CSRF 빗장). */
const GUARD = { "x-liftgram-session": "1" } as const;

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

/** 로그인 상태가 바뀌면 화면이 따라오도록 알린다. */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onSessionChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of listeners) fn();
}

function setFlag(on: boolean): void {
  if (typeof localStorage === "undefined") return;
  if (on) localStorage.setItem(SESSION_FLAG, "1");
  else localStorage.removeItem(SESSION_FLAG);
}

/**
 * 로그인·가입이 성공했을 때. access는 메모리에, refresh는 **서버가 쿠키에** 담는다.
 *
 * 쿠키를 담는 요청이 실패해도 그 자리에서는 로그인된 채로 둔다(access가 있다) —
 * 다만 새로고침하면 풀린다. 로그인 자체를 실패로 되돌리는 것보다 낫다.
 */
export function setTokens(t: { accessToken: string; refreshToken: string }): void {
  accessToken = t.accessToken;
  setFlag(true);
  void fetch("/api/session", {
    method: "POST",
    headers: { ...GUARD, "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: t.refreshToken }),
  }).catch(() => {});
  notify();
}

export function clearTokens(): void {
  accessToken = null;
  setFlag(false);
  void fetch("/api/session", { method: "DELETE", headers: GUARD }).catch(() => {});
  notify();
}

/**
 * 지금 로그인돼 있는가 — **깃발**로 본다(쿠키는 못 읽는다).
 *
 * access는 새로고침하면 사라지지만 그건 "로그아웃"이 아니다. 첫 요청에서 갱신하면 된다.
 * 깃발이 남았는데 쿠키가 죽었다면 갱신이 401을 주고, 그때 깃발도 내려간다.
 */
export function hasSession(): boolean {
  return typeof localStorage !== "undefined" && localStorage.getItem(SESSION_FLAG) === "1";
}

/**
 * 옛 저장 자리(localStorage)에 남은 refresh를 **한 번만** 쿠키로 옮긴다.
 *
 * 이 이행이 없으면 이미 로그인해 둔 사람이 전부 로그아웃된다 — 새 코드가 옛 자리를
 * 더는 보지 않기 때문이다. 옮긴 뒤에는 그 값을 지운다(두 곳에 남겨 둘 이유가 없다).
 */
async function migrateLegacyToken(): Promise<boolean> {
  if (typeof localStorage === "undefined") return false;
  const legacy = localStorage.getItem(LEGACY_REFRESH_KEY);
  if (!legacy) return false;
  localStorage.removeItem(LEGACY_REFRESH_KEY);
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { ...GUARD, "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: legacy }),
  }).catch(() => null);
  if (!res?.ok) return false;
  setFlag(true);
  return true;
}

/** 인증이 붙은 클라이언트. 401이면 한 번 갱신하고 다시 보낸다. */
export function authClient(): Client<typeof AuthService> {
  return createClient(AuthService, transport());
}

/**
 * 다른 도메인의 클라이언트도 같은 인증을 쓰도록 전송 계층을 나눠 준다.
 * (피드가 이 transport를 쓴다.)
 */
export function authedTransport() {
  return transport();
}

/**
 * 인증만 떼어 내보낸다 — 전송 형식이 다른 클라이언트도 **같은 갱신 규칙**을 쓰게.
 *
 * 사진 업로드는 binary 전송이라 자기 transport를 만들어야 하는데, 거기서 인증을 다시 짜면
 * 갱신이 두 곳에서 돌아 refresh 회전이 서로를 무효로 만든다(그 사고를 막으려고 나눠 둔다).
 */
export function authInterceptor(): Interceptor {
  return (next) => async (req) => {
    // 토큰이 아직 없는데 되살릴 수 있으면 **보내기 전에** 되살린다.
    //
    // 새로고침 직후에는 access가 메모리에 없다(refresh만 저장소에 있다). 그대로 쏘면 401을 맞고
    // 갱신→재시도로 돌아오는데, 화면 여럿이 동시에 뜨는 순간(목록·동기·프로필)에는 그 401이
    // 한꺼번에 몰린다. refresh는 쓰는 순간 회전하므로 그중 하나만 살아남고 나머지는
    // **죽은 토큰으로 재시도**해 "불러오지 못했어요"로 끝난다(실측으로 잡았다).
    //
    // `refreshOnce`가 단일 비행이라, 여기서 먼저 기다리면 그 경쟁 자체가 사라진다.
    if (!accessToken && hasSession()) await refreshOnce();
    if (accessToken) req.header.set("Authorization", `Bearer ${accessToken}`);
    try {
      return await next(req);
    } catch (e) {
      // 갱신할 것이 없거나 401이 아니면 그대로 올린다.
      if (!(e instanceof ConnectError) || e.code !== Code.Unauthenticated || !hasSession()) throw e;
      if (!(await refreshOnce())) throw e;
      if (accessToken) req.header.set("Authorization", `Bearer ${accessToken}`);
      return await next(req);
    }
  };
}

function transport() {
  return createConnectTransport({
    baseUrl: routes.apiPrefix,
    interceptors: [authInterceptor()],
  });
}

/**
 * 갱신은 한 번만 돈다.
 *
 * 동시에 세 요청이 401을 받아도 세 번 갱신하면 안 된다 — refresh는 쓰는 순간 회전하므로
 * 두 번째·세 번째가 이미 죽은 토큰을 들고 가서 **로그아웃돼 버린다.**
 */
async function refreshOnce(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      // 옛 자리에 토큰이 남아 있으면 먼저 쿠키로 옮긴다(기존 사용자 이행).
      await migrateLegacyToken();

      // 갱신은 **우리 서버에** 부탁한다 — refresh 값은 쿠키에 있고 여기서는 읽을 수 없다.
      const res = await fetch("/api/session/refresh", { method: "POST", headers: GUARD });
      if (res.status === 401) {
        // 토큰이 죽었다 — 진짜 로그아웃이다(쿠키는 서버가 이미 지웠다).
        accessToken = null;
        setFlag(false);
        notify();
        return false;
      }
      if (!res.ok) return false; // 서버에 못 닿았다 — 로그아웃시키지 않는다(다음에 다시 시도)

      const body = (await res.json()) as { accessToken?: string };
      if (!body.accessToken) return false;
      accessToken = body.accessToken;
      setFlag(true);
      notify();
      return true;
    } catch {
      // 네트워크가 끊겼다. 이건 로그아웃이 아니다.
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** 새로고침 직후처럼 access가 없을 때, 조용히 한 번 채워 둔다. */
export async function restoreSession(): Promise<boolean> {
  if (accessToken) return true;
  // 깃발이 없어도 옛 자리에 토큰이 남아 있을 수 있다 — 그 사람도 이어서 로그인 상태여야 한다.
  if (!hasSession() && typeof localStorage !== "undefined" && !localStorage.getItem(LEGACY_REFRESH_KEY)) {
    return false;
  }
  return refreshOnce();
}
