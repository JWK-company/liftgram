// 루틴 e2e — 만들고 · 종목을 넣고 · 그 루틴으로 운동을 시작하는 한 바퀴
//
// 확인하는 것:
//   · 새 루틴은 **첫 변경이 있을 때** 만들어진다(그냥 들어갔다 나오면 목록이 그대로다)
//   · 루틴에 담은 종목·세트가 세션으로 그대로 옮겨진다(startWorkoutFromRoutine)
//   · 진행 중인 운동이 있는데 새로 시작하려 하면 묻는다
//   · 콘셉트 루틴을 저장하면 Day 수만큼 루틴이 생긴다
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });
}

async function 루틴_만들기(page: Page, 이름: string, 종목검색: string) {
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("routine-name").fill(이름);
  await page.getByTestId("routine-name").blur();

  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill(종목검색);
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("routine-exercises").locator("> div")).toHaveCount(1, { timeout: 10_000 });

  await page.getByTestId("btn-routine-done").click();
  await expect(page.getByTestId("routine-list")).toContainText(이름, { timeout: 10_000 });
}

test("빈 편집기는 루틴을 만들지 않는다 — 들어갔다 나와도 목록 그대로", async ({ page }) => {
  await 카탈로그_준비(page);
  await page.goto("/");

  // 아직 루틴이 없으므로 빈 상태다.
  await expect(page.getByTestId("empty-state")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-routine-done").click();

  // 아무것도 고치지 않았으니 빈 상태 그대로여야 한다(빈 초안이 쌓이면 안 된다).
  await expect(page.getByTestId("empty-state")).toBeVisible({ timeout: 10_000 });
});

test("루틴을 만들고 그 루틴으로 운동을 시작한다", async ({ page }) => {
  await 카탈로그_준비(page);
  await 루틴_만들기(page, "상체 A", "바벨 벤치프레스");

  await page.getByTestId("btn-start-routine").click();

  // 세션으로 넘어가고, 루틴에 담은 종목이 그대로 들어 있다.
  await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });
  await expect(page.getByTestId("workout-exercises").locator("> div")).toHaveCount(1, { timeout: 20_000 });
  // 루틴 기본값은 3세트다(저장소가 정한다) — 세트가 미리 깔려 있어야 체크만 하면 된다.
  await expect(page.getByTestId("set-list").locator("> div")).toHaveCount(3);
});

test("진행 중인 운동이 있으면 새로 시작하기 전에 묻는다", async ({ page }) => {
  await 카탈로그_준비(page);

  // 먼저 빠른 운동을 하나 띄운다.
  await page.goto("/");
  await page.getByTestId("btn-quick-start").click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });

  // 운동 탭으로 돌아오면 진행 중 카드와 전역 바가 보인다.
  await page.goto("/");
  await expect(page.getByTestId("resume-card")).toBeVisible({ timeout: 20_000 });

  // 이 상태에서 또 시작하려 하면 선택지를 준다.
  await page.getByTestId("btn-quick-start").click();
  await expect(page.getByTestId("active-exists")).toBeVisible();
  await expect(page.getByTestId("active-exists")).toContainText("이어서 하기");
});

test("콘셉트 루틴을 저장하면 Day 수만큼 루틴이 생긴다", async ({ page }) => {
  await 카탈로그_준비(page);
  await page.goto("/");

  // '퇴근 후 30분'은 2일 구성이다(도메인 상수).
  await page.getByTestId("concept-after-work-30").click();
  await expect(page.getByTestId("concept-sheet")).toBeVisible();
  await page.getByTestId("concept-save").click();

  await expect(page.getByTestId("routine-list")).toContainText("퇴근 후 30분", { timeout: 20_000 });
  const rows = page.getByTestId("routine-list").locator("> div");
  expect(await rows.count()).toBe(2);
});
