// 화면 지도 보고서 캡처 — 10단계(11-09): S-14 루틴 편집 종목 카드(변형 칩·휴식·무게 한 줄 · 안내 한 번). SHOTS=<폴더> BASE=…
import { expect, test, type Page } from "@playwright/test";

const OUT = process.env.SHOTS as string;
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, locale: "ko-KR" });

async function add(page: Page, q: string, n: number) {
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill(q);
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  await expect(page.getByTestId("routine-exercises").locator("> div")).toHaveCount(n, { timeout: 20_000 });
}

test("S-14", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("btn-add-routine-exercise")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("routine-name").fill("등 A");
  await page.getByTestId("routine-name").blur();
  await add(page, "풀업", 1);
  await add(page, "바벨 벤치프레스", 2);
  await page.getByTestId("set-table-hint").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/_routines__id_.jpg`, type: "jpeg", quality: 72 });
});
