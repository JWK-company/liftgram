// 운영자 통계 e2e(SPEC-032) — 역할과 시드 행은 테스트 DB 를 직접 고친다(STATS_CACHE_SEC=0 으로 띄운 서버).
//   E2E_PSQL_URL=postgres://... BASE=http://127.0.0.1:3300 bunx playwright test e2e/admin-stats
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";

const URL_ = process.env.E2E_PSQL_URL;
test.skip(!URL_, "E2E_PSQL_URL 이 없다 — 역할을 줄 테스트 DB 가 필요하다");

function sql(q: string): string {
  return execFileSync("psql", [URL_ as string, "-tAc", q])
    .toString()
    .trim();
}

let seq = 0;
const freshEmail = (tag: string) => {
  seq += 1;
  return `e2e-stats-${tag}-${Date.now()}-${seq}@example.com`;
};

async function 가입(page: Page, email: string) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill("통계시험");
  await page.getByTestId("age-confirm").check();
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

// ── 이용 기록(Phase 3) ──
const 보고 = "**/usage.v1.UsageService/ReportUsage";
const FIRST_DELAY = 3_500;

function 건수(where: string) {
  return Number(sql(`select count(*) from usage_events where ${where}`));
}

test("비로그인 기기가 앱을 열면 이용 기록이 쌓이고 내용은 없다", async ({ page }) => {
  const bodies: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.url().includes("UsageService/ReportUsage"))
      bodies.push(r.postDataJSON() as Record<string, unknown>);
  });
  const first = page.waitForResponse((r) => r.url().includes("UsageService/ReportUsage"), {
    timeout: 15_000,
  });
  await page.goto("/");
  expect((await first).status()).toBe(200);

  const deviceId = await page.evaluate(() => localStorage.getItem("liftgram.usage.deviceId"));
  expect(deviceId).toMatch(/^[0-9a-f-]{36}$/);
  // 건강 보고의 기기 ID 와 이어지지 않는다.
  expect(await page.evaluate(() => localStorage.getItem("liftgram.device_id"))).not.toBe(deviceId);

  const body = bodies[0] as {
    deviceId: string;
    platform: string;
    appVersion: string;
    presence: boolean;
    events: { event: string }[];
  };
  expect(body.deviceId).toBe(deviceId);
  expect(body.platform).toBe("web");
  expect(body.presence).toBe(true);
  expect(body.events.map((e) => e.event)).toEqual(expect.arrayContaining(["app_open", "screen_home"]));

  expect(건수(`actor_kind='guest' and actor_id='${deviceId}' and event='app_open'`)).toBe(1);
  // 시각은 시간 단위로 내려 저장한다. 표에 IP·내용 칸이 없다.
  expect(건수(`actor_id='${deviceId}' and date_trunc('hour', at) <> at`)).toBe(0);
  const cols = sql(
    `select string_agg(column_name, ',') from information_schema.columns where table_name='usage_events'`,
  );
  expect(cols).not.toMatch(/\bip\b|body|payload|query/);
  expect(sql(`select count(*) from usage_presence where actor_kind='guest' and actor_id='${deviceId}'`)).toBe(
    "1",
  );
  expect(
    sql(`select count(*) from usage_active_days where actor_kind='guest' and actor_id='${deviceId}'`),
  ).toBe("1");

  // 화면을 옮기면 구역 이름만 쌓인다.
  await page.goto("/routines");
  await expect
    .poll(() => 건수(`actor_id='${deviceId}' and event='screen_routines'`), { timeout: 15_000 })
    .toBe(1);
});

test("끄면 전송과 접속 신호가 모두 멈추고 쌓인 것도 지운다 · 다시 켤 수 있다", async ({ page }) => {
  await page.goto("/profile");
  const sw = page.getByTestId("switch-usage-stats");
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await page.evaluate(() => {
    localStorage.setItem(
      "liftgram.usage.queue",
      JSON.stringify([{ id: "x", e: "app_open", t: Date.now(), a: "g" }]),
    );
  });
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => localStorage.getItem("liftgram.usage.queue"))).toBeNull();

  let calls = 0;
  page.on("request", (r) => {
    if (r.url().includes("UsageService")) calls += 1;
  });
  await page.reload();
  await page.waitForTimeout(FIRST_DELAY);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(500);
  expect(calls).toBe(0);
  await expect(page.getByTestId("switch-usage-stats")).toHaveAttribute("aria-checked", "false");

  await page.getByTestId("switch-usage-stats").click();
  await expect(page.getByTestId("switch-usage-stats")).toHaveAttribute("aria-checked", "true");
});

