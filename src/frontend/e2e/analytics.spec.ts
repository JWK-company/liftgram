// 기록·캘린더·분석 e2e — 완료한 운동이 세 화면에 **같은 숫자로** 나타나는지 본다
//
// 여기서 확인하는 것은 화면이 아니라 **집계의 일관성**이다. 볼륨은 도메인이 한 번 계산하고
// 세 화면이 그 값을 놓기만 해야 한다 — 화면마다 다시 세면 반드시 갈라진다.
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

/** 운동 하나를 완료해 둔다 — 세 화면이 읽을 재료. 100kg × 10 = 1,000kg. */
async function 운동_하나_완료(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });

  await page.goto("/workout");
  await expect(page.getByTestId("btn-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-start").click();

  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();

  const row = page.getByTestId("set-list").locator("> div").first();
  await row.getByTestId("set-weight").fill("100");
  await row.getByTestId("set-reps").fill("10");
  await row.getByTestId("set-reps").blur();
  await row.getByTestId("set-done").click();

  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toHaveText("1000kg", { timeout: 15_000 });
}

test("완료한 운동이 기록 목록에 뜨고, 상세로 이어진다", async ({ page }) => {
  await 운동_하나_완료(page);

  await page.goto("/history");
  await expect(page.getByTestId("history-list")).toContainText("1000kg", { timeout: 20_000 });

  // 목록 → 상세: 같은 볼륨이 그대로 나와야 한다.
  await page.getByTestId("history-list").locator("a").first().click();
  await expect(page.getByTestId("detail-volume")).toHaveText("1000kg", { timeout: 20_000 });
  await expect(page.getByTestId("detail-exercises")).toContainText("100kg × 10");
});

test("분석 탭의 집계가 같은 값을 낸다", async ({ page }) => {
  await 운동_하나_완료(page);

  await page.goto("/stats");
  await expect(page.getByTestId("stat-volume")).toHaveText("1000kg", { timeout: 20_000 });
  await expect(page.getByTestId("stat-sessions")).toHaveText("1");
  // 워킹 세트 1개 — 워밍업·실패는 세지 않는다(도메인 규칙).
  await expect(page.getByTestId("stat-sets")).toHaveText("1");
});

test("캘린더에 오늘이 운동일로 찍히고 연속일이 1이 된다", async ({ page }) => {
  await 운동_하나_완료(page);

  await page.goto("/calendar");
  await expect(page.getByTestId("streak-current")).toHaveText("1", { timeout: 20_000 });

  // 오늘 칸을 고르면 그날의 세션이 아래에 뜬다.
  const today = new Date().getDate();
  await page.getByTestId(`day-${today}`).click();
  await expect(page.getByTestId("selected-day")).toBeVisible();
});

test("주간 목표는 기기에 남는다 — 새로고침해도 그대로", async ({ page }) => {
  await page.goto("/calendar");
  await expect(page.getByTestId("weekly-goal")).toBeVisible({ timeout: 20_000 });

  const before = await page.getByTestId("weekly-goal").innerText();
  await page.getByLabel("목표 늘리기").click();
  const after = await page.getByTestId("weekly-goal").innerText();
  expect(after).not.toBe(before);

  await page.reload();
  await expect(page.getByTestId("weekly-goal")).toHaveText(after, { timeout: 20_000 });
});
