// 운영 웹 로그아웃(SPEC-033). 폐기가 실패해도 쿠키는 지운다.
import { audit, authRpc } from "@/lib/backend";
import {
  clearedCookies,
  REFRESH_COOKIE,
  readCookie,
  sameOriginRequest,
  withCookies,
} from "@/lib/sessionCookie";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request): Promise<Response> {
  if (!sameOriginRequest(req)) return new Response("forbidden", { status: 403 });
  const token = readCookie(req, REFRESH_COOKIE);
  if (token) await authRpc(req, "LogOut", { refreshToken: token });
  audit(req, "admin_logout");
  return withCookies(null, 204, clearedCookies());
}
