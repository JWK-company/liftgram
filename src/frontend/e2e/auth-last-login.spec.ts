// 「최근」 배지 e2e — 이 기기에서 마지막으로 로그인한 방법이 로그인 화면에 표시되는가 (SRS-052 · booktarae d8790329)
//
// 보는 것: 세션을 연 **실제 경로**(이메일 가입 / 소셜 왕복)가 /api/session 에서 HttpOnly 쿠키 `lg_last` 를 남기고,
// 로그아웃한 뒤 로그인 화면이 그 버튼에 배지를 단다. 다른 방법으로 다시 들어오면 배지가 옮겨 간다.
// 소셜 판정은 backend 를 `-tags=oauthfake` 로 띄우고 OAUTH_FAKE_PROFILE_FILE 을 줘야 돈다(auth-formal 과 같다).
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const FAKE_FILE = process.env.OAUTH_FAKE_PROFILE_FILE ?? "";
const PW = "hunter22!";

function freshEmail(tag: string): string {
  return `e2e-last-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function 가입(page: Page, email: string) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill(PW);
  await page.getByTestId("auth-name-input").fill("최근테스트");
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

async function 로그아웃(page: Page) {
  await page.getByTestId("btn-logout").click();
  await expect(page.getByTestId("btn-auth-submit")).toBeVisible({ timeout: 20_000 });
}

/** 로그인 화면에서 배지가 붙은 버튼들의 testid. */
async function 배지(page: Page): Promise<string[]> {
  await page.goto("/signin");
  await expect(page.getByTestId("btn-auth-submit")).toBeVisible({ timeout: 20_000 });
  return page
    .getByTestId("last-login-badge")
    .evaluateAll((els) => els.map((el) => el.closest("a,button")?.getAttribute("data-testid") ?? "?"));
}

async function lastCookie(page: Page) {
  return (await page.context().cookies()).find((c) => c.name === "lg_last");
}

test("처음 온 기기에는 「최근」 배지가 없다", async ({ page }) => {
  expect(await 배지(page)).toEqual([]);
});

test("이메일로 가입하면 로그아웃 뒤 이메일 로그인 버튼에 배지 — 쿠키는 HttpOnly", async ({ page }) => {
  await 가입(page, freshEmail("email"));
  await expect.poll(async () => (await lastCookie(page))?.value).toBe("email");
  expect((await lastCookie(page))?.httpOnly, "화면 JS 가 읽을 필요가 없다 — HttpOnly 여야 한다").toBe(true);

  await 로그아웃(page);
  // 로그아웃은 이 표시를 지우지 않는다(다음 로그인을 돕는 것이 목적).
  expect((await lastCookie(page))?.value).toBe("email");
  expect(await 배지(page)).toEqual(["btn-auth-submit"]);
  // 낭독기에는 버튼 이름 뒤에 붙는다.
  await expect(page.getByTestId("btn-auth-submit")).toContainText("최근에 로그인한 방법");
});

test("이메일 뒤에 구글로 들어오면 배지가 구글로 옮겨 간다", async ({ page }) => {
  await page.goto("/account");
  const fake =
    !!FAKE_FILE &&
    (await page
      .getByTestId("btn-oauth-google")
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false));
  test.skip(!fake, "가짜 제공자 없음 — backend 를 -tags=oauthfake 로");

  await 가입(page, freshEmail("first"));
  await 로그아웃(page);
  expect(await 배지(page)).toEqual(["btn-auth-submit"]);

  writeFileSync(
    FAKE_FILE,
    JSON.stringify({
      ProviderUserID: `g-last-${Date.now()}`,
      Email: freshEmail("google"),
      EmailVerified: true,
      DisplayName: "최근구글",
    }),
  );
  await page.getByTestId("btn-oauth-google").click();
  // 착지 → /account. 다시 goto 하지 않는다(막 시작된 refresh 를 끊는다 — auth-formal 주석).
  await page.waitForURL((u) => u.pathname.startsWith("/account"), { timeout: 30_000 });
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  expect((await lastCookie(page))?.value).toBe("google");

  await 로그아웃(page);
  expect(await 배지(page)).toEqual(["btn-oauth-google"]);
});
