// 주간 스케줄 · 캐치업 · 순서 바꾸기 · 월 결산 e2e
//
// 확인하는 것:
//   · 스케줄을 **만들 수 있고**(요일 배정 + 블록 주기) 지울 수 있다
//   · 배정한 요일이 주차 스트립에 뜨고, 오늘 예정이 안내 카드로 나온다
//   · 루틴 순서를 바꾸면 새로고침해도 그대로다
//   · 이번 달 자랑하기는 **운동이 있을 때만** 뜬다
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function 준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
}

async function 루틴_만들기(page: Page, 이름: string) {
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("routine-name").fill(이름);
  await page.getByTestId("routine-name").blur();
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("routine-exercises").locator("> div")).toHaveCount(1, { timeout: 20_000 });
  await page.getByTestId("btn-routine-done").click();
  await expect(page.getByTestId("routine-list")).toContainText(이름, { timeout: 20_000 });
}

test("주간 스케줄을 만들고 지운다", async ({ page }) => {
  test.setTimeout(180_000);
  const 루틴 = `스케줄루틴${Date.now().toString(36)}`;
  await 준비(page);
  await 루틴_만들기(page, 루틴);

  // 스케줄이 없으면 만들기 입구가 열려 있다(예전에는 눌리지 않았다).
  await page.goto("/");
  await page.getByTestId("entry-schedule").click();
  await expect(page.getByTestId("schedule-editor")).toBeVisible({ timeout: 20_000 });

  // 월요일에 루틴을 배정한다 — 목록에서 **전부** 고를 수 있다.
  await page.getByTestId("schedule-day-mon").click();
  await expect(page.getByTestId("schedule-day-picker")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("schedule-day-picker").getByText(루틴).click();
  await expect(page.getByTestId("schedule-day-mon")).toContainText(루틴);

  // 화요일은 휴식.
  await page.getByTestId("schedule-day-tue").click();
  await page.getByTestId("pick-rest").click();
  await expect(page.getByTestId("schedule-day-tue")).toContainText("휴식");

  // 4주 블록.
  await page.getByTestId("schedule-block-4").click();
  await expect(page.getByTestId("schedule-block-4")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("schedule-save").click();
  await expect(page.getByTestId("schedule-editor")).toHaveCount(0, { timeout: 20_000 });

  // 카드가 뜨고 주차 배지가 붙는다.
  await expect(page.locator("main")).toContainText("1주차", { timeout: 20_000 });

  // 새로고침해도 남아 있다.
  await page.reload();
  await expect(page.locator("main")).toContainText("1주차", { timeout: 20_000 });

  // 지우면 만들기 입구로 돌아간다.
  await page.getByTestId("btn-edit-schedule").click();
  await page.getByTestId("schedule-delete").click();
  await page.getByTestId("confirm-delete-schedule").getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("entry-schedule")).toBeVisible({ timeout: 20_000 });
});

test("루틴 순서를 바꾸면 새로고침해도 그대로다", async ({ page }) => {
  test.setTimeout(180_000);
  const 첫째 = `가루틴${Date.now().toString(36)}`;
  const 둘째 = `나루틴${Date.now().toString(36)}`;
  await 준비(page);
  await 루틴_만들기(page, 첫째);
  await 루틴_만들기(page, 둘째);

  await page.goto("/");
  const 목록 = page.getByTestId("routine-list");
  await expect(목록).toContainText(첫째, { timeout: 20_000 });

  // 둘째를 위로 올린다.
  const 처음순서 = (await 목록.textContent()) ?? "";
  expect(처음순서.indexOf(첫째)).toBeLessThan(처음순서.indexOf(둘째));

  await page.getByTestId("btn-routine-actions").nth(1).click();
  await page.getByTestId("routine-actions").getByText("위로 이동").click();

  await expect
    .poll(
      async () => {
        const s = (await 목록.textContent()) ?? "";
        return s.indexOf(둘째) < s.indexOf(첫째);
      },
      { timeout: 20_000 },
    )
    .toBe(true);

  // 새로고침해도 바뀐 순서다.
  await page.reload();
  const 나중순서 = (await 목록.textContent()) ?? "";
  expect(나중순서.indexOf(둘째)).toBeLessThan(나중순서.indexOf(첫째));
});

test("이번 달 자랑하기는 운동이 있을 때만 뜬다", async ({ page }) => {
  test.setTimeout(180_000);
  await 준비(page);

  // 아직 아무것도 안 했으면 버튼이 없다.
  await page.goto("/calendar");
  await expect(page.getByTestId("btn-brag-month")).toHaveCount(0);

  // 운동을 하나 마치면 뜬다.
  await page.goto("/workout");
  await expect(page.getByTestId("btn-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("set-weight").first().fill("60");
  await page.getByTestId("set-reps").first().fill("10");
  await page.getByTestId("set-done").first().click();
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-summary-close").click();

  await page.goto("/calendar");
  await expect(page.getByTestId("btn-brag-month")).toBeVisible({ timeout: 20_000 });

  // 로그인하지 않았으면 그 사실을 알린다(조용히 실패하지 않는다).
  await page.getByTestId("btn-brag-month").click();
  await expect(page.getByTestId("toast-root")).toContainText("로그인", { timeout: 20_000 });
});
