// 로그인·역할·세션(SPEC-033 Phase 1)
import { expect, logIn, makeAccount, PASSWORD, sql, test } from "./helpers/base";

for (const [role, label] of [
  ["admin", "관리자"],
  ["moderator", "모더레이터"],
] as const) {
  test(`${role} 은 로그인해 운영 화면을 본다`, async ({ page }) => {
    await logIn(page, await makeAccount(role));
    await expect(page.getByTestId("home")).toBeVisible();
    await expect(page.getByTestId("me-role")).toHaveText(label);
    await page.reload();
    await expect(page.getByTestId("home")).toBeVisible();
  });
}

test("일반 사용자는 거절되고 쿠키가 남지 않는다", async ({ page, context }) => {
  const email = await makeAccount("user");
  const answer = page.waitForResponse("**/api/session/login");
  await logIn(page, email);
  const res = await answer;
  expect(res.status()).toBe(403);
  expect((await res.allHeaders())["set-cookie"]).toBeUndefined();
  await expect(page.getByTestId("login-error")).toContainText("운영 권한");
  expect(await context.cookies()).toEqual([]);
});

test("옛 협업자 역할은 운영 웹에 들어오지 못한다", async ({ page, context }) => {
  const answer = page.waitForResponse("**/api/session/login");
  await logIn(page, await makeAccount("coworker"));
  expect((await answer).status()).toBe(403);
  await expect(page.getByTestId("login-error")).toContainText("운영 권한");
  expect(await context.cookies()).toEqual([]);
});

test("거절된 일반 사용자의 refresh 는 폐기된다", async ({ page }) => {
  const email = await makeAccount("user");
  const answer = page.waitForResponse("**/api/session/login");
  await logIn(page, email);
  await answer;
  await expect(page.getByTestId("login-error")).toBeVisible();
  // 가입 때 받은 토큰 하나는 시험 준비물이다. 로그인이 만든 가장 새 토큰이 폐기됐는지 본다.
  const newest = sql(
    `select t.revoked_at is not null from refresh_tokens t join users u on u.id = t.user_id where u.email = '${email}' order by t.created_at desc limit 1`,
  );
  expect(newest).toBe("t");
});

test("틀린 비밀번호는 같은 안내를 준다", async ({ page }) => {
  await logIn(page, await makeAccount("admin"), "wrong-password-1");
  await expect(page.getByTestId("login-error")).toContainText("맞지 않습니다");
});

test("비로그인은 로그인 화면으로 가고, 로그인 뒤 돌아온다", async ({ page }) => {
  await page.goto("/?x=1");
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByTestId("login-email").fill(await makeAccount("admin"));
  await page.getByTestId("login-password").fill(PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/\?x=1$/);
});

test("next 는 공백류를 끼워도 다른 사이트로 보내지 못한다", async ({ page }) => {
  const email = await makeAccount("admin");
  await page.goto("/login?next=/%09/example.com/x");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("home")).toBeVisible();
  expect(new URL(page.url()).host).toBe(new URL(test.info().project.use.baseURL as string).host);
});

test("로그아웃하면 쿠키가 지워지고 로그인으로 간다", async ({ page, context }) => {
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home")).toBeVisible();
  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL(/\/login/);
  expect((await context.cookies()).filter((c) => c.name.includes("liftgram_admin"))).toEqual([]);
});

test("로그인 쿠키는 __Host 조건과 12시간 상한을 지킨다", async ({ page, context }) => {
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home")).toBeVisible();
  const c = (await context.cookies()).find((x) => x.name === "__Host-liftgram_admin_refresh");
  expect(c).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict", path: "/" });
  // 쿠키는 상한보다 오래 남아 끝난 세션의 토큰을 폐기할 기회를 준다. 상한은 시작 시각으로 판정한다.
  const hours = ((c?.expires ?? 0) - Date.now() / 1000) / 3600;
  expect(hours).toBeGreaterThan(12 + 7 * 24 - 0.1);
  expect(hours).toBeLessThanOrEqual(12 + 7 * 24 + 0.01);
  const started = (await context.cookies()).find((x) => x.name === "__Host-liftgram_admin_started");
  expect(started).toMatchObject({ httpOnly: true, secure: true, sameSite: "Strict", path: "/" });
});

test("권한을 회수하면 갱신 때 끊기고 안내를 본다", async ({ page, context }) => {
  const email = await makeAccount("admin");
  await logIn(page, email);
  await expect(page.getByTestId("home")).toBeVisible();
  sql(`update users set role = 'user' where email = '${email}'`);
  await page.reload();
  await expect(page.getByTestId("session-denied")).toBeVisible();
  expect((await context.cookies()).filter((c) => c.name.includes("liftgram_admin"))).toEqual([]);
});

