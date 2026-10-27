// 종목 카탈로그 개편 P4 e2e — 운동 중 기록 칸(조합) (ADR-033·034·037 · SRS-057·058)
//
// 여기서 보는 것:
//   · 바벨 벤치프레스를 덤벨로 바꿔 마친 세션 = 덤벨 벤치프레스를 처음부터 고른 세션(성공 기준 3)
//   · 케이블 부착물(로프/일자바)·머신 적재 방식(핀/플레이트)·손 그립은 기록이 섞이지 않고, 지난 조합이 기본으로 고른다
//   · 「다른 조합 기록 보기」로 다른 칸의 지난 기록을 보고 그 칸으로 바꾼다
//   · 플레이트 「한쪽 무게로 입력」 — 입력은 한쪽, 볼륨은 ×2
//   · 루틴 편집의 대체가 한 번에 바뀐다(#47) · 운동 중 기구 바꾸기를 「루틴에도」 반영한다
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
}

async function 운동_시작(page: Page, 검색: string) {
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill(검색);
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("exercise-picker")).toHaveCount(0);
  await expect(page.getByTestId("we-name").first()).toHaveText(검색, { timeout: 15_000 });
}

function 첫세트(page: Page) {
  return page.getByTestId("set-list").first().locator("> div").nth(0);
}

async function 세트_기록(page: Page, kg: number, reps: number) {
  const row = 첫세트(page);
  await row.getByTestId("set-weight").fill(String(kg));
  await row.getByTestId("set-reps").fill(String(reps));
  await row.getByTestId("set-reps").blur();
  await row.getByTestId("set-done").click();
  await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
}

async function 마치기(page: Page) {
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 15_000 });
  // 완료 직후 루틴 저장·반영 질문(SRS-059·060)이 요약 위에 뜨면 「저장 안 함 / 오늘만」으로 닫는다.
  for (const id of ["btn-finish-dont-save", "btn-finish-today"]) {
    const b = page.getByTestId(id);
    if (await b.isVisible()) await b.click();
  }
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

async function 칸_시트(page: Page) {
  await page.getByTestId("variant-trigger").first().click();
  await expect(page.getByTestId("variant-sheet")).toBeVisible();
}

async function 시트_닫기(page: Page) {
  await page
    .getByTestId("variant-sheet")
    .locator("xpath=..")
    .locator('button[aria-label="닫기"]')
    .click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId("variant-sheet")).toHaveCount(0);
}

test("기구 바꾸기 — 바벨 벤치프레스를 덤벨로 바꿔 마친 기록 = 덤벨 벤치프레스의 기록·PR (성공 기준 3)", async ({
  page,
}) => {
  await 카탈로그_준비(page);
  await 운동_시작(page, "바벨 벤치프레스");
  await 칸_시트(page);
  await page.getByTestId("swap-dumbbell").click();
  await expect(page.getByTestId("we-name").first()).toHaveText("덤벨 벤치프레스", { timeout: 15_000 });
  await 세트_기록(page, 30, 10);
  await 마치기(page);

  // 처음부터 덤벨 벤치프레스를 고르면 — 방금 기록이 이전 기록·PR 로 온다
  await 운동_시작(page, "덤벨 벤치프레스");
  await expect(첫세트(page).getByTestId("set-prev")).toContainText("30×10", { timeout: 15_000 });
  // [원본] await expect(page.getByTestId("pr-chip")).toContainText("30");
  await expect(page.getByTestId("pr-chip-both")).toContainText("30"); // 같은 세트가 중량·볼륨 PR(#50)
});

