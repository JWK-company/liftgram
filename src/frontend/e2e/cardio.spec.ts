// 유산소 세트행 e2e
//
// 유산소는 무게·횟수를 적지 않는다 — 종목이 정한 지표(시간·거리·경사·단계)를 적는다.
// 확인하는 것:
//   · 종목에 따라 **칸이 달라진다**(러닝머신=시간·거리·경사·속도, 줄넘기=시간만)
//   · 분·킬로미터로 적고 저장은 초·미터 — 새로고침해도 같은 값이 보인다
//   · 볼륨 칩 대신 **총 시간·거리**가 뜬다(무게가 없으니 볼륨은 늘 0이다)
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function 준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
}

/** 빈 운동을 시작하고 종목 하나를 담는다. */
async function 세션에_담기(page: Page, 검색어: string) {
  await page.goto("/workout");
  await expect(page.getByTestId("btn-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill(검색어);
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("set-list")).toBeVisible({ timeout: 20_000 });
}

test("러닝머신은 시간·거리·경사·속도를 적는다", async ({ page }) => {
  test.setTimeout(120_000);
  await 준비(page);
  await 세션에_담기(page, "러닝머신");

  // 근력 칸(무게·횟수)이 아니라 유산소 칸이 뜬다.
  await expect(page.getByTestId("cardio-row").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("set-weight")).toHaveCount(0);
  await expect(page.getByTestId("cardio-duration").first()).toBeVisible();
  await expect(page.getByTestId("cardio-distance").first()).toBeVisible();
  await expect(page.getByTestId("cardio-incline").first()).toBeVisible();
  await expect(page.getByTestId("cardio-speed").first()).toBeVisible();
  // 러닝머신에 '단계'는 없다.
  await expect(page.getByTestId("cardio-level")).toHaveCount(0);

  // 30분 · 5.2km · 경사 1.5 · 속도 10.4로 적는다.
  await page.getByTestId("cardio-duration").first().fill("30");
  await page.getByTestId("cardio-distance").first().fill("5.2");
  await page.getByTestId("cardio-incline").first().fill("1.5");
  await page.getByTestId("cardio-speed").first().fill("10.4");
  await page.getByTestId("cardio-done").first().click();

  // 총계가 뜬다 — 저장은 초·미터인데 표시는 사람의 단위다.
  await expect(page.getByTestId("workout-exercises")).toContainText("30:00", { timeout: 20_000 });
  await expect(page.getByTestId("workout-exercises")).toContainText("5.2km");

  // 새로고침해도 적은 그대로다(단위 환산이 왕복에서 어긋나지 않는다).
  await page.reload();
  await expect(page.getByTestId("cardio-duration").first()).toHaveValue("30", { timeout: 20_000 });
  await expect(page.getByTestId("cardio-distance").first()).toHaveValue("5.2");
  await expect(page.getByTestId("cardio-incline").first()).toHaveValue("1.5");
  await expect(page.getByTestId("cardio-speed").first()).toHaveValue("10.4");
});

test("줄넘기는 시간만 적는다", async ({ page }) => {
  test.setTimeout(120_000);
  await 준비(page);
  await 세션에_담기(page, "줄넘기");

  await expect(page.getByTestId("cardio-duration").first()).toBeVisible({ timeout: 20_000 });
  // 거리·경사·단계·속도 칸은 아예 없다 — 적을 수 없는 것을 묻지 않는다.
  await expect(page.getByTestId("cardio-distance")).toHaveCount(0);
  await expect(page.getByTestId("cardio-incline")).toHaveCount(0);
  await expect(page.getByTestId("cardio-level")).toHaveCount(0);
  await expect(page.getByTestId("cardio-speed")).toHaveCount(0);
});

test("유산소 기록은 볼륨에 섞이지 않는다", async ({ page }) => {
  test.setTimeout(120_000);
  await 준비(page);
  await 세션에_담기(page, "러닝머신");

  await page.getByTestId("cardio-duration").first().fill("20");
  await page.getByTestId("cardio-distance").first().fill("3");
  await page.getByTestId("cardio-done").first().click();
  await expect(page.getByTestId("workout-exercises")).toContainText("20:00", { timeout: 20_000 });

  // 세션 전체 볼륨은 0이다 — 유산소는 무게·횟수가 없다.
  await expect(page.getByTestId("live-volume")).toContainText("0kg");
});
