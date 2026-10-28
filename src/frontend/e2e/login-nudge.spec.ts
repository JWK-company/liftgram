// 로그인 유도 e2e (SRS-086) — 로그인하지 않은 기기의 기록은 그 기기에만 있다. 운동을 마칠 때 보관을 권하되 매번 끼어들지 않는가.
//   · 비로그인 완료 1·3번째에 권유 시트 · 그 뒤로는 마지막 표시 7일 뒤
//   · 루틴 저장 질문이 있으면 그 질문이 끝난 뒤
//   · 「이 기기에만 있는 기록」 띠는 1건부터 · 「나중에」는 하루
//   · 로그인한 기기에는 둘 다 없다
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function 준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toBeVisible({ timeout: 30_000 });
}

/** 빠른 운동 하나를 마치고 요약까지. 루틴 저장 질문은 닫지 않고 돌려준다. */
async function 운동_마치기(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("workout-exercises")).toContainText("벤치프레스", { timeout: 20_000 });
  await page.getByTestId("set-weight").first().fill("60");
  await page.getByTestId("set-reps").first().fill("10");
  await page.getByTestId("set-done").first().click();
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 20_000 });
}

/** 루틴 저장 질문을 닫는다(빠른 운동은 「저장 안 함」). 권유 시트가 그 **뒤에** 뜨는지 본다. */
async function 질문_닫기(page: Page) {
  const q = page.getByTestId("btn-finish-dont-save");
  await expect(q).toBeVisible({ timeout: 10_000 });
  // 질문이 떠 있는 동안 권유 시트는 없다
  await expect(page.getByTestId("login-nudge")).toHaveCount(0);
  await q.click();
}

async function 요약_닫기(page: Page) {
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

test("비로그인 완료 1·3번째에만 권하고, 7일 뒤에 다시 권한다", async ({ page }) => {
  test.setTimeout(300_000);
  await 준비(page);
  const seen: boolean[] = [];
  for (let i = 1; i <= 4; i++) {
    await 운동_마치기(page);
    await 질문_닫기(page);
    const sheet = page.getByTestId("login-nudge");
    // 뜰 때는 곧바로 뜬다 — 안 뜨는 회차는 잠깐 기다려 본다
    const shown = await sheet
      .waitFor({ state: "visible", timeout: 3_000 })
      .then(() => true)
      .catch(() => false);
    seen.push(shown);
    if (shown) await page.getByTestId("btn-login-nudge-later").click();
    await expect(sheet).toHaveCount(0);
    await 요약_닫기(page);
  }
  expect(seen).toEqual([true, false, true, false]);

  // 마지막 표시를 8일 전으로 — 다음 완료에 다시 권한다
  await page.evaluate(() =>
    localStorage.setItem("liftgram.nudge.lastShownAt", String(Date.now() - 8 * 24 * 3600_000)),
  );
  await 운동_마치기(page);
  await 질문_닫기(page);
  await expect(page.getByTestId("login-nudge")).toBeVisible({ timeout: 5_000 });
});

test("「로그인하고 보관하기」는 계정 화면으로 가고 방금 기록은 기기에 남는다", async ({ page }) => {
  test.setTimeout(180_000);
  await 준비(page);
  await 운동_마치기(page);
  await 질문_닫기(page);
  await page.getByTestId("btn-login-nudge-login").click();
  await expect(page).toHaveURL(/\/account/, { timeout: 15_000 });
  await page.reload();
  await page.goto("/history");
  await expect(page.getByTestId("history-list")).toContainText("600kg", { timeout: 20_000 });
});

test("「이 기기에만 있는 기록」 띠는 운동을 한 번 마친 뒤 뜨고(운동 중엔 없음) 「나중에」는 하루만 접는다", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await 준비(page);
  await expect(page.getByTestId("sync-localonly-banner")).toHaveCount(0);
  // 첫 운동 도중 — 세트를 저장해도(미동기 행이 생겨도) 띠가 끼어들지 않는다(qa spec H-3)
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("set-weight").first().fill("60");
  await page.getByTestId("set-reps").first().fill("10");
  await page.getByTestId("set-done").first().click();
  await page.waitForTimeout(2_000);
  await expect(page.getByTestId("sync-localonly-banner")).toHaveCount(0);
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 20_000 });
  await 질문_닫기(page);
  // 첫 완료 — 권유 시트가 뜬다(닫고 간다)
  await expect(page.getByTestId("login-nudge")).toBeVisible({ timeout: 5_000 });
  await page.getByTestId("btn-login-nudge-later").click();
  await 요약_닫기(page);
  const banner = page.getByTestId("sync-localonly-banner");
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await banner.getByRole("button", { name: "나중에" }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("btn-quick-start")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("sync-localonly-banner")).toHaveCount(0);
  // 접은 지 25시간 — 다시 뜬다
  await page.evaluate(() =>
    localStorage.setItem("sync_localonly_dismissed_at", String(Date.now() - 25 * 3600_000)),
  );
  await page.reload();
  await expect(page.getByTestId("sync-localonly-banner")).toBeVisible({ timeout: 15_000 });
});

test("로그인한 기기에는 권유 시트도 로컬 띠도 없다", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page
    .getByTestId("auth-email-input")
    .fill(`e2e-nudge-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill("권유테스트");
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
  await 운동_마치기(page);
  await 질문_닫기(page);
  await page.waitForTimeout(2_000);
  await expect(page.getByTestId("login-nudge")).toHaveCount(0);
  await 요약_닫기(page);
  await expect(page.getByTestId("sync-localonly-banner")).toHaveCount(0);
});
