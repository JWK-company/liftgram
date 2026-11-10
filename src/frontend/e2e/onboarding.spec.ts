// 첫 실행 안내 e2e
//
// [개선] SPEC-055 Phase 2(S-54) — 첫 실행 온보딩을 띄우지 않는다. 아래 [원본] 시험은 막고, 「안 뜬다」만 본다.
//        경력은 프로필에서 고른다 · 온보딩 표시 없이도 첫 안내가 뜨는 것은 declutter-055.spec.ts 가 본다.
//
//
// 다른 테스트는 이 안내를 **이미 본 상태**로 시작한다(playwright.config.ts).
// 여기서만 그 표시를 지우고, 처음 여는 사람이 보는 것을 확인한다:
//   · 두 장으로 넘어간다
//   · **아무것도 답하지 않아도 끝난다**(건너뛰기)
//   · 한 번 닫으면 다시 뜨지 않는다
//   · 답한 경력은 프로필에 남는다([원본] 경력·의향 — SPEC-052 에서 트레이너 질문을 없앴다)
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

/** "본 적 있음" 표시를 지운다 — 처음 여는 사람과 같은 상태로 만든다. */
async function 처음처럼(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("onboarding_seen_v1"));
  await page.reload();
}

// [원본] 아래 두 시험 — 온보딩이 뜨고 넘기는 흐름(SPEC-055 에서 온보딩을 없앴다)
// test("처음 열면 안내가 뜨고, 건너뛰어도 아무것도 막히지 않는다", async ({ page }) => {
//   await 처음처럼(page);
//
//   await expect(page.getByTestId("onboarding")).toBeVisible({ timeout: 20_000 });
//   await expect(page.getByTestId("onboarding")).toContainText("Liftgram에 오신 걸 환영해요");
//
//   // 둘째 장 — 경력·의향은 **선택**이다.
//   await page.getByTestId("onboarding-next").click();
//   await expect(page.getByTestId("onboarding")).toContainText("운동 경력을 알려주세요");
//   await page.getByTestId("onboarding-skip").click();
//   await expect(page.getByTestId("onboarding")).toHaveCount(0);
//
//   // 안내를 닫으면 앱이 그대로 쓰인다(로그인도, 답변도 필요 없다).
//   await expect(page.getByTestId("btn-new-routine")).toBeVisible({ timeout: 20_000 });
//
//   // 다시 열어도 뜨지 않는다.
//   await page.reload();
//   await expect(page.getByTestId("onboarding")).toHaveCount(0);
// });
//
// // [원본] test("답한 경력·의향은 프로필에 남는다") — onboarding-intent 를 눌러 켰다
// // [개선] SPEC-052 — 트레이너·코치 질문이 없다. 경력만 남고, 코치 찾기 노출은 꺼진 그대로.
// test("답한 경력은 프로필에 남는다 · 트레이너 질문은 없다", async ({ page }) => {
//   test.setTimeout(120_000);
//   await 처음처럼(page);
//
//   await page.getByTestId("onboarding-next").click();
//   await page.getByTestId("onboarding-level-intermediate").click();
//   await expect(page.getByTestId("onboarding-intent")).toHaveCount(0);
//   await page.getByTestId("onboarding-done").click();
//   await expect(page.getByTestId("onboarding")).toHaveCount(0);
//
//   await page.goto("/profile");
//   await page.getByTestId("btn-edit-experience").click();
//   await expect(page.getByTestId("level-intermediate")).toHaveAttribute("aria-pressed", "true", {
//     timeout: 20_000,
//   });
//   // [원본] toHaveAttribute("aria-pressed", "true")
//   await expect(page.getByTestId("trainer-intent")).toHaveAttribute("aria-pressed", "false");
// });

// [개선] 처음 여는 사람에게도 온보딩이 뜨지 않는다 · 앱이 그대로 쓰인다 · 경력은 프로필에서 고른다
test("처음 열어도 온보딩이 뜨지 않는다 — 경력은 프로필에서", async ({ page }) => {
  test.setTimeout(120_000);
  await 처음처럼(page);
  await expect(page.getByTestId("btn-new-routine")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_000);
  await expect(page.getByTestId("onboarding")).toHaveCount(0);

  await page.goto("/profile");
  await page.getByTestId("btn-edit-experience").click();
  await page.getByTestId("level-intermediate").click();
  await expect(page.getByTestId("level-intermediate")).toHaveAttribute("aria-pressed", "true", {
    timeout: 20_000,
  });
});
