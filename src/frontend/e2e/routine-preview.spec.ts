// 루틴 한눈에 e2e(SPEC-045 · SRS-110)
//
// 확인하는 것:
//   · R1 루틴 줄에 종목 이름이 한 줄로 보인다(「종목 N개」 대신)
//   · R2 줄을 누르면 미리보기 시트 — 종목마다 이름과 세트 요약, 아래 「시작」·「편집」
//   · 시트의 「시작」은 운동을 시작하고, 「편집」은 편집기로 간다
//   · R3 줄 오른쪽 기존 시작 버튼은 그대로
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });
}

async function 루틴_만들기(page: Page, 이름: string, 종목들: string[]) {
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("routine-name").fill(이름);
  await page.getByTestId("routine-name").blur();
  for (const [i, q] of 종목들.entries()) {
    await page.getByTestId("btn-add-routine-exercise").click();
    await page.getByTestId("picker-search").fill(q);
    await page.getByTestId("picker-list").locator("button").first().click();
    await page.getByTestId("picker-confirm").click();
    await expect(page.getByTestId("routine-exercises").locator("> div")).toHaveCount(i + 1, { timeout: 10_000 });
  }
  await page.getByTestId("btn-routine-done").click();
  await expect(page.getByTestId("routine-list")).toContainText(이름, { timeout: 10_000 });
}

test("루틴 줄에 종목 이름 한 줄 · 넷 이상이면 「외 N」", async ({ page }) => {
  await 카탈로그_준비(page);
  await 루틴_만들기(page, "전신 A", ["바벨 벤치프레스", "바벨 스쿼트", "데드리프트", "풀업"]);

  const line = page.getByTestId("exercise-line").first();
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute("data-count", "4");
  await expect(line).toContainText("벤치프레스");
  await expect(page.getByTestId("exercise-line-more").first()).toHaveText(/외 1/);
  // 한 줄 — 줄바꿈 없이 말줄임
  const h = await line.evaluate((el) => el.getBoundingClientRect().height);
  expect(h).toBeLessThan(30);

  // 편집하면 곧바로 바뀐다(R1) — 하나 더 넣고 돌아오면 「외 2」
  await page.getByTestId("open-routine-preview").first().click();
  await page.getByTestId("routine-preview-edit").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("레그 프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  await expect(page.getByTestId("routine-exercises").locator("> div")).toHaveCount(5, { timeout: 10_000 });
  await page.getByTestId("btn-routine-done").click();
  await expect(page.getByTestId("exercise-line").first()).toHaveAttribute("data-count", "5", { timeout: 10_000 });
  await expect(page.getByTestId("exercise-line-more").first()).toHaveText(/외 2/);
});

test("뒤로 가기는 미리보기만 닫고 목록에 남는다", async ({ page }) => {
  await 카탈로그_준비(page);
  await 루틴_만들기(page, "등 D", ["바벨 로우"]);
  const url = page.url();
  await page.getByTestId("open-routine-preview").first().click();
  await expect(page.getByTestId("routine-preview")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("routine-preview")).toHaveCount(0);
  expect(page.url()).toBe(url);
  await expect(page.getByTestId("routine-list")).toContainText("등 D");
});

test("줄을 누르면 미리보기 — 종목마다 세트 요약 · 「편집」은 편집기로", async ({ page }) => {
  await 카탈로그_준비(page);
  await 루틴_만들기(page, "상체 B", ["바벨 벤치프레스", "바벨 로우"]);

  await page.getByTestId("open-routine-preview").first().click();
  const sheet = page.getByTestId("routine-preview");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("상체 B");
  const rows = sheet.getByTestId("routine-preview-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("벤치프레스");
  await expect(rows.first()).toContainText("3세트"); // 루틴 기본 3세트

  await sheet.getByTestId("routine-preview-edit").click();
  await expect(page).toHaveURL(/\/routines\/[^/]+$/, { timeout: 20_000 });
  await expect(page.getByTestId("routine-name")).toHaveValue("상체 B", { timeout: 20_000 });
});

test("미리보기의 「시작」으로 운동을 시작한다 · 기존 시작 버튼도 그대로", async ({ page }) => {
  await 카탈로그_준비(page);
  await 루틴_만들기(page, "하체 C", ["바벨 스쿼트"]);
  await expect(page.getByTestId("btn-start-routine").first()).toBeVisible(); // R3

  await page.getByTestId("open-routine-preview").first().click();
  await expect(page.getByTestId("routine-preview")).toBeVisible();
  await page.getByTestId("routine-preview-start").click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });
  await expect(page.getByTestId("workout-exercises").locator("> div")).toHaveCount(1, { timeout: 20_000 });
});