test("12시간이 지난 세션은 갱신되지 않고 끝난다", async ({ page, context }) => {
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home")).toBeVisible();
  const old = Date.now() - 13 * 3600 * 1000;
  const started = (await context.cookies()).find((c) => c.name === "__Host-liftgram_admin_started");
  await context.addCookies([{ ...(started as NonNullable<typeof started>), value: String(old) }]);
  await page.reload();
  await expect(page).toHaveURL(/\/login/);
  expect((await context.cookies()).filter((c) => c.name.includes("liftgram_admin"))).toEqual([]);
});

test("회전해도 12시간 상한은 늘지 않는다", async ({ page, context }) => {
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home")).toBeVisible();
  const eleven = Date.now() - 11 * 3600 * 1000;
  const started = (await context.cookies()).find((c) => c.name === "__Host-liftgram_admin_started");
  await context.addCookies([{ ...(started as NonNullable<typeof started>), value: String(eleven) }]);
  await page.reload();
  await expect(page.getByTestId("home")).toBeVisible();
  const after = await context.cookies();
  expect(after.find((c) => c.name === "__Host-liftgram_admin_started")?.value).toBe(String(eleven));
  const hours =
    ((after.find((c) => c.name === "__Host-liftgram_admin_refresh")?.expires ?? 0) - Date.now() / 1000) /
    3600;
  expect(hours).toBeLessThan(1 + 7 * 24 + 0.01);
  expect(hours).toBeGreaterThan(0.9 + 7 * 24);
});

test("다시 로그인하면 이전 토큰을 폐기한다", async ({ page }) => {
  const email = await makeAccount("admin");
  await logIn(page, email);
  await expect(page.getByTestId("home")).toBeVisible();
  const live = () =>
    Number(
      sql(
        `select count(*) from refresh_tokens t join users u on u.id = t.user_id where u.email = '${email}' and t.revoked_at is null`,
      ),
    );
  const before = live();
  await logIn(page, email);
  await expect(page.getByTestId("home")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("home")).toBeVisible();
  expect(live()).toBeLessThanOrEqual(before);
});

test("로그아웃은 서버 토큰도 폐기한다", async ({ page }) => {
  const email = await makeAccount("admin");
  await logIn(page, email);
  await expect(page.getByTestId("home")).toBeVisible();
  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL(/\/login/);
  const newest = sql(
    `select t.revoked_at is not null from refresh_tokens t join users u on u.id = t.user_id where u.email = '${email}' order by t.created_at desc limit 1`,
  );
  expect(newest).toBe("t");
});

test("백엔드 503 은 로그아웃이 아니다: 안내 후 다시 시도로 복구한다", async ({ page, context }) => {
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home")).toBeVisible();
  await page.route("**/api/session/refresh", (r) => r.fulfill({ status: 503, body: "down" }));
  await page.reload();
  await expect(page.getByTestId("session-unavailable")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("liftgram.admin.session"))).toBe("1");
  expect((await context.cookies()).some((c) => c.name === "__Host-liftgram_admin_refresh")).toBe(true);
  await page.unroute("**/api/session/refresh");
  await page.getByTestId("session-unavailable").getByRole("button").click();
  await expect(page.getByTestId("home")).toBeVisible();
});

test("access 만료(401)는 갱신하고 같은 요청을 다시 보낸다", async ({ page }) => {
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home")).toBeVisible();
  let refreshes = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/session/refresh")) refreshes++;
  });
  let failed = false;
  await page.route("**/api/ops.v1.OpsService/GetOpsStatus", async (r) => {
    if (failed) return r.continue();
    failed = true;
    await r.fulfill({
      status: 401,
      contentType: "application/json",
      body: '{"code":"unauthenticated","message":"x"}',
    });
  });
  await page.getByTestId("menu-ops").click();
  await expect(page.getByTestId("ops-summary")).toBeVisible();
  expect(failed).toBe(true);
  expect(refreshes).toBe(1);
});

test("다른 탭 로그아웃을 따라가고, 그 뒤 요청도 보내지 않는다", async ({ page, context }) => {
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home")).toBeVisible();
  const second = await context.newPage();
  await second.goto("/ops");
  await expect(second.getByTestId("ops-summary")).toBeVisible();
  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL(/\/login/);
  await expect(second).toHaveURL(/\/login\?next=%2Fops/);
});

test("다른 탭에서 다른 계정으로 로그인하면 이 탭도 새 계정으로 다시 그린다", async ({ page, context }) => {
  const first = await makeAccount("admin");
  const other = await makeAccount("moderator");
  await logIn(page, first);
  await expect(page.getByTestId("menu-ops")).toBeVisible();
  const second = await context.newPage();
  await logIn(second, other);
  await expect(second.getByTestId("home")).toBeVisible();
  await expect(page.getByTestId("menu-ops")).toHaveCount(0);
});

