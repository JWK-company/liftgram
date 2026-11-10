// SPEC-042 · SRS-106·107 세트 입력 편의 e2e
//   · 운동 중 「다른 세트도 똑같이」 — 안 한 세트만, 체크한 세트는 그대로
//   · 숫자 칸을 누르면 전체 선택 — 바로 치면 바뀐다
//   · 뒤로 가기 = 맨 위 창만 닫기(운동 중 세트 타입 시트 · 루틴 편집 세트 방식 시트)
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


test("운동 중 — 다른 세트도 똑같이 · 전체 선택 · 뒤로는 시트만 닫는다", async ({ page }) => {
  test.setTimeout(240_000);
  await 카탈로그_준비(page);
  const 이름 = `편의${Date.now().toString(36)}`;
  await 새_루틴(page, 이름);
  const id = await 루틴_저장(page, 이름);

  // 루틴 편집 — 세트 방식 시트를 연 채 뒤로 → 시트만 닫히고 주소 그대로
  await page.goto(`/routines/${id}`);
  await expect(표(page).getByTestId("scheme-chip")).toBeVisible({ timeout: 20_000 });
  await 표(page).getByTestId("scheme-chip").click();
  await expect(page.getByTestId("scheme-sheet")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("scheme-sheet")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/routines/${id}`));
  await expect(표(page)).toBeVisible();

  await 루틴_시작(page, id);
  await expect(세트들(page)).toHaveCount(3, { timeout: 20_000 });
  const 칸 = (k: number, f: "set-weight" | "set-reps") => 세트들(page).nth(k).getByTestId(f);

  // 1세트 60 × 10 → 「2세트」 → 나머지 둘이 같은 값
  await 칸(0, "set-weight").fill("60");
  await 칸(0, "set-weight").blur();
  await 칸(0, "set-reps").fill("10");
  await 칸(0, "set-reps").blur();
  await expect(page.getByTestId("set-copy-rest")).toContainText("2세트");
  await page.getByTestId("set-copy-rest").click();
  for (const k of [1, 2]) {
    await expect(칸(k, "set-weight")).toHaveValue("60");
    await expect(칸(k, "set-reps")).toHaveValue("10");
  }
  await expect(page.getByTestId("set-copy-rest")).toHaveCount(0);

  // 2세트를 체크하고 1세트 횟수를 8로 — 대상은 3세트 하나뿐
  await 세트들(page).nth(1).getByTestId("set-done").click();
  await expect(세트들(page).nth(1).getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
  // 칸을 누르면 숫자 전체가 선택된다 — 바로 치면 「10」이 「8」이 된다
  await 칸(0, "set-reps").click();
  await page.keyboard.type("8");
  await expect(칸(0, "set-reps")).toHaveValue("8");
  await 칸(0, "set-reps").blur();
  // 번호 시트에서 고른다 — 1세트
  await 세트들(page).nth(0).getByTestId("set-type").click();
  await expect(page.getByTestId("set-copy")).toContainText("1세트");
  await page.getByTestId("set-copy").click();
  await expect(칸(2, "set-reps")).toHaveValue("8");
  await expect(칸(1, "set-reps")).toHaveValue("10");

  // 세트 타입 시트를 연 채 뒤로 → 시트만 닫히고 운동 화면 그대로
  await 세트들(page).nth(2).getByTestId("set-type").click();
  await expect(page.getByTestId("set-type-sheet")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("set-type-sheet")).toHaveCount(0);
  await expect(page).toHaveURL(/\/workout/);
  await expect(세트들(page)).toHaveCount(3);
  // 버튼으로 닫은 뒤 뒤로 한 번 → 운동 화면에서 벗어난다(묵은 칸에 갇히지 않는다)
  await 세트들(page).nth(2).getByTestId("set-type").click();
  // [원본] await page.getByRole("button", { name: "취소" }).click();
  // [개선] 머리 「취소」(이름 「운동 취소(삭제)」)와 겹치지 않게 정확히(SPEC-055 Phase 2)
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.getByTestId("set-type-sheet")).toHaveCount(0);
  await page.goBack();
  await expect(page).not.toHaveURL(/\/workout/, { timeout: 10_000 });
});

test("뒤로 가기 — 시트에서 확인창으로 넘어가도 확인창이 남고, 시트에서 다른 화면으로 가면 뒤로 한 번에 돌아온다", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  const 이름 = `뒤로${Date.now().toString(36)}`;
  await 새_루틴(page, 이름);
  const id = await 루틴_저장(page, 이름);
  await 루틴_시작(page, id);
  await expect(세트들(page)).toHaveCount(3, { timeout: 20_000 });

  // 시트 → 확인창(같은 순간에 닫고 연다) — 확인창이 곧바로 닫히지 않는다 · 뒤로면 확인창만 닫힌다
  // [원본] await page.getByTestId("btn-session-menu").click(); — ⋯ 없이 머리 「취소」를 바로 누른다(SPEC-055 Phase 2)
  await page.getByTestId("btn-discard").click();
  await expect(page.getByTestId("confirm-discard")).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByTestId("confirm-discard")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("confirm-discard")).toHaveCount(0);
  await expect(page).toHaveURL(/\/workout/);
  await expect(세트들(page)).toHaveCount(3);

  // 시트의 선택지로 다른 화면 — 이동이 취소되지 않고, 뒤로 한 번이면 운동 화면
  await 블록(page).getByTestId("btn-we-menu").click();
  await page.getByTestId("btn-we-info").click();
  await expect(page).toHaveURL(/\/exercise\//, { timeout: 15_000 });
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/exercise\//);
  await page.goBack();
  await expect(page).toHaveURL(/\/workout/, { timeout: 10_000 });
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/workout/);
  await expect(세트들(page)).toHaveCount(3);
});
