// 운영 세션 쿠키와 요청 검사(SPEC-033 · REV-048).
//
// `__Host-` 접두는 Secure·Path=/·Domain 없음을 브라우저가 강제한다. 앱과 운영 웹은 둘 다 tarae.org 아래 형제라
// SameSite 로는 서로를 막지 못하는데, 이 접두가 있으면 다른 하위 도메인이 같은 이름의 쿠키를 심을 수 없다.
import { adminOrigin } from "./env";

export const REFRESH_COOKIE = "__Host-liftgram_admin_refresh";
export const STARTED_COOKIE = "__Host-liftgram_admin_started";
export const GUARD_HEADER = "x-liftgram-admin-session";

/** 로그인 뒤 이 시간이 지나면 갱신해도 끝난다. 백엔드 refresh 수명(30일)은 운영 웹에 너무 길다. */
export const SESSION_MAX_SEC = 12 * 60 * 60;

/**
 * 쿠키는 상한보다 오래 둔다. 만료 순간 쿠키도 사라지면 서버가 끝났음을 알 수 없어 백엔드 토큰(30일)을 폐기하지 못한다.
 * 상한 판정은 쿠키 수명이 아니라 시작 시각으로만 한다. 일주일 안에 돌아오면 폐기까지 되고, 그 뒤면 토큰이 제 수명에 끝난다.
 */
export const COOKIE_GRACE_SEC = 7 * 24 * 60 * 60;

/** CSRF 빗장 셋. 형제 하위 도메인은 같은 사이트라 Origin 정확 일치와 Sec-Fetch-Site 가 실제 방어선이다. */
export function sameOriginRequest(req: Request): boolean {
  return (
    req.headers.get(GUARD_HEADER) === "1" &&
    req.headers.get("origin") === adminOrigin() &&
    req.headers.get("sec-fetch-site") === "same-origin"
  );
}

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function readCookie(req: Request, name: string): string {
  // 같은 이름이 여럿이면 하나도 믿지 않는다. __Host- 라 정상 흐름에서는 생기지 않는다.
  const found = (req.headers.get("cookie") ?? "")
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p.startsWith(`${name}=`));
  return found.length === 1 ? found[0].slice(name.length + 1) : "";
}

/** 남은 세션 시간(초). 시작 시각이 없거나 망가졌으면 0. */
export function remainingSec(req: Request, now = Date.now()): number {
  const started = Number(readCookie(req, STARTED_COOKIE));
  // 미래 시각은 망가진 값으로 본다. 시작 시각을 늘려 상한을 넘기지 못하게 한다.
  if (!Number.isFinite(started) || started <= 0 || started > now + 60_000) return 0;
  return Math.max(0, Math.floor(started / 1000 + SESSION_MAX_SEC - now / 1000));
}

export function sessionCookies(refresh: string, startedMs: number, remaining: number): string[] {
  const maxAge = remaining + COOKIE_GRACE_SEC;
  return [cookie(REFRESH_COOKIE, refresh, maxAge), cookie(STARTED_COOKIE, String(startedMs), maxAge)];
}

export function clearedCookies(): string[] {
  return [cookie(REFRESH_COOKIE, "", 0), cookie(STARTED_COOKIE, "", 0)];
}

export function withCookies(body: BodyInit | null, status: number, cookies: string[]): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  if (body) headers.set("content-type", "application/json");
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(body, { status, headers });
}

const STAFF = new Set(["ROLE_MODERATOR", "ROLE_ADMIN"]);

/** 백엔드 JSON 응답의 역할이 운영진인가. 숫자 표기나 빈 값은 거절 쪽으로 떨어진다. */
export function isStaffRole(role: unknown): boolean {
  return typeof role === "string" && STAFF.has(role);
}
