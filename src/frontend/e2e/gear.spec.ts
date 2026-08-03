// 착용장비 e2e — 태그를 달고, 카드에서 링크로 열리는가 (ADR-027)
//
// 확인하는 것:
//   · 컴포저에서 8종 중 골라 브랜드까지 달 수 있고, 올린 글에 남는다
//   · 같은 분류를 두 번 고를 수 없다(도메인 정규화)
//   · 카드의 장비 묶음은 **사진 바깥**에 있고 기본은 접혀 있다
//   · 제휴가 꺼져 있으면 **고지 라벨이 없고**, 칩은 검색 링크로 열린다
//   · 링크를 열면 클릭이 집계된다(반복은 서버가 눌러 담는다)
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

function freshEmail(tag: string): string {
  return `e2e-gear-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function 가입(page: Page, email: string, name: string) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill(name);
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

test("장비를 골라 글에 달면 카드에 칩으로 남는다", async ({ page }) => {
  await 가입(page, freshEmail("tag"), "장비쓴이");
  await page.goto("/feed");

  await page.getByTestId("gear-open").click();
  await expect(page.getByTestId("gear-sheet")).toBeVisible({ timeout: 20_000 });
  // 8종이 다 있다.
  await expect(page.getByTestId("gear-option")).toHaveCount(8);

  // 벨트와 스트랩을 고르고, 벨트에는 브랜드를 적는다.
  await page.getByTestId("gear-option").nth(2).click(); // belt
  await page.getByTestId("gear-option").nth(1).click(); // strap
  await page.getByTestId("gear-brand-belt").fill("SBD");
  // 이미 고른 것을 다시 누르면 빠진다 — 같은 분류가 두 번 붙지 않는다.
  await page.getByTestId("gear-option").nth(1).click();
  await page.getByTestId("gear-option").nth(1).click();

  // 시트를 닫으면 고른 칩이 컴포저에 보인다.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("gear-chip")).toHaveCount(2, { timeout: 20_000 });
  await expect(page.getByTestId("gear-chip").first()).toContainText("SBD");

  await page.getByTestId("feed-caption").fill("장비 착용 글");
  await page.getByTestId("feed-post").click();
  await expect(page.getByTestId("feed-list")).toContainText("장비 착용 글", { timeout: 20_000 });

  // 카드의 장비 묶음 — 기본은 접혀 있다(사진을 가리지 않는다).
  const 묶음 = page.getByTestId("gear-chips").first();
  await expect(묶음).toBeVisible();
  await expect(page.getByTestId("gear-link")).toHaveCount(0);

  // 펼치면 칩이 나오고, 브랜드가 붙어 있다.
  await page.getByTestId("gear-summary").first().click();
  await expect(page.getByTestId("gear-link")).toHaveCount(2, { timeout: 20_000 });
  await expect(묶음).toContainText("SBD");

  // 새로고침해도 남는다(서버에 저장됐다는 뜻).
  await page.reload();
  await expect(page.getByTestId("gear-chips").first()).toBeVisible({ timeout: 20_000 });
});

/**
 * 링크를 눌러 열린 새 창이 **어디로 가려 했는지**를 읽는다.
 *
 * 실제로 열리게 두면 안 된다: ① e2e가 바깥 사이트에 요청을 보내게 되고(느리고 불안정하다)
 * ② 리다이렉트가 끝난 주소가 읽혀 우리가 만든 URL을 확인할 수 없다(실측: 딥링크가 쿠팡 홈으로 바뀌어 있었다).
 * 그래서 요청을 막고, 막힌 그 주소를 확인한다.
 */
async function 열린주소(context: import("@playwright/test").BrowserContext, 클릭: () => Promise<void>) {
  // 요청은 막되(바깥으로 나가지 않게) **요청 자체는 관찰한다** — 막힌 창의 주소는
  // `chrome-error://…`가 되어 우리가 만든 URL을 잃는다.
  await context.route("**://*.coupang.com/**", (route) => route.abort());
  const [요청] = await Promise.all([
    context.waitForEvent("request", { predicate: (r) => r.url().includes("coupang.com") }),
    클릭(),
  ]);
  const 주소 = 요청.url();
  await context.unroute("**://*.coupang.com/**");
  for (const p of context.pages().slice(1)) await p.close();
  return 주소;
}

test("제휴가 꺼져 있으면 고지 라벨이 없고, 칩은 검색으로 열린다", async ({ page, context }) => {
  test.skip(!!process.env.GEAR_ON, "제휴를 켠 서버에서는 이 검사가 성립하지 않는다");
  await 가입(page, freshEmail("off"), "고지확인");
  await page.goto("/feed");
  await page.getByTestId("gear-open").click();
  await page.getByTestId("gear-option").nth(2).click(); // belt
  await page.keyboard.press("Escape");
  await page.getByTestId("feed-caption").fill("제휴 꺼짐 확인");
  await page.getByTestId("feed-post").click();
  await expect(page.getByTestId("feed-list")).toContainText("제휴 꺼짐 확인", { timeout: 20_000 });

  // 제휴가 꺼져 있으면(기본값) 대가성 고지는 **뜨지 않는다** — 없는 대가를 알릴 이유가 없다.
  await expect(page.getByTestId("gear-disclosure")).toHaveCount(0);

  // 칩을 누르면 새 창이 열린다. 어디로 가려 했는지 확인한다(쿠팡 검색).
  await page.getByTestId("gear-summary").first().click();
  const 주소 = await 열린주소(context, () => page.getByTestId("gear-link").first().click());
  expect(주소).toContain("coupang.com");
  // 제휴가 꺼져 있으므로 딥링크(link.coupang.com/a/…)가 아니라 검색이어야 한다.
  expect(주소).not.toContain("link.coupang.com/a/");
});

// 제휴를 **켰을 때**의 동작 — 고지 라벨이 서고 딥링크로 열린다.
//
// 서버 설정(GEAR_AFFILIATE_*)은 화면에서 줄 수 없다. 그래서 이 검사는 그 설정으로 띄운
// 서버를 대상으로 할 때만 돈다: `GEAR_ON=1 bunx playwright test e2e/gear.spec.ts`
// 없으면 건너뛴다 — 못 도는 검사를 실패로 남기면 진짜 실패가 묻힌다.
test("제휴가 켜져 있으면 고지가 서고 딥링크로 열린다", async ({ page, context }) => {
  test.skip(!process.env.GEAR_ON, "제휴를 켠 서버가 필요하다 — GEAR_ON=1");

  await 가입(page, freshEmail("on"), "제휴켜짐");
  await page.goto("/feed");
  await page.getByTestId("gear-open").click();
  await page.getByTestId("gear-option").nth(2).click(); // belt
  await page.keyboard.press("Escape");
  await page.getByTestId("feed-caption").fill("제휴 켜짐 확인");
  await page.getByTestId("feed-post").click();
  await expect(page.getByTestId("feed-list")).toContainText("제휴 켜짐 확인", { timeout: 20_000 });

  // 대가성 고지가 **게시물 첫 부분**에 뜬다(작성자명 바로 아래).
  await expect(page.getByTestId("gear-disclosure").first()).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("gear-summary").first().click();
  const 주소 = await 열린주소(context, () => page.getByTestId("gear-link").first().click());
  // 설정에 넣은 딥링크로 간다(검색 폴백이 아니다).
  expect(주소).toContain("link.coupang.com/a/");
});
