// @plm SRS-061 SRS-062 SRS-063  운동 중 보조 e2e — PR 칩 2종 · PR 기록 바로잡기 · 슈퍼셋 함께 완료 · 처방 무게 기준
//
// 확인하는 것:
//   · 중량 PR·볼륨 PR 칩이 따로 보이고, 누르면 아직 안 한 첫 세트에 채워진다(#50)
//   · 「이 기록 보기」로 가서 그 세트를 지우면 PR 칩이 다음 기록으로 바뀐다(#51)
//   · 슈퍼셋 체크 한 번 = 묶음의 같은 번호 세트 함께 완료 · 멤버 칸에 적고 저장 안 한 값도 반영 · 「이 종목만」(#48)
//   · 「1RM의 80%」 처방 → 시작 무게가 계산돼 근거와 함께 · 탑셋을 마치면 「탑셋의 90%」 백오프가 채워진다(#56)
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
}

async function 빠른_운동(page: Page, 종목들: string[]) {
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  for (const [i, 종목] of 종목들.entries()) {
    await page.getByTestId("btn-add-exercise").click();
    await page.getByTestId("picker-search").fill(종목);
    await page.getByTestId("picker-list").locator("button").first().click();
    await expect(page.getByTestId("exercise-picker")).toHaveCount(0);
    await expect(page.getByTestId("workout-exercises").locator("> div")).toHaveCount(i + 1);
  }
}

function 블록(page: Page, i: number) {
  return page.getByTestId("workout-exercises").locator("> div").nth(i);
}
function 세트(block: ReturnType<typeof 블록>, k: number) {
  return block.getByTestId("set-list").locator("> div").nth(k);
}

async function 기록(row: ReturnType<typeof 세트>, kg: number, reps: number) {
  await row.getByTestId("set-weight").fill(String(kg));
  await row.getByTestId("set-reps").fill(String(reps));
  await row.getByTestId("set-reps").blur();
  await row.getByTestId("set-done").click();
  await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
}

/** 완료 → (빠른 운동이면) 루틴 저장 안 함 → 요약 닫기 */
async function 완료(page: Page) {
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 15_000 });
  const skip = page.getByTestId("btn-finish-dont-save");
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

test("PR 칩 — 중량·볼륨 따로, 누르면 다음 세트에 채우고, 기록 보기에서 지우면 바뀐다", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);

  // ① 100×3(중량 PR) · 80×12(볼륨 PR) 를 남긴다
  await 빠른_운동(page, ["바벨 벤치프레스"]);
  const b = 블록(page, 0);
  await b.getByTestId("btn-add-set").click();
  await expect(b.getByTestId("set-list").locator("> div")).toHaveCount(2);
  await 기록(세트(b, 0), 100, 3);
  await 기록(세트(b, 1), 80, 12);
  await 완료(page);

  // ② 다시 시작하면 칩이 두 개
  await 빠른_운동(page, ["바벨 벤치프레스"]);
  const b2 = 블록(page, 0);
  await expect(b2.getByTestId("pr-chip-weight")).toContainText("100", { timeout: 15_000 });
  await expect(b2.getByTestId("pr-chip-volume")).toContainText("80");

  // ③ 볼륨 PR 칩 → 아직 안 한 첫 세트에 80×12
  await b2.getByTestId("pr-chip-volume").click();
  await expect(세트(b2, 0).getByTestId("set-weight")).toHaveValue("80", { timeout: 10_000 });
  await expect(세트(b2, 0).getByTestId("set-reps")).toHaveValue("12");

  // ④ 중량 PR 「이 기록 보기」 → 그 세트를 지운다
  await b2.getByTestId("pr-chip-weight-history").click();
  await expect(page).toHaveURL(/\/history\/.+\?set=/, { timeout: 15_000 });
  const focused = page.locator("[data-testid=detail-set][style*=brand]");
  await expect(focused).toHaveCount(1, { timeout: 15_000 });
  await expect(focused).toContainText("100");
  await focused.click();
  await page.getByTestId("edit-set-delete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("detail-set")).toHaveCount(1, { timeout: 15_000 });

  // ⑤ 운동으로 돌아가면 남은 80×12 가 중량·볼륨 둘 다 — 칩 하나
  await page.goto("/workout");
  await expect(블록(page, 0).getByTestId("pr-chip-both")).toContainText("80", { timeout: 15_000 });
  await expect(블록(page, 0).getByTestId("pr-chip-weight")).toHaveCount(0);
});

