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
// 갱신 401에서도 쿠키를 지우지 않는다(SRS-083) — 탭 경합에서 이긴 쪽의 새 쿠키를 지우지 않으려고.
// ─────────────────────────────────────────────────────────────────────────────
import { env } from "@/lib/env";
import { SESSION_COOKIE } from "../route";

export const dynamic = "force-dynamic";

const GUARD_HEADER = "x-liftgram-session";
const MAX_AGE_SEC = 30 * 24 * 60 * 60;
const UPSTREAM_TIMEOUT_MS = 8_000;

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

const IP_HEADERS = ["x-forwarded-for", "x-real-ip", "cf-connecting-ip"];

function clientIpHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of IP_HEADERS) {
    const v = req.headers.get(k);
    if (v) out[k] = v;
  }
  return out;
}

export async function POST(req: Request): Promise<Response> {
  if (req.headers.get(GUARD_HEADER) !== "1") return new Response("forbidden", { status: 403 });

  const token = readCookie(req);
  if (!token) return new Response("no session", { status: 401 });

  const res = await fetch(`${env.API_URL.replace(/\/$/, "")}/api/auth.v1.AuthService/Refresh`, {
    method: "POST",
    // 재검토 N-6 — 범용 프록시(`[...path]`)처럼 클라이언트 IP 헤더를 넘긴다. 빼면 백엔드 요청 제한이 모든 사용자의
    // 갱신을 한 버킷(`unknown`)으로 세어, 사용자가 늘면 갱신이 429(→503)를 받는다.
    headers: { "content-type": "application/json", ...clientIpHeaders(req) },
    body: JSON.stringify({ refreshToken: token }),
    // 백엔드가 매달리면 화면의 잠금도 매달린다 — 한도를 둔다(QA M-2).
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  }).catch(() => null);

  // backend에 닿지 못한 것과 토큰이 죽은 것은 다르다 — 전자는 재시도할 값어치가 있고,
  // 후자는 쿠키를 지워야 한다(남겨 두면 매 요청이 같은 실패를 반복한다).
  if (!res) return new Response("upstream unreachable", { status: 503 });
  // [원본] 401이면 쿠키를 지웠다 — 다른 탭이 막 구운 새 쿠키까지 지워 모든 탭이 로그아웃됐다(SRS-083 H-1).
  // if (!res.ok) {
  //   return new Response("refresh failed", { status: 401, headers: { "set-cookie": cookieHeader("", 0) } });
  // }
  // [개선] @plm SRS-083 쿠키는 건드리지 않고 401만 알린다. 화면이 한 번 더 시도하고(그사이 다른 탭이 새 쿠키를
  // 구웠을 수 있다), 그래도 401이면 깃발만 내린다. 죽은 쿠키는 다음 로그인이 덮어쓴다.
  // [원본] 백엔드 응답이 ok 가 아니면 모두 401 — DB 순간 장애(5xx)가 로그아웃이 됐다(QA M-1).
  // if (!res.ok) return new Response("refresh failed", { status: 401 });
  // [개선] 토큰이 죽은 것(401 = Connect unauthenticated)만 401. 그 밖은 503 — 화면이 「다음에 다시」로 간다.
  if (res.status === 401) return new Response("refresh failed", { status: 401 });
  if (!res.ok) return new Response("upstream error", { status: 503 });

  // 재검토 N-2·N-4 — 갱신 응답에 이미 내 정보(user)가 실려 온다. 예전에는 Me 를 한 번 더 불러(최대 8초) 회전과 응답
  // 사이 간격이 벌어졌고, 그 편차가 탭 경합에서 응답 순서를 뒤집어 진 쪽 쿠키를 남겼다. 이제 회전 응답을 곧바로 돌려준다.
  const body = (await res.json()) as {
    tokens?: { accessToken?: string; refreshToken?: string };
    user?: unknown;
  };
  const access = body.tokens?.accessToken ?? "";
  const rotated = body.tokens?.refreshToken ?? "";
  if (!access || !rotated) return new Response("unexpected response", { status: 502 });

  // [원본] 내 정보는 Me 를 따로 불러 실었다(SRS-054) — 재검토 N-2·N-4 로 대체(원복 시 아래 주석 해제·user 를 me?.user 로).
  // const me = await fetch(`${env.API_URL.replace(/\/$/, "")}/api/auth.v1.AuthService/Me`, {
  //   method: "POST",
  //   headers: { "content-type": "application/json", authorization: `Bearer ${access}` },
  //   body: "{}",
  //   signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  // })
  //   .then((r) => (r.ok ? (r.json() as Promise<{ user?: unknown }>) : null))
  //   .catch(() => null);

  return new Response(JSON.stringify({ accessToken: access, user: body.user ?? null }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": cookieHeader(rotated, MAX_AGE_SEC) },
  });
}
