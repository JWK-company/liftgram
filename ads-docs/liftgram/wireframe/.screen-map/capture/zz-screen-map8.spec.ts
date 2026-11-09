// 화면 지도 보고서 캡처 — 8단계: 글 보기(/feed/[postId]) · 댓글 시트(2026-11-09). 실행: SHOTS=<폴더> BASE=… npx playwright test e2e/zz-screen-map8.spec.ts
import { expect, test } from "@playwright/test";

const OUT = process.env.SHOTS as string;
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, locale: "ko-KR" });

test("글 보기", async ({ page }) => {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(`e2e-map8-${Date.now()}@example.com`);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill("화면지도");
  await page.getByTestId("age-confirm").check();
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  await page.goto("/feed?tab=following");
  await page.getByTestId("feed-compose").click();
  await page.getByTestId("feed-caption").fill("오늘 하체 끝! 스쿼트 5x5 #하체");
  await page.getByTestId("feed-post").click();
  await expect(page.getByTestId("feed-list")).toContainText("오늘 하체", { timeout: 20_000 });
  // [개선] 댓글은 바닥 시트 — 글 보기는 카드만, 💬 로 시트를 띄워 따로 찍는다
  const id = await page
    .locator('[data-testid="feed-list"] [data-testid="post-comments"]')
    .first()
    .getAttribute("data-post-id");
  await page.goto(`/feed/${id}`);
  await expect(page.getByTestId("post-view")).toContainText("오늘 하체", { timeout: 20_000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/_feed__postId_.jpg`, type: "jpeg", quality: 72, fullPage: true });
  await page.getByTestId("post-view").getByTestId("post-comments").click();
  await page.getByTestId("comment-input").fill("멋져요!");
  await page.getByTestId("comment-post").click();
  await expect(page.getByTestId("comment-row").first()).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("comment-reply").first().click();
  await page.getByTestId("comment-input").fill("고마워요");
  await page.getByTestId("comment-post").click();
  await expect(page.getByTestId("comments-list")).toContainText("고마워요", { timeout: 20_000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/s.comments.jpg`, type: "jpeg", quality: 72 });
});
