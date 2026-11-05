// 입구와 경계(SPEC-033 Phase 1 · REV-048)
import { request } from "@playwright/test";
import { accessToken, expect, makeAccount, PASSWORD, test } from "./helpers/base";

const BASE = process.env.BASE ?? "http://localhost:3320";

async function statusWith(token: string | null, path = "/login") {
  const ctx = await request.newContext({
    extraHTTPHeaders: token ? { "cf-access-jwt-assertion": token } : {},
  });
  const res = await ctx.get(`${BASE}${path}`, { maxRedirects: 0 });
  const status = res.status();
  await ctx.dispose();
  return status;
}

test("Access 토큰 없거나 틀리면 거절한다", async () => {
  expect(await statusWith(null)).toBe(403);
  expect(await statusWith(null, "/api/auth.v1.AuthService/Me")).toBe(403);
  expect(await statusWith("not-a-token")).toBe(403);
  expect(await statusWith(await accessToken("?key=other"))).toBe(403);
  expect(await statusWith(await accessToken("?aud=someone-else"))).toBe(403);
  expect(await statusWith(await accessToken("?iss=https://evil.cloudflareaccess.com"))).toBe(403);
  expect(await statusWith(await accessToken("?exp=1577836800"))).toBe(403);
  expect(await statusWith(await accessToken("?noexp=1"))).toBe(403);
  expect(await statusWith(await accessToken("?hs256=1"))).toBe(403);
  expect(await statusWith(await accessToken())).toBe(200);
  // 경계를 비껴가는 주소도 면제되지 않는다.
  for (const p of [
    "/",
    "/ops",
    "/api/session/refresh",
    "/_next/image?w=64&q=75&url=%2Fx",
    "/faviconXico",
    "/_next/staticX",
    "/healthzX",
    "/LOGIN",
  ]) {
    expect(await statusWith(null, p), p).toBe(403);
  }
});

test("헬스는 Access 없이 답하고 내용을 내보내지 않는다", async () => {
  expect(await statusWith(null, "/healthz")).toBe(200);
  const ctx = await request.newContext();
  const res = await ctx.get(`${BASE}/readyz`);
  expect(res.status()).toBe(200);
  expect(await res.text()).toBe("ready");
  await ctx.dispose();
});

test("허용 밖 RPC 와 인코딩 우회, 파일 경로는 404 다", async ({ request: req }) => {
  for (const path of [
    "/api/auth.v1.AuthService/DeleteAccount",
    "/api/auth.v1.AuthService/LogIn",
    "/api/auth.v1.AuthService/CreateLinkTicket",
    "/api/auth.v1.AuthService/CreateAppContinue",
    "/api/auth.v1.AuthService/ExchangeLoginCode",
    "/api/media.v1.MediaService/UploadImage",
    "/api/moderation.v1.ModerationService/Report",
    "/api/feedback.v1.FeedbackService/SubmitUserFeedback",
    "/api/ops.v1.OpsService/ReportClientHealth",
    "/api/auth/oauth/google",
    "/api/media/file/x",
    "/api/readyz",
  ]) {
    const res = await req.post(path, { data: {} });
    expect(res.status(), path).toBe(404);
  }
});

test("로그인 응답 본문에 refresh 가 없다", async ({ request: req }) => {
  const res = await req.post("/api/session/login", {
    headers: { "x-liftgram-admin-session": "1", origin: BASE, "sec-fetch-site": "same-origin" },
    data: { email: await makeAccount("admin"), password: PASSWORD },
  });
  expect(res.status()).toBe(200);
  expect(Object.keys(await res.json()).sort()).toEqual(["accessToken", "userId"]);
});

test("일반 프록시는 GET 을 받지 않는다", async ({ request: req }) => {
  expect((await req.get("/api/auth.v1.AuthService/Me")).status()).toBe(405);
});