test("로그인 중에는 기기 ID 를 보내지 않고, 전송 실패가 화면을 막지 않고 큐를 지킨다", async ({ page }) => {
  const email = freshEmail("usage");
  await 가입(page, email);
  const uid = sql(`select id from users where email='${email}'`);

  const bodies: { deviceId?: string; events: { event: string }[] }[] = [];
  page.on("request", (r) => {
    if (r.url().includes("UsageService/ReportUsage")) bodies.push(r.postDataJSON());
  });
  await page.reload();
  await expect.poll(() => bodies.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(bodies.every((b) => !b.deviceId)).toBe(true);
  await expect
    .poll(() => 건수(`actor_kind='user' and actor_id='${uid}' and event='app_open'`), { timeout: 10_000 })
    .toBeGreaterThan(0);

  // 서버가 죽어 있어도 화면은 멀쩡하고 큐에 남는다.
  await page.route(보고, (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: "{}" }),
  );
  await page.goto("/profile");
  await expect(page.getByTestId("switch-usage-stats")).toBeVisible();
  await page.waitForTimeout(FIRST_DELAY);
  const queued = await page.evaluate(
    () => JSON.parse(localStorage.getItem("liftgram.usage.queue") ?? "[]").length as number,
  );
  expect(queued).toBeGreaterThan(0);

  // 다른 주체의 항목은 보내지 않고 버린다.
  await page.unroute(보고);
  await page.evaluate(() => {
    const q = JSON.parse(localStorage.getItem("liftgram.usage.queue") ?? "[]");
    q.push({
      id: "99999999-9999-4999-8999-999999999999",
      e: "workout_finish",
      t: Date.now(),
      a: "u:남의계정",
    });
    localStorage.setItem("liftgram.usage.queue", JSON.stringify(q));
  });
  await page.reload();
  await expect
    .poll(
      () => page.evaluate(() => (localStorage.getItem("liftgram.usage.queue") ?? "").includes("남의계정")),
      { timeout: 15_000 },
    )
    .toBe(false);
  expect(건수(`client_event_id='99999999-9999-4999-8999-999999999999'`)).toBe(0);
});

test("받는 쪽 — 무효 토큰 401 · 기기 형식 · 모르는 이벤트 · 재전송 · 큰 본문", async ({ request }) => {
  const post = (data: unknown, headers: Record<string, string> = {}) =>
    request.post("/api/usage.v1.UsageService/ReportUsage", {
      headers: { "content-type": "application/json", ...headers },
      data,
    });
  const dev = crypto.randomUUID();
  const id = crypto.randomUUID();

  expect((await post({ deviceId: dev }, { authorization: "Bearer broken" })).status()).toBe(401);
  expect((await post({ deviceId: "abc" })).status()).toBe(400);

  const ok = await post({
    deviceId: dev,
    platform: "web",
    appVersion: "1.2.3",
    events: [
      { clientEventId: id, event: "workout_finish", ageMs: "0" },
      { clientEventId: crypto.randomUUID(), event: "모르는_이름", ageMs: "0" },
    ],
  });
  expect(ok.status()).toBe(200);
  const j = await ok.json();
  expect(j.accepted).toBe(1);
  expect(j.unknownEvents).toEqual(["모르는_이름"]);
  expect(j.enabled).toBe(true);

  const again = await post({
    deviceId: dev,
    events: [{ clientEventId: id, event: "workout_finish", ageMs: "0" }],
  });
  expect((await again.json()).accepted ?? 0).toBe(0);
  expect(건수(`client_event_id='${id}'`)).toBe(1);

  const big = await post({ deviceId: dev, platform: "x".repeat(70_000) });
  expect(big.status()).toBeGreaterThanOrEqual(400);
  expect(big.status()).toBeLessThan(500);
});

test("운동을 시작·완료하고 종목을 검색하면 이름만 쌓이고 검색어는 나가지 않는다", async ({ page }) => {
  const sent: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("UsageService/ReportUsage")) sent.push(r.postData() ?? "");
  });
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  const row = page.getByTestId("set-list").locator("> div").first();
  await row.getByTestId("set-weight").fill("100");
  await row.getByTestId("set-reps").fill("10");
  await row.getByTestId("set-reps").blur();
  await row.getByTestId("set-done").click();
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toHaveText("1000kg", { timeout: 15_000 });

  // 페이지를 떠나면 저장되고, 다음 실행의 첫 전송에 나간다.
  await page.goto("/profile");
  // 기기 ID 는 첫 전송 때 생긴다 — 운동이 그보다 빨리 끝날 수 있어 떠난 뒤에 읽는다.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("liftgram.usage.deviceId")), { timeout: 15_000 })
    .toBeTruthy();
  const deviceId = await page.evaluate(() => localStorage.getItem("liftgram.usage.deviceId"));
  for (const ev of ["workout_start", "exercise_search", "workout_finish"]) {
    await expect.poll(() => 건수(`actor_id='${deviceId}' and event='${ev}'`), { timeout: 15_000 }).toBe(1);
  }
  expect(sent.join("\n")).not.toContain("벤치프레스");
  expect(sent.join("\n")).not.toContain("1000");
});
