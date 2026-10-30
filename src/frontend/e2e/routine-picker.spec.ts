// 루틴 만들기 입구 · 전체 화면 종목 고르기 e2e (SRS-093)
//   · 홈에 「새 루틴 만들기」가 「빠른 운동 시작」과 같은 크기로 있다(루틴 0개면 빨강 — home-primary.spec 이 잰다)
//   · 루틴 편집의 「운동 추가」는 화면 전체를 덮고, 근육군·기구 칩으로 좁혀진다
//   · 검색·필터를 바꿔 가며 여러 개 골라도 선택이 남고, 「N개 추가」가 고른 순서대로 넣는다
//   · 닫기는 아무것도 넣지 않는다 · 교체는 한 줄을 누르면 바로 바뀐다
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });
}

async function 새_루틴(page: Page) {
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("routine-name").fill(`고르기 ${Date.now().toString(36)}`);
  await page.getByTestId("routine-name").blur();
}

const rows = (page: Page) => page.getByTestId("routine-exercises").locator("> div");

test("운동 추가는 화면 전체를 덮고, 부위 칩으로 좁혀진다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await 새_루틴(page);
  await page.getByTestId("btn-add-routine-exercise").click();
  const screen = page.getByTestId("picker-screen");
  await expect(screen).toBeVisible();
  const box = await screen.boundingBox();
  expect(box).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  // 하단 탭바가 덮개 위로 보이지 않는다(덮개가 맨 위)
  const top = await page.evaluate(() => {
    const el = document.elementFromPoint(195, 830);
    return el?.closest('[data-testid="picker-screen"]')
      ? "picker"
      : (el?.getAttribute("data-testid") ?? el?.tagName);
  });
  expect(top).toBe("picker");

  const list = page.getByTestId("picker-list").locator("> li");
  await expect(list.first()).toBeVisible({ timeout: 20_000 });
  const all = await list.count();
  await page.getByTestId("picker-chip-muscle-chest").click();
  await expect(page.getByTestId("picker-chip-muscle-chest")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => list.count()).toBeLessThan(all);
  await page.getByTestId("picker-chip-equipment-barbell").click();
  await expect(page.getByTestId("picker-list")).toContainText("바벨 벤치프레스");
  await expect(page.getByTestId("picker-list")).not.toContainText("덤벨");
});

test("검색·필터를 바꿔 가며 셋을 골라 「3개 추가」 — 고른 순서대로 들어간다", async ({ page }) => {
  test.setTimeout(120_000);
  await 카탈로그_준비(page);
  await 새_루틴(page);
  await page.getByTestId("btn-add-routine-exercise").click();
  const confirm = page.getByTestId("picker-confirm");
  await expect(confirm).toBeDisabled();

  await page.getByTestId("picker-search").fill("스쿼트");
  await page.getByTestId("pick-seed-barbell-squat").click();
  await expect(page.getByTestId("pick-seed-barbell-squat").getByTestId("pick-order")).toHaveText("1");

  await page.getByTestId("picker-search").fill("");
  await page.getByTestId("picker-chip-muscle-chest").click();
  await page.getByTestId("pick-seed-barbell-bench-press").click();
  await page.getByTestId("picker-chip-muscle-chest").click(); // 필터 해제
  await page.getByTestId("picker-search").fill("데드리프트");
  await page.getByTestId("pick-seed-deadlift").click();

  // 다시 누르면 풀리고, 다시 누르면 맨 뒤로
  await page.getByTestId("picker-search").fill("벤치");
  await page.getByTestId("pick-seed-barbell-bench-press").click();
  await expect(page.getByTestId("pick-seed-barbell-bench-press")).toHaveAttribute("aria-pressed", "false");
  await page.getByTestId("pick-seed-barbell-bench-press").click();
  await expect(page.getByTestId("pick-seed-barbell-bench-press").getByTestId("pick-order")).toHaveText("3");

  await expect(confirm).toHaveText(/3개 추가/);
  await confirm.click();
  await expect(page.getByTestId("picker-screen")).toHaveCount(0);
  await expect(rows(page)).toHaveCount(3, { timeout: 15_000 });
  await expect(rows(page).nth(0)).toContainText("스쿼트");
  await expect(rows(page).nth(1)).toContainText("데드리프트");
  // 「벤치」 검색 중에 골랐다 — 맞은 별칭이 표시 이름이 된다(SRS-056 · 고를 때의 검색 정보를 함께 넘긴다)
  await expect(rows(page).nth(2)).toContainText("벤치");
});

test("닫기(←·Esc)는 아무것도 넣지 않는다", async ({ page }) => {
  await 카탈로그_준비(page);
  await 새_루틴(page);
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("벤치");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-close").click();
  await expect(page.getByTestId("picker-screen")).toHaveCount(0);

  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("벤치");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("picker-screen")).toHaveCount(0);
  await page.waitForTimeout(800);
  await expect(rows(page)).toHaveCount(0);
});

