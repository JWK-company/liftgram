// 앱에 운영 기능이 남지 않았는가(SPEC-033 Phase 5)
//
// 관리자 계정으로 봐도 앱에는 운영 입구가 없다. 옛 주소는 운영 웹으로 넘기거나(ADMIN_URL 이 있을 때) 없는 주소가 된다.
// 역할은 화면으로 줄 수 없어 테스트 DB 를 직접 고친다. E2E_PSQL_URL 이 없으면 관리자 시험을 건너뛴다.
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const URL_ = process.env.E2E_PSQL_URL;

test("관리자 계정도 프로필에 운영 입구가 없다", async ({ page }) => {
  test.skip(!URL_, "E2E_PSQL_URL 이 없다 — 역할을 줄 테스트 DB 가 필요하다");
  const email = `e2e-boundary-${Date.now()}@example.com`;
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill("경계시험");
  await page.getByTestId("age-confirm").check();
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  execFileSync("psql", [URL_ as string, "-tAc", `update users set role = 'admin' where email = '${email}'`]);
  // 새로고침 때 토큰이 갱신되며 서버가 DB 역할을 다시 읽는다
  await page.goto("/profile");
  await page.reload();
  await expect(page.getByTestId("account-card")).toBeVisible({ timeout: 20_000 });
  for (const id of [
    "row-admin",
    "row-ops",
    "btn-moderation",
    "row-feedback",
    "row-feedback-inbox",
    "nav-staff",
  ]) {
    await expect(page.getByTestId(id)).toHaveCount(0);
  }
  // 사용자 기능인 의견 보내기는 남는다.
  await expect(page.getByTestId("row-user-feedback")).toBeVisible();
  await expect(page.getByTestId("nav-profile-ops-dot")).toHaveCount(0);
});

for (const path of [
  "/admin",
  "/admin/stats",
  "/admin/feedback",
  "/staff",
  "/feedback",
  "/moderation",
  "/ops",
]) {
  test(`옛 주소 ${path} 는 앱 화면을 주지 않는다`, async ({ request }) => {
    const res = await request.get(path, { maxRedirects: 0 });
    expect([307, 404]).toContain(res.status());
    if (res.status() === 307) expect(res.headers().location).toMatch(/^https?:\/\//);
  });
}

const post = (request: import("@playwright/test").APIRequestContext, path: string) =>
  request.post(`/api/${path}`, { headers: { "content-type": "application/json" }, data: {} });

for (const path of [
  "admin.v1.AdminService/GetSignupStats",
  "ADMIN.V1.ADMINSERVICE/GetSignupStats",
  "admin.v1.AdminService%2FGetSignupStats",
  "ops.v1.OpsService/GetOpsStatus",
  "moderation.v1.ModerationService/ListQueue",
  "moderation.v1.ModerationService/Resolve",
  "feedback.v1.FeedbackService/ListEntries",
  "feedback.v1.FeedbackService/SetStatus",
]) {
  test(`앱 프록시는 운영 RPC ${path} 를 넘기지 않는다`, async ({ request }) => {
    expect((await post(request, path)).status()).toBe(404);
  });
}

for (const path of [
  "moderation.v1.ModerationService/Report",
  "feedback.v1.FeedbackService/SubmitUserFeedback",
  "ops.v1.OpsService/ReportClientHealth",
]) {
  test(`사용자 기능 RPC ${path} 는 그대로 서버에 닿는다`, async ({ request }) => {
    // 빈 본문이라 검증 또는 로그인에서 거절된다. 프록시가 막으면 404 다.
    expect([400, 401]).toContain((await post(request, path)).status());
  });
}
