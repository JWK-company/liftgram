// SPEC-041 · SRS-105 세트 방식 e2e
//
// 확인하는 것:
//   · 루틴 편집 — 세트 방식을 고르면 표가 한 번에 바뀌고 되돌릴 수 있다 · 바벨에는 드롭세트가 막힌다 ·
//     … 메뉴와 강도 목표가 없다 · 번호 시트에 피더·삭제 · 저장하고 다시 열어도 같은 방식
//   · 운동 중 바꾸기 — 끝낸 세트는 그대로, 남은 세트만 새 방식(피더는 P)
//   · 완료 — 「세트 방식 A → B」 를 반영하면 루틴에 남고, 「오늘만」이면 그대로 · 기록 상세에 방식 태그
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

async function 라벨(page: Page): Promise<string[]> {
  return (await 세트들(page).locator('[data-testid="set-type"]').allInnerTexts()).map((x) => x.trim());
}

async function 세트_하기(page: Page, k: number) {
  const row = 세트들(page).nth(k);
  await row.getByTestId("set-weight").fill("40");
  await row.getByTestId("set-reps").fill("5");
  await row.getByTestId("set-reps").blur();
  await row.getByTestId("set-done").click();
  await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
}

async function 완료(page: Page) {
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 15_000 });
}

test("루틴 편집 — 세트 방식 고르기·되돌리기·바벨 드롭세트 막힘·번호 시트·저장 왕복", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  const 이름 = `방식${Date.now().toString(36)}`;
  await 새_루틴(page, 이름);

  // … 메뉴·강도 목표가 없다 · 칩은 「일반」
  await expect(줄(page)).toHaveCount(3);
  await expect(page.getByTestId("rx-more")).toHaveCount(0);
  await expect(page.getByTestId("effort-goal")).toHaveCount(0);

  // 바벨은 드롭세트를 고를 수 없다
  await 표(page).getByTestId("scheme-chip").click();
  await expect(page.getByTestId("scheme-dropSet")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("scheme-sheet")).toHaveCount(0);

  // 5×5 → 웜업 3 + 작업 5 · 되돌리기 → 3줄
  await 방식_고르기(page, "fiveByFive");
  await expect(줄(page)).toHaveCount(8);
  await expect(표(page).getByTestId("scheme-guide")).toBeVisible();
  await page.getByTestId("scheme-undo").click();
  await expect(줄(page)).toHaveCount(3);

  // 탑세트+백오프 → W W P T B · 피더 범례
  await 방식_고르기(page, "topBackoff");
  await expect(줄(page)).toHaveCount(5);
  const 글자 = (await 줄(page).getByTestId("rx-type").allInnerTexts()).map((x) => x.trim());
  expect(글자).toEqual(["W", "W", "P", "T", "B"]);
  await expect(표(page).getByTestId("scheme-guide")).toContainText("P = 피더");

  // 번호 시트 — 피더와 삭제가 있다(시트만 보고 닫는다)
  await 줄(page).nth(1).getByTestId("rx-type").click();
  await expect(page.getByTestId("rx-type-feeder")).toBeVisible();
  await expect(page.getByTestId("rx-delete")).toBeVisible();
  await page.keyboard.press("Escape");

  // 저장하고 다시 열어도 같은 방식 · 수정함 아님
  const id = await 루틴_저장(page, 이름);
  await page.goto(`/routines/${id}`);
  await expect(표(page).getByTestId("scheme-chip")).toHaveAttribute("data-scheme", "topBackoff", { timeout: 20_000 });
  await expect(표(page).getByTestId("scheme-chip")).not.toContainText("수정함");
  await expect(줄(page)).toHaveCount(5);
});

test("운동 중 바꾸기 → 완료 반영 → 루틴에 남고 기록 상세에 태그 · 다음엔 「오늘만」", async ({ page }) => {
  test.setTimeout(300_000);
  await 카탈로그_준비(page);
  const 이름 = `중간${Date.now().toString(36)}`;
  await 새_루틴(page, 이름);
  await 방식_고르기(page, "fiveByFive");
  const id = await 루틴_저장(page, 이름);

  // ① 시작 — 방식 이름·안내 · W W W 1~5
  await 루틴_시작(page, id);
  await expect(블록(page).getByTestId("we-scheme")).toHaveAttribute("data-scheme", "fiveByFive", { timeout: 20_000 });
  await expect(세트들(page)).toHaveCount(8);
  expect(await 라벨(page)).toEqual(["W", "W", "W", "1", "2", "3", "4", "5"]);

  // ② 웜업 하나 하고 탑세트+백오프로 — 끝낸 1세트 + 남은 4세트(W P T B)
  await 세트_하기(page, 0);
  await 블록(page).getByTestId("btn-we-menu").click();
  await page.getByTestId("btn-change-scheme").click();
  await expect(page.getByTestId("we-scheme-topBackoff")).toContainText("끝낸 1세트는 그대로");
  await page.getByTestId("we-scheme-topBackoff").click();
  await expect(블록(page).getByTestId("we-scheme")).toHaveAttribute("data-scheme", "topBackoff", { timeout: 15_000 });
  await expect(세트들(page)).toHaveCount(5);
  expect(await 라벨(page)).toEqual(["W", "W", "P", "T", "B"]);
  await expect(세트들(page).nth(0).getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");

  // ③ 나머지 하고 완료 → 「세트 방식 5×5 → 탑세트+백오프」 반영
  for (const k of [1, 2, 3, 4]) await 세트_하기(page, k);
  await 완료(page);
  await expect(page.getByTestId("finish-routine")).toBeVisible();
  await expect(page.getByTestId("finish-locked")).toHaveCount(0);
  await page.getByTestId("btn-finish-apply").click();
  await expect(page.getByTestId("finish-change-scheme")).toContainText("세트 방식");
  await expect(page.getByTestId("finish-change-sets")).toHaveCount(0); // 처방 줄은 세트 수 항목이 없다
  await page.getByTestId("btn-finish-apply-confirm").click();
  await expect(page.getByTestId("finish-pick")).toHaveCount(0, { timeout: 10_000 });

  // 기록 상세 — 방식 태그
  await page.goto("/history");
  await page.getByTestId("history-list").locator("a").first().click();
  await expect(page.getByTestId("detail-scheme").first()).toHaveAttribute("data-scheme", "topBackoff", { timeout: 20_000 });

  // 루틴에 남았다
  await page.goto(`/routines/${id}`);
  await expect(표(page).getByTestId("scheme-chip")).toHaveAttribute("data-scheme", "topBackoff", { timeout: 20_000 });
  await expect(줄(page)).toHaveCount(5);

  // ④ 다시 — 피라미드로 바꾸고 「오늘만」 → 루틴은 탑세트+백오프 그대로
  await 루틴_시작(page, id);
  await expect(세트들(page)).toHaveCount(5, { timeout: 20_000 });
  await 블록(page).getByTestId("btn-we-menu").click();
  await page.getByTestId("btn-change-scheme").click();
  await page.getByTestId("we-scheme-pyramid").click();
  await expect(블록(page).getByTestId("we-scheme")).toHaveAttribute("data-scheme", "pyramid", { timeout: 15_000 });
  await 세트_하기(page, 0);
  await 세트_하기(page, 1);
  await 완료(page);
  await page.getByTestId("btn-finish-today").click();
  await expect(page.getByTestId("finish-routine")).toHaveCount(0);
  await page.goto(`/routines/${id}`);
  await expect(표(page).getByTestId("scheme-chip")).toHaveAttribute("data-scheme", "topBackoff", { timeout: 20_000 });
});
