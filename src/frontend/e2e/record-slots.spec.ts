// 종목 카탈로그 개편 P4 e2e — 운동 중 기록 칸(조합) (ADR-033·034·037 · SRS-057·058)
//
// 여기서 보는 것:
//   · 바벨 벤치프레스를 덤벨로 바꿔 마친 세션 = 덤벨 벤치프레스를 처음부터 고른 세션(성공 기준 3)
//   · 케이블 부착물(로프/일자바)·머신 적재 방식(핀/플레이트)·손 그립은 기록이 섞이지 않고, 지난 조합이 기본으로 고른다
//   · 「다른 조합 기록 보기」로 다른 칸의 지난 기록을 보고 그 칸으로 바꾼다
//   · 플레이트 「한쪽 무게로 입력」 — 입력은 한쪽, 볼륨은 ×2
//   · 루틴 편집의 대체가 한 번에 바뀐다(#47) · 운동 중 기구 바꾸기를 「루틴에도」 반영한다
import { expect, test } from "@playwright/test";
import { 블록_행동_보임 } from "./helpers/block";

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
  await page.getByTestId("picker-confirm").click(); // 전체 화면 피커 — 골라서 「N개 추가」(SRS-093)
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
  // [원본] prev-slot(읽어 주는 글) — 화면에서 지웠다(/qa code L-4). 이전 기록은 늘 지금 칸에서 읽으므로 트리거로 본다.
  await expect(page.getByTestId("variant-trigger").first()).toContainText("일자바");
  await expect(첫세트(page).getByTestId("set-prev")).not.toContainText("25×12");
  // [원본] 이번 칸(일자바)에 기록이 없으면 「다른 조합 기록 보기」는 접지 않고 메타 줄에 꺼내 둔다(/qa code M-4) — block-more-panel 0개
  // [개선 SPEC-057] 「더 보기」가 없어 늘 보인다
  await expect(page.getByTestId("btn-other-slots")).toBeVisible();
  await 세트_기록(page, 35, 10);
  await 마치기(page);

  // ③ 다음에는 일자바가 기본 · 「다른 조합 기록 보기」에 로프 기록이 있다 → 그 칸으로 바꾼다
  await 운동_시작(page, "케이블 푸시다운");
  await expect(page.getByTestId("variant-trigger").first()).toContainText("일자바", { timeout: 15_000 });
  await expect(첫세트(page).getByTestId("set-prev")).toContainText("35×10");
  await 블록_행동_보임(page.getByTestId("workout-exercises").locator("> div").first()); // [원본] 블록_더보기 — 늘 보인다(SPEC-057)
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
  // [원본] 한쪽 입력을 켜면 안 한 세트의 미리 채운 무게가 계산 무게가 같도록 절반이 된다(20 → 10 · /qa code M-1).
  // await expect(첫세트(page).getByTestId("set-weight")).toHaveValue("10", { timeout: 10_000 });
  // [개선] 플레이트 머신은 처음부터 한쪽(×2)으로 태어난다(피드백 #63) — 켤 것이 없어 환산도 없다(20 그대로) @plm SRS-084
  await expect(첫세트(page).getByTestId("set-weight")).toHaveValue("20", { timeout: 10_000 });

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
  // [원본] 세트 옵션에는 더 이상 그립이 없다(그립은 블록 칸) — 원암만
  // [개선] 세트 옵션에서도 고를 수 있다 — 고르면 세트가 아니라 블록 칸이 바뀐다(사용자 결정 2026-11-04)
  await 첫세트(page).getByTestId("set-more").click();
  await 첫세트(page).getByTestId("set-variant").click();
  // [원본] await expect(page.getByText("세트 옵션 (원암·원레그)")).toBeVisible();
  // [원본] await expect(page.getByText("와이드그립")).toHaveCount(0);
  // [원본] await page.getByText("와이드그립").click();
  // [원본] await expect(page.getByTestId("set-grip-legacy")).toHaveCount(0);
  // [원본] await expect(page.getByTestId("variant-trigger").first()).toContainText("와이드");
  // [개선] 세트 그립은 그 세트에만 — 블록 칸은 그대로(사용자 요청 2026-11-05 · ADR-055)
  await expect(page.getByText("세트 옵션 (이 세트만)")).toBeVisible();
  await page.getByText("와이드그립").click();
  await page.getByTestId("set-variant-sheet").getByRole("button", { name: "확인" }).click();
  await expect(첫세트(page).getByTestId("set-variant-badge")).toContainText("와이드");
  await expect(page.getByTestId("variant-trigger").first()).not.toContainText("와이드");
  // 칸이 클로즈일 때 — 기본 줄에 칸 그립이 보이고, 칸과 같은 그립을 고르면 이름표가 붙지 않는다
  const 시트 = page.getByTestId("set-variant-sheet");
  await 첫세트(page).getByTestId("set-variant-badge").click();
  await 시트.getByText("클로즈그립", { exact: true }).click();
  await expect(시트.getByText("기본(클로즈그립)", { exact: true })).toBeVisible();
  await 시트.getByRole("button", { name: "확인" }).click();
  await expect(첫세트(page).getByTestId("set-variant-badge")).toHaveCount(0);
});

