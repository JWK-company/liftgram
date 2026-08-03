// 프로필 e2e — 설정이 **다른 화면의 계산까지 바꾸는지** 본다
//
// 프로필은 값을 저장하는 화면이 아니라, 저장한 값이 세션·분석의 숫자를 바꾸는 화면이다.
// 그래서 여기서는 "저장됐다"가 아니라 "다른 화면이 그 값을 쓴다"를 확인한다.
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });
}

test("단위를 lb로 바꾸면 세션의 무게 표기가 따라간다", async ({ page }) => {
  await 카탈로그_준비(page);

  await page.goto("/profile");
  await expect(page.getByTestId("unit")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("unit-lb").click();
  // 저장이 **끝난 뒤** 옮겨 간다. 페이지를 떠나면 JS 컨텍스트가 갈리므로,
  // 아직 로컬 저장소에 안 내려간 변경은 그대로 사라진다(LokiJS는 비동기로 flush한다).
  //
  // 그런데 `aria-pressed`만 보면 부족하다 — 그 값은 **메모리의 관측값**이라 flush보다 먼저 뒤집힌다.
  // 버튼이 다시 눌릴 수 있게 되는 순간이 저장→flush→재조회가 **다 끝난** 시점이다(그동안 disabled).
  await expect(page.getByTestId("unit-lb")).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
  await expect(page.getByTestId("unit-lb")).toBeEnabled({ timeout: 20_000 });

  // 세션을 열면 무게 컬럼이 lb로 바뀌어 있다(저장은 계속 kg — 표시만 바뀐다).
  await page.goto("/workout");
  await expect(page.getByTestId("btn-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();

  await expect(page.getByTestId("workout-exercises")).toContainText("무게 (lb)", { timeout: 20_000 });
});

test("체중을 넣으면 세션의 '체중 미설정' 경고가 사라진다", async ({ page }) => {
  await 카탈로그_준비(page);

  // 어시스트 종목(체중 기준이 필요한 종목)을 담은 세션을 연다.
  await page.goto("/workout");
  await expect(page.getByTestId("btn-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("어시스트 풀업");
  const first = page.getByTestId("picker-list").locator("button").first();
  if ((await first.count()) === 0) test.skip(true, "어시스트 종목이 카탈로그에 없다");
  await first.click();

  await expect(page.getByTestId("workout-exercises")).toContainText("체중 미설정", { timeout: 20_000 });

  // 체중을 넣는다 — 스테퍼의 값을 눌러 직접 입력한다.
  await page.goto("/profile");
  await expect(page.getByTestId("bodyweight")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("bodyweight-value").click();
  await page.getByTestId("bodyweight-input").fill("70");
  await page.getByTestId("bodyweight-input").press("Enter");

  await page.goto("/workout");
  await expect(page.getByTestId("workout-exercises")).not.toContainText("체중 미설정", { timeout: 20_000 });
});

test("장비함에 담은 장비가 남는다 — 새로고침해도", async ({ page }) => {
  await page.goto("/gear");
  await expect(page.getByTestId("gear-all")).toBeVisible({ timeout: 20_000 });

  // 목록에서 첫 장비를 담는다.
  const first = page.getByTestId("gear-all").locator("button").first();
  const label = (await first.innerText()).trim();
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.getByTestId("gear-all").locator("button").first()).toHaveAttribute(
    "aria-pressed",
    "true",
    { timeout: 20_000 },
  );
  // 담은 것은 위쪽 "저장된" 목록에도 뜬다.
  await expect(page.locator("body")).toContainText(label);
});
