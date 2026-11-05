// 오픈짐 대조 갭 보강 e2e (SRS-094) — 새 종목이 검색·스무고개·픽토그램·운동 기록에서 기존 종목과 똑같이 쓰이는가
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
}

test("새 종목을 검색해 고르면 그림과 함께 운동에 들어가고 세트가 저장된다", async ({ page }) => {
  test.setTimeout(120_000);
  await 카탈로그_준비(page);
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  // 띄어쓰기를 빼고 쳐도 찾는다
  await page.getByTestId("picker-search").fill("싱글레그데드");
  const sld = page.getByTestId("pick-seed-single-leg-deadlift");
  await expect(sld).toBeVisible({ timeout: 15_000 });
  // 그림이 없을 때의 기구 아이콘도 svg 다 — 픽토그램 표식으로 본다(qa code M-3)
  await expect(sld.locator("[data-picto]").first()).toBeVisible();
  await sld.click();
  await page.getByTestId("picker-search").fill("티비알리스");
  await page.getByTestId("pick-seed-tibialis-raise").click();
  await page.getByTestId("picker-confirm").click();
  const names = page.getByTestId("we-name");
  await expect(names).toHaveCount(2, { timeout: 20_000 });
  await expect(names.nth(0)).toContainText("싱글 레그 데드리프트");
  await expect(names.nth(1)).toContainText("티비알리스 레이즈");
  await page.getByTestId("set-reps").first().fill("12");
  await page.getByTestId("set-done").first().click();
  await expect(page.getByTestId("set-done").first()).toHaveAttribute("aria-pressed", "true");
  // 새로고침 뒤에도 남는다(qa code L-6)
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByTestId("we-name").first()).toContainText("싱글 레그 데드리프트", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("set-reps").first()).toHaveValue("12");
});

test("서버 카탈로그가 새 판(633행 · 보관 포함)이고 기기가 두 페이지를 받아 맞춘다(qa code L-5)", async ({
  page,
}) => {
  // 번들 top-up 이 새 종목을 먼저 만들어 화면만으로는 서버 경로를 증명하지 못한다 — 받은 판과 응답을 직접 본다
  const pulls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("PullCatalog")) pulls.push(r.postData() ?? "");
  });
  const bodies: string[] = [];
  page.on("response", async (r) => {
    if (r.url().includes("PullCatalog")) bodies.push(await r.text().catch(() => ""));
  });
  await 카탈로그_준비(page);
  const rev = await page.evaluate(() => localStorage.getItem("liftgram.catalog.revision"));
  expect(rev?.startsWith("633:")).toBe(true);
  // 첫 1건(판 확인) + 500 + 나머지 = 3번 이상
  expect(pulls.length).toBeGreaterThanOrEqual(3);
  expect(bodies.join("").includes("seed-stomach-vacuum")).toBe(true);
  expect(bodies.join("").includes("seed-barbell-overhead-shrug")).toBe(true);
});

test("별칭으로도 찾는다 — 「Z 프레스」 · 같은 동작은 기존 종목으로(「SDHP」→ 데드리프트 하이 풀 · qa spec H-2)", async ({
  page,
}) => {
  await 카탈로그_준비(page);
  await page.goto("/routines/new");
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("routine-name").fill(`갭 ${Date.now().toString(36)}`);
  await page.getByTestId("routine-name").blur();
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("SDHP");
  await expect(page.getByTestId("picker-list").locator("> li").first()).toContainText(
    "바벨 데드리프트 하이 풀",
    {
      timeout: 15_000,
    },
  );
  await page.getByTestId("picker-search").fill("z 프레스");
  await expect(page.getByTestId("picker-list")).toContainText("바벨 Z 프레스");
  await expect(page.getByTestId("picker-list")).toContainText("덤벨 Z 프레스");
});

test("스무고개: 햄스트링 → 엉덩이 접기에 싱글 레그 데드리프트 셋이 나온다", async ({ page }) => {
  await 카탈로그_준비(page);
  await page.goto("/routines/new");
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("routine-name").fill(`갭 ${Date.now().toString(36)}`);
  await page.getByTestId("routine-name").blur();
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-wizard").click();
  await page.getByTestId("wizard-muscle-hamstrings").click();
  await page.getByTestId("wizard-sub-hinge").click();
  const list = page.getByTestId("picker-list");
  for (const id of [
    "seed-single-leg-deadlift",
    "seed-dumbbell-single-leg-deadlift",
    "seed-kettlebell-single-leg-deadlift",
  ])
    await expect(page.getByTestId(`pick-${id}`)).toBeVisible({ timeout: 15_000 });
  await expect(list).toContainText("바벨 루마니안 데드리프트"); // 기존 종목도 그대로
});

test("주의 문구는 해당 종목 상세에만 보인다", async ({ page }) => {
  await 카탈로그_준비(page);
  await page.goto("/exercise/seed-barbell-jefferson-curl");
  await expect(page.getByTestId("exercise-caution")).toContainText("척추를 말아", { timeout: 20_000 });
  await page.goto("/exercise/seed-barbell-bench-press");
  await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("exercise-caution")).toHaveCount(0);
});
