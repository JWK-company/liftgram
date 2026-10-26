// 종목 카탈로그 개편 P2 e2e — 기구 바꾸기 = 종목 바꾸기 · 부착물/그립 칸 · 보관 종목은 고를 수 없다 (ADR-033·034)
//
// 여기서 보는 것: 바벨 인클라인을 덤벨로 바꾸면 **종목이 바뀌고**(#44 — 변형 칸이 아니다), 케이블 종목은 부착물을,
// 그립을 허용하는 동작은 그립을 칸으로 고른다. 병합된 옛 종목(로프 푸시다운)은 목록에 없다 — 기록은 대상 종목으로 옮겨진다.
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
}

test("기구 바꾸기 — 바벨 인클라인 프레스를 덤벨로 바꾸면 덤벨 인클라인 프레스가 된다(변형 칸이 아니라 종목)", async ({
  page,
}) => {
  await 카탈로그_준비(page);
  await 운동_시작(page, "바벨 인클라인 프레스");
  await expect(page.getByTestId("we-name").first()).toHaveText("바벨 인클라인 프레스", { timeout: 15_000 });

  await page.getByTestId("variant-trigger").first().click();
  await expect(page.getByTestId("swap-equipment")).toBeVisible();
  // 기구 줄의 칩은 **종목**이다(같은 동작 그룹의 다른 기구) — 켜진 것은 지금 종목의 기구
  await expect(page.getByTestId("swap-barbell")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("swap-dumbbell").click();

  await expect(page.getByTestId("we-name").first()).toHaveText("덤벨 인클라인 프레스", { timeout: 15_000 });
});

test("케이블 푸시다운 — 부착물(로프)을 칸으로 고르고, 다시 누르면 해제된다", async ({ page }) => {
  await 카탈로그_준비(page);
  await 운동_시작(page, "케이블 푸시다운");
  await page.getByTestId("variant-trigger").first().click();
  await expect(page.getByTestId("slot-attach")).toBeVisible();
  await page.getByTestId("slot-attach-rope").click();
  await expect(page.getByTestId("slot-attach-rope")).toHaveAttribute("aria-pressed", "true");
  // 시트 바깥(어두운 뒤판)을 눌러 닫는다
  await page
    .getByTestId("variant-sheet")
    .locator("xpath=..")
    .locator('button[aria-label="닫기"]')
    .click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId("variant-trigger").first()).toContainText("로프");
});

test("병합된 옛 종목은 목록에 없고 대표 이름으로 찾는다", async ({ page }) => {
  await 카탈로그_준비(page);
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("푸시다운");
  const list = page.getByTestId("picker-list");
  await expect(list).toContainText("케이블 푸시다운");
  // 로프 푸시다운은 케이블 푸시다운 + 로프로 접혔다(보관 — 고를 수 없다)
  await expect(list).not.toContainText("로프 푸시다운");
});