test("세션 라우트는 헤더·Origin·Sec-Fetch-Site 가 맞아야 한다", async ({ request: req }) => {
  const good = { "x-liftgram-admin-session": "1", origin: BASE, "sec-fetch-site": "same-origin" };
  const data = { email: "a@example.com", password: "x" };
  for (const headers of [
    { ...good, "x-liftgram-admin-session": "" },
    { ...good, origin: "https://liftgram.tarae.org" },
    { ...good, "sec-fetch-site": "same-site" },
  ]) {
    for (const path of ["/api/session/login", "/api/session/refresh"]) {
      expect((await req.post(path, { headers, data })).status(), `${path} ${JSON.stringify(headers)}`).toBe(
        403,
      );
    }
    expect((await req.delete("/api/session", { headers })).status()).toBe(403);
  }
  expect((await req.post("/api/session/login", { headers: good, data })).status()).toBe(401);
});

const good = (base: string) => ({
  "x-liftgram-admin-session": "1",
  origin: base,
  "sec-fetch-site": "same-origin",
});
const SPOOF = {
  "x-forwarded-for": "6.6.6.6",
  "cf-connecting-ip": "9.9.9.9",
  cookie: "CF_Authorization=secret; __Host-liftgram_admin_refresh=r",
};

async function lastAtStub(): Promise<{ path: string; headers: Record<string, string> }> {
  return (await fetch("http://127.0.0.1:3324/__last")).json();
}

async function postTo(base: string, path: string, headers: Record<string, string>, data: unknown) {
  const ctx = await request.newContext({
    extraHTTPHeaders: { "cf-access-jwt-assertion": await accessToken() },
  });
  const res = await ctx.post(`${base}${path}`, { headers, data });
  return { ctx, res };
}

test("프록시: 백엔드에는 허용한 헤더와 다시 세운 주소만 간다", async () => {
  const { ctx, res } = await postTo(
    "http://localhost:3325",
    "/api/admin.v1.AdminService/GetUsageStats",
    { ...SPOOF, authorization: "Bearer a", "x-custom": "1" },
    {},
  );
  expect(res.status()).toBe(200);
  const got = await lastAtStub();
  expect(got.headers["x-forwarded-for"]).toBe("9.9.9.9");
  expect(got.headers.authorization).toBe("Bearer a");
  for (const k of ["cookie", "cf-connecting-ip", "cf-access-jwt-assertion", "x-custom"])
    expect(got.headers[k], k).toBeUndefined();
  // 응답에서도 쿠키와 내부 헤더가 사라진다.
  expect(res.headers()["set-cookie"]).toBeUndefined();
  expect(res.headers()["x-internal"]).toBeUndefined();
  expect(res.headers()["cache-control"]).toContain("no-store");
  await ctx.dispose();
});

test("TRUST=0 이면 Cloudflare 헤더도 믿지 않는다", async () => {
  const { ctx } = await postTo(
    "http://localhost:3326",
    "/api/admin.v1.AdminService/GetUsageStats",
    SPOOF,
    {},
  );
  expect((await lastAtStub()).headers["x-forwarded-for"]).toBeUndefined();
  await ctx.dispose();
  const login = await postTo(
    "http://localhost:3326",
    "/api/session/login",
    { ...good("http://localhost:3326"), ...SPOOF },
    { email: "a@example.com", password: "x" },
  );
  const got = await lastAtStub();
  expect(got.path).toBe("/api/auth.v1.AuthService/LogIn");
  expect(got.headers["x-forwarded-for"]).toBeUndefined();
  await login.ctx.dispose();
});

test("세션 라우트: 주소를 다시 세우고 쿠키를 넘기지 않으며, 상태 코드를 옮긴다", async () => {
  const base = "http://localhost:3325";
  const headers = { ...good(base), ...SPOOF };
  const body = { email: "a@example.com", password: "x" };
  const first = await postTo(base, "/api/session/login", headers, body);
  const got = await lastAtStub();
  expect(got.headers["x-forwarded-for"]).toBe("9.9.9.9");
  expect(got.headers.cookie).toBeUndefined();
  await first.ctx.dispose();
  for (const [upstream, want] of [
    [429, 429],
    [401, 401],
    [400, 401],
    [500, 503],
    [503, 503],
  ]) {
    await fetch(`http://127.0.0.1:3324/__next?status=${upstream}`, { method: "POST" });
    const r = await postTo(base, "/api/session/login", headers, body);
    expect(r.res.status(), `백엔드 ${upstream}`).toBe(want);
    await r.ctx.dispose();
  }
  // 인증 요청 제한은 백엔드에서 503 메시지로 온다.
  const msg = encodeURIComponent("요청이 너무 잦아요. 잠시 뒤 다시 시도해 주세요");
  await fetch(`http://127.0.0.1:3324/__next?status=503&message=${msg}`, { method: "POST" });
  const limited = await postTo(base, "/api/session/login", headers, body);
  expect(limited.res.status()).toBe(429);
  await limited.ctx.dispose();
});

