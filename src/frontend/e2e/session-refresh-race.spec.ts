// @plm SRS-083  세션 갱신 경합 e2e — 응답을 못 받은 갱신·탭 동시 갱신이 로그아웃을 일으키지 않는다
//
// 앱을 연 직후(세션 복원 갱신이 비행 중일 때) 새로고침하거나 앱을 닫으면, 서버는 refresh 를 회전했는데
// 새 쿠키는 브라우저에 닿지 못한다. 예전에는 다음 문서의 갱신이 401 → 로그아웃이었다(화면 정리 P4 QA H-1).
import { type BrowserContext, type Page, expect, test } from "@playwright/test";

const GUARD = { "x-liftgram-session": "1" };

function freshEmail(): string {
  return `e2e-race-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function 가입(page: Page) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(freshEmail());
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill("경합사람");
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

async function 로그인_상태(page: Page) {
  await page.goto("/account");
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

test("같은 쿠키로 갱신 두 번을 동시에 보내도 둘 다 통하고 로그인이 이어진다(탭 경합)", async ({ page }) => {
  test.setTimeout(120_000);
  await 가입(page);
  const statuses = await page.evaluate(async (h) => {
    const rs = await Promise.all(
      [1, 2].map(() => fetch("/api/session/refresh", { method: "POST", headers: h })),
    );
    return rs.map((r) => r.status);
  }, GUARD);
  expect(statuses).toEqual([200, 200]);
  await page.reload();
  await 로그인_상태(page);
});

test("갱신 응답이 브라우저에 닿지 못해도(새 쿠키 유실) 다음에 열면 로그인이 이어진다", async ({ page }) => {
  test.setTimeout(120_000);
  await 가입(page);
  const context = page.context();
  // 회전 전 쿠키 — 응답이 닿지 못하면 브라우저에는 이것이 남는다.
  const before = await context.cookies();
  // 서버까지는 가서 회전이 일어나지만, 응답(새 쿠키)은 브라우저가 받지 못한다 — 문서가 사라진 것과 같다.
  await page.route("**/api/session/refresh", async (route) => {
    await route.fetch();
    await route.abort();
  });
  const ok = await page.evaluate(
    (h) =>
      fetch("/api/session/refresh", { method: "POST", headers: h })
        .then(() => true)
        .catch(() => false),
    GUARD,
  );
  expect(ok).toBe(false); // 정말로 응답을 못 받았다
  await page.unroute("**/api/session/refresh");
  // route.fetch 는 응답 쿠키를 컨텍스트에 넣는다 — 실제 유실처럼 옛 쿠키로 되돌린다.
  await context.clearCookies();
  await context.addCookies(before);
  // 앱을 닫았다가 몇 초 뒤 다시 연다.
  await page.waitForTimeout(1_000);
  await page.reload();
  await 로그인_상태(page);
});

// 경합은 타이밍이 맞아야 나서 이 테스트만으로는 결정적으로 재현되지 않는다 — 회귀 확인용(게이트는 위 두 테스트).
test("탭 두 개를 동시에 열어도 둘 다 로그인 상태다", async ({ page, context }) => {
  test.setTimeout(120_000);
  await 가입(page);
  const 둘째: Page = await (context as BrowserContext).newPage();
  await Promise.all([page.goto("/account"), 둘째.goto("/account")]);
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  await expect(둘째.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  // 그 뒤에도 갱신이 통한다(어느 쪽 쿠키가 남았든).
  await page.reload();
  await 로그인_상태(page);
});
