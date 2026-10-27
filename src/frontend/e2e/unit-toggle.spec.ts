// @plm SRS-067 SRS-068  블록별 kg/lb 토글 · 운동 중 막대 취소 e2e
//
// 확인하는 것:
//   · lb 블록에 100 을 적으면 다시 봐도 100(lb) — 볼륨은 kg 로 센다 · 기록 상세도 100lb
//   · 같은 종목·칸의 다음 운동은 lb 로 시작한다(칸별 기억 · Q1 A)
//   · 완료 세트가 있는 블록에서 토글 = 숫자 그대로·단위만(Q4 B) · 다시 누르면 원래대로
//   · 프로필에는 단위 줄이 없다(Q3 A)
//   · 운동 중 막대의 「취소」 — 운동 화면과 같은 확인창 · 확인하면 보던 화면에 머문 채 막대가 사라진다
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
}

function 블록(page: Page, i = 0) {
  return page.getByTestId("workout-exercises").locator("> div").nth(i);
}

async function 빠른_운동(page: Page, 종목: string) {
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill(종목);
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("exercise-picker")).toHaveCount(0);
  await expect(page.getByTestId("workout-exercises").locator("> div")).toHaveCount(1);
}

async function 세트(page: Page, k: number, kg: number, reps: number) {
  const row = 블록(page).getByTestId("set-list").locator("> div").nth(k);
  await row.getByTestId("set-weight").fill(String(kg));
  await row.getByTestId("set-reps").fill(String(reps));
  await row.getByTestId("set-reps").blur();
  await row.getByTestId("set-done").click();
  await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
}

async function 완료(page: Page) {
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 15_000 });
  const skip = page.getByTestId("btn-finish-dont-save");
  if (await skip.isVisible()) await skip.click();
}

test("lb 로 적은 세트는 lb 로 남고 볼륨은 kg · 같은 칸의 다음 운동은 lb 로 시작한다", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await 빠른_운동(page, "바벨 벤치프레스");

  // 기본은 kg(이 종목·칸의 기록이 없다)
  const toggle = 블록(page).getByTestId("unit-toggle");
  await expect(toggle.getByTestId("unit-toggle-kg")).toHaveAttribute("aria-pressed", "true", {
    timeout: 20_000,
  });
  await toggle.getByTestId("unit-toggle-lb").click();
  await expect(toggle.getByTestId("unit-toggle-lb")).toHaveAttribute("aria-pressed", "true");
  await expect(블록(page)).toContainText("무게 (lb)");

  await 세트(page, 0, 100, 10);
  // 다시 그려도 100 — 99.99 같은 꼬리가 없다
  await expect(
    블록(page).getByTestId("set-list").locator("> div").nth(0).getByTestId("set-weight"),
  ).toHaveValue("100");
  // 볼륨은 kg: 100lb × 10 = 453.59kg(합계 표시는 0.5kg 단위)
  await expect(블록(page)).toContainText("453.5kg", { timeout: 10_000 });

  await 완료(page);
  await expect(page.getByTestId("summary-volume")).toContainText("kg");

  // 기록 상세 — 적은 단위 그대로
  await page.goto("/history");
  await page.getByTestId("history-list").locator("a").first().click();
  await expect(page.getByTestId("detail-exercises")).toContainText("100lb × 10", { timeout: 20_000 });
  await expect(page.getByTestId("detail-volume")).toContainText("kg");

  // 같은 종목·칸의 다음 운동은 lb 로 시작한다(Q1 A)
  await 빠른_운동(page, "바벨 벤치프레스");
  await expect(블록(page).getByTestId("unit-toggle-lb")).toHaveAttribute("aria-pressed", "true", {
    timeout: 20_000,
  });
  await expect(블록(page)).toContainText("무게 (lb)");
});

test("완료한 세트가 있어도 토글은 숫자 그대로·단위만 바꾼다 · 다시 누르면 원래대로(Q4 B)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await 빠른_운동(page, "덤벨 숄더 프레스");
  const toggle = 블록(page).getByTestId("unit-toggle");
  await expect(toggle.getByTestId("unit-toggle-kg")).toHaveAttribute("aria-pressed", "true", {
    timeout: 20_000,
  });

  await 세트(page, 0, 20, 12);
  const weight = 블록(page).getByTestId("set-list").locator("> div").nth(0).getByTestId("set-weight");
  await expect(블록(page)).toContainText("240kg", { timeout: 10_000 }); // 20kg × 12

  await toggle.getByTestId("unit-toggle-lb").click();
  await expect(page.getByTestId("toast-root")).toContainText("lb", { timeout: 10_000 });
  await expect(weight).toHaveValue("20");
  await expect(블록(page)).toContainText("무게 (lb)");
  // 20lb × 12 = 108.86kg → 합계 표시 109kg
  await expect(블록(page)).toContainText("109kg", { timeout: 10_000 });

  await toggle.getByTestId("unit-toggle-kg").click();
  await expect(weight).toHaveValue("20");
  await expect(블록(page)).toContainText("240kg", { timeout: 10_000 });
});

test("프로필에는 무게 단위 줄이 없다 — 단위는 운동 블록마다(Q3 A)", async ({ page }) => {
  await page.goto("/profile");
  await expect(page.getByTestId("bar-weight")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("unit")).toHaveCount(0);
  await expect(page.getByTestId("bar-weight")).toContainText("kg");
});

test("운동 중 막대의 취소 — 같은 확인창을 거치고, 확인하면 보던 화면에 머문 채 막대가 사라진다", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await 빠른_운동(page, "바벨 벤치프레스");

  // 집중 모드를 나와 다른 화면으로
  await page.getByTestId("btn-close-session").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await page.getByTestId("home-exercises").click();
  await expect(page).toHaveURL(/\/exercises/, { timeout: 15_000 });
  const bar = page.getByTestId("global-workout-bar");
  await expect(bar).toBeVisible({ timeout: 20_000 });

  // 잘못 누름 — 확인창에서 물러서면 아무 일도 없다
  await page.getByTestId("global-workout-cancel").click();
  await expect(page.getByTestId("confirm-discard")).toBeVisible();
  await expect(page.getByTestId("confirm-discard")).toContainText("운동 취소");
  await page.getByTestId("dialog-cancel").click();
  await expect(page.getByTestId("confirm-discard")).toHaveCount(0);
  await expect(bar).toBeVisible();
  await expect(page).toHaveURL(/\/exercises/);

  // 확인 → 폐기 · 화면은 그대로 · 막대 없음
  await page.getByTestId("global-workout-cancel").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(bar).toHaveCount(0, { timeout: 15_000 });
  await expect(page).toHaveURL(/\/exercises/);

  // 운동 탭에도 진행 중 카드가 없다
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await expect(page.getByTestId("resume-card")).toHaveCount(0);
});
