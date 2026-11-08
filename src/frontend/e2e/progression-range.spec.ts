// SPEC-043 · SRS-108 루틴 횟수 범위 → 운동 중 목표 · 결과 · 다음 무게
import { expect, test, type Page } from "@playwright/test";

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
}

async function 새_루틴(page: Page, 이름: string, 종목 = "바벨 벤치프레스") {
  await page.goto("/");
  await expect(page.getByTestId("btn-new-routine")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("routine-name").fill(이름);
  await page.getByTestId("routine-name").blur();
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill(종목);
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  await expect(page.getByTestId("set-table").first()).toBeVisible({ timeout: 15_000 });
}

const 표 = (page: Page) => page.getByTestId("set-table").first();
const 줄 = (page: Page) => 표(page).getByTestId("set-table-row");

async function 방식_고르기(page: Page, id: string) {
  await 표(page).getByTestId("scheme-chip").click();
  await page.getByTestId(`scheme-${id}`).click();
  await expect(표(page).getByTestId("scheme-chip")).toHaveAttribute("data-scheme", id);
}

async function 루틴_저장(page: Page, 이름: string): Promise<string> {
  await page.getByTestId("btn-routine-done").click();
  const 행 = page.getByTestId("routine-list").locator("[data-testid^=routine-]").filter({ hasText: 이름 }).first();
  await expect(행).toBeVisible({ timeout: 20_000 });
  return ((await 행.getAttribute("data-testid")) ?? "").replace("routine-", "");
}

async function 루틴_시작(page: Page, id: string) {
  await page.goto("/");
  await page.getByTestId(`routine-${id}`).getByTestId("btn-start-routine").click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });
}

const 블록 = (page: Page) => page.getByTestId("workout-exercises").locator("> div").first();
const 세트들 = (page: Page) => 블록(page).getByTestId("set-list").locator("> div");


async function 완료(page: Page) {
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 15_000 });
}

async function 세트(page: Page, k: number, kg: string, reps: string) {
  const row = 세트들(page).nth(k);
  await row.getByTestId("set-weight").fill(kg);
  await row.getByTestId("set-reps").fill(reps);
  await row.getByTestId("set-reps").blur();
  await row.getByTestId("set-done").click();
  await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
}

test("일반 루틴 — 편집기에서 정한 범위가 목표로 · 결과 · 같은 줄 지난 기록으로 다음 값 제안과 채우기", async ({ page }) => {
  test.setTimeout(300_000);
  await 카탈로그_준비(page);
  const 이름 = `범위${Date.now().toString(36)}`;
  await 새_루틴(page, 이름);
  // 편집기에서 범위를 6~8로 — 첫 줄을 고치고 「다른 세트도 똑같이」
  const 줄 = 표(page).getByTestId("set-table-row");
  await 줄.nth(0).getByTestId("rx-rep-min").fill("6");
  await 줄.nth(0).getByTestId("rx-rep-min").blur();
  await 줄.nth(0).getByTestId("rx-rep-max").fill("8");
  await 줄.nth(0).getByTestId("rx-rep-max").blur();
  await page.getByTestId("rx-copy-rest").click();
  await expect(줄.nth(2).getByTestId("rx-rep-max")).toHaveValue("8");
  const id = await 루틴_저장(page, 이름);

  // ① 첫 운동 — 「목표 6-8회」 · 8회 = 위쪽 값 달성 · 7회 = 범위 안 · 5회 = 목표 미달 · 제안 없음(기록 없음)
  await 루틴_시작(page, id);
  await expect(세트들(page)).toHaveCount(3, { timeout: 20_000 });
  await expect(세트들(page).nth(0)).toContainText("목표 6-8회");
  await expect(page.getByTestId("prog-plan")).toHaveCount(0);
  await 세트(page, 0, "60", "8");
  await 세트(page, 1, "60", "7");
  await 세트(page, 2, "60", "5");
  const 결과 = (k: number) => 세트들(page).nth(k).getByTestId("set-rep-result");
  await expect(결과(0)).toHaveAttribute("data-result", "top");
  await expect(결과(0)).toContainText("위쪽 값 달성");
  await expect(결과(1)).toHaveAttribute("data-result", "inRange");
  await expect(결과(2)).toHaveAttribute("data-result", "below");
  await 완료(page);

  // ② 두 번째 — 5회가 있어 같은 무게로 6회부터 · 채우기 → 60 × 6 · 하나 하면 카드가 접힌다
  await 루틴_시작(page, id);
  await expect(page.getByTestId("prog-plan")).toHaveAttribute("data-action", "hold", { timeout: 20_000 });
  await expect(page.getByTestId("prog-plan")).toContainText("8·7·5");
  await page.getByTestId("prog-apply").click();
  for (const k of [0, 1, 2]) {
    await expect(세트들(page).nth(k).getByTestId("set-weight")).toHaveValue("60");
    await expect(세트들(page).nth(k).getByTestId("set-reps")).toHaveValue("6");
  }
  await expect(page.getByTestId("prog-plan")).toHaveCount(0);
  await 세트(page, 0, "60", "8");
  await 세트(page, 1, "60", "8");
  await 세트(page, 2, "60", "7");
  await 완료(page);

  // ③ 세 번째 — 범위 안 → 세트마다 지난번 +1(위쪽 값까지 · 높았던 세트는 깎지 않음) → 8·8·8
  await 루틴_시작(page, id);
  await expect(page.getByTestId("prog-plan")).toHaveAttribute("data-action", "addRep", { timeout: 20_000 });
  await page.getByTestId("prog-apply").click();
  for (const k of [0, 1, 2]) await expect(세트들(page).nth(k).getByTestId("set-reps")).toHaveValue("8");
  for (const k of [0, 1, 2]) await 세트(page, k, "60", "8");
  await 완료(page);

  // ④ 네 번째 — 모두 위쪽 값 → 바벨 +2.5kg · 6회부터
  await 루틴_시작(page, id);
  await expect(page.getByTestId("prog-plan")).toHaveAttribute("data-action", "increaseWeight", { timeout: 20_000 });
  await expect(page.getByTestId("prog-plan")).toContainText("62.5kg × 6회");
  await page.getByTestId("prog-apply").click();
  await expect(세트들(page).nth(2).getByTestId("set-weight")).toHaveValue("62.5");
  await expect(세트들(page).nth(2).getByTestId("set-reps")).toHaveValue("6");
  await expect(page.getByTestId("prog-plan")).toHaveCount(0);
});
