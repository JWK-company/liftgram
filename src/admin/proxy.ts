// 운영 웹의 첫 관문(SPEC-033). 모든 요청이 여기를 지난다.
//   ① Cloudflare Access 토큰 검증. 터널 설정 실수로 Access 가 빠져도 운영 웹이 그대로 열리지 않게 한다.
//   ② 요청마다 nonce 를 만들어 CSP 를 붙인다. 운영 웹은 사용자가 쓴 글을 읽는 화면이라 XSS 방어선이 중요하다.
import { createRemoteJWKSet, jwtVerify } from "jose";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksFrom = "";

function keySet(certsUrl: string) {
  if (!jwks || jwksFrom !== certsUrl) {
    jwks = createRemoteJWKSet(new URL(certsUrl));
    jwksFrom = certsUrl;
  }
  return jwks;
}

async function accessAllowed(req: NextRequest): Promise<boolean> {
  const { CF_ACCESS_AUD: aud, CF_ACCESS_TEAM_DOMAIN: team, CF_ACCESS_CERTS_URL: certs, NODE_ENV } = env();
  if (!aud || !team) return NODE_ENV !== "production"; // 운영에서 설정이 비면 열지 않는다.
  const token = req.headers.get("cf-access-jwt-assertion");
  if (!token) return false;
  try {
    await jwtVerify(token, keySet(certs || `https://${team}/cdn-cgi/access/certs`), {
      audience: aud,
      issuer: `https://${team}`,
      algorithms: ["RS256"],
      requiredClaims: ["exp"],
    });
    return true;
  } catch {
    return false;
  }
}

function pageCsp(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob:",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "font-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  if (!(await accessAllowed(req))) {
    return new NextResponse("접근 권한이 없습니다", {
      status: 403,
      headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" },
    });
  }
  const { NODE_ENV, ADMIN_URL } = env();
  const isApi = req.nextUrl.pathname.startsWith("/api/");
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = isApi ? "default-src 'none'; sandbox" : pageCsp(nonce, NODE_ENV === "development");

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("content-security-policy", csp);
  res.headers.set("cache-control", "no-store");
  if (ADMIN_URL.startsWith("https://")) res.headers.set("strict-transport-security", "max-age=31536000");
  return res;
}

export const config = {
  // 정적 파일과 헬스만 뺀다. /api 는 넣어야 Access 검증을 지난다.
  // 경계를 분명히 둔다. `/_next/staticX`, `/faviconXico` 같은 주소가 검증을 비껴가지 않게 한다.
  // 이미지 최적화(/_next/image)는 쓰지 않으므로 면제하지 않는다. 면제하면 익명 요청이 서버 로그에 글을 남길 수 있다.
  matcher: ["/((?!_next/static/|favicon\\.ico$|healthz$|readyz$).*)"],
};
