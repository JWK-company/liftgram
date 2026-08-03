// @plm SRS-006  세션 갱신 — 쿠키를 읽을 수 있는 것은 서버뿐이다
//
// ─────────────────────────────────────────────────────────────────────────────
// 화면은 "갱신해 줘"라고만 말한다. 이 라우트가 쿠키에서 refresh를 꺼내 backend에 묻고,
// **회전된 새 refresh를 다시 쿠키에 담고**, 화면에는 access만 돌려준다.
//
// 그래서 refresh 값은 브라우저의 자바스크립트에 한 번도 나타나지 않는다 —
// XSS가 나도 훔쳐 갈 것이 15분짜리 access뿐이다.
//
// 쿠키가 없으면 401이다. 로그인한 적이 없거나 만료됐다는 뜻이고, 화면은 그때 로그아웃 상태가 된다.
// ─────────────────────────────────────────────────────────────────────────────
import { env } from "@/lib/env";
import { SESSION_COOKIE } from "../route";

export const dynamic = "force-dynamic";

const GUARD_HEADER = "x-liftgram-session";
const MAX_AGE_SEC = 30 * 24 * 60 * 60;

function cookieHeader(value: string, maxAge: number): string {
  const parts = [`${SESSION_COOKIE}=${value}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${maxAge}`];
  if (env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

function readCookie(req: Request): string {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) return rest.join("=");
  }
  return "";
}

export async function POST(req: Request): Promise<Response> {
  if (req.headers.get(GUARD_HEADER) !== "1") return new Response("forbidden", { status: 403 });

  const token = readCookie(req);
  if (!token) return new Response("no session", { status: 401 });

  const res = await fetch(`${env.API_URL.replace(/\/$/, "")}/api/auth.v1.AuthService/Refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: token }),
  }).catch(() => null);

  // backend에 닿지 못한 것과 토큰이 죽은 것은 다르다 — 전자는 재시도할 값어치가 있고,
  // 후자는 쿠키를 지워야 한다(남겨 두면 매 요청이 같은 실패를 반복한다).
  if (!res) return new Response("upstream unreachable", { status: 503 });
  if (!res.ok) {
    return new Response("refresh failed", { status: 401, headers: { "set-cookie": cookieHeader("", 0) } });
  }

  const body = (await res.json()) as { tokens?: { accessToken?: string; refreshToken?: string } };
  const access = body.tokens?.accessToken ?? "";
  const rotated = body.tokens?.refreshToken ?? "";
  if (!access || !rotated) return new Response("unexpected response", { status: 502 });

  return new Response(JSON.stringify({ accessToken: access }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": cookieHeader(rotated, MAX_AGE_SEC) },
  });
}
