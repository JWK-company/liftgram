// 운영 웹이 먼 경로에서도 빠르게 열리는가(SPEC-035). 실제 경로처럼 요청마다 지연을 넣고, 순서와 시간을 잰다.
import type { Page, Request } from "@playwright/test";
import { expect, makeAccount, PASSWORD, test } from "./helpers/base";

const DELAY_MS = 500;
const BASELINE = process.env.SPEED_BASELINE === "1";

/** 정적 파일은 CDN 이 응답하므로 지연 없이 둔다. 페이지·RSC·API 만 서버까지 간다. */
async function slowRoute(page: Page, seen: string[]) {
  await page.route("**/*", async (route) => {
    const req: Request = route.request();
    const url = new URL(req.url());
    if (url.pathname.startsWith("/_next/static/")) return route.fallback();
    const rsc = url.searchParams.has("_rsc");
    if (rsc) seen.push(`rsc ${url.pathname}`);
    else if (url.pathname.startsWith("/api/")) seen.push(url.pathname.split("/").pop() ?? "");
    await new Promise((r) => setTimeout(r, DELAY_MS));
    return route.fallback();
  });
}

async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(PASSWORD);
  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("home")).toBeVisible();
}

test("새로고침은 갱신 한 번 뒤 바로 데이터를 읽고, 메뉴 재방문은 저장한 값을 곧바로 보인다", async ({
  page,
}) => {
  await logIn(page, await makeAccount("admin"));
  const seen: string[] = [];
  await slowRoute(page, seen);

  // ① 전체 새로고침: 문서 → 세션 갱신 → 데이터
  let t = Date.now();
  await page.reload();
  await expect(page.getByTestId("home-online").or(page.getByTestId("home-usage-not-started"))).toBeVisible({
    timeout: 20_000,
  });
  const full = Date.now() - t;
  const fullRpcs = [...seen];
  seen.length = 0;

  // ② 처음 가는 메뉴
  await page.waitForTimeout(2_500);
  const prefetched = seen.filter((s) => s.startsWith("rsc ")).length;
  seen.length = 0;
  t = Date.now();
  await page.getByTestId("menu-stats").click();
  await expect(page.getByTestId("stat-online").or(page.getByTestId("stats-users-before"))).toBeVisible({
    timeout: 20_000,
  });
  const first = Date.now() - t;
  const firstRsc = seen.filter((s) => s.startsWith("rsc ")).length;

  // ③ 요약으로 돌아가기(재방문)
  await page.waitForTimeout(1_500);
  seen.length = 0;
  t = Date.now();
  await page.getByTestId("menu-home").click();
  await expect(page.getByTestId("home-online").or(page.getByTestId("home-usage-not-started"))).toBeVisible({
    timeout: 20_000,
  });
  const back = Date.now() - t;
  const backRsc = seen.filter((s) => s.startsWith("rsc ")).length;

  // ④ 한 번 갔던 메뉴를 다시 누른다. 라우터가 들고 있어 서버까지 가지 않는다.
  await page.waitForTimeout(1_500);
  seen.length = 0;
  t = Date.now();
  await page.getByTestId("menu-stats").click();
  await expect(page.getByTestId("stat-online").or(page.getByTestId("stats-users-before"))).toBeVisible();
  const again = Date.now() - t;
  const againRsc = seen.filter((s) => s.startsWith("rsc ")).length;

  console.log(
    JSON.stringify({ full, first, back, again, prefetched, firstRsc, backRsc, againRsc, fullRpcs }),
  );
  if (BASELINE) return;

  // 내 정보를 따로 묻지 않는다. 갱신 응답에 함께 온다.
  expect(fullRpcs).not.toContain("Me");
  expect(backRsc, "재방문은 화면을 다시 받지 않는다").toBe(0);
  expect(againRsc, "재방문은 화면을 다시 받지 않는다").toBe(0);
  expect(again, "재방문은 왕복 없이 그려진다").toBeLessThan(DELAY_MS);
});

test("갱신 응답에 내 정보가 없으면 Me 로 묻는다", async ({ page }) => {
  await logIn(page, await makeAccount("admin"));
  const rpcs: string[] = [];
  page.on("request", (r) => rpcs.push(new URL(r.url()).pathname.split("/").pop() ?? ""));
  await page.route("**/api/session/refresh", async (route) => {
    // 대신 보내는 요청에는 브라우저가 붙이는 출처 헤더가 없어 CSRF 빗장에 막힌다.
    const res = await route.fetch({
      headers: { ...route.request().headers(), "sec-fetch-site": "same-origin" },
    });
    const body = await res.json();
    delete body.user;
    await route.fulfill({ response: res, json: body });
  });
  await page.reload();
  await expect(page.getByTestId("home")).toBeVisible();
  expect(rpcs).toContain("Me");
  await expect(page.getByTestId("me-role")).toBeVisible();
});

