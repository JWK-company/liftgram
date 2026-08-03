// 첫 실행 안내 e2e
//
// 다른 테스트는 이 안내를 **이미 본 상태**로 시작한다(playwright.config.ts).
// 여기서만 그 표시를 지우고, 처음 여는 사람이 보는 것을 확인한다:
//   · 두 장으로 넘어간다
//   · **아무것도 답하지 않아도 끝난다**(건너뛰기)
//   · 한 번 닫으면 다시 뜨지 않는다
//   · 답한 경력·의향은 프로필에 남는다
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

/** "본 적 있음" 표시를 지운다 — 처음 여는 사람과 같은 상태로 만든다. */
async function 처음처럼(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("onboarding_seen_v1"));
  await page.reload();
}

test("처음 열면 안내가 뜨고, 건너뛰어도 아무것도 막히지 않는다", async ({ page }) => {
  await 처음처럼(page);

  await expect(page.getByTestId("onboarding")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("onboarding")).toContainText("Liftgram에 오신 걸 환영해요");

  // 둘째 장 — 경력·의향은 **선택**이다.
  await page.getByTestId("onboarding-next").click();
  await expect(page.getByTestId("onboarding")).toContainText("운동 경력을 알려주세요");
  await page.getByTestId("onboarding-skip").click();
  await expect(page.getByTestId("onboarding")).toHaveCount(0);

  // 안내를 닫으면 앱이 그대로 쓰인다(로그인도, 답변도 필요 없다).
  await expect(page.getByTestId("btn-new-routine")).toBeVisible({ timeout: 20_000 });

  // 다시 열어도 뜨지 않는다.
  await page.reload();
  await expect(page.getByTestId("onboarding")).toHaveCount(0);
});

test("답한 경력·의향은 프로필에 남는다", async ({ page }) => {
  test.setTimeout(120_000);
  await 처음처럼(page);

  await page.getByTestId("onboarding-next").click();
  await page.getByTestId("onboarding-level-intermediate").click();
  await page.getByTestId("onboarding-intent").click();
  await expect(page.getByTestId("onboarding-intent")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("onboarding-done").click();
  await expect(page.getByTestId("onboarding")).toHaveCount(0);

  await page.goto("/profile");
  await expect(page.getByTestId("level-intermediate")).toHaveAttribute("aria-pressed", "true", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("trainer-intent")).toHaveAttribute("aria-pressed", "true");
});
