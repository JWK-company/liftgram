// 모든 시험의 공통 준비: Access 토큰을 모든 요청에 싣고, 역할을 가진 계정을 DB 에 만든다.
import { execFileSync } from "node:child_process";
import { test as base, expect } from "@playwright/test";

export const API = process.env.API ?? "http://127.0.0.1:3321";
export const PASSWORD = "hunter22!";

const PSQL = process.env.E2E_PSQL_URL;
if (!PSQL) throw new Error("E2E_PSQL_URL 이 필요하다 — scripts/e2e-admin.sh 로 돌린다");
// 고정 비밀번호로 관리자를 만드는 시험이다. 다른 서버로 향하지 못하게 멈춘다.
if (!/@(127\.0\.0\.1|localhost):/.test(PSQL) || !/^https?:\/\/(127\.0\.0\.1|localhost):/.test(API)) {
  throw new Error("운영 웹 e2e 는 로컬 DB·API 에서만 돈다");
}
// 로컬이어도 dev DB 는 안 된다 — e2e-admin.sh 가 만든 새 DB(e2e_admin_<시각>)만(SPEC-063 · REV-156 경계 7)
if (!/\/e2e_admin_\d+$/.test(PSQL)) {
  throw new Error("운영 웹 e2e 는 scripts/e2e-admin.sh 가 만든 새 DB 에서만 돈다");
}

export function sql(query: string): string {
  return execFileSync("psql", [PSQL as string, "-tAc", query])
    .toString()
    .trim();
}

export async function accessToken(query = ""): Promise<string> {
  return (await fetch(`http://127.0.0.1:3322/token${query}`)).text();
}

/** 앱 가입 RPC 로 계정을 만들고 역할을 준다. 메일 주소를 돌려준다. */
export async function makeAccount(role: "user" | "coworker" | "moderator" | "admin"): Promise<string> {
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e-admin-${role}-${tag}@example.com`;
  const res = await fetch(`${API}/api/auth.v1.AuthService/SignUp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      password: PASSWORD,
      displayName: `운영시험 ${role} ${tag}`,
      ageConfirmed: true,
    }),
  });
  if (!res.ok) throw new Error(`가입 실패 ${res.status}: ${await res.text()}`);
  sql(`update users set role = '${role}' where email = '${email}'`);
  return email;
}

export const test = base.extend<{ cspViolations: string[] }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright 픽스처는 첫 인자를 구조 분해 형태로 요구한다
  extraHTTPHeaders: async ({}, use) => {
    await use({ "cf-access-jwt-assertion": await accessToken() });
  },
  // 모든 시험이 끝날 때 어느 탭에서든 CSP 위반이 없었는지 본다.
  cspViolations: [
    async ({ context }, use) => {
      const seen: string[] = [];
      context.on("console", (m) => {
        if (/Content Security Policy|Refused to/i.test(m.text())) seen.push(m.text());
      });
      await use(seen);
      expect(seen, "CSP 위반이 없어야 한다").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function logIn(page: import("@playwright/test").Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  // 로그인 요청이 끝나기 전에 다른 주소로 가면 요청이 취소된다. 폼을 떠나거나 거절 문구가 나올 때까지 기다린다.
  await Promise.race([
    page.waitForURL((u) => !u.pathname.startsWith("/login")),
    page.getByTestId("login-error").waitFor(),
  ]);
}
