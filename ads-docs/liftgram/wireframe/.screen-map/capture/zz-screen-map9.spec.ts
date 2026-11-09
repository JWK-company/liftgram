// 화면 지도 보고서 캡처 — 9단계(11-09): S-13 새 루틴 첫 화면 · 운동 홈 주간 스케줄 「📅 편집」 · S-101 「취소하고 새로 시작」. SHOTS=<폴더> BASE=…
import { expect, test, type Page } from "@playwright/test";

const OUT = process.env.SHOTS as string;
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, locale: "ko-KR" });
async function shot(page: Page, name: string) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 72 });
}

test("S-13 · 홈 스케줄 · S-101", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("btn-add-routine-exercise")).toBeVisible({ timeout: 20_000 });
  await shot(page, "_routines_new");
  await page.getByTestId("routine-name").fill("가슴 A");
  await page.getByTestId("routine-name").blur();
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  await expect(page.getByTestId("routine-exercises").locator("> div")).toHaveCount(1, { timeout: 20_000 });
  await page.getByTestId("btn-routine-done").click();
  await expect(page.getByTestId("routine-list")).toContainText("가슴 A", { timeout: 20_000 });
  await page.getByTestId("entry-schedule").click();
  await expect(page.getByTestId("schedule-editor")).toBeVisible({ timeout: 20_000 });
  for (const d of ["mon", "wed", "fri"]) {
    await page.getByTestId(`schedule-day-${d}`).click();
    await page.getByTestId("schedule-day-picker").getByText("가슴 A").click();
  }
  await page.getByTestId("schedule-block-4").click();
  await page.getByTestId("schedule-save").click();
  await expect(page.getByTestId("schedule-editor")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId("btn-edit-schedule")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "_");
  // 운동 중에 루틴 시작 → 「진행 중인 운동이 있어요」
  await page.getByTestId("btn-quick-start").click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });
  await page.goto("/");
  await page.getByTestId("btn-start-routine").first().click({ timeout: 10_000 });
  await expect(page.getByTestId("active-exists")).toBeVisible({ timeout: 10_000 });
  await shot(page, "s.active");
});
