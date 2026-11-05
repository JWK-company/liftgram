// 운영 웹 로그인(SPEC-033). refresh 토큰은 서버에서 쿠키로 구워 브라우저 자바스크립트를 지나지 않는다.
// 역할이 맞지 않으면 쿠키를 굽기 전에 토큰을 폐기한다. 나중에 지우는 방식은 지우기가 실패할 여지가 있다.
import { audit, authRpc } from "@/lib/backend";
import {
  isStaffRole,
  REFRESH_COOKIE,
  readCookie,
  SESSION_MAX_SEC,
  sameOriginRequest,
  sessionCookies,
  withCookies,
} from "@/lib/sessionCookie";

export const dynamic = "force-dynamic";

type LogInBody = {
  tokens?: { accessToken?: string; refreshToken?: string };
  user?: { id?: string; role?: string };
};

export async function POST(req: Request): Promise<Response> {
  if (!sameOriginRequest(req)) return new Response("forbidden", { status: 403 });

  const input = (await req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  const email = typeof input?.email === "string" ? input.email : "";
  const password = typeof input?.password === "string" ? input.password : "";
  if (!email || !password) return Response.json({ error: "invalid" }, { status: 400 });

  const res = await authRpc(req, "LogIn", { email, password });
  if (!res) return Response.json({ error: "unavailable" }, { status: 503 });
  // 인증 요청 제한은 백엔드에서 503(Unavailable)으로 온다(auth/handler_account.go guard). 장애와 구분해 알린다.
  const limited =
    res.status === 429 ||
    (res.status === 503 &&
      /너무 잦/.test(
        (
          (await res
            .clone()
            .json()
            .catch(() => null)) as { message?: string } | null
        )?.message ?? "",
      ));
  if (limited) {
    audit(req, "admin_login", { result: "limited" });
    return Response.json({ error: "limited" }, { status: 429 });
  }
  if (!res.ok) {
    audit(req, "admin_login", { result: "failed" });
    // 백엔드의 400(형식)과 401(자격)을 구분해 알리지 않는다. 5xx 만 장애로 말한다.
    return Response.json(
      { error: res.status >= 500 ? "unavailable" : "credentials" },
      { status: res.status >= 500 ? 503 : 401 },
    );
  }

  const body = (await res.json()) as LogInBody;
  const access = body.tokens?.accessToken ?? "";
  const refresh = body.tokens?.refreshToken ?? "";
  if (!access || !refresh) return Response.json({ error: "unavailable" }, { status: 502 });

  if (!isStaffRole(body.user?.role)) {
    await authRpc(req, "LogOut", { refreshToken: refresh });
    audit(req, "admin_login", { result: "denied_role", userId: body.user?.id ?? "" });
    return Response.json({ error: "role" }, { status: 403, headers: { "x-admin-denied": "1" } });
  }

  // 다시 로그인하면 이전 세션의 토큰을 폐기한다. 쿠키만 덮으면 이전 토큰이 30일까지 살아 있다.
  const previous = readCookie(req, REFRESH_COOKIE);
  if (previous) await authRpc(req, "LogOut", { refreshToken: previous });

  audit(req, "admin_login", { result: "ok", userId: body.user?.id ?? "" });
  return withCookies(
    JSON.stringify({ accessToken: access, userId: body.user?.id ?? "" }),
    200,
    sessionCookies(refresh, Date.now(), SESSION_MAX_SEC),
  );
}
