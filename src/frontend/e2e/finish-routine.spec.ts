// @plm SRS-059 SRS-060  운동 완료 시 루틴 반영·루틴으로 저장 e2e
//
// 확인하는 것:
//   · 루틴 운동에서 바꾼 것 중 **고른 것만** 루틴에 남는다(벤치 교체는 빼고 플라이 3 → 4세트만)
//   · 「오늘만」이면 루틴은 그대로 · 변형 칸만 바꾼 운동은 묻지 않는다
//   · 빠른 운동은 끝날 때 루틴으로 저장할지 묻고, 저장한 루틴으로 같은 구성이 시작된다
//   · 요약 화면의 「이 운동으로 루틴 만들기」
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
}

async function 루틴_만들기(page: Page, 이름: string, 종목들: string[]): Promise<string> {
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("routine-name").fill(이름);
  await page.getByTestId("routine-name").blur();
  const rows = page.getByTestId("routine-exercises").locator("> div");
  for (const [i, 종목] of 종목들.entries()) {
    await page.getByTestId("btn-add-routine-exercise").click();
    await page.getByTestId("picker-search").fill(종목);
    await page.getByTestId("picker-list").locator("button").first().click();
    await expect(rows).toHaveCount(i + 1, { timeout: 10_000 });
  }
  await page.getByTestId("btn-routine-done").click();
  await expect(page.getByTestId("routine-list")).toContainText(이름, { timeout: 10_000 });
  const tid = await page
    .getByTestId("routine-list")
    .locator("[data-testid^=routine-]")
    .filter({ hasText: 이름 })
    .first()
    .getAttribute("data-testid");
  return (tid ?? "").replace("routine-", "");
}

async function 루틴_시작(page: Page, routineId: string) {
  await page.goto("/");
  await page.getByTestId(`routine-${routineId}`).getByTestId("btn-start-routine").click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });
  await expect(page.getByTestId("workout-exercises").locator("> div").first()).toBeVisible({
    timeout: 20_000,
  });
}

function 블록(page: Page, i: number) {
  return page.getByTestId("workout-exercises").locator("> div").nth(i);
}

/** i 번째 블록의 세트를 전부(또는 n 개) 체크한다. */
async function 세트_다_하기(page: Page, i: number, n?: number) {
  const rows = 블록(page, i).getByTestId("set-list").locator("> div");
  const count = n ?? (await rows.count());
  for (let k = 0; k < count; k++) {
    const row = rows.nth(k);
    await row.getByTestId("set-weight").fill("20");
    await row.getByTestId("set-reps").fill("10");
    await row.getByTestId("set-reps").blur();
    await row.getByTestId("set-done").click();
    await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
  }
}

async function 완료(page: Page) {
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 15_000 });
}

test("루틴 운동 — 벤치 교체 + 플라이 한 세트 더, 플라이만 루틴에 남긴다", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  const id = await 루틴_만들기(page, `가슴 반영 ${Date.now().toString(36)}`, [
    "바벨 벤치프레스",
    "덤벨 플라이",
  ]);

  await 루틴_시작(page, id);
  // 벤치를 덤벨로(기구 바꾸기 = 종목 교체)
  await 블록(page, 0).getByTestId("variant-trigger").click();
  await page.getByTestId("swap-dumbbell").click();
  await expect(블록(page, 0).getByTestId("we-name")).toHaveText("덤벨 벤치프레스", { timeout: 15_000 });
  await expect(page.getByTestId("swap-scope")).toHaveCount(0); // 운동 중에는 묻지 않는다(D3)
  await 세트_다_하기(page, 0);
  // 플라이는 한 세트 더(3 → 4)
  await 블록(page, 1).getByTestId("btn-add-set").click();
  await expect(블록(page, 1).getByTestId("set-list").locator("> div")).toHaveCount(4);
  await 세트_다_하기(page, 1);

  await 완료(page);
  await expect(page.getByTestId("finish-routine")).toBeVisible();
  await page.getByTestId("btn-finish-apply").click();
  await expect(page.getByTestId("finish-change-swap")).toContainText("바벨 벤치프레스 → 덤벨 벤치프레스");
  await expect(page.getByTestId("finish-change-sets")).toContainText("3 → 4");
  // 벤치 교체는 오늘만 — 체크를 끈다
  await page.getByTestId("finish-change-swap").locator("input").uncheck();
  await page.getByTestId("btn-finish-apply-confirm").click();
  await expect(page.getByTestId("finish-pick")).toHaveCount(0, { timeout: 10_000 });

  // 다시 시작하면 벤치는 그대로, 플라이는 4세트
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await 루틴_시작(page, id);
  await expect(블록(page, 0).getByTestId("we-name")).toHaveText("바벨 벤치프레스");
  await expect(블록(page, 1).getByTestId("set-list").locator("> div")).toHaveCount(4);
});

