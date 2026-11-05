// 운영 세션 갱신(SPEC-033). 회전한 새 refresh 는 쿠키로만 돌려주고, 역할을 매번 다시 본다.
// 절대 수명은 늘리지 않는다. 401 에서 쿠키를 지우지 않는 까닭은 앱과 같다(SRS-083): 다른 탭이 막 구운 새 쿠키를 지우면 안 된다.
import { audit, authRpc } from "@/lib/backend";
import {
  clearedCookies,
  isStaffRole,
  REFRESH_COOKIE,
  readCookie,
  remainingSec,
  STARTED_COOKIE,
  sameOriginRequest,
  sessionCookies,
  withCookies,
} from "@/lib/sessionCookie";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  if (!sameOriginRequest(req)) return new Response("forbidden", { status: 403 });

  const token = readCookie(req, REFRESH_COOKIE);
  if (!token) return new Response("no session", { status: 401 });

  const remaining = remainingSec(req);
  if (remaining <= 0) {
    // 12시간이 지났다. 쿠키만 지우면 백엔드 토큰이 30일까지 살아 있으므로 폐기한다.
    await authRpc(req, "LogOut", { refreshToken: token });
    audit(req, "admin_session_expired");
    const ended = withCookies(null, 401, clearedCookies());
    ended.headers.set("x-admin-session-ended", "1");
    return ended;
  }

  const res = await authRpc(req, "Refresh", { refreshToken: token });
  if (!res) return new Response("upstream unreachable", { status: 503 });
  if (res.status === 401) return new Response("refresh failed", { status: 401 });
  if (!res.ok) return new Response("upstream error", { status: 503 });

  const body = (await res.json()) as {
    tokens?: { accessToken?: string; refreshToken?: string };
    user?: { id?: string; role?: string };
  };
  const access = body.tokens?.accessToken ?? "";
  const rotated = body.tokens?.refreshToken ?? "";
  if (!access || !rotated) return new Response("unexpected response", { status: 502 });

  if (!isStaffRole(body.user?.role)) {
    await authRpc(req, "LogOut", { refreshToken: rotated });
    audit(req, "admin_refresh", { result: "denied_role", userId: body.user?.id ?? "" });
    const denied = withCookies(null, 403, clearedCookies());
    denied.headers.set("x-admin-denied", "1");
    return denied;
  }

  const started = Number(readCookie(req, STARTED_COOKIE));
  return withCookies(
    JSON.stringify({ accessToken: access, userId: body.user?.id ?? "" }),
    200,
    sessionCookies(rotated, started, remaining),
  );
}