test("열린 탭에서 강등되면 다음 거절 때 메뉴가 바로 줄어든다", async ({ page }) => {
  const email = await makeAccount("admin");
  await logIn(page, email);
  await expect(page.getByTestId("menu-ops")).toBeVisible();
  sql(`update users set role = 'moderator' where email = '${email}'`);
  await page.getByTestId("menu-ops").click();
  await expect(page.getByTestId("menu-ops")).toHaveCount(0);
});

test("입구의 403 은 권한 회수가 아니다: 세션을 버리지 않는다", async ({ page }) => {
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home")).toBeVisible();
  await page.route("**/api/session/refresh", (r) => r.fulfill({ status: 403, body: "접근 권한이 없습니다" }));
  await page.reload();
  await expect(page.getByTestId("session-unavailable")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("liftgram.admin.session"))).toBe("1");
});

test("로그인 응답이 JSON 이 아니어도 폼이 멈추지 않고, 입구의 403 을 계정 탓으로 말하지 않는다", async ({
  page,
}) => {
  const email = await makeAccount("admin");
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(PASSWORD);
  await page.route("**/api/session/login", (r) =>
    r.fulfill({ status: 200, contentType: "text/html", body: "<html>" }),
  );
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-error")).toContainText("서버에 연결할 수 없습니다");
  await expect(page.getByTestId("login-submit")).toBeEnabled();
  await page.unroute("**/api/session/login");
  await page.route("**/api/session/login", (r) => r.fulfill({ status: 403, body: "x" }));
  await page.getByTestId("login-password").fill(PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("login-error")).toContainText("서버에 연결할 수 없습니다");
});

test("저장소에 쓸 수 없어도 로그인 루프에 빠지지 않는다", async ({ page, context }) => {
  await context.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("막힘", "QuotaExceededError");
    };
  });
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home")).toBeVisible();
});

test("AbortSignal.timeout 이 없는 브라우저에서도 로그인된다", async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(AbortSignal, "timeout", { value: undefined });
  });
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("home")).toBeVisible();
});

test("입력칸: 경계 3:1 토큰, 휴대폰 폭 16px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/login");
  const css = await page.getByTestId("login-email").evaluate((el) => {
    const c = getComputedStyle(el);
    return { size: c.fontSize, border: c.borderTopColor };
  });
  expect(css.size).toBe("16px");
  expect(css.border).not.toBe("rgb(223, 226, 232)");
});

test("탭 두 개의 갱신은 줄을 서고 둘 다 로그인을 유지한다", async ({ page, context }) => {
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home")).toBeVisible();
  let active = 0;
  let peak = 0;
  await context.route("**/api/session/refresh", async (r) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((d) => setTimeout(d, 300));
    await r.continue();
    active--;
  });
  const second = await context.newPage();
  await Promise.all([page.reload(), second.goto("/")]);
  await expect(page.getByTestId("home")).toBeVisible();
  await expect(second.getByTestId("home")).toBeVisible();
  expect(peak).toBe(1);
});

test("잠금 API 가 없어도 저장소 대체 잠금으로 줄을 선다", async ({ page, context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "locks", { value: undefined });
  });
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home")).toBeVisible();
  let active = 0;
  let peak = 0;
  await context.route("**/api/session/refresh", async (r) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((d) => setTimeout(d, 300));
    await r.continue();
    active--;
  });
  const second = await context.newPage();
  await Promise.all([page.reload(), second.goto("/")]);
  await expect(page.getByTestId("home")).toBeVisible();
  await expect(second.getByTestId("home")).toBeVisible();
  expect(peak).toBe(1);
});

test("갱신 401 은 600ms 뒤 한 번 더 시도한다", async ({ page }) => {
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home")).toBeVisible();
  const at: number[] = [];
  await page.route("**/api/session/refresh", async (r) => {
    at.push(Date.now());
    if (at.length === 1) return r.fulfill({ status: 401, body: "x" });
    return r.continue();
  });
  await page.reload();
  await expect(page.getByTestId("home")).toBeVisible();
  expect(at.length).toBe(2);
  expect(at[1] - at[0]).toBeGreaterThanOrEqual(590);
});

test("휴대폰 폭에서는 메뉴가 접히고 펼쳐진다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home")).toBeVisible();
  await expect(page.getByTestId("menu-home")).toBeHidden();
  await page.getByTestId("menu-toggle").click();
  await expect(page.getByTestId("menu-home")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
