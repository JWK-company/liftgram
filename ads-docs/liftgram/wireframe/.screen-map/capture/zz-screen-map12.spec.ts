// 화면 지도 보고서 캡처 — 12단계(11-09): v0.84.5·0.84.6 바뀐 화면 — S-23 대화방 입력줄 · S-25 알림(날짜·새/이전) ·
// S-104 루틴 편집 맨 아래 「루틴 삭제」 → S-107 · S-145 종목 고치기 「종목 삭제」 확인 · S-146 종목 상세 ✎. SHOTS=<폴더> BASE=…
import { expect, test, type Page } from "@playwright/test";
import { 가입, 새_기기, 새_메일, 준비 } from "./helpers/opengym";

const OUT = process.env.SHOTS as string;
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, locale: "ko-KR" });
async function shot(page: Page, name: string, full = false) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name.replace(/[^\w.-]/g, "_")}.jpg`, type: "jpeg", quality: 72, fullPage: full });
}

test("12단계", async ({ page, browser }) => {
  test.setTimeout(600_000);
  const a = 새_메일("a"), b = 새_메일("b");
  const an = `지은${Date.now().toString(36).slice(-4)}`, bn = `민수${Date.now().toString(36).slice(-4)}`;
  const [, pb] = await 새_기기(browser);
  await 가입(pb, b, bn); await 준비(pb);
  await 가입(page, a, an); await 준비(page);

  // b 가 a 를 팔로우하고 말을 건다 → a 의 알림·대화
  await pb.goto("/discover"); await pb.getByTestId("discover-query").fill(an);
  await expect(pb.getByTestId("discover-list")).toContainText(an, { timeout: 20_000 });
  await pb.getByTestId("discover-user").first().click();
  await pb.getByTestId("profile-follow").click();
  await expect(pb.getByTestId("profile-follow")).toHaveText("팔로잉", { timeout: 20_000 });
  await pb.getByTestId("profile-message").click();
  await pb.getByTestId("conv-input").fill("오늘 저녁에 같이 하체 하실래요?");
  await pb.getByTestId("conv-send").click(); await pb.waitForTimeout(1000);

  await page.goto("/notifications");
  await expect(page.getByTestId("notif-row").first()).toBeVisible({ timeout: 20_000 });
  await shot(page, "/notifications");
  await page.goto("/messages");
  await page.getByTestId("dm-row").first().click();
  await page.getByTestId("conv-input").fill("좋아요! 7시에 봬요");
  await page.getByTestId("conv-send").click(); await page.waitForTimeout(800);
  await page.getByTestId("conv-input").fill("스쿼트 먼저 하고\n레그프레스로 마무리해요");
  await shot(page, "/messages/[id]");

  // 종목 상세 ✎ (S-146)
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
  await page.goto("/exercise/seed-seated-cable-row");
  await expect(page.getByTestId("btn-rename-exercise")).toBeVisible({ timeout: 20_000 });
  await shot(page, "/exercise/[id]");

  // 내 종목 고치기 「종목 삭제」(S-145)
  await page.goto("/exercises");
  await page.getByTestId("btn-new-exercise").click();
  await page.getByTestId("form-name-ko").fill("내 케이블 머신 로우");
  await page.getByTestId("form-save").click();
  await expect(page).toHaveURL(/\/exercises$/, { timeout: 20_000 });
  await page.getByTestId("search-input").fill("내 케이블 머신");
  await page.getByTestId("exercise-list").locator("[data-testid^='edit-']").first().click();
  await expect(page.getByTestId("btn-delete-exercise")).toBeVisible({ timeout: 20_000 });
  await shot(page, "/exercises/[id]/edit");
  await page.getByTestId("btn-delete-exercise").click();
  await expect(page.getByTestId("confirm-delete-exercise")).toBeVisible();
  await shot(page, "s.exdel");
  await page.keyboard.press("Escape");

  // 루틴 편집 맨 아래 「루틴 삭제」(S-104) → 확인(S-107)
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await page.getByTestId("routine-name").fill("하체 A");
  await page.getByTestId("routine-name").blur();
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 백스쿼트");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  await expect(page.getByTestId("routine-exercises").locator("> div")).toHaveCount(1, { timeout: 20_000 });
  await page.getByTestId("btn-delete-routine").scrollIntoViewIfNeeded();
  await shot(page, "/routines/[id]");
  await page.getByTestId("btn-delete-routine").click();
  await expect(page.getByTestId("confirm-delete-routine")).toBeVisible();
  await shot(page, "s.rrm");
});