test("머신 손 그립(#T4) — 체스트 프레스에서 언더·뉴트럴을 고르면 칸이 나뉘고, 같은 동작의 케이블에는 늘지 않는다", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await 카탈로그_준비(page);

  await 운동_시작(page, "머신 체스트 프레스");
  await 칸_시트(page);
  await expect(page.getByTestId("slot-grip-under")).toBeVisible();
  await expect(page.getByTestId("slot-grip-neutral")).toBeVisible();
  await page.getByTestId("slot-grip-under").click();
  await 시트_닫기(page);
  await 세트_기록(page, 40, 10);
  await 마치기(page);

  await 운동_시작(page, "머신 체스트 프레스");
  await expect(page.getByTestId("variant-trigger").first()).toContainText("언더", { timeout: 15_000 });
  await expect(첫세트(page).getByTestId("set-prev")).toContainText("40×10");
  await 칸_시트(page);
  await page.getByTestId("slot-grip-neutral").click();
  await 시트_닫기(page);
  await expect(첫세트(page).getByTestId("set-prev")).not.toContainText("40×10");
  await 세트_기록(page, 45, 8);
  await 마치기(page);

  // 다시 열어도 고른 뉴트럴이 저장 값 그대로 남는다(쓰기 정규화가 지우지 않는다)
  await 운동_시작(page, "머신 체스트 프레스");
  await expect(page.getByTestId("variant-trigger").first()).toContainText("뉴트럴", { timeout: 15_000 });
  await expect(첫세트(page).getByTestId("set-prev")).toContainText("45×8");
  await 세트_기록(page, 45, 8);
  await 마치기(page);

  await 운동_시작(page, "케이블 체스트 프레스");
  await 칸_시트(page);
  // [원본] await expect(page.getByTestId("slot-grip-under")).toHaveCount(0); — 기구로 축을 막지 않는다(사용자 결정 2026-11-04)
  await expect(page.getByTestId("slot-grip-under")).toBeVisible();
  await expect(page.getByTestId("slot-attach-rope")).toBeVisible();
  await page.getByTestId("slot-grip-under").click();
  await 시트_닫기(page);
  await expect(page.getByTestId("variant-trigger").first()).toContainText("언더", { timeout: 15_000 });
});

