// 계정 e2e — 로그인은 **선택**이고, 했을 때 제대로 이어지는가
//
// 확인하는 것:
//   · 로그인하지 않아도 운동 기록은 그대로 된다(이 앱의 전제 — ADR-002)
//   · 가입 → 새로고침해도 로그인 상태가 유지된다(refresh로 되살아난다)
//   · 로그아웃하면 이 기기에서 나간다
//   · 틀린 비밀번호는 **같은 문구**로 거절한다(어느 이메일이 가입돼 있는지 흘리지 않는다)
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

/** 테스트마다 다른 계정을 쓴다 — 같은 DB를 공유하므로 겹치면 서로를 깨뜨린다. */
function freshEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function 가입(page: Page, email: string, password = "hunter22!") {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill(password);
  await page.getByTestId("auth-name-input").fill("테스터");
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

test("로그인하지 않아도 운동을 기록할 수 있다", async ({ page }) => {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });

  await page.goto("/workout");
  await expect(page.getByTestId("btn-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();

  // 계정이 없어도 세트가 깔리고 기록된다.
  await expect(page.getByTestId("set-list").locator("> div")).toHaveCount(1, { timeout: 20_000 });

  // 프로필의 계정 칸은 "로그인" 안내를 보여 준다(막지 않는다).
  await page.goto("/profile");
  await expect(page.getByTestId("account-card")).toContainText("로그인", { timeout: 20_000 });
});

test("가입하면 새로고침해도 로그인 상태가 유지된다", async ({ page }) => {
  const email = freshEmail("persist");
  await 가입(page, email);
  await expect(page.getByTestId("auth-email")).toContainText("테스터");

  // 새로고침하면 access는 사라지지만 refresh로 되살아난다.
  await page.reload();
  await expect(page.getByTestId("auth-email")).toContainText("테스터", { timeout: 20_000 });

  // 프로필의 계정 칸에도 반영된다.
  await page.goto("/profile");
  await expect(page.getByTestId("account-card")).toContainText(email, { timeout: 20_000 });
});

test("로그아웃하면 이 기기에서 나간다", async ({ page }) => {
  await 가입(page, freshEmail("logout"));
  await page.getByTestId("btn-logout").click();

  // 다시 로그인 폼이 뜬다.
  await expect(page.getByTestId("btn-auth-submit")).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByTestId("btn-auth-submit")).toBeVisible({ timeout: 20_000 });
});

test("틀린 비밀번호와 없는 계정은 같은 문구로 거절한다", async ({ page }) => {
  const email = freshEmail("secret");
  await 가입(page, email);
  await page.getByTestId("btn-logout").click();
  await expect(page.getByTestId("btn-auth-submit")).toBeVisible({ timeout: 20_000 });
  // 탭은 가입에 남아 있다 — 로그인 시도임을 **분명히** 고른다(남은 상태에 기대지 않는다).
  await page.getByTestId("mode-login").click();

  // ① 있는 계정 + 틀린 비밀번호
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill("definitely-wrong");
  await page.getByTestId("btn-auth-submit").click();
  const wrongPassword = await page.getByTestId("auth-error").innerText();

  // ② 아예 없는 계정 (여전히 로그인 탭이다)
  await page.getByTestId("auth-email-input").fill(freshEmail("nobody"));
  await page.getByTestId("auth-password-input").fill("definitely-wrong");
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-error")).toBeVisible();
  const noSuchUser = await page.getByTestId("auth-error").innerText();

  // 문구가 다르면 그 차이가 곧 "이 이메일은 가입돼 있다"는 정보가 된다.
  expect(noSuchUser).toBe(wrongPassword);
});

test("이미 가입된 이메일은 안내하고 막는다", async ({ page }) => {
  const email = freshEmail("dupe");
  await 가입(page, email);
  await page.getByTestId("btn-logout").click();
  await expect(page.getByTestId("btn-auth-submit")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-error")).toContainText("이미 가입된", { timeout: 20_000 });
});