test("케이블 부착물 — 로프와 일자바 기록이 섞이지 않고, 지난 조합을 기억하고, 다른 조합 기록을 볼 수 있다", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);

  // ① 로프로 한 번
  await 운동_시작(page, "케이블 푸시다운");
  await 칸_시트(page);
  await page.getByTestId("slot-attach-rope").click();
  await 시트_닫기(page);
  await 세트_기록(page, 25, 12);
  await 마치기(page);

  // ② 다시 고르면 로프가 기본(지난 조합) — 이전 기록 25×12
  await 운동_시작(page, "케이블 푸시다운");
  await expect(page.getByTestId("variant-trigger").first()).toContainText("로프", { timeout: 15_000 });
  await expect(첫세트(page).getByTestId("set-prev")).toContainText("25×12");

  // 일자바로 바꾸면 그 칸의 기록(없음)으로 — 로프 기록이 섞여 보이지 않는다
  await 칸_시트(page);
  await page.getByTestId("slot-attach-straight").click();
  await 시트_닫기(page);
  await expect(page.getByTestId("prev-slot")).toContainText("일자바");
  await expect(첫세트(page).getByTestId("set-prev")).not.toContainText("25×12");
  await expect(page.getByTestId("btn-other-slots")).toBeVisible();
  await 세트_기록(page, 35, 10);
  await 마치기(page);

  // ③ 다음에는 일자바가 기본 · 「다른 조합 기록 보기」에 로프 기록이 있다 → 그 칸으로 바꾼다
  await 운동_시작(page, "케이블 푸시다운");
  await expect(page.getByTestId("variant-trigger").first()).toContainText("일자바", { timeout: 15_000 });
  await expect(첫세트(page).getByTestId("set-prev")).toContainText("35×10");
  await page.getByTestId("btn-other-slots").click();
  const rope = page.getByTestId("slots-sheet").getByTestId("slot-attach:rope");
  await expect(rope).toContainText("25");
  await rope.getByTestId("btn-use-slot").click();
  await expect(page.getByTestId("variant-trigger").first()).toContainText("로프", { timeout: 15_000 });
  await expect(첫세트(page).getByTestId("set-prev")).toContainText("25×12");
});

test("머신 적재 방식 — 핀로드와 플레이트는 다른 칸 · 플레이트 한쪽 입력은 볼륨 ×2", async ({ page }) => {
  test.setTimeout(150_000);
  await 카탈로그_준비(page);

  await 운동_시작(page, "머신 체스트 프레스");
  await 칸_시트(page);
  await expect(page.getByTestId("slot-load")).toBeVisible();
  await page.getByTestId("slot-load-plate").click();
  // 플레이트를 고르면 「한쪽 무게로 입력」이 나타난다(핀로드에는 없다)
  await page.getByTestId("slot-plate-one-side-input").check();
  await 시트_닫기(page);
  await expect(page.getByTestId("variant-trigger").first()).toContainText("플레이트");
  await expect(page.getByTestId("workout-exercises")).toContainText("한쪽(kg)");
  // 한쪽 입력을 켜면 안 한 세트의 미리 채운 무게가 계산 무게가 같도록 절반이 된다(20 → 10 · /qa code M-1).
  // 그 환산이 끝난 뒤에 적는다 — 환산이 입력을 덮지 않게(이 기다림이 없으면 타이밍에 따라 40 이 10 으로 덮였다).
  await expect(첫세트(page).getByTestId("set-weight")).toHaveValue("10", { timeout: 10_000 });

  // 한쪽 40kg × 10회 = 볼륨 800kg (양쪽 80kg)
  await 세트_기록(page, 40, 10);
  await expect(page.getByTestId("workout-exercises")).toContainText("볼륨 800kg", { timeout: 10_000 });
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toHaveText("800kg", { timeout: 15_000 });
  // 완료 직후 루틴 저장·반영 질문(SRS-059·060)이 요약 위에 뜨면 「저장 안 함 / 오늘만」으로 닫는다.
  for (const id of ["btn-finish-dont-save", "btn-finish-today"]) {
    const b = page.getByTestId(id);
    if (await b.isVisible()) await b.click();
  }
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

  // 다음에는 플레이트·한쪽 입력이 기본 — 이전 기록은 입력한 그대로(한쪽 40)
  await 운동_시작(page, "머신 체스트 프레스");
  await expect(page.getByTestId("variant-trigger").first()).toContainText("플레이트", { timeout: 15_000 });
  await expect(첫세트(page).getByTestId("set-prev")).toContainText("40×10");
  await expect(page.getByTestId("workout-exercises")).toContainText("한쪽(kg)");

  // 핀로드로 바꾸면 다른 칸 — 플레이트 기록이 보이지 않고, 한쪽 입력도 없다
  await 칸_시트(page);
  await page.getByTestId("slot-load-pin").click();
  await expect(page.getByTestId("slot-plate-one-side")).toHaveCount(0);
  await 시트_닫기(page);
  await expect(첫세트(page).getByTestId("set-prev")).not.toContainText("40×10");
  await expect(page.getByTestId("workout-exercises")).not.toContainText("한쪽(kg)");
});

