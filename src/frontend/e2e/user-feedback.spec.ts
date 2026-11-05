// 의견 보내기 e2e(SPEC-032). 모아 보기는 운영 웹 시험이 본다.
//   E2E_PSQL_URL=postgres://app:app@127.0.0.1:55460/app BASE=http://127.0.0.1:3300 bunx playwright test e2e/user-feedback.spec.ts
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

const URL_ = process.env.E2E_PSQL_URL;

test.skip(!URL_, "E2E_PSQL_URL 이 없다 — 역할을 줄 테스트 DB 가 필요하다");

function sql(q: string): string {
  return execFileSync("psql", [URL_ as string, "-tAc", q])
    .toString()
    .trim();
}

let seq = 0;
function freshEmail(tag: string) {
  seq += 1;
  return `e2e-ufb-${tag}-${Date.now()}-${seq}@example.com`;
}

async function 가입(page: Page, email: string, name: string) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill(name);
  await page.getByTestId("age-confirm").check();
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

function 메일확인(email: string) {
  sql(`update users set email_verified_at = now() where email = '${email}'`);
}

test("일반 사용자가 프로필에서 의견을 보낸다 — 운영 피드백과 섞이지 않는다", async ({ page }) => {
  const email = freshEmail("plain");
  await 가입(page, email, "의견시험");
  메일확인(email);
  await page.goto("/profile");
  await page.getByTestId("row-user-feedback").click();
  await expect(page).toHaveURL(/\/profile\/feedback$/);
  await expect(page.getByTestId("nav-profile")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("user-feedback-submit")).toBeDisabled();

  const 글 = `무게 칸이 작아요 ${Date.now()}`;
  await page.getByTestId("user-feedback-body").fill(글);
  await page.getByTestId("user-feedback-submit").click();
  await expect(page.getByTestId("user-feedback-sent")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("user-feedback-body")).toHaveValue("");

  const row = sql(
    `select kind, category is null, platform, app_version <> '' from feedback_items where body = '${글}'`,
  );
  expect(row).toBe("user|t|web|t");
});

test("메일 미확인은 거절하고 글을 지우지 않는다", async ({ page }) => {
  await 가입(page, freshEmail("unverified"), "미확인");
  await page.goto("/profile/feedback");
  const 글 = "메일 확인 전에 쓴 글";
  await page.getByTestId("user-feedback-body").fill(글);
  await page.getByTestId("user-feedback-submit").click();
  await expect(page.getByTestId("user-feedback-error")).toContainText("메일 확인", { timeout: 20_000 });
  await expect(page.getByTestId("user-feedback-body")).toHaveValue(글);
  // 새로고침해도 초안이 남는다.
  await page.reload();
  await expect(page.getByTestId("user-feedback-body")).toHaveValue(글, { timeout: 20_000 });
});

test("하루 5건을 넘기면 안내하고 글을 지우지 않는다", async ({ page }) => {
  test.setTimeout(120_000);
  const email = freshEmail("limit");
  await 가입(page, email, "상한시험");
  메일확인(email);
  await page.goto("/profile/feedback");
  for (let i = 1; i <= 5; i++) {
    await page.getByTestId("user-feedback-body").fill(`의견 ${i}번`);
    await page.getByTestId("user-feedback-submit").click();
    await expect(page.getByTestId("user-feedback-sent")).toBeVisible({ timeout: 20_000 });
  }
  const 글 = "여섯 번째 의견";
  await page.getByTestId("user-feedback-body").fill(글);
  await page.getByTestId("user-feedback-submit").click();
  await expect(page.getByTestId("user-feedback-error")).toContainText("하루 5건", { timeout: 20_000 });
  await expect(page.getByTestId("user-feedback-body")).toHaveValue(글);
});

test("비로그인은 로그인 안내를 보고, 로그인하면 의견 화면으로 돌아오며 로그아웃 전 초안은 지워져 있다", async ({
  page,
}) => {
  const email = freshEmail("back");
  await 가입(page, email, "복귀시험");
  await page.goto("/profile/feedback");
  await page.getByTestId("user-feedback-body").fill("로그아웃 전에 쓴 글");
  await page.goto("/account");
  await page.getByTestId("btn-logout").click();
  await page
    .getByTestId("dialog-confirm")
    .click({ timeout: 3_000 })
    .catch(() => {});
  await expect(page.getByTestId("auth-email-input")).toBeVisible({ timeout: 20_000 });

  await page.goto("/profile/feedback");
  await expect(page.getByTestId("user-feedback-login")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("user-feedback-login-link").click();
  await expect(page).toHaveURL(/next=/);
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("btn-auth-submit").click();
  await expect(page).toHaveURL(/\/profile\/feedback$/, { timeout: 20_000 });
  // [원본] 로그아웃 전 글이 그대로 돌아왔다 — 같은 기기의 다른 계정에게 보여 로그아웃 때 지운다(REV-044)
  await expect(page.getByTestId("user-feedback-body")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("user-feedback-body")).toHaveValue("");
});

test("외부 주소로는 돌아가지 않는다", async ({ page }) => {
  await 가입(page, freshEmail("open"), "리다이렉트");
  await page.goto("/account?next=https://example.com/");
  await page.waitForTimeout(1_000);
  await expect(page).toHaveURL(/\/account/);
});
