// 광고 자리 e2e(SPEC-022) — 기본은 요소 0개 · 관리자 미리 보기로 자리 확인 · 운동을 시작하면 사라진다.
//
// 관리자 역할을 테스트 DB 에 직접 줘야 한다. 이 시험의 건너뜀은 「지켜지지 않음」이므로 실행 기록에 건너뜀 0건을 남긴다.
//   E2E_PSQL_URL=postgres://app@127.0.0.1:55470/app BASE=http://127.0.0.1:3220 bunx playwright test e2e/ad-slots.spec.ts
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;
const URL_ = process.env.E2E_PSQL_URL;

test.skip(!URL_, "E2E_PSQL_URL 이 없다 — 관리자 역할을 줄 테스트 DB 가 필요하다");

async function 가입(page: Page, tag: string, role: string) {
  const email = `e2e-ad-${tag}-${Date.now()}@example.com`;
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill(`광고시험${tag}`);
  await page.getByTestId("age-confirm").check();
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  execFileSync("psql", [
    URL_ as string,
    "-tAc",
    `update users set role = '${role}' where email = '${email}'`,
  ]);
  await page.goto("/profile");
  await page.reload();
  await expect(page.getByTestId("btn-blocked")).toBeVisible({ timeout: 20_000 });
}

async function 글쓰기(page: Page, caption: string) {
  await page.goto("/feed");
  await page.getByTestId("feed-compose").click();
  await page.getByTestId("feed-caption").fill(caption);
  await page.getByTestId("feed-post").click();
  await expect(page.getByTestId("feed-list")).toContainText(caption, { timeout: 20_000 });
}

async function 세트_하나_완료(page: Page) {
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 스쿼트");
  // 세션 화면에는 슬롯을 두지 않는다 — 가드 시험이 아니라 넣지 않았는지 보는 회귀 방지
  await expect(page.locator("[data-ad-slot]")).toHaveCount(0);
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  await expect(page.getByTestId("exercise-picker")).toHaveCount(0);
  const row = page
    .getByTestId("workout-exercises")
    .locator("> div")
    .first()
    .getByTestId("set-list")
    .locator("> div")
    .first();
  await row.getByTestId("set-weight").fill("100");
  await row.getByTestId("set-reps").fill("5");
  await row.getByTestId("set-done").click();
}

test("기본 상태 — 관리자여도 미리 보기를 켜기 전에는 광고 요소가 없다", async ({ page }) => {
  await 가입(page, "off", "admin");
  await page.goto("/");
  await expect(page.getByTestId("home-ready")).toBeAttached({ timeout: 20_000 });
  await page.waitForTimeout(500);
  await expect(page.locator("[data-ad-slot]")).toHaveCount(0);
});

test("일반 사용자 — 저장 값을 넣어도 슬롯이 그려지지 않는다", async ({ page }) => {
  await 가입(page, "plain", "user");
  await page.evaluate(() => localStorage.setItem("liftgram.adPreview", "1"));
  await page.goto("/");
  await expect(page.getByTestId("home-ready")).toBeAttached({ timeout: 20_000 });
  await page.waitForTimeout(500);
  await expect(page.locator("[data-ad-slot]")).toHaveCount(0);
});

