// 화면 지도 보고서 캡처 — 6단계: 11-09 바뀐 화면(루틴 미리보기 · 첫 안내 · 「이전」 칩이 산 운동 중). SHOTS=<폴더> BASE=…
import { expect, test, type Page } from "@playwright/test";
import { 마치기, 빠른_운동_시작, 세트_기록, 안내_띠_닫기, 종목_추가 } from "./helpers/opengym";

const OUT = process.env.SHOTS as string;
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, locale: "ko-KR" });
const f = (id: string) => id.replace(/[^\w.-]/g, "_");
async function shot(page: Page, id: string, full = true) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${f(id)}.jpg`, type: "jpeg", quality: 72, fullPage: full });
}

test("11-09 보충", async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });
  // 첫 운동 — 지난 기록을 만든다
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 세트_기록(page, 0, 0, 60, 8);
  await 마치기(page);
  // 루틴 하나
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("routine-name").fill("가슴 A");
  await page.getByTestId("routine-name").blur();
  for (const [i, q] of ["바벨 벤치프레스", "바벨 스쿼트", "데드리프트"].entries()) {
    await page.getByTestId("btn-add-routine-exercise").click();
    await page.getByTestId("picker-search").fill(q);
    await page.getByTestId("picker-list").locator("button").first().click();
    await page.getByTestId("picker-confirm").click();
    await expect(page.getByTestId("routine-exercises").locator("> div")).toHaveCount(i + 1, { timeout: 10_000 });
  }
  await page.getByTestId("btn-routine-done").click();
  await expect(page.getByTestId("routine-list")).toContainText("가슴 A", { timeout: 10_000 });
  await 안내_띠_닫기(page).catch(() => {});
  await page.getByTestId("open-routine-preview").first().click();
  await expect(page.getByTestId("routine-preview")).toBeVisible();
  await shot(page, "s.routinepreview", false);
  await page.keyboard.press("Escape");
  // 두 번째 운동 — 「이전」 칩이 살아 있는 운동 중 화면 + 첫 안내
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await page.evaluate(() => localStorage.removeItem("liftgram.hint.suppressed"));
  await page.reload();
  await expect(page.getByTestId("hint-prev")).toBeVisible({ timeout: 15_000 });
  await shot(page, "h.prev", false);
  await page.getByTestId("hint-prev-ok").click();
  await 세트_기록(page, 0, 0, 62.5, 8);
});