test("머신 손 그립(#T4) — 커스텀 머신 종목도 그립을 고를 수 있고, 다시 열어도 남는다", async ({ page }) => {
  test.setTimeout(150_000);
  const 이름 = `내머신${Date.now().toString(36)}`;
  await 카탈로그_준비(page);
  await page.getByTestId("btn-new-exercise").click();
  await expect(page.getByTestId("exercise-form")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("form-name-ko").fill(이름);
  await page.getByTestId("exercise-form").getByText("머신", { exact: true }).click();
  await page.getByTestId("form-save").click();
  await expect(page).toHaveURL(/\/exercises$/, { timeout: 20_000 });

  await 운동_시작(page, 이름);
  await 칸_시트(page);
  await page.getByTestId("slot-grip-under").click();
  await 시트_닫기(page);
  await 세트_기록(page, 30, 10);
  await 마치기(page);

  await 운동_시작(page, 이름);
  await expect(page.getByTestId("variant-trigger").first()).toContainText("언더", { timeout: 15_000 });
  await expect(첫세트(page).getByTestId("set-prev")).toContainText("30×10");
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
  await page.getByTestId("picker-confirm").click(); // 전체 화면 피커 — 골라서 「N개 추가」(SRS-093)
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

// 세트 변형은 세트마다 따로 — 1세트 일반·2세트 뉴트럴(사용자 요청 2026-11-05 · ADR-055)
test("세트 그립 — 세트마다 따로 저장되고 이름표가 보이며, 칸은 그대로이고 다음 운동에 이어진다", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await 카탈로그_준비(page);
  await 운동_시작(page, "덤벨 숄더 프레스");
  const 세트 = (n: number) => page.getByTestId("set-list").first().locator("> div").nth(n);
  const 그립_고르기 = async (n: number, 이름: string) => {
    await 세트(n).getByTestId("set-more").click();
    await 세트(n).getByTestId("set-variant").click();
    const sheet = page.getByTestId("set-variant-sheet");
    await sheet.getByText(이름, { exact: true }).first().click(); // 「기본」은 그립·부착물 두 줄에 있고 그립이 먼저
    await sheet.getByRole("button", { name: "확인" }).click();
    await expect(sheet).toHaveCount(0);
    await 세트(n).getByTestId("set-more").click();
  };

  // 2세트가 없으면 만든다
  if ((await page.getByTestId("set-list").first().locator("> div").count()) < 2) {
    await page.getByTestId("btn-add-set").first().click();
  }
  await expect(세트(1).getByTestId("set-weight")).toBeVisible();
  await expect(세트(0).getByTestId("set-variant-badge")).toHaveCount(0);

  await 그립_고르기(1, "뉴트럴그립");
  await expect(세트(1).getByTestId("set-variant-badge")).toHaveText("뉴트럴");
  await expect(세트(0).getByTestId("set-variant-badge")).toHaveCount(0); // 1세트는 그대로
  await expect(page.getByTestId("variant-trigger").first()).not.toContainText("뉴트럴"); // 칸도 그대로

  // 이름표는 어두운 알약 — 브랜드 빨강이 아니고, 바탕과 글자가 뚜렷이 다르다
  const 색 = await 세트(1)
    .getByTestId("set-variant-badge")
    .evaluate((el) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-brand)";
      document.body.append(probe);
      const brand = getComputedStyle(probe).color;
      probe.remove();
      const cs = getComputedStyle(el);
      return { brand, bg: cs.backgroundColor, fg: cs.color, h: el.getBoundingClientRect().height };
    });
  expect(색.bg).not.toBe(색.brand);
  expect(색.fg).not.toBe(색.brand);
  expect(색.bg).not.toBe(색.fg);
  expect(색.h).toBeGreaterThanOrEqual(24);

  // 다른 세트에 다른 그립, 기본으로 되돌리기
  await 그립_고르기(0, "언더그립");
  await expect(세트(0).getByTestId("set-variant-badge")).toHaveText("언더");
  await expect(세트(1).getByTestId("set-variant-badge")).toHaveText("뉴트럴");
  await 그립_고르기(0, "기본");
  await expect(세트(0).getByTestId("set-variant-badge")).toHaveCount(0);
  await expect(세트(1).getByTestId("set-variant-badge")).toHaveText("뉴트럴");

  // 끝내고 다시 — 그립은 새 운동에 잇지 않고, 「이전」 칸에 보인다(REV-045 H-1)
  for (const n of [0, 1]) {
    await 세트(n).getByTestId("set-weight").fill("20");
    await 세트(n).getByTestId("set-reps").fill("10");
    await 세트(n).getByTestId("set-reps").blur();
    await 세트(n).getByTestId("set-done").click();
    await expect(세트(n).getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
  }
  await 마치기(page);
  await 운동_시작(page, "덤벨 숄더 프레스");
  await expect(세트(1).getByTestId("set-prev")).toContainText("뉴트럴", { timeout: 15_000 });
  await expect(세트(1).getByTestId("set-variant-badge")).toHaveCount(0);
  await expect(세트(0).getByTestId("set-variant-badge")).toHaveCount(0);
  await expect(page.getByTestId("variant-trigger").first()).not.toContainText("뉴트럴");

  // 같은 운동 안에서 세트를 더하면 마지막 세트의 그립을 잇는다
  const 수 = await page.getByTestId("set-list").first().locator("> div").count();
  await 그립_고르기(수 - 1, "뉴트럴그립");
  await page.getByTestId("btn-add-set").first().click();
  await expect(세트(수).getByTestId("set-variant-badge")).toHaveText("뉴트럴");
});

test("세트 그립 — 기구를 바꾸면 바꾸기 전 세트 그립은 남지 않는다(REV-045 M-1)", async ({ page }) => {
  await 카탈로그_준비(page);
  await 운동_시작(page, "바벨 벤치프레스");
  await 첫세트(page).getByTestId("set-more").click();
  await 첫세트(page).getByTestId("set-variant").click();
  const 시트 = page.getByTestId("set-variant-sheet");
  await 시트.getByText("뉴트럴그립", { exact: true }).click();
  await 시트.getByRole("button", { name: "확인" }).click();
  await expect(첫세트(page).getByTestId("set-variant-badge")).toHaveText("뉴트럴");
  await 칸_시트(page);
  await page.getByTestId("swap-dumbbell").click();
  await expect(page.getByTestId("we-name").first()).toHaveText("덤벨 벤치프레스", { timeout: 15_000 });
  await expect(첫세트(page).getByTestId("set-variant-badge")).toHaveCount(0);
});

test("케이블 브랜드(id=1723·1718) — 롱풀(케이블 시티드 로우)에서 종목을 바꾸지 않고 브랜드를 고르고, 「기본」으로 지운다", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await 카탈로그_준비(page);
  await 운동_시작(page, "케이블 시티드 로우");
  await 칸_시트(page);
  await expect(page.getByTestId("slot-brand")).toBeVisible();
  await page.getByTestId("slot-brand-hammer").click();
  // 브랜드만 바뀌고 종목은 그대로(머신 로우로 넘어가지 않는다)
  await expect(page.getByTestId("variant-sheet").getByTestId("slot-brand")).toBeVisible();
  await 시트_닫기(page);
  await expect(page.getByTestId("we-name").first()).toHaveText("케이블 시티드 로우");
  await expect(page.getByTestId("variant-trigger").first()).toContainText("해머");
  // 「기본」으로 지우면 요약은 기구 이름으로 돌아온다
  await 칸_시트(page);
  await page.getByTestId("slot-brand").getByRole("button", { name: "기본", exact: true }).click();
  await expect(page.getByTestId("slot-brand")).toBeVisible(); // 열린 창의 줄은 그대로(코드 리뷰 L-2)
  await 시트_닫기(page);
  await expect(page.getByTestId("variant-trigger").first()).not.toContainText("해머");
});