test("미리 보기 — 자리가 보이고, 운동을 시작하면 전부 사라지고, 완료 요약에 다시 나온다", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await 가입(page, "admin", "admin");
  await page.goto("/admin");
  await expect(page.getByTestId("row-ad-preview")).toContainText("꺼짐", { timeout: 20_000 });
  await page.getByTestId("row-ad-preview").click();
  await expect(page.getByTestId("row-ad-preview")).toContainText("켜짐");

  // 먼저 보이는 것을 확인한다
  await page.goto("/");
  await expect(page.getByTestId("ad-slot-home")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("ad-slot-home")).toContainText("광고");
  await page.getByTestId("ad-slot-home").scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("ad-home.png") });
  await page.goto("/exercise/seed-seated-cable-row");
  await expect(page.getByTestId("ad-slot-exercise")).toBeVisible({ timeout: 20_000 });
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });

  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await expect(page.getByTestId("btn-add-exercise")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-ad-slot]")).toHaveCount(0);
  await 세트_하나_완료(page);
  // 휴식 중에도 세션 화면에는 슬롯이 없다
  await expect(page.locator("[data-ad-slot]")).toHaveCount(0);

  await page.getByTestId("btn-close-session").click();
  await expect(page.getByTestId("global-workout-bar")).toBeVisible({ timeout: 20_000 });

  // 끝내면 완료 요약에 자리가 생긴다
  await page.getByTestId("global-workout-bar").click();
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 20_000 });
  for (const id of ["btn-finish-dont-save", "btn-finish-today"]) {
    const b = page.getByTestId(id);
    if (await b.isVisible()) await b.click();
  }
  await expect(page.getByTestId("ad-slot-summary")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("ad-slot-summary").scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("ad-summary.png") });
  await page.getByTestId("btn-summary-close").click();

  // 기록이 생긴 뒤 기록·통계 끝에도 있다
  await page.goto("/history");
  await expect(page.getByTestId("ad-slot-history")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("ad-slot-history").scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("ad-history.png") });
  await page.goto("/stats");
  await expect(page.getByTestId("ad-slot-stats")).toBeVisible({ timeout: 20_000 });

  // 피드 — 글 5개까지 없고, 6개면 그 뒤에 1개
  for (let i = 1; i <= 5; i++) await 글쓰기(page, `광고시험글${i}`);
  await page.waitForTimeout(500);
  await expect(page.getByTestId("ad-slot-feed")).toHaveCount(0);
  await 글쓰기(page, "광고시험글6");
  await expect(page.getByTestId("ad-slot-feed")).toHaveCount(1, { timeout: 20_000 });
  const before = await page.getByTestId("ad-slot-feed").evaluate((el) => {
    let n = 0;
    for (let x = el.previousElementSibling; x; x = x.previousElementSibling) {
      if (x.textContent?.includes("광고시험글")) n++;
    }
    return n;
  });
  expect(before).toBe(6);

  // 두 번째 운동 — 기록이 있어 평소 슬롯이 보이는 화면들이 운동 중에는 비어 있어야 한다.
  // 탭 이동은 문서를 새로 받지 않으므로, 슬롯이 한 번이라도 생겼는지 관찰자로 함께 잰다(깜빡임 포함).
  await page.goto("/");
  await expect(page.getByTestId("ad-slot-home")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await expect(page.getByTestId("btn-add-exercise")).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    const w = window as unknown as { __adSeen: number };
    w.__adSeen = 0;
    new MutationObserver(() => {
      if (document.querySelector("[data-ad-slot]")) w.__adSeen++;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.getByTestId("btn-close-session").click();
  await expect(page.getByTestId("global-workout-bar")).toBeVisible({ timeout: 20_000 });
  for (const [nav, content] of [
    ["nav-history", "history-list"],
    ["nav-stats", "stats-period"],
    ["nav-feed", "feed-list"],
  ]) {
    await page.getByTestId(nav).click();
    await expect(page.getByTestId(content)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(300);
    await expect(page.locator("[data-ad-slot]")).toHaveCount(0);
  }
  expect(await page.evaluate(() => (window as unknown as { __adSeen: number }).__adSeen)).toBe(0);
  await page.goto("/exercise/seed-seated-cable-row");
  await expect(page.getByTestId("exercise-back")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
  await expect(page.locator("[data-ad-slot]")).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByTestId("global-workout-bar")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-ad-slot]")).toHaveCount(0);
  await page.getByTestId("global-workout-bar").click();
  // 운동을 버려 첫 상태로 돌아간다
  await page.getByTestId("btn-close-session").click();
  await page.getByTestId("global-workout-cancel").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("global-workout-bar")).toHaveCount(0, { timeout: 20_000 });

  // 미리 보기를 끄면 다시 0개
  await page.goto("/admin");
  await page.getByTestId("row-ad-preview").click();
  await expect(page.getByTestId("row-ad-preview")).toContainText("꺼짐");
  await page.goto("/");
  await expect(page.getByTestId("home-ready")).toBeAttached({ timeout: 20_000 });
  await page.waitForTimeout(500);
  await expect(page.locator("[data-ad-slot]")).toHaveCount(0);
});
