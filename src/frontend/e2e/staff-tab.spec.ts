// 운영 탭 e2e(#T2) — 역할마다 탭과 줄이 맞게 보이는가 · 프로필에서 운영 줄이 빠졌는가
//
// 역할은 화면으로 줄 수 없어 테스트 DB 를 직접 고친다. E2E_PSQL_URL 이 없으면 건너뛴다.
//   E2E_PSQL_URL=postgres://app@127.0.0.1:55470/app BASE=http://127.0.0.1:3220 bunx playwright test e2e/staff-tab.spec.ts
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const URL_ = process.env.E2E_PSQL_URL;

test.skip(!URL_, "E2E_PSQL_URL 이 없다 — 역할을 줄 테스트 DB 가 필요하다");

function setRole(email: string, role: string) {
  execFileSync("psql", [
    URL_ as string,
    "-tAc",
    `update users set role = '${role}' where email = '${email}'`,
  ]);
}

const CASES = [
  { role: "user", tab: false, feedback: false, moderation: false, ops: false },
  { role: "coworker", tab: true, feedback: true, moderation: false, ops: false },
  { role: "moderator", tab: true, feedback: false, moderation: true, ops: false },
  { role: "admin", tab: true, feedback: true, moderation: true, ops: true },
] as const;

for (const c of CASES) {
  test(`${c.role} — 운영 탭 ${c.tab ? "보임" : "없음"}`, async ({ page }) => {
    const email = `e2e-staff-${c.role}-${Date.now()}@example.com`;
    await page.goto("/account");
    await page.getByTestId("mode-signup").click();
    await page.getByTestId("auth-email-input").fill(email);
    await page.getByTestId("auth-password-input").fill("hunter22!");
    await page.getByTestId("auth-name-input").fill(`운영시험${c.role}`);
    await page.getByTestId("age-confirm").check();
    await page.getByTestId("btn-auth-submit").click();
    await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
    setRole(email, c.role);

    // 새로고침 때 토큰이 갱신되며 서버가 DB 역할을 다시 읽는다
    await page.goto("/profile");
    await page.reload();
    await expect(page.getByTestId("btn-blocked")).toBeVisible({ timeout: 20_000 });

    if (!c.tab) {
      await expect(page.getByTestId("nav-staff")).toHaveCount(0);
      await page.goto("/staff");
      await expect(page.getByTestId("staff-denied")).toBeVisible({ timeout: 20_000 });
      return;
    }
    await expect(page.getByTestId("nav-staff")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("nav-feedback")).toHaveCount(0);
    // 프로필에는 운영 줄이 없다 — 탭이 뜬 뒤(역할을 받은 뒤)에 본다
    await expect(page.getByTestId("row-ops")).toHaveCount(0);
    await expect(page.getByTestId("btn-moderation")).toHaveCount(0);
    await page.getByTestId("nav-staff").click();
    await expect(page.getByTestId("staff-screen")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("nav-staff")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("nav-profile")).not.toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("row-feedback")).toHaveCount(c.feedback ? 1 : 0);
    await expect(page.getByTestId("btn-moderation")).toHaveCount(c.moderation ? 1 : 0);
    await expect(page.getByTestId("row-ops")).toHaveCount(c.ops ? 1 : 0);

    // 각 화면에서도 운영 탭이 켜져 있고, 뒤로 가면 운영 탭 첫 화면이다
    const rows = [
      ...(c.feedback ? [["row-feedback", "feedback-back"]] : []),
      ...(c.moderation ? [["btn-moderation", "mod-back"]] : []),
      ...(c.ops ? [["row-ops", "ops-back"]] : []),
    ];
    for (const [row, back] of rows) {
      await page.getByTestId(row).click();
      await expect(page.getByTestId(back)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("nav-staff")).toHaveAttribute("aria-current", "page");
      await expect(page.getByTestId("nav-profile")).not.toHaveAttribute("aria-current", "page");
      await page.getByTestId(back).click();
      await expect(page.getByTestId("staff-screen")).toBeVisible({ timeout: 20_000 });
    }
  });
}
