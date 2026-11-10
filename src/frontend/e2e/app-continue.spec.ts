// SPEC-018 §7  웹 → 앱 로그인 넘기기 e2e — 크롬 탭(웹 세션) → 확인 → liftgram://auth → 앱 웹뷰(v) 교환 → 같은 계정
//
// 두 문맥을 쓴다: 「크롬」(웹에서 로그인한 브라우저 — 크롬 PWA 와 같은 쿠키 통) · 「앱」(가짜 Capacitor 안드로이드 웹뷰 —
// 쿠키 통이 다르다). 크롬 탭(Custom Tabs)은 크롬 문맥의 새 페이지로 흉내 낸다.
import { expect, test, type Browser, type Page } from "@playwright/test";

const PW = "hunter22!";
/** lib/session.ts ME_CACHE 와 같은 값 */
const ME_CACHE_KEY = "liftgram.me";

function freshEmail(tag: string): string {
  return `e2e-cont-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function 가입(page: Page, email: string, name: string) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill(PW);
  await page.getByTestId("auth-name-input").fill(name);
  await page.getByTestId("age-confirm").check();
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

/** 가짜 안드로이드 앱 웹뷰 — Browser.open 주소를 기록하고, appUrlOpen 리스너를 잡아 둔다 */
async function 앱(browser: Browser, launchUrl = ""): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript((launch) => {
    const w = window as unknown as Record<string, unknown>;
    const state = { opened: [] as string[], listeners: [] as Array<(d: { url: string }) => void> };
    w.__cap = state;
    w.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "android",
      isPluginAvailable: (n: string) => n === "App" || n === "Browser",
      Plugins: {
        Browser: {
          open: async (o: { url: string }) => {
            state.opened.push(o.url);
          },
          close: async () => {
            sessionStorage.setItem(
              "cap-closed",
              String(Number(sessionStorage.getItem("cap-closed") ?? "0") + 1),
            );
          },
        },
        App: {
          addListener: async (_ev: string, fn: (d: { url: string }) => void) => {
            state.listeners.push(fn);
            return { remove: async () => {} };
          },
          getLaunchUrl: async () => (launch ? { url: launch } : {}),
        },
      },
    };
  }, launchUrl);
  return page;
}

async function 앱링크(page: Page, url: string) {
  await page.evaluate((u) => {
    const s = (window as unknown as { __cap: { listeners: Array<(d: { url: string }) => void> } }).__cap;
    for (const f of s.listeners) f({ url: u });
  }, url);
}

async function 열린주소(page: Page): Promise<string> {
  await expect
    .poll(async () =>
      page.evaluate(() => (window as unknown as { __cap: { opened: string[] } }).__cap.opened.at(-1) ?? ""),
    )
    .toContain("/app/continue?ac=");
  return page.evaluate(
    () => (window as unknown as { __cap: { opened: string[] } }).__cap.opened.at(-1) as string,
  );
}

/** 크롬 탭에서 확인 → 「계속」 → 서버가 준 앱 주소(liftgram://auth?code=) */
async function 계속(chromeTab: Page, url: string): Promise<string> {
  let calls = 0;
  chromeTab.on("request", (q) => {
    if (q.url().includes("CreateAppContinue")) calls++;
  });
  await chromeTab.goto(url);
  await expect(chromeTab.getByTestId("continue-warn")).toBeVisible({ timeout: 20_000 });
  // 화면이 열리기만 해서는 서버를 부르지 않는다 — 「계속」을 눌러야 한 번(REV-012 시험 M-2)
  await chromeTab.waitForTimeout(500);
  expect(calls).toBe(0);
  const res = chromeTab.waitForResponse((r) => r.url().includes("CreateAppContinue"));
  await chromeTab.getByTestId("btn-continue").click();
  const body = (await (await res).json()) as { appUrl?: string };
  expect(body.appUrl ?? "").toMatch(/^liftgram:\/\/auth\?code=/);
  expect(calls).toBe(1);
  // 크롬이 자동 열기를 막아도 누를 수 있는 「앱 열기」(REV-012 화면 M-4)
  await expect(chromeTab.getByTestId("continue-open-app")).toHaveAttribute("href", body.appUrl as string);
  return body.appUrl as string;
}

test("넘기기 — 앱 「계속」 → 크롬 탭 확인 → liftgram://auth → 앱이 같은 계정으로 로그인 · 탭 닫힘", async ({
  browser,
}) => {
  const email = freshEmail("ok");
  const chrome = await browser.newContext();
  const web = await chrome.newPage();
  await 가입(web, email, "넘기기");

  const app = await 앱(browser);
  await app.goto("/account");
  await expect(app.getByTestId("app-continue-entry")).toBeVisible({ timeout: 20_000 });
  await app.getByTestId("btn-app-continue").click();
  const url = await 열린주소(app);
  expect(url).toMatch(/\/app\/continue\?ac=[A-Za-z0-9_-]{43}$/);

  // 크롬 탭 — 마스킹한 주소 · 이름 · 경고
  const tab = await chrome.newPage();
  await tab.goto(url);
  await expect(tab.getByTestId("continue-name")).toHaveText("넘기기", { timeout: 20_000 });
  await expect(tab.getByTestId("continue-email")).toHaveText(`e${"•".repeat(6)}@example.com`);
  const appLink = await 계속(tab, url);
  await expect(tab.getByTestId("continue-returning")).toBeVisible();

  // 앱이 스킴을 받는다 → v 로 교환 → 같은 계정
  await 앱링크(app, appLink);
  await expect(app).toHaveURL(/^[^?#]*:\/\/[^/]+\/(\?.*)?$/, { timeout: 20_000 });
  await app.goto("/account");
  await expect(app.getByTestId("auth-email")).toHaveText("넘기기", { timeout: 20_000 });
  expect(await app.evaluate(() => sessionStorage.getItem("cap-closed"))).toBe("1");
  // 크롬(웹) 세션은 그대로
  await web.reload();
  await expect(web.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  await chrome.close();
  await app.context().close();
});

test("넘기기 — 남이 가로챈 코드는 v 없이 교환되지 않고, 정당한 앱은 그 뒤에도 교환한다", async ({
  browser,
  baseURL,
}) => {
  const chrome = await browser.newContext();
  const web = await chrome.newPage();
  await 가입(web, freshEmail("steal"), "가로채기");
  const app = await 앱(browser);
  await app.goto("/account");
  await app.getByTestId("btn-app-continue").click();
  const appLink = await 계속(await chrome.newPage(), await 열린주소(app));
  const code = new URL(appLink).searchParams.get("code") ?? "";

  // 다른 앱(같은 스킴 등록)이 코드를 가로챘다 — v 를 모른다
  const thief = await browser.newContext();
  const r = await thief.request.get(
    `${baseURL}/api/auth/oauth/app/handoff?code=${encodeURIComponent(code)}&v=wrong`,
    {
      maxRedirects: 0,
    },
  );
  expect(r.headers().location ?? "").toContain("err=oauth_state");
  expect((await thief.storageState()).cookies.filter((c) => /session|refresh/i.test(c.name))).toEqual([]);
  await thief.close();

  await 앱링크(app, appLink);
  await expect(app).toHaveURL(/^[^?#]*:\/\/[^/]+\/(\?.*)?$/, { timeout: 20_000 });
  await app.goto("/account");
  await expect(app.getByTestId("auth-email")).toHaveText("가로채기", { timeout: 20_000 });
  await chrome.close();
  await app.context().close();
});

test("넘기기 착지는 이미 로그인된 앱에서 교환하지 않는다(via=continue · 사용자 캐시 없이도)", async ({
  browser,
}) => {
  const app = await 앱(browser);
  await 가입(app, freshEmail("in"), "이미로그인");
  // 브라우저의 사용자 캐시를 지우고 세션 쿠키만 남긴다 — 착지는 세션 확인(loading)을 기다린 뒤 판단해야 한다(REV-012 시험 M-1)
  await app.evaluate((k) => localStorage.removeItem(k), ME_CACHE_KEY);
  let exchanged = 0;
  app.on("request", (q) => {
    if (q.url().includes("ExchangeLoginCode")) exchanged++;
  });
  await app.goto("/auth/complete?code=someone-elses-code&via=continue");
  await expect(app).toHaveURL(/^[^?#]*:\/\/[^/]+\/(\?.*)?$/, { timeout: 20_000 });
  expect(exchanged).toBe(0);
  await app.goto("/account");
  await expect(app.getByTestId("auth-email")).toHaveText("이미로그인", { timeout: 20_000 });
  // 이미 로그인된 앱에는 진입점이 없다(로그인 폼이 아니라 계정 화면)
  await expect(app.getByTestId("app-continue-entry")).toHaveCount(0);
  await app.context().close();
});

test("확인 화면 — 잘못된 주소 · 로그인 안 됨 · 웹(앱 아님)에는 진입점 없음 · 로그인 없이 RPC 거절", async ({
  page,
  request,
  browser,
}) => {
  await page.goto("/app/continue?ac=bad");
  await expect(page.getByTestId("continue-bad-link")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("btn-continue")).toHaveCount(0);

  const ac = "A".repeat(43);
  await page.goto(`/app/continue?ac=${ac}`);
  await expect(page.getByTestId("continue-need-login")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("btn-auth-submit")).toBeVisible();
  // 확인 화면 안 로그인 폼에는 「웹에서 쓰던 계정으로 계속」이 없다
  await expect(page.getByTestId("app-continue-entry")).toHaveCount(0);
  // 이메일 로그인을 하면 같은 자리에서 확인으로 바뀐다
  const email = freshEmail("login");
  const other = await browser.newContext();
  const o = await other.newPage();
  await 가입(o, email, "다시로그인");
  await other.close();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill(PW);
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("continue-name")).toHaveText("다시로그인", { timeout: 20_000 });
  await expect(page).toHaveURL(new RegExp(`/app/continue\\?ac=${ac}$`));

  // 「다른 방법으로 로그인」은 탭만 닫는 auth?cancel=1(start 가 아니다 — 앱이 「PWA 에서 바꾸기」로 읽지 않게 · REV-012 화면 M-1)
  await expect(page.getByTestId("continue-other")).toHaveAttribute("href", "liftgram://auth?cancel=1");

  // 헤더 — 끼워 넣기 금지 · 저장 안 함
  const h = await request.get(`/app/continue?ac=${ac}`);
  expect(h.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h.headers()["cache-control"]).toContain("no-store");
  expect(h.headers()["referrer-policy"]).toBe("no-referrer");

  // 웹 브라우저(앱 아님) 로그인 화면에는 진입점이 없다
  const anon = await browser.newContext();
  const a = await anon.newPage();
  await a.goto("/account");
  await expect(a.getByTestId("btn-auth-submit")).toBeVisible({ timeout: 20_000 });
  await expect(a.getByTestId("app-continue-entry")).toHaveCount(0);

  // 로그인 없이 부르면 거절
  const rpc = await anon.request.post("/api/auth.v1.AuthService/CreateAppContinue", {
    data: { challenge: ac },
    headers: { "Content-Type": "application/json" },
  });
  expect(rpc.status()).toBe(401);
  await anon.close();
});

test("PWA 에서 바꾸기로 켜진 앱(liftgram://start)은 진입점을 강조한다", async ({ browser }) => {
  const app = await 앱(browser, "liftgram://start");
  await app.goto("/account");
  await expect(app.getByTestId("app-continue-entry")).toHaveAttribute("data-emphasis", "1", {
    timeout: 20_000,
  });
  // [원본] await expect(app.getByTestId("app-continue-new")).toBeVisible();
  // [개선] 「앱을 새로 설치했나요?…」 설명 줄 없앰(SPEC-055 Phase 4) — 강조(빨강 버튼)는 data-emphasis 로 본다
  await expect(app.getByTestId("app-continue-new")).toHaveCount(0);
  const plain = await 앱(browser);
  await plain.goto("/account");
  await expect(plain.getByTestId("app-continue-entry")).toHaveAttribute("data-emphasis", "0", {
    timeout: 20_000,
  });
  // 떠 있는 앱에 start 링크가 오면 강조로 바뀐다
  await 앱링크(plain, "liftgram://start");
  await expect(plain.getByTestId("app-continue-entry")).toHaveAttribute("data-emphasis", "1");
  await app.context().close();
  await plain.context().close();
});

test("liftgram://start 로 처음 켜진 앱도 넘기기가 끝난다 · 새로고침해도 start 를 다시 재생하지 않는다(REV-012 화면 H-1·M-2)", async ({
  browser,
}) => {
  const chrome = await browser.newContext();
  const web = await chrome.newPage();
  await 가입(web, freshEmail("cold"), "콜드");
  const app = await 앱(browser, "liftgram://start");
  await app.goto("/account");
  await expect(app.getByTestId("app-continue-entry")).toHaveAttribute("data-emphasis", "1", {
    timeout: 20_000,
  });
  // 두 번 눌러도 탭은 하나(바쁨 상태 · 화면 M-5)
  await app.getByTestId("btn-app-continue").dblclick();
  const url = await 열린주소(app);
  expect(
    await app.evaluate(() => (window as unknown as { __cap: { opened: string[] } }).__cap.opened.length),
  ).toBe(1);
  const appLink = await 계속(await chrome.newPage(), url);
  await 앱링크(app, appLink);
  await expect(app).toHaveURL(/^[^?#]*:\/\/[^/]+\/(\?.*)?$/, { timeout: 20_000 });
  await app.goto("/account");
  await expect(app.getByTestId("auth-email")).toHaveText("콜드", { timeout: 20_000 });
  // 같은 실행에서 새로고침 — start 는 한 번만 재생됐다(sessionStorage)
  expect(await app.evaluate(() => sessionStorage.getItem("liftgram.launchLinkSeen:start"))).toBe("1");
  await chrome.close();
  await app.context().close();
});
