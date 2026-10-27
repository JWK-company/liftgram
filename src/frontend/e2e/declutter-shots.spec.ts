// 화면 정리 전후 캡처(사람이 보는 비교용) — 평소 e2e 에서는 건너뛴다.
// 실행: DECLUTTER_SHOTS=<저장 폴더> BASE=… npx playwright test e2e/declutter-shots.spec.ts
import { test } from "@playwright/test";
import {
  붐비는_운동_화면,
  안내_띠_닫기,
  요약_재료,
  지난_기록_채우기,
  카탈로그_준비,
} from "./fixtures/declutter-seed";

const OUT = process.env.DECLUTTER_SHOTS;

test.use({ deviceScaleFactor: 2 });

test("운동 블록 캡처 — 390 라이트·다크 · 360×640", async ({ page }) => {
  test.skip(!OUT, "DECLUTTER_SHOTS 가 없으면 건너뛴다");
  test.setTimeout(300_000);
  const shots: { name: string; w: number; h: number; scheme: "light" | "dark" }[] = [
    { name: "block-390-light", w: 390, h: 844, scheme: "light" },
    { name: "block-390-dark", w: 390, h: 844, scheme: "dark" },
    { name: "block-360x640", w: 360, h: 640, scheme: "light" },
  ];
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await 지난_기록_채우기(page);
  await 붐비는_운동_화면(page);
  for (const s of shots) {
    await page.setViewportSize({ width: s.w, height: s.h });
    await page.emulateMedia({ colorScheme: s.scheme });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${s.name}.png` });
  }
});

// P2 — 요약·기록 상세·분석. 화면 전체 길이로 찍는다(요약은 「끝까지」 가 얼마나 긴지가 비교 대상이다).
test("요약·기록 상세·분석 캡처 — 390 라이트·다크 · 360×640", async ({ page }) => {
  test.skip(!OUT, "DECLUTTER_SHOTS 가 없으면 건너뛴다");
  test.setTimeout(300_000);
  const shots: { w: number; h: number; scheme: "light" | "dark"; tag: string }[] = [
    { w: 390, h: 844, scheme: "light", tag: "390-light" },
    { w: 390, h: 844, scheme: "dark", tag: "390-dark" },
    { w: 360, h: 640, scheme: "light", tag: "360x640" },
  ];
  const snap = async (name: string) => {
    await 안내_띠_닫기(page); // 로그인 안 한 기기에만 뜨는 띠 — 실제 사용자는 보지 않는다
    for (const s of shots) {
      await page.setViewportSize({ width: s.w, height: s.h });
      await page.emulateMedia({ colorScheme: s.scheme });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${name}-${s.tag}.png`, fullPage: true });
    }
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await 요약_재료(page);
  await page.waitForTimeout(800);
  await snap("summary");
  // 화면 단위 캡처 — 전체 길이 캡처는 sticky 「완료」 바가 부가 행동 줄을 덮는다(P2 /qa code L-7).
  // 첫 종목의 「PR n」 을 펼친 채 끝까지 내린 실제 뷰포트를 남긴다.
  await page.getByTestId("summary-row-pr").first().click();
  for (const s of shots) {
    await page.setViewportSize({ width: s.w, height: s.h });
    await page.emulateMedia({ colorScheme: s.scheme });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/summary-end-${s.tag}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("btn-summary-close").click();
  await page.goto("/history");
  await page.getByTestId("history-list").locator("a").first().click();
  await page.getByTestId("detail-exercises").waitFor({ timeout: 20_000 });
  await snap("detail");
  await page.goto("/stats");
  await page.getByTestId("stat-volume").waitFor({ timeout: 20_000 });
  await snap("stats");
});

// P3 — 홈(진행 중)·피드 운동 카드·칸 시트. 피드는 내 글도 팔로잉 목록에 보인다(로그인 필요).
test("홈·피드·칸 시트 캡처 — 390 라이트·다크 · 360×640", async ({ page }) => {
  test.skip(!OUT, "DECLUTTER_SHOTS 가 없으면 건너뛴다");
  test.setTimeout(360_000);
  const shots: { w: number; h: number; scheme: "light" | "dark"; tag: string }[] = [
    { w: 390, h: 844, scheme: "light", tag: "390-light" },
    { w: 390, h: 844, scheme: "dark", tag: "390-dark" },
    { w: 360, h: 640, scheme: "light", tag: "360x640" },
  ];
  const snap = async (name: string, top = true) => {
    for (const s of shots) {
      await page.setViewportSize({ width: s.w, height: s.h });
      await page.emulateMedia({ colorScheme: s.scheme });
      if (top) await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${name}-${s.tag}.png` });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "light" });
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(`e2e-dcshots-${Date.now()}@example.com`);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill("정리캡처");
  await page.getByTestId("btn-auth-submit").click();
  await page.getByTestId("auth-email").waitFor({ timeout: 20_000 });
  await 카탈로그_준비(page);
  // 지난 기록 — 머신 체스트 프레스(테크노짐) + 벤치 → 공유
  await page.goto("/");
  await page.getByTestId("btn-quick-start").click();
  for (const [name, kg, reps] of [
    ["머신 체스트 프레스", 40, 10],
    ["바벨 벤치프레스", 60, 10],
  ] as const) {
    await page.getByTestId("btn-add-exercise").click();
    await page.getByTestId("picker-search").fill(name);
    await page.getByTestId("picker-list").locator("button").first().click();
    await page.getByTestId("exercise-picker").waitFor({ state: "detached" });
    const i = (await page.getByTestId("set-list").count()) - 1;
    const row = page.getByTestId("set-list").nth(i).locator("> div").first();
    if (name === "머신 체스트 프레스") {
      await page.getByTestId("variant-trigger").nth(i).click();
      await page.getByTestId("slot-brand-technogym").click();
      await page
        .getByTestId("variant-sheet")
        .locator("xpath=..")
        .locator('button[aria-label="닫기"]')
        .click({ position: { x: 5, y: 5 } });
    }
    await row.getByTestId("set-weight").fill(String(kg));
    await row.getByTestId("set-reps").fill(String(reps));
    await row.getByTestId("set-reps").blur();
    await row.getByTestId("set-done").click();
  }
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await page.getByTestId("summary-volume").waitFor({ timeout: 15_000 });
  const skip = page.getByTestId("btn-finish-dont-save");
  if (await skip.isVisible()) await skip.click();
  await page.getByTestId("btn-summary-share").click();
  await page.getByTestId("btn-share-workout").click();
  await page.waitForTimeout(1500);
  await page.getByTestId("btn-summary-close").click();
  await page.goto("/feed");
  await page.getByTestId("post-workout").first().waitFor({ timeout: 20_000 });
  await snap("feed");
  // 홈 — 진행 중 운동이 있는 상태
  await page.goto("/");
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("머신 체스트 프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("exercise-picker").waitFor({ state: "detached" });
  // 칸 시트
  await page.getByTestId("variant-trigger").first().click();
  await page.getByTestId("variant-sheet").waitFor();
  await snap("sheet", false);
  await page
    .getByTestId("variant-sheet")
    .locator("xpath=..")
    .locator('button[aria-label="닫기"]')
    .click({ position: { x: 5, y: 5 } });
  await page.goto("/");
  await page.getByTestId("global-workout-bar").waitFor({ timeout: 20_000 });
  await snap("home");
});