test("「오늘만」이면 루틴은 그대로 · 무게만 바꾼 운동은 묻지 않는다", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  const id = await 루틴_만들기(page, `오늘만 ${Date.now().toString(36)}`, ["바벨 스쿼트"]);

  // ① 그대로 3세트 — 묻지 않는다
  await 루틴_시작(page, id);
  await 세트_다_하기(page, 0);
  await 완료(page);
  await expect(page.getByTestId("finish-routine")).toHaveCount(0);
  await expect(page.getByTestId("finish-name")).toHaveCount(0);
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

  // ② 한 세트 더 → 「오늘만」 → 루틴은 3세트 그대로
  await 루틴_시작(page, id);
  await 블록(page, 0).getByTestId("btn-add-set").click();
  await 세트_다_하기(page, 0);
  await 완료(page);
  await page.getByTestId("btn-finish-today").click();
  await expect(page.getByTestId("finish-routine")).toHaveCount(0);
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await 루틴_시작(page, id);
  await expect(블록(page, 0).getByTestId("set-list").locator("> div")).toHaveCount(3);
});

test("빠른 운동 — 끝날 때 루틴으로 저장하고, 그 루틴으로 같은 구성이 시작된다", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  for (const 종목 of ["바벨 벤치프레스", "덤벨 플라이"]) {
    await page.getByTestId("btn-add-exercise").click();
    await page.getByTestId("picker-search").fill(종목);
    await page.getByTestId("picker-list").locator("button").first().click();
    await expect(page.getByTestId("exercise-picker")).toHaveCount(0);
  }
  await 세트_다_하기(page, 0);
  await 블록(page, 1).getByTestId("btn-add-set").click();
  await 세트_다_하기(page, 1);
  const 플라이세트 = await 블록(page, 1).getByTestId("set-list").locator("> div").count();

  await 완료(page);
  await expect(page.getByTestId("finish-name")).toBeVisible();
  // 기본 이름 = M/D + 주 근육
  await expect(page.getByTestId("finish-name-input")).toHaveValue(/^\d{1,2}\/\d{1,2} /);
  const 이름 = `빠른 저장 ${Date.now().toString(36)}`;
  await page.getByTestId("finish-name-input").fill(이름);
  await page.getByTestId("btn-finish-save").click();
  await expect(page.getByTestId("finish-name")).toHaveCount(0, { timeout: 10_000 });
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

  await expect(page.getByTestId("routine-list")).toContainText(이름, { timeout: 15_000 });
  const tid = await page
    .getByTestId("routine-list")
    .locator("[data-testid^=routine-]")
    .filter({ hasText: 이름 })
    .first()
    .getAttribute("data-testid");
  await 루틴_시작(page, (tid ?? "").replace("routine-", ""));
  await expect(page.getByTestId("workout-exercises").locator("> div")).toHaveCount(2);
  await expect(블록(page, 0).getByTestId("we-name")).toHaveText("바벨 벤치프레스");
  await expect(블록(page, 1).getByTestId("set-list").locator("> div")).toHaveCount(플라이세트);
});

test("「저장 안 함」이면 루틴이 생기지 않고, 요약의 「이 운동으로 루틴 만들기」로도 저장된다", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await page.goto("/");
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 데드리프트");
  await page.getByTestId("picker-list").locator("button").first().click();
  await 세트_다_하기(page, 0, 1);
  await 완료(page);
  await page.getByTestId("btn-finish-dont-save").click();
  await expect(page.getByTestId("finish-name")).toHaveCount(0);

  const 이름 = `요약 저장 ${Date.now().toString(36)}`;
  await page.getByTestId("btn-summary-make-routine").click();
  await page.getByTestId("finish-name-input").fill(이름);
  await page.getByTestId("btn-finish-save").click();
  await expect(page.getByTestId("finish-name")).toHaveCount(0, { timeout: 10_000 });
  await page.getByTestId("btn-summary-close").click();
  await expect(page.getByTestId("routine-list")).toContainText(이름, { timeout: 15_000 });
});