test("교체는 한 줄을 누르면 바로 바뀐다", async ({ page }) => {
  await 카탈로그_준비(page);
  await 새_루틴(page);
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  await expect(rows(page)).toHaveCount(1, { timeout: 15_000 });

  await page.getByTestId("btn-re-swap").first().click();
  await expect(page.getByTestId("picker-screen")).toBeVisible();
  await expect(page.getByTestId("picker-confirm")).toHaveCount(0);
  await page.getByTestId("picker-search").fill("덤벨 벤치프레스");
  await page.getByTestId("pick-seed-dumbbell-bench-press").click();
  await expect(page.getByTestId("picker-screen")).toHaveCount(0);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("덤벨 벤치프레스", { timeout: 15_000 });
});

test("대표 이름에 없는 별칭(롱풀)으로 골라도 그 이름으로 들어간다 — 고를 때의 검색 정보가 그 줄에 붙는다(qa code M-5)", async ({
  page,
}) => {
  await 카탈로그_준비(page);
  await 새_루틴(page);
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 스쿼트");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-search").fill("롱풀");
  const first = page.getByTestId("picker-list").locator("button").first();
  await expect(first.getByTestId("pick-alias")).toContainText("롱풀");
  await expect(first).not.toContainText(/^롱풀/); // 대표 이름은 롱풀이 아니다
  await first.click();
  await page.getByTestId("picker-confirm").click();
  await expect(rows(page)).toHaveCount(2, { timeout: 15_000 });
  await expect(rows(page).nth(0)).not.toContainText("롱풀");
  await expect(rows(page).nth(1)).toContainText("롱풀");
});

test("시스템 뒤로 가기는 피커만 닫고 편집 화면에 남는다(qa code M-4)", async ({ page }) => {
  await 카탈로그_준비(page);
  await 새_루틴(page);
  const url = page.url();
  await page.getByTestId("btn-add-routine-exercise").click();
  await expect(page.getByTestId("picker-screen")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("picker-screen")).toHaveCount(0);
  expect(page.url()).toBe(url);
  await expect(page.getByTestId("routine-name")).toBeVisible();
  // 다시 열고 고르면 정상으로 들어가고, 쌓인 칸이 남지 않는다(뒤로 한 번에 홈)
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  await expect(rows(page)).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByTestId("picker-screen")).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(page.url()).toBe(url);
});

test("하나 지운 뒤 넣어도 새 종목은 맨 뒤 — 순서값이 겹치지 않는다(qa code M-2)", async ({ page }) => {
  test.setTimeout(120_000);
  await 카탈로그_준비(page);
  await 새_루틴(page);
  await page.getByTestId("btn-add-routine-exercise").click();
  for (const id of ["seed-barbell-squat", "seed-deadlift", "seed-barbell-bench-press"]) {
    await page
      .getByTestId("picker-search")
      .fill(
        id === "seed-barbell-squat"
          ? "바벨 스쿼트"
          : id === "seed-deadlift"
            ? "데드리프트"
            : "바벨 벤치프레스",
      );
    await page.getByTestId(`pick-${id}`).click();
  }
  await page.getByTestId("picker-confirm").click();
  await expect(rows(page)).toHaveCount(3, { timeout: 15_000 });
  // 첫 종목(스쿼트)을 지운다 — 남은 순서값 1·2
  await rows(page).nth(0).getByTestId("btn-re-remove").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(rows(page)).toHaveCount(2, { timeout: 15_000 });
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 컬");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  await expect(rows(page)).toHaveCount(3, { timeout: 15_000 });
  await expect(rows(page).nth(0)).toContainText("데드리프트");
  await expect(rows(page).nth(2)).toContainText("컬");
});

test("운동 중 「종목 추가」도 전체 화면 — 둘을 골라 고른 순서대로 블록이 생긴다(2026-10-30)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  const screen = page.getByTestId("picker-screen");
  await expect(screen).toBeVisible();
  expect(await screen.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
  await page.getByTestId("picker-search").fill("데드리프트");
  await page.getByTestId("pick-seed-deadlift").click();
  await page.getByTestId("picker-search").fill("바벨 스쿼트");
  await page.getByTestId("pick-seed-barbell-squat").click();
  await page.getByTestId("picker-confirm").click();
  await expect(screen).toHaveCount(0);
  const names = page.getByTestId("we-name");
  await expect(names).toHaveCount(2, { timeout: 20_000 });
  await expect(names.nth(0)).toContainText("데드리프트");
  await expect(names.nth(1)).toContainText("스쿼트");
});
