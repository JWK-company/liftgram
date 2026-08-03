// @plm SRS-006  브라우저 쪽 세션 — 토큰을 어디에 두고 언제 갱신하는가
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 앱은 **로그인 없이도 완전히 돈다**(ADR-002). 계정은 여러 기기에서 이어 쓰기와
// 다른 사람이 있는 기능에만 필요하다 — 그래서 세션은 "있으면 쓰고 없으면 만다".
//
// ── 토큰을 어디에 두나 ──────────────────────────────────────────────────────
//   access   **메모리에만.** 15분이면 죽으므로 새로고침 때 다시 받으면 된다.
//            localStorage에 두면 XSS 한 번에 그대로 새어 나간다.
//   refresh  localStorage. 새로고침·탭 종료를 넘겨 살아야 로그인 상태가 유지된다.
//
// refresh를 localStorage에 두는 것은 완전한 안전이 아니다 — 이상적으로는 httpOnly 쿠키다.
// 다만 그러려면 프록시가 쿠키를 붙이고 CSRF를 막아야 해서, 계정 기능이 실제로 쓰이는
// 시점(피드·DM)에 함께 옮기는 것이 맞다. 지금은 그 사실을 적어 두고 간다.
//
// ── 갱신 ────────────────────────────────────────────────────────────────────
// access가 죽으면 서버가 401(unauthenticated)을 준다. 그때 **한 번만** 갱신하고 재시도한다.
// 동시에 여러 요청이 401을 받아도 갱신은 한 번만 돈다(같은 약속을 나눠 쓴다) —
// 아니면 refresh 회전이 서로를 무효로 만들어 로그아웃돼 버린다.
// ─────────────────────────────────────────────────────────────────────────────
import { AuthService, routes } from "@app/contracts";
import { Code, ConnectError, createClient, type Client, type Interceptor } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

const REFRESH_KEY = "liftgram.refreshToken";

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

export function getRefreshToken(): string | null {
  return typeof localStorage === "undefined" ? null : localStorage.getItem(REFRESH_KEY);
}

/** 로그인·갱신이 성공했을 때. access는 메모리, refresh만 남긴다. */
export function setTokens(t: { accessToken: string; refreshToken: string }): void {
  accessToken = t.accessToken;
  if (typeof localStorage !== "undefined") localStorage.setItem(REFRESH_KEY, t.refreshToken);
  notify();
}

export function clearTokens(): void {
  accessToken = null;
  if (typeof localStorage !== "undefined") localStorage.removeItem(REFRESH_KEY);
  notify();
}

/**
 * 지금 로그인돼 있는가 — **refresh가 있는지**로 본다.
 *
 * access는 새로고침하면 사라지지만 그건 "로그아웃"이 아니다. 첫 요청에서 갱신하면 된다.
 */
export function hasSession(): boolean {
  return !!getRefreshToken();
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
    if (!accessToken && getRefreshToken()) await refreshOnce();
    if (accessToken) req.header.set("Authorization", `Bearer ${accessToken}`);
    try {
      return await next(req);
    } catch (e) {
      // 갱신할 것이 없거나 401이 아니면 그대로 올린다.
      if (!(e instanceof ConnectError) || e.code !== Code.Unauthenticated || !getRefreshToken()) throw e;
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
    const token = getRefreshToken();
    if (!token) return false;
    try {
      // 갱신 요청 자체는 인터셉터 없는 맨 전송으로 보낸다(다시 401 → 갱신 고리에 빠지지 않게).
      const bare = createClient(AuthService, createConnectTransport({ baseUrl: routes.apiPrefix }));
      const res = await bare.refresh({ refreshToken: token });
      if (!res.tokens) return false;
      setTokens(res.tokens);
      return true;
    } catch {
      // refresh까지 죽었다 — 진짜 로그아웃이다.
      clearTokens();
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
  if (!getRefreshToken()) return false;
  return refreshOnce();
}
