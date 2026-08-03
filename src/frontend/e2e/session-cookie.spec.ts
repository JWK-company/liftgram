// 세션 쿠키 e2e — refresh 토큰이 **스크립트에 보이지 않는지**
//
// 확인하는 것:
//   · 로그인해도 refresh 값이 localStorage에 없다(있는 것은 깃발 하나뿐)
//   · 쿠키는 httpOnly라 `document.cookie`에도 나타나지 않는다
//   · 그래도 새로고침하면 로그인 상태가 이어진다(서버가 쿠키로 갱신한다)
//   · 로그아웃하면 쿠키가 사라진다
//   · 커스텀 헤더 없이 세션 라우트를 부르면 거절한다(CSRF 빗장)
import { expect, test } from "@playwright/test";

function freshEmail(): string {
  return `e2e-cookie-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

test("refresh 토큰은 스크립트에 보이지 않는다", async ({ page, context }) => {
  test.setTimeout(120_000);
  const 메일 = freshEmail();

  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(메일);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill("쿠키사람");
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });

  // localStorage에는 **깃발만** 있다 — 값이 아니다.
  const 저장소 = await page.evaluate(() =>
    Object.fromEntries(
      Object.keys(localStorage)
        .filter((k) => k.startsWith("liftgram"))
        .map((k) => [k, localStorage.getItem(k)]),
    ),
  );
  expect(저장소["liftgram.session"]).toBe("1");
  expect(저장소["liftgram.refreshToken"]).toBeUndefined();

  // httpOnly라 스크립트가 쿠키에서도 못 읽는다.
  const 보이는쿠키 = await page.evaluate(() => document.cookie);
  expect(보이는쿠키).not.toContain("liftgram_refresh");

  // 브라우저에는 분명히 있다(서버만 읽는다).
  const 쿠키들 = await context.cookies();
  const 세션쿠키 = 쿠키들.find((c) => c.name === "liftgram_refresh");
  expect(세션쿠키?.httpOnly).toBe(true);
  expect(세션쿠키?.sameSite).toBe("Strict");

  // 새로고침해도 로그인 상태가 이어진다 — 서버가 쿠키로 갱신해 준다.
  await page.reload();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });

  // 로그아웃하면 쿠키가 사라진다.
  await page.getByTestId("btn-logout").click();
  await expect(page.getByTestId("btn-auth-submit")).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => (await context.cookies()).some((c) => c.name === "liftgram_refresh" && c.value), {
      timeout: 20_000,
    })
    .toBe(false);
});

test("커스텀 헤더 없이는 세션 라우트를 쓸 수 없다", async ({ request }) => {
  // 남의 사이트가 보낼 수 있는 것은 이런 요청이다(헤더를 붙일 수 없다).
  const 담기 = await request.post("/api/session", { data: { refreshToken: "훔친토큰" } });
  expect(담기.status()).toBe(403);

  const 갱신 = await request.post("/api/session/refresh");
  expect(갱신.status()).toBe(403);

  const 지우기 = await request.delete("/api/session");
  expect(지우기.status()).toBe(403);
});