test("재방문 때 저장한 값을 보인 뒤 새 값으로 바꾼다", async ({ page }) => {
  const seen: string[] = [];
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home-feedback-count")).toBeVisible();
  const before = Number(await page.getByTestId("home-feedback-count").textContent());
  await page.getByTestId("menu-settings").click();
  await expect(page.getByTestId("home")).toBeHidden();

  // 다음 읽기가 다른 값을 돌려주게 하고, 응답을 늦춘다.
  await page.route("**/feedback.v1.FeedbackService/ListEntries", async (route) => {
    seen.push("ListEntries");
    const res = await route.fetch();
    const body = await res.json();
    await new Promise((r) => setTimeout(r, 1_000));
    const extra = { id: "999999", status: "FEEDBACK_STATUS_NEW", kind: "FEEDBACK_KIND_USER" };
    await route.fulfill({ response: res, json: { ...body, entries: [...(body.entries ?? []), extra] } });
  });
  await page.getByTestId("menu-home").click();
  await expect(page.getByTestId("home-feedback-count")).toHaveText(String(before), { timeout: 500 });
  await expect(page.getByTestId("home-feedback-count")).toHaveText(String(before + 1));
  expect(seen).toContain("ListEntries");
});

test("입구 세션이 끝나면 미리 받은 메뉴에 갇히지 않고 다시 인증하러 간다", async ({ page }) => {
  await logIn(page, await makeAccount("admin"));
  await page.waitForTimeout(1_500); // 메뉴 미리 받기가 끝날 시간
  // Access 가 끝나면 문서는 다른 출처로 넘어가고, RPC 는 fetch 단계에서 실패한다.
  await page.route("**/login", (r) =>
    r.fulfill({ status: 302, headers: { location: "https://e2e.cloudflareaccess.com/" } }),
  );
  await page.route("**/api/**", (r) => r.abort());
  await page.getByTestId("menu-ops").click();
  await expect(page.getByTestId("session-unavailable")).toBeVisible();
});

test("망이 끊긴 것뿐이면 화면을 그대로 둔다", async ({ page }) => {
  await logIn(page, await makeAccount("admin"));
  await page.waitForTimeout(1_500);
  await page.route("**/api/**", (r) => r.abort());
  await page.getByTestId("menu-settings").click();
  await page.getByTestId("menu-ops").click();
  await page.waitForTimeout(800);
  await expect(page.getByTestId("session-unavailable")).toBeHidden();
});

test("권한 거절을 받으면 내 정보를 다시 읽지 못해도 저장한 값을 비운다", async ({ page }) => {
  await logIn(page, await makeAccount("admin"));
  await expect(
    page.getByTestId("home-alert-clear").or(page.getByTestId("home-alert-reason").first()),
  ).toBeVisible();
  await page.route("**/auth.v1.AuthService/Me", (r) => r.abort());
  await page.route("**/ops.v1.OpsService/GetOpsStatus", (r) =>
    r.fulfill({
      status: 403,
      contentType: "application/json",
      body: '{"code":"permission_denied","message":"x"}',
    }),
  );
  await page.getByTestId("home-refresh").click();
  await expect(page.getByTestId("home-alert")).toContainText("새로고침 실패");
  await page.getByTestId("menu-settings").click();
  await expect(page.getByTestId("home")).toBeHidden();
  await page.getByTestId("menu-home").click();
  await expect(page.getByTestId("home-alert-error")).toBeVisible();
});

test("저장한 경고값으로 메뉴 점을 끄지 않는다", async ({ page }) => {
  // 경고 점은 켜져 있고, 요약이 저장한 상태 값은 「이상 없음」이다.
  await page.route("**/ops.v1.OpsService/GetOpsAlert", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"alert":true}' }),
  );
  await page.route("**/ops.v1.OpsService/GetOpsStatus", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"alert":false}' }),
  );
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home-alert-clear")).toBeVisible();
  await expect(page.getByTestId("menu-ops-dot")).toBeVisible();
  await page.route("**/ops.v1.OpsService/GetOpsStatus", (r) => r.abort());
  await page.getByTestId("menu-ops").click();
  await expect(page.getByTestId("ops-summary")).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.getByTestId("menu-ops-dot")).toBeVisible();
});

test("미리 받기가 도중에 실패해도 그 메뉴의 본문이 비지 않는다", async ({ page }) => {
  await logIn(page, await makeAccount("admin"));
  let failing = true;
  await page.route("**/stats?*", async (route) => {
    const headers = route.request().headers();
    const isTree = headers["next-router-segment-prefetch"] !== undefined;
    if (!failing || isTree || !new URL(route.request().url()).searchParams.has("_rsc"))
      return route.fallback();
    await new Promise((r) => setTimeout(r, 2_000));
    return route.abort();
  });
  await page.reload();
  await page.getByTestId("menu-stats").waitFor();
  await page.waitForTimeout(500);
  await page.getByTestId("menu-stats").click(); // 미리 받기가 아직 끝나지 않았다.
  await page.waitForTimeout(2_500);
  failing = false;
  const shown = page.getByTestId("stat-online").or(page.getByTestId("stats-users-before"));
  if (!(await shown.isVisible())) {
    // 첫 시도는 실패할 수 있어도 메뉴를 다시 누르면 열려야 한다.
    await page.getByTestId("menu-home").click();
    await page.getByTestId("menu-stats").click();
  }
  await expect(shown).toBeVisible({ timeout: 5_000 });
});
