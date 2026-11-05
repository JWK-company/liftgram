// 운영 웹 서버가 백엔드를 부를 때 쓰는 공용 부분(SPEC-033).
import { env } from "./env";

/**
 * 백엔드 요청 제한의 키가 되는 클라이언트 주소.
 * 브라우저가 보낸 X-Forwarded-For 는 위조할 수 있고 백엔드는 첫 값을 믿으므로 받은 값을 절대 넘기지 않는다.
 * 터널 뒤(TRUST=1)에서만 Cloudflare 가 넣은 값으로 새로 세운다.
 */
export function clientIp(req: Request): string {
  if (env().TRUST_CF_CONNECTING_IP !== "1") return "";
  return req.headers.get("cf-connecting-ip")?.trim() ?? "";
}

export function clientIpHeaders(req: Request): Record<string, string> {
  const ip = clientIp(req);
  return ip ? { "x-forwarded-for": ip } : {};
}

export function backendUrl(pathname: string): string {
  return `${env().API_URL.replace(/\/$/, "")}${pathname}`;
}

const AUTH = "/api/auth.v1.AuthService";

/** 인증 RPC 를 Connect JSON 으로 부른다. 닿지 못하면 null. */
export function authRpc(req: Request, method: "LogIn" | "Refresh" | "LogOut", body: unknown) {
  return fetch(backendUrl(`${AUTH}/${method}`), {
    method: "POST",
    headers: { "content-type": "application/json", ...clientIpHeaders(req) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null);
}

/** 운영 작업을 돌아볼 수 있게 남기는 구조화 로그. 비밀번호·토큰·메일 주소는 넣지 않는다. */
export function audit(req: Request, event: string, fields: Record<string, string> = {}): void {
  console.log(
    JSON.stringify({ audit: event, at: new Date().toISOString(), ip: clientIp(req) || "unknown", ...fields }),
  );
}