test("슈퍼셋 — 체크 한 번에 같은 번호 세트 함께 완료 · 적어 둔 값 반영 · 이 종목만", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await 빠른_운동(page, ["바벨 벤치프레스", "바벨 로우"]);
  await 블록(page, 0).getByTestId("btn-we-menu").click();
  await page.getByTestId("btn-superset").click();
  await page.getByTestId("superset-option").first().click();
  await expect(page.getByTestId("btn-unlink-superset")).toBeVisible({ timeout: 10_000 });

  // 묶음 안 두 종목 — 각자 세트 하나씩
  const group = page.getByTestId("workout-exercises").locator("> div").first();
  const lists = group.getByTestId("set-list");
  await expect(lists).toHaveCount(2);
  const a1 = lists.nth(0).locator("> div").nth(0);
  const b1 = lists.nth(1).locator("> div").nth(0);

  // 로우 칸에 적고 **저장(blur) 없이** 벤치 체크를 누른다
  await b1.getByTestId("set-weight").fill("55");
  await a1.getByTestId("set-weight").fill("60");
  await a1.getByTestId("set-done").click();
  await expect(a1.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
  await expect(b1.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
  // 휴식은 한 번만 — 휴식 바 하나(휴식은 화면 상태라 새로고침 전에 본다)
  await expect(page.getByTestId("rest-bar")).toHaveCount(1);
  // 적어 둔 55 가 저장돼 완료(다시 읽어도 55)
  await page.reload();
  const g2 = page.getByTestId("workout-exercises").locator("> div").first();
  await expect(
    g2.getByTestId("set-list").nth(1).locator("> div").nth(0).getByTestId("set-weight"),
  ).toHaveValue("55", {
    timeout: 15_000,
  });

  // 「이 종목만」 — 벤치 1세트만 해제
  const a1b = g2.getByTestId("set-list").nth(0).locator("> div").nth(0);
  const b1b = g2.getByTestId("set-list").nth(1).locator("> div").nth(0);
  await a1b.getByTestId("set-more").click();
  await a1b.getByTestId("set-done-single").click();
  await expect(a1b.getByTestId("set-done")).toHaveAttribute("aria-pressed", "false", { timeout: 10_000 });
  await expect(b1b.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
});

test("처방 무게 — 1RM의 80% 로 시작 · 탑셋을 마치면 탑셋의 90% 백오프", async ({ page }) => {
  test.setTimeout(240_000);
  await 카탈로그_준비(page);

  // ① 기록: 100×1 → 추정 1RM 100
  await 빠른_운동(page, ["바벨 벤치프레스"]);
  await 기록(세트(블록(page, 0), 0), 100, 1);
  await 완료(page);

  // ② 루틴: 1세트 탑 1RM 80% · 2세트 백오프 탑셋 90%
  const 이름 = `처방 무게 ${Date.now().toString(36)}`;
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("routine-name").fill(이름);
  await page.getByTestId("routine-name").blur();
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("routine-exercises").locator("> div")).toHaveCount(1, { timeout: 10_000 });
  await page.getByTestId("btn-rx").click();
  const sheet = page.getByTestId("rx-sheet");
  await expect(sheet).toBeVisible();
  // 행 1: 탑 · 1RM 80%
  await sheet.getByTestId("rx-type").nth(0).click(); // normal → warmup
  await sheet.getByTestId("rx-type").nth(0).click(); // → top
  await sheet.getByTestId("rx-load-basis").nth(0).click(); // 없음 → 1RM%
  await sheet.getByTestId("rx-load-value").nth(0).fill("80");
  // 행 2: 백오프 · 탑셋 90%
  await sheet.getByRole("button", { name: /세트 추가|Add set/ }).click();
  await sheet.getByTestId("rx-type").nth(1).click();
  await sheet.getByTestId("rx-type").nth(1).click();
  await sheet.getByTestId("rx-type").nth(1).click(); // → backoff
  await sheet.getByTestId("rx-load-basis").nth(1).click();
  await sheet.getByTestId("rx-load-basis").nth(1).click(); // → 탑셋%
  await sheet.getByTestId("rx-load-value").nth(1).fill("90");
  await page.getByTestId("btn-rx-save").click();
  await page.getByTestId("btn-routine-done").click();
  await expect(page.getByTestId("routine-list")).toContainText(이름, { timeout: 10_000 });

  // ③ 시작 → 1세트 80kg + 근거
  const tid = await page
    .getByTestId("routine-list")
    .locator("[data-testid^=routine-]")
    .filter({ hasText: 이름 })
    .first()
    .getAttribute("data-testid");
  await page
    .getByTestId(tid ?? "")
    .getByTestId("btn-start-routine")
    .click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });
  const b = 블록(page, 0);
  await expect(세트(b, 0).getByTestId("set-weight")).toHaveValue("80", { timeout: 15_000 });
  await expect(세트(b, 0).getByTestId("set-load-note")).toContainText("80%");
  await expect(세트(b, 1).getByTestId("set-load-note")).toContainText("90%");

  // ④ 탑셋 80×3 완료 → 백오프 72.5(80×0.9=72 → 바벨 2.5kg 단위)
  await 세트(b, 0).getByTestId("set-reps").fill("3");
  await 세트(b, 0).getByTestId("set-reps").blur();
  await 세트(b, 0).getByTestId("set-done").click();
  await expect(세트(b, 1).getByTestId("set-weight")).toHaveValue("72.5", { timeout: 15_000 });
  await expect(세트(b, 1).getByTestId("set-load-note")).toContainText("90%");
});
