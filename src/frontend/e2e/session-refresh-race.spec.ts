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

// [원본] fetch 를 직접 두 번 보냈다 — 앱의 Web Locks·재시도를 거치지 않아 서버 유예만 확인했다(/qa code M-4).
// [개선] 앱 경로 그대로: 첫 갱신을 일부러 401 로 돌려도 앱이 600ms 뒤 한 번 더 시도해 로그인이 이어진다.
test("갱신이 한 번 401 이어도 앱이 다시 시도해 로그인이 이어진다(재시도 경로)", async ({ page }) => {
  test.setTimeout(120_000);
  await 가입(page);
  let seen = 0;
  await page.route("**/api/session/refresh", async (route) => {
    seen += 1;
    if (seen === 1) return route.fulfill({ status: 401, body: "refresh failed" }); // 다른 탭이 막 회전한 것처럼
    return route.fallback();
  });
  await page.reload(); // 새 문서 — 메모리에 access 가 없어 복원 갱신이 돈다
  await 로그인_상태(page);
  expect(seen).toBeGreaterThanOrEqual(2); // 정말로 두 번 갔다(재시도)
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

// [원본] 두 탭을 동시에 열기만 했다 — 옛 코드에서도 통과해 경합을 재현하지 못했다(/qa code M-4).
// [개선] 첫 갱신 응답을 1.5초 붙잡아 경합 창을 일부러 넓힌다. Web Locks 가 동작하면 두 번째 탭의 갱신은
// 첫 응답이 끝난 **뒤에** 떠나고, 첫 갱신이 구운 **새 쿠키**를 들고 간다(같은 쿠키로 동시에 가지 않는다).
test("탭 두 개가 동시에 복원 갱신해도 갱신은 한 줄로 서고, 둘째는 새 쿠키로 간다(Web Locks)", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await 가입(page);
  const 둘째: Page = await (context as BrowserContext).newPage();
  const calls: { cookie: string; start: number; end: number }[] = [];
  await (context as BrowserContext).route("**/api/session/refresh", async (route) => {
    const call = { cookie: route.request().headers().cookie ?? "", start: Date.now(), end: 0 };
    calls.push(call);
    if (calls.length === 1) await new Promise((r) => setTimeout(r, 1_500));
    const res = await route.fetch();
    call.end = Date.now();
    await route.fulfill({ response: res });
  });
  await Promise.all([page.goto("/account"), 둘째.goto("/account")]);
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  await expect(둘째.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  // 화면은 캐시된 내 정보로 먼저 그려진다 — 두 갱신이 실제로 끝날 때까지 기다린다.
  await expect
    .poll(() => calls.filter((c) => c.end > 0).length, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(2);
  const [a, b] = [...calls].sort((x, y) => x.start - y.start);
  expect(b.start).toBeGreaterThanOrEqual(a.end - 50); // 직렬: 둘째는 첫 응답 뒤에 떠났다
  expect(b.cookie).not.toBe(a.cookie); // 첫 회전이 구운 새 쿠키를 들고 갔다
  await (context as BrowserContext).unroute("**/api/session/refresh");
  await page.reload();
  await 로그인_상태(page);
});
