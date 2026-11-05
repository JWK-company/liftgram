// @plm SRS-088 SRS-087  기기 건강 보고 e2e — 동기가 3번 실패한 기기가 서버에 곧바로 보고하는가
//
// 운영 화면에 보이는지는 운영 웹 시험(src/admin/e2e/ops.spec.ts)이 본다(SPEC-033).
// 서버 줄을 읽어야 해서 테스트 DB 가 필요하다. E2E_DB 가 없으면 건너뛴다.
//   E2E_DB=<새 DB 주소> BASE=http://127.0.0.1:3200 bunx playwright test -c frontend/playwright.config.ts e2e/ops-status.spec.ts
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

const PW = "hunter22!";
const SYNC_ROUTE = "**/api/sync.v1.SyncService/**";
const DB = process.env.E2E_DB;

/** 테스트 DB 에 SQL 한 줄(결과 문자열). 값은 이 파일이 만든 것만 넣는다(따옴표는 두 겹으로). */
function sql(q: string): string {
  if (!DB) throw new Error("E2E_DB 없음");
  return execFileSync("psql", [DB, "-tAc", q], {
    encoding: "utf8",
  }).trim();
}
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

function freshEmail(tag: string): string {
  return `e2e-ops-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

async function 운동하고_마치기(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click(); // 전체 화면 피커 — 골라서 「N개 추가」(SRS-093)
  await expect(page.getByTestId("workout-exercises")).toContainText("벤치프레스", { timeout: 20_000 });
  await page.getByTestId("set-weight").first().fill("60");
  await page.getByTestId("set-reps").first().fill("10");
  await page.getByTestId("set-done").first().click();
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 20_000 });
  for (const id of ["btn-finish-dont-save", "btn-finish-today"]) {
    const b = page.getByTestId(id);
    if (await b.isVisible()) await b.click();
  }
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

test.describe("기기 건강 보고", () => {
  test.skip(!DB, "E2E_DB 없음 — 서버 줄을 테스트 DB 에서 읽어야 한다(파일 머리말)");

  test("동기가 3번 실패하면 기기가 곧바로 보고하고, 기기 id 는 해시만 간다", async ({ browser }) => {
    test.setTimeout(180_000);
    // 동기를 막고 운동 → 3번 실패
    const stuckName = `멈춘이${Date.now().toString(36)}`;
    const stuckEmail = freshEmail("stuck");
    const ctxB = await browser.newContext();
    const b = await ctxB.newPage();
    await 가입(b, stuckEmail, stuckName);
    await b.route(SYNC_ROUTE, (r) => r.fulfill({ status: 500, body: "e2e: sync blocked" }));
    await 운동하고_마치기(b);
    await b.goto("/account");
    for (let i = 0; i < 3; i++) {
      await b.getByTestId("btn-sync-now").click();
      await expect(b.getByTestId("sync-status")).not.toHaveText("동기 중…", { timeout: 20_000 });
    }
    await expect(b.getByTestId("sync-pending")).toContainText("서버에 아직 안 올라간 기록");
    // 3회 문턱은 쓰로틀 없이 곧바로 보고된다(qa spec H-1) — 서버 줄로 확인한다.
    await expect
      .poll(
        () =>
          Number(
            sql(
              `select coalesce(max(h.consecutive_failures), 0) from client_health h join users u on u.id = h.user_id where u.email = ${lit(stuckEmail)}`,
            ),
          ),
        { timeout: 20_000 },
      )
      .toBeGreaterThanOrEqual(3);
    // 기기 id 는 해시 16자로 간다(원래 id 를 싣지 않는다 · qa spec L-6)
    expect(
      sql(
        `select h.device_id from client_health h join users u on u.id = h.user_id where u.email = ${lit(stuckEmail)} limit 1`,
      ),
    ).toMatch(/^[0-9a-f]{16}$/);
    await ctxB.close();
  });
});