test("손 그립 — 와이드와 클로즈 기록이 섞이지 않고, 지난 그립이 기본", async ({ page }) => {
  test.setTimeout(150_000);
  await 카탈로그_준비(page);

  // 기본 그립으로 먼저 한 번 — 기본 칸에 이력이 있어도 다음 기본값은 「지난번」 조합이다(ADR-034)
  await 운동_시작(page, "케이블 랫풀다운");
  await 세트_기록(page, 45, 10);
  await 마치기(page);

  await 운동_시작(page, "케이블 랫풀다운");
  await 칸_시트(page);
  await page.getByTestId("slot-grip-wide").click();
  await 시트_닫기(page);
  await 세트_기록(page, 50, 10);
  await 마치기(page);

  await 운동_시작(page, "케이블 랫풀다운");
  await expect(page.getByTestId("variant-trigger").first()).toContainText("와이드", { timeout: 15_000 });
  await expect(첫세트(page).getByTestId("set-prev")).toContainText("50×10");
  await 칸_시트(page);
  await page.getByTestId("slot-grip-close").click();
  await 시트_닫기(page);
  await expect(첫세트(page).getByTestId("set-prev")).not.toContainText("50×10");
  // 세트 옵션에는 더 이상 그립이 없다(그립은 블록 칸) — 원암만
  await 첫세트(page).getByTestId("set-more").click();
  await 첫세트(page).getByTestId("set-variant").click();
  await expect(page.getByText("세트 옵션 (원암·원레그)")).toBeVisible();
  await expect(page.getByText("와이드그립")).toHaveCount(0);
});

test("루틴 편집 대체는 한 번에 바뀌고(#47), 운동 중 기구 바꾸기를 루틴에도 반영할 수 있다", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);

  // 루틴 하나(바벨 벤치프레스)
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("routine-name").fill("상체 P4");
  await page.getByTestId("routine-name").blur();
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  const rows = page.getByTestId("routine-exercises").locator("> div");
  await expect(rows).toHaveCount(1, { timeout: 10_000 });
  await page.getByTestId("btn-routine-done").click();
  await expect(page.getByTestId("routine-list")).toContainText("상체 P4", { timeout: 10_000 });

  // 다시 열어 대체 — 한 번 고르면 바로 바뀐다(#47: 두 번 바꿔야 바뀌던 것)
  const tid = await page
    .getByTestId("routine-list")
    .locator("[data-testid^=routine-]")
    .first()
    .getAttribute("data-testid");
  const routineId = (tid ?? "").replace("routine-", "");
  await page.goto(`/routines/${routineId}`);
  await expect(rows).toHaveCount(1, { timeout: 20_000 });
  await rows.first().getByTestId("btn-re-swap").click();
  await page.getByTestId("picker-search").fill("덤벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(rows.first()).toContainText("덤벨 벤치프레스", { timeout: 5_000 });
  // 기구 칩에서 바로 바꿔도 한 번에
  await rows.first().getByTestId("variant-trigger").click();
  await page.getByTestId("swap-smith").click();
  await expect(rows.first()).toContainText("스미스 벤치프레스", { timeout: 5_000 });
  await page.getByTestId("btn-routine-done").click();
  await expect(page.getByTestId("routine-list")).toContainText("상체 P4", { timeout: 10_000 });

  // 다시 열어도 그대로(저장됨)
  await page.goto(`/routines/${routineId}`);
  await expect(rows.first()).toContainText("스미스 벤치프레스", { timeout: 20_000 });

  // 루틴으로 시작 → 운동 중 기구 바꾸기 → 운동 중에는 묻지 않는다 → 완료 때 「바뀐 대로 루틴 바꾸기」(SRS-059 · D3)
  await page.goto("/");
  await page.getByTestId(`routine-${routineId}`).getByTestId("btn-start-routine").click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });
  await 칸_시트(page);
  await page.getByTestId("swap-barbell").click();
  await expect(page.getByTestId("we-name").first()).toHaveText("바벨 벤치프레스");
  await expect(page.getByTestId("swap-scope")).toHaveCount(0);
  await 세트_기록(page, 60, 8);
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("finish-routine")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("btn-finish-apply").click();
  await expect(page.getByTestId("finish-change-swap")).toBeVisible();
  await page.getByTestId("btn-finish-apply-confirm").click();
  await expect(page.getByTestId("finish-pick")).toHaveCount(0, { timeout: 10_000 });

  await page.goto(`/routines/${routineId}`);
  await expect(rows.first()).toContainText("바벨 벤치프레스", { timeout: 20_000 });
});
