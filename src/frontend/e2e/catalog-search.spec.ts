// 종목 카탈로그 개편 P3 e2e — 띄어쓰기·별칭 검색 · 별칭으로 고르면 그 이름으로 보인다 · 이름 바꾸기 (ADR-033 · SRS-056)
//
// 여기서 보는 것: 「랫 풀」처럼 띄어 써도 케이블 랫풀다운이 맨 위에 오고(#58), 「롱풀」로 고르면 운동 블록 이름이
// 「롱풀」로 보이며(기록은 케이블 시티드 로우 한 종목), 「로프 푸시다운」으로 고르면 케이블 푸시다운 + 로프 칸이 된다(D7).
// 종목 상세 ⋯ 「이름 바꾸기」로 대표 이름과 별칭 사이를 오간다.
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
}

async function 운동_열기(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
}

async function 검색해서_추가(page: Page, 검색: string) {
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill(검색);
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("exercise-picker")).toHaveCount(0);
}

test("띄어쓰기를 무시하고 별칭으로 찾는다 — 「랫 풀」 → 케이블 랫풀다운이 맨 위", async ({ page }) => {
  await 카탈로그_준비(page);
  await page.getByTestId("search-input").fill("랫 풀");
  await expect(page.getByTestId("exercise-list").locator("li").first()).toContainText("케이블 랫풀다운");
  // 별칭이 맞았으면 줄에 그 말을 함께 보여 준다
  await page.getByTestId("search-input").fill("롱풀");
  await expect(page.getByTestId("exercise-list").locator("li").first()).toContainText("케이블 시티드 로우");
  await expect(page.getByTestId("exercise-list").locator("li").first()).toContainText("롱풀");
});

test("별칭으로 고르면 그 이름으로 보이고, 함축 칸(로프)이 켜진다", async ({ page }) => {
  await 카탈로그_준비(page);
  await 운동_열기(page);

  await 검색해서_추가(page, "롱풀");
  await expect(page.getByTestId("we-name").first()).toHaveText("롱풀", { timeout: 15_000 });

  await 검색해서_추가(page, "로프 푸시다운");
  await expect(page.getByTestId("we-name").nth(1)).toHaveText("로프 푸시다운", { timeout: 15_000 });
  await expect(page.getByTestId("variant-trigger").nth(1)).toContainText("로프", { timeout: 15_000 });

  // 피커 결과 줄 — 「대표 이름 · 맞은 별칭」, 아래에 비슷한 운동
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("벤트오버");
  await expect(page.getByTestId("picker-list").locator("button").first()).toContainText("바벨 로우");
  await expect(page.getByTestId("pick-alias").first()).toBeVisible();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await expect(page.getByTestId("picker-similar")).toContainText("덤벨 벤치프레스");
});

test("종목 상세 ⋯ 이름 바꾸기 — 별칭을 고르면 그 이름, 대표 이름으로 되돌린다", async ({ page }) => {
  await 카탈로그_준비(page);
  await page.goto("/exercise/seed-seated-cable-row");
  await expect(page.getByTestId("exercise-name")).toHaveText("케이블 시티드 로우", { timeout: 20_000 });

  await page.getByTestId("exercise-more").click();
  await page.getByTestId("btn-rename-exercise").click();
  await page.getByTestId("rename-exercise-sheet").getByText("롱풀", { exact: true }).click();
  await expect(page.getByTestId("exercise-name")).toHaveText("롱풀", { timeout: 15_000 });
  await expect(page.getByTestId("exercise-official-name")).toHaveText("케이블 시티드 로우");

  // 다시 열어도 그 이름(기기 저장소에 남았다)
  await page.reload();
  await expect(page.getByTestId("exercise-name")).toHaveText("롱풀", { timeout: 20_000 });

  await page.getByTestId("exercise-more").click();
  await page.getByTestId("btn-rename-exercise").click();
  await page.getByTestId("name-choice-official").click();
  await expect(page.getByTestId("exercise-name")).toHaveText("케이블 시티드 로우", { timeout: 15_000 });
  await expect(page.getByTestId("exercise-official-name")).toHaveCount(0);
});