test("입구 설정이 비면 운영 빌드는 모든 요청을 거절한다", async () => {
  const token = await accessToken();
  const ctx = await request.newContext({ extraHTTPHeaders: { "cf-access-jwt-assertion": token } });
  for (const p of ["/", "/login", "/ops"])
    expect((await ctx.get(`http://localhost:3323${p}`, { maxRedirects: 0 })).status(), p).toBe(403);
  expect((await ctx.post("http://localhost:3323/api/auth.v1.AuthService/Me", { data: {} })).status()).toBe(
    403,
  );
  expect((await ctx.get("http://localhost:3323/healthz")).status()).toBe(200);
  await ctx.dispose();
});

test("로그인 감사 줄: 결과와 주소가 남고 비밀은 남지 않는다", async () => {
  const email = await makeAccount("admin");
  const { ctx } = await postTo(
    BASE,
    "/api/session/login",
    { ...good(BASE), ...SPOOF },
    { email, password: PASSWORD },
  );
  await ctx.dispose();
  const { readFileSync } = await import("node:fs");
  const lines = readFileSync(process.env.ADMIN_LOG as string, "utf8")
    .trim()
    .split("\n")
    .filter((l) => l.includes('"audit"'));
  const last = JSON.parse(lines[lines.length - 1]);
  expect(last).toMatchObject({ audit: "admin_login", result: "ok", ip: "9.9.9.9" });
  expect(last.userId).toBeTruthy();
  const raw = lines.join("\n");
  expect(raw).not.toContain(email);
  expect(raw).not.toContain(PASSWORD);
  expect(raw).not.toContain("6.6.6.6");
});

test("응답에 보안 헤더가 있고 페이지마다 nonce 가 다르다", async ({ request: req }) => {
  const a = await req.get("/login");
  const b = await req.get("/login");
  const h = a.headers();
  expect(h["x-robots-tag"]).toContain("noindex");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("no-referrer");
  expect(h["cache-control"]).toContain("no-store");
  expect(h["content-security-policy"].replace(/'nonce-[^']+'/, "'nonce'")).toBe(
    "default-src 'self'; script-src 'self' 'nonce' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
  );
  expect(h["content-security-policy"]).not.toEqual(b.headers()["content-security-policy"]);
  // 로그인 화면만이 아니라 콘솔 경로와 세션 라우트에도 같은 헤더가 붙는다.
  for (const [path, res] of [
    ["/", await req.get("/", { maxRedirects: 0 })],
    ["/ops", await req.get("/ops", { maxRedirects: 0 })],
    ["/api/session", await req.get("/api/session", { maxRedirects: 0 })],
  ] as const) {
    const hh = res.headers();
    expect(hh["x-robots-tag"], path).toContain("noindex");
    expect(hh["x-content-type-options"], path).toBe("nosniff");
    expect(hh["cache-control"], path).toContain("no-store");
    expect(hh["content-security-policy"], path).toBeTruthy();
  }
  const html = await a.text();
  const nonce = /'nonce-([^']+)'/.exec(h["content-security-policy"])?.[1];
  expect(html).toContain(`nonce="${nonce}"`);
  const api = await req.post("/api/auth.v1.AuthService/Me", { data: {} });
  expect(api.headers()["content-security-policy"]).toBe("default-src 'none'; sandbox");
  expect(api.headers()["cache-control"]).toContain("no-store");
  expect(api.headers()["x-robots-tag"]).toContain("noindex");
});
