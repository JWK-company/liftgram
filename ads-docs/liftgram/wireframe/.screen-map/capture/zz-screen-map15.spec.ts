// 화면 지도 캡처 15단계(11-10): 탭 순서 피드·운동·기록·분석·프로필 — 하단 탭바(g.tabbar)
import { expect, test } from "@playwright/test";
const OUT = process.env.SHOTS as string;
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, locale: "ko-KR" });
test("15단계 탭바", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("onboarding_seen_v1", "yes"));
  await page.goto("/history");
  await expect(page.locator('[data-testid="shell-nav"]:visible').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/g.tabbar.jpg`, type: "jpeg", quality: 72 });
});
