// 의견 보내기와 피드백 모아 보기 e2e(SPEC-032) — 역할은 테스트 DB 를 직접 고친다.
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

async function 역할(page: Page, email: string, role: string) {
  sql(`update users set role = '${role}' where email = '${email}'`);
  // 새로고침 때 토큰이 갱신되며 서버가 DB 역할을 다시 읽는다
  await page.goto("/profile");
  await page.reload();
  await expect(page.getByTestId("row-user-feedback")).toBeVisible({ timeout: 20_000 });
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

  // 일반 사용자는 운영 피드백 화면과 모아 보기에 못 들어간다.
  await page.goto("/feedback");
  await expect(page.getByTestId("feedback-gate")).toContainText("접근 권한이 없어요", { timeout: 20_000 });
  await page.goto("/admin/feedback");
  await expect(page.getByTestId("admin-feedback-denied")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("admin-feedback-list")).toHaveCount(0);
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

test("관리자는 상태를 바꾸고 협업자는 보기만 한다 · 작성자 이름은 관리자에게만", async ({ browser }) => {
  test.setTimeout(180_000);
  const 글 = `상태 시험 글 <b>${Date.now()}</b>`;

  const userCtx = await browser.newContext();
  const userPage = await userCtx.newPage();
  const userEmail = freshEmail("author");
  await 가입(userPage, userEmail, "의견작성자");
  메일확인(userEmail);
  await userPage.goto("/profile/feedback");
  await userPage.getByTestId("user-feedback-body").fill(글);
  await userPage.getByTestId("user-feedback-submit").click();
  await expect(userPage.getByTestId("user-feedback-sent")).toBeVisible({ timeout: 20_000 });
  await userCtx.close();

  // 협업자 — 보이지만 이름도 버튼도 없다. 운영 칸에는 사용자 의견이 없다.
  const coCtx = await browser.newContext();
  const co = await coCtx.newPage();
  const coEmail = freshEmail("co");
  await 가입(co, coEmail, "협업자");
  await 역할(co, coEmail, "coworker");
  await co.goto("/admin/feedback");
  const coItem = co.getByTestId("admin-feedback-item").filter({ hasText: 글 });
  await expect(coItem).toBeVisible({ timeout: 20_000 });
  await expect(coItem).not.toContainText("의견작성자");
  await expect(coItem.getByTestId("admin-feedback-approve")).toHaveCount(0);
  await co.getByTestId("admin-feedback-tab-ops").click();
  await expect(co.getByTestId("admin-feedback-item").filter({ hasText: 글 })).toHaveCount(0);

  // 역할을 회수하면 토큰이 살아 있어도 다음 호출부터 막힌다.
  sql(`update users set role = 'user' where email = '${coEmail}'`);
  await co.getByTestId("admin-feedback-tab-user").click();
  await expect(co.getByTestId("admin-feedback-state")).toContainText("다시", { timeout: 20_000 });
  await expect(co.getByTestId("admin-feedback-item")).toHaveCount(0);
  await coCtx.close();

  // 관리자 — 이름이 보이고, 승인 → 완료. 본문은 글자 그대로다.
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  const adminEmail = freshEmail("admin");
  await 가입(admin, adminEmail, "관리자");
  await 역할(admin, adminEmail, "admin");
  await admin.getByTestId("row-admin").click();
  await admin.getByTestId("row-feedback-inbox").click();
  const item = admin.getByTestId("admin-feedback-item").filter({ hasText: 글 });
  await expect(item).toBeVisible({ timeout: 20_000 });
  await expect(item).toContainText("의견작성자");
  await item.getByTestId("admin-feedback-note").fill("이렇게 고친다");
  await item.getByTestId("admin-feedback-approve").click();
  await expect(item).toHaveAttribute("data-status", "승인", { timeout: 20_000 });
  await expect(item).toContainText("이렇게 고친다");
  const row = sql(
    `select status, length(approved_body_sha256), approved_instruction from feedback_items where body = '${글}'`,
  );
  expect(row).toBe("approved|64|이렇게 고친다");
  await item.getByTestId("admin-feedback-done").click();
  await expect(item).toHaveAttribute("data-status", "완료", { timeout: 20_000 });
  await expect(item.getByTestId("admin-feedback-reopen")).toHaveCount(0);
  expect(
    sql(
      `select count(*) from feedback_events e join feedback_items f on f.id = e.item_id where f.body = '${글}'`,
    ),
  ).toBe("2");
  await adminCtx.close();
});
