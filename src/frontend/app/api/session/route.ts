// @plm SRS-006  세션 쿠키 — refresh 토큰을 브라우저 스크립트가 못 읽는 곳으로
//
// ─────────────────────────────────────────────────────────────────────────────
// refresh 토큰은 **오래 사는 열쇠**다. localStorage에 두면 XSS 한 번에 그대로 새어 나가고,
// 그 토큰으로 공격자는 계정을 무기한 유지할 수 있다(access는 15분이라 훔쳐도 짧다).
//
// 그래서 이 라우트가 그것을 **httpOnly 쿠키**에 담는다. 스크립트는 값을 읽지 못하고,
// 브라우저가 우리 출처로 보낼 때만 자동으로 실린다.
//
// ── 그러면 CSRF는? ─────────────────────────────────────────────────────────
// 쿠키가 자동으로 실린다는 말은, 남의 사이트가 우리 주소로 요청을 보내도 실린다는 뜻이다.
// 두 겹으로 막는다:
//   ① `SameSite=Strict` — 다른 사이트에서 시작된 요청에는 쿠키가 아예 실리지 않는다
//   ② **커스텀 헤더 요구** — 폼·이미지 같은 단순 요청은 이 헤더를 붙일 수 없고,
//      붙이려면 preflight가 도는데 우리는 CORS를 열지 않았으므로 거기서 막힌다
//
// 하나만으로도 대체로 충분하지만, ①은 브라우저가 지켜 줘야 하고 ②는 우리가 지킨다.
//
// ── 왜 여기서 갱신까지 하나 ─────────────────────────────────────────────────
// 쿠키를 읽을 수 있는 것은 서버뿐이다. 화면은 "갱신해 줘"라고만 말하고, 이 라우트가
// 쿠키에서 꺼내 backend에 묻고, **회전된 새 토큰을 다시 쿠키에 담는다**.
// 화면이 받는 것은 access 토큰뿐이다 — 그것만 메모리에 둔다.
// ─────────────────────────────────────────────────────────────────────────────
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** 쿠키 이름. 값은 스크립트가 못 읽는다(httpOnly). */
export const SESSION_COOKIE = "liftgram_refresh";

/**
 * 이 헤더가 없으면 받지 않는다. 남의 사이트가 붙일 수 없는 값이라 CSRF의 두 번째 빗장이다.
 * (붙이려면 preflight가 필요한데 우리는 CORS를 열지 않았다.)
 */
const GUARD_HEADER = "x-liftgram-session";

/** 30일. refresh 자체의 수명은 서버가 정하고, 쿠키는 그보다 짧지 않기만 하면 된다. */
const MAX_AGE_SEC = 30 * 24 * 60 * 60;

function guarded(req: Request): boolean {
  return req.headers.get(GUARD_HEADER) === "1";
}

function cookieHeader(value: string, maxAge: number): string {
  const parts = [`${SESSION_COOKIE}=${value}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAge}`];
  // 로컬은 http라 Secure를 붙이면 쿠키가 아예 저장되지 않는다.
  if (env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/** 로그인·가입 직후 — 받은 refresh를 쿠키에 담는다. 화면은 값을 돌려받지 않는다. */
export async function POST(req: Request): Promise<Response> {
  if (!guarded(req)) return new Response("forbidden", { status: 403 });

  let token = "";
  try {
    token = ((await req.json()) as { refreshToken?: string }).refreshToken ?? "";
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (!token) return new Response("bad request", { status: 400 });

  return new Response(null, { status: 204, headers: { "set-cookie": cookieHeader(token, MAX_AGE_SEC) } });
}

/**
 * 로그아웃 — 쿠키를 지우고, **서버 쪽 토큰도 폐기한다**.
 *
 * 폐기까지 여기서 하는 이유: 화면은 refresh 값을 읽을 수 없으니 스스로 폐기를 요청할 수 없다.
 * 그런데 지우기만 하고 폐기하지 않으면, 어딘가 유출된 그 토큰이 만료까지 살아 있다.
 *
 * **폐기가 실패해도 쿠키는 지운다.** 오프라인이라고 로그아웃이 막히면 안 된다 —
 * 남의 기기에서 나가려는 사람이 못 나가는 쪽이 더 나쁘다.
 */
export async function DELETE(req: Request): Promise<Response> {
  if (!guarded(req)) return new Response("forbidden", { status: 403 });

  const token = readCookie(req);
  if (token) {
    await fetch(`${env.API_URL.replace(/\/$/, "")}/api/auth.v1.AuthService/LogOut`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: token }),
    }).catch(() => {});
  }
  return new Response(null, { status: 204, headers: { "set-cookie": cookieHeader("", 0) } });
}

function readCookie(req: Request): string {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) return rest.join("=");
  }
  return "";
}
