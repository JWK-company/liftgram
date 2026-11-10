// 화면 지도 보고서 캡처 — 20단계(11-10): v0.95.0 화면 덜어내기(SPEC-055)
//   /workout 머리 「취소」·세트 줄 「여유」 칸 · s.discard 확인창 「계속하기」 · s.rename 이름 누르기 · s.pr 무게 PR 축하 · /calendar 머리 자랑하기
// 실행: SHOTS=<폴더> BASE=… npx playwright test e2e/zz-screen-map20.spec.ts
import { expect, test, type Page } from "@playwright/test";
import { 빠른_운동_시작, 세트_기록, 안내_띠_닫기, 카탈로그_준비, 종목_추가, 마치기 } from "./fixtures/declutter-seed";

const OUT = process.env.SHOTS as string;
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, locale: "ko-KR" });
async function shot(page: Page, name: string) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name.replace(/[^\w.-]/g, "_")}.jpg`, type: "jpeg", quality: 72 });
}

test("20단계 — 화면 덜어내기", async ({ page }) => {
  test.setTimeout(300_000);
  await 카탈로그_준비(page);

  // 지난 기록 하나(벤치 60×8)
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 안내_띠_닫기(page);
  await 세트_기록(page, 0, 0, 60, 8);
  await 마치기(page);

  // /calendar 머리 「이번 달 자랑하기」
  await page.goto("/calendar");
  await expect(page.getByTestId("btn-brag-month")).toBeVisible({ timeout: 20_000 });
  await shot(page, "/calendar");

  // 두 번째 운동 — 62.5×8 → 무게 PR 축하(s.pr)
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 안내_띠_닫기(page);
  await 세트_기록(page, 0, 0, 62.5, 8);
  await expect(page.getByTestId("pr-celebration")).toBeVisible({ timeout: 8_000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/s.pr.jpg`, type: "jpeg", quality: 72 });
  await expect(page.getByTestId("pr-celebration")).toHaveCount(0, { timeout: 8_000 });

  // 여유 칸 — 1세트 +2 · 2세트 기록 뒤 4+
  await page.locator('button[data-testid^="set-spare-"]').first().click();
  await page.locator('button[data-testid^="set-spare-"]').first().click();
  await page.locator('button[data-testid^="set-spare-"]').first().click(); // 비움→0→+1→+2
  await page.getByTestId("btn-add-set").first().click();
  await 세트_기록(page, 0, 1, 62.5, 7);
  for (let i = 0; i < 5; i++) await page.locator('button[data-testid^="set-spare-"]').nth(1).click(); // →4+
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "/workout");

  // s.rename 이름 누르기
  await page.getByTestId("workout-name").click();
  await expect(page.getByTestId("rename-input")).toBeVisible();
  await shot(page, "s.rename");
  await page.keyboard.press("Escape");

  // s.discard 머리 「취소」 → 확인창
  await page.getByTestId("btn-discard").click();
  await expect(page.getByTestId("confirm-discard")).toBeVisible();
  await shot(page, "s.discard");
  await page.getByTestId("confirm-discard").getByTestId("dialog-cancel").click();
});