// 다리 운동이면 원암·투암 대신 원레그·투레그(사용자 지시 2660) — 저장 값은 같은 arm
test("세트 옵션 — 다리 운동은 원레그·투레그로 보이고 칩·기록 상세도 원레그, 팔 운동은 원암 그대로", async ({ page }) => {
  test.setTimeout(150_000);
  await 카탈로그_준비(page);
  await 운동_시작(page, "라잉 레그 컬");
  await 첫세트(page).getByTestId("set-more").click();
  await 첫세트(page).getByTestId("set-variant").click();
  const sheet = page.getByTestId("set-variant-sheet");
  await expect(sheet.getByText("투레그", { exact: true })).toBeVisible();
  await expect(sheet.getByText("원암", { exact: true })).toHaveCount(0);
  await sheet.getByText("원레그", { exact: true }).click();
  await sheet.getByRole("button", { name: "확인" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(첫세트(page).getByTestId("set-variant-badge")).toHaveText("원레그");
  await 세트_기록(page, 30, 12);
  await 마치기(page);
  await page.goto("/history");
  await page.getByTestId("history-list").locator("a").first().click();
  await expect(page.getByTestId("detail-set").first()).toContainText("원레그", { timeout: 15_000 });

  await 운동_시작(page, "덤벨 숄더 프레스");
  await 첫세트(page).getByTestId("set-more").click();
  await 첫세트(page).getByTestId("set-variant").click();
  await expect(sheet.getByText("원암", { exact: true })).toBeVisible();
  await expect(sheet.getByText("원레그", { exact: true })).toHaveCount(0);
  await sheet.getByRole("button", { name: "확인" }).click();
  await expect(sheet).toHaveCount(0);
  await 세트_기록(page, 10, 10);
  await 마치기(page);

  // 케틀벨 스윙 — 주 부위는 둔근이지만 한 손으로 들어 원암(사용자 지시 2026-11-12)
  await 운동_시작(page, "케틀벨 스윙");
  await 첫세트(page).getByTestId("set-more").click();
  await 첫세트(page).getByTestId("set-variant").click();
  await expect(sheet.getByText("원암", { exact: true })).toBeVisible();
  await expect(sheet.getByText("원레그", { exact: true })).toHaveCount(0);
  await sheet.getByText("원암", { exact: true }).click();
  await sheet.getByRole("button", { name: "확인" }).click();
  await expect(첫세트(page).getByTestId("set-variant-badge")).toHaveText("원암");
  await 세트_기록(page, 16, 15);
  await 마치기(page);
  await page.goto("/history");
  await page.getByTestId("history-list").locator("a").first().click();
  await expect(page.getByTestId("detail-set").first()).toContainText("원암", { timeout: 15_000 });
});
