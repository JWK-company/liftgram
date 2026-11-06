// 종목 카탈로그 개편 P5 e2e — 픽토그램이 목록·고르기·운동 블록·팁·상세에 실제로 그려진다 (ADR-036)
//
// 여기서 보는 것: 그림이 **자체 생성 SVG** 로 뜨는가(사진 CDN 이 아니라), 움직임 그림이 프레임을 바꾸는가,
// 동작 줄이기 설정이면 멈춰 있는가.
import { expect, test } from "@playwright/test";
import { 블록_더보기 } from "./helpers/block";

type Page = import("@playwright/test").Page;

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
}

test("종목 목록 썸네일은 픽토그램 SVG 다 — 사진 CDN 을 부르지 않는다", async ({ page }) => {
  const cdn: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("free-exercise-db")) cdn.push(r.url());
  });
  await 카탈로그_준비(page);
  const first = page.getByTestId("row-picto").first();
  await expect(first.locator("svg")).toBeVisible({ timeout: 15_000 });
  // 색은 앱 토큰(CSS 변수)을 따른다
  expect(await first.innerHTML()).toContain("var(--picto-ink, var(--color-ink");
  expect(cdn).toEqual([]);
});

test("운동 상세에 사진이 없다 — 사진 CDN 을 부르지 않고 설명은 남는다", async ({ page }) => {
  const cdn: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("free-exercise-db") || r.url().includes("jsdelivr")) cdn.push(r.url());
  });
  await page.goto("/exercise/seed-barbell-bench-press");
  await expect(page.getByTestId("exercise-name")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("자세 설명").first()).toBeVisible();
  await page.waitForTimeout(1_000);
  expect(cdn).toEqual([]);
});

test("종목 고르기·운동 블록에 그림이 있고, 팁을 펴면 움직인다", async ({ page }) => {
  // SPEC-036: 영상이 있는 종목도 있으니 영상을 막아 픽토그램 경로만 본다
  await page.route("**/motion/**", (r) => r.abort());
  await 카탈로그_준비(page);
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  // SPEC-034: 영상이 있는 종목은 정지 사진을 그리므로, 픽토그램만 있는 종목으로 본다
  await page.getByTestId("picker-search").fill("노르딕 컬");
  // 고르기 목록 줄에도 그림
  await expect(page.getByTestId("picker-list").locator("button").first().locator("svg")).toBeVisible({
    timeout: 15_000,
  });
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click(); // 전체 화면 피커 — 골라서 「N개 추가」(SRS-093)
  await expect(page.getByTestId("we-picto").first().locator("svg")).toBeVisible({ timeout: 15_000 });

  await 블록_더보기(page.getByTestId("workout-exercises").locator("> div").first()); // 운동 방법은 「더 보기」 안(SRS-069)
  await page.getByTestId("tip-toggle").first().click();
  const tip = page.getByTestId("tip-motion-picto"); // SPEC-034: 영상 틀 안의 픽토그램
  await expect(tip.locator("svg")).toBeVisible({ timeout: 15_000 });
  const a = await tip.innerHTML();
  await expect.poll(async () => (await tip.innerHTML()) !== a, { timeout: 5_000 }).toBe(true);
});

test("동작 줄이기 설정이면 상세의 그림이 멈춰 있다", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/exercise/seed-barbell-bench-press");
  const pic = page.getByTestId("exercise-motion-picto"); // SPEC-034: 영상 종목도 동작 줄이기면 픽토그램
  await expect(pic.locator("svg")).toBeVisible({ timeout: 20_000 });
  const a = await pic.innerHTML();
  await page.waitForTimeout(1500);
  expect(await pic.innerHTML()).toBe(a);
  await context.close();
});

test("상세 화면은 움직이는 그림을 보여 준다", async ({ page }) => {
  await page.goto("/exercise/seed-nordic-curl"); // SPEC-034: 영상이 없는 종목은 움직이는 픽토그램
  const pic = page.getByTestId("exercise-motion-picto");
  await expect(pic.locator("svg")).toBeVisible({ timeout: 20_000 });
  const a = await pic.innerHTML();
  await expect.poll(async () => (await pic.innerHTML()) !== a, { timeout: 5_000 }).toBe(true);
});
