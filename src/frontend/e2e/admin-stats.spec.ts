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

async function 역할(page: Page, email: string, role: string) {
  sql(`update users set role = '${role}' where email = '${email}'`);
  await page.goto("/profile");
  await page.reload();
}

function 숫자(s: string) {
  return Number(s.replace(/[^0-9]/g, ""));
}

test("일반 사용자·동업자는 통계를 부르지도 못하고, 서버도 막는다", async ({ page, request }) => {
  const anon = await request.post("/api/admin.v1.AdminService/GetSignupStats", {
    headers: { "content-type": "application/json" },
    data: {},
  });
  expect(anon.status()).toBe(401);

  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("AdminService")) calls.push(r.url());
  });
  const email = freshEmail("user");
  await 가입(page, email);
  await page.goto("/admin/stats");
  await expect(page.getByTestId("stats-denied")).toBeVisible();

  await 역할(page, email, "coworker");
  await page.goto("/admin");
  await expect(page.getByTestId("admin-screen")).toBeVisible();
  await expect(page.getByTestId("row-feedback-inbox")).toBeVisible();
  await expect(page.getByTestId("row-stats")).toHaveCount(0);
  await page.goto("/admin/stats");
  await expect(page.getByTestId("stats-denied")).toBeVisible();
  expect(calls).toEqual([]);
});

test("관리자는 구역별 숫자를 보고, 운영진은 숫자에서 빠진다", async ({ page }) => {
  const email = freshEmail("admin");
  await 가입(page, email);
  await 역할(page, email, "admin");

  // 일반 사용자 하나와 그 기록을 심는다.
  const uid = `e2e-stats-u-${Date.now()}`;
  sql(
    `insert into users (id, email, display_name, password_hash, email_verified_at) values ('${uid}', '${uid}@example.com', 'x', 'x', now())`,
  );
  const startMs = Date.now() - 3600_000;
  sql(
    `insert into sync_records (id, user_id, collection, record_id, payload) values
     ('${uid}-w1', '${uid}', 'workouts', 'w1', '{"state":"completed","started_at":${startMs},"duration_seconds":1800,"routine_id":"r1"}'::jsonb),
     ('${uid}-w2', '${uid}', 'workouts', 'w2', '{"state":"completed","started_at":${startMs},"duration_seconds":2400}'::jsonb),
     ('${uid}-r1', '${uid}', 'routines', 'r1', '{"is_archived":false}'::jsonb)`,
  );
  sql(
    `insert into reports (id, target_type, target_id, reporter_id, reason) values ('${uid}-rp', 'post', 'x', '${uid}', 'spam')`,
  );

  await page.goto("/admin");
  await page.getByTestId("row-stats").click();
  await expect(page.getByTestId("stats-screen")).toBeVisible();

  const total = sql(`select count(*) from users where role='user' and not stats_excluded`);
  await expect(page.getByTestId("stat-signup-total")).toHaveText(Number(total).toLocaleString());
  await expect(page.getByTestId("stats-signup-at")).toBeVisible();
  await expect(page.getByTestId("chart-signup")).toBeVisible();

  // 신고 대기·콘텐츠
  await expect(page.getByTestId("stat-pending-reports")).toContainText(
    sql(`select count(*) from reports where status='pending'`),
  );
  await expect(page.getByTestId("content-post")).toBeVisible();

  // 루틴·운동(다른 시험의 운동이 섞여도 0 이 아니다)
  await expect(page.getByTestId("chart-routines-1")).toBeVisible();
  const n = 숫자((await page.getByTestId("chart-routines-1").textContent()) ?? "");
  expect(n).toBeGreaterThan(0);
  await expect(page.getByTestId("stat-from-routine")).toBeVisible();
  await expect(page.getByTestId("stat-median")).toContainText("분");

  // 관리자 본인은 가입 수에서 빠진다 — 제외 켜면 하나 줄어든다.
  sql(`update users set stats_excluded = true where id = '${uid}'`);
  await page.reload();
  await expect(page.getByTestId("stat-signup-total")).toHaveText((Number(total) - 1).toLocaleString());
  sql(`update users set stats_excluded = false where id = '${uid}'`);

  // 차트 — 표로 보기와 툴팁(바는 탭으로도 열린다).
  await page.reload();
  await page.getByTestId("chart-signup-toggle").click();
  await expect(page.getByTestId("chart-signup-table")).toBeVisible();
  await page.getByTestId("chart-signup-toggle").click();
  await page.getByTestId("chart-signup").locator("button").nth(29).click();
  await expect(page.getByTestId("chart-signup-tooltip")).toBeVisible();

  // 좁은 화면에서 가로로 넘치지 않는다.
  await page.setViewportSize({ width: 360, height: 800 });
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
});

test("한 구역 실패는 그 구역만 막고 다시 시도로 살아난다 · 시행 전 상태", async ({ page }) => {
  const email = freshEmail("admin2");
  await 가입(page, email);
  await 역할(page, email, "admin");

  let fail = true;
  await page.route("**/admin.v1.AdminService/GetContentStats", (route) =>
    fail
      ? route.fulfill({
          status: 500,
          contentType: "application/json",
          body: '{"code":"internal","message":"x"}',
        })
      : route.fallback(),
  );
  await page.route("**/admin.v1.AdminService/GetRoutineStats", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        generatedAt: "2026-11-01T00:00:00Z",
        started: false,
        usageSince: "2026-11-05T00:00:00+09:00",
      }),
    }),
  );
  await page.goto("/admin/stats");
  await expect(page.getByTestId("stats-content-error")).toBeVisible();
  await expect(page.getByTestId("stat-signup-total")).toBeVisible();
  await expect(page.getByTestId("stats-routine-before")).toContainText("집계 전");

  fail = false;
  await page.getByTestId("stats-content-retry").click();
  await expect(page.getByTestId("content-post")).toBeVisible();
});

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

test("관리자 화면에 사용자·기능 구역이 나오고 로그인·비로그인·합계가 맞는다", async ({ page }) => {
  const email = freshEmail("admin3");
  await 가입(page, email);
  await 역할(page, email, "admin");
  // 이 탭의 신호가 숫자에 섞이지 않게 끄고, 다른 시험의 행을 비운 뒤 넣는다(집계는 USAGE_JOB_INTERVAL_SEC=2 로 돈다).
  await page.evaluate(() => localStorage.setItem("liftgram.usage.optOut", "1"));
  sql(`delete from usage_events`);
  sql(`delete from usage_presence`);
  sql(`delete from usage_active_days`);
  sql(`delete from usage_daily`);

  const u = `e2e-usage-u-${Date.now()}`;
  sql(`insert into users (id, email, display_name) values ('${u}', '${u}@example.com', 'x')`);
  const day = sql(`select to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD')`);
  sql(`insert into usage_presence (actor_kind, actor_id, first_seen, last_seen) values
       ('user', '${u}', now(), now()),
       ('guest', 'g1', now(), now()),
       ('guest', 'g2', now(), now() - interval '10 minutes')`);
  sql(`insert into usage_active_days (day, actor_kind, actor_id) values
       ('${day}', 'user', '${u}'), ('${day}', 'guest', 'g1'), ('${day}', 'guest', 'g2')`);
  sql(`insert into usage_events (at, actor_kind, actor_id, client_event_id, event, platform) values
       (date_trunc('hour', now()), 'user', '${u}', gen_random_uuid(), 'workout_finish', 'android'),
       (date_trunc('hour', now()), 'guest', 'g1', gen_random_uuid(), 'workout_finish', 'web'),
       (date_trunc('hour', now()), 'guest', 'g1', gen_random_uuid(), 'screen_feed', 'web'),
       (date_trunc('hour', now()), 'guest', 'g2', gen_random_uuid(), 'screen_home', 'web')`);

  await page.goto("/admin/stats");
  await expect(page.getByTestId("stat-online")).toHaveText("2");
  await expect(page.getByTestId("stats-users")).toContainText("로그인 1 · 비로그인 1");
  await expect(page.getByTestId("stat-dau")).toHaveText("3");
  await expect(page.getByTestId("stats-users-note")).toContainText("추세로만");

  // 일별·기능은 집계표를 읽는다 — 다음 주기까지 기다려 새로고침.
  await expect
    .poll(
      async () => {
        await page.reload();
        await expect(page.getByTestId("stats-features-at")).toBeVisible();
        return page.getByTestId("chart-actions-workout_finish").count();
      },
      { timeout: 20_000 },
    )
    .toBe(1);
  await expect(page.getByTestId("chart-active-legend")).toContainText("비로그인");
  await expect(page.getByTestId("chart-actions-workout_finish")).toContainText("운동 완료");
  await expect(page.getByTestId("chart-actions-workout_finish")).toContainText("2");
  await expect(page.getByTestId("chart-screens-screen_feed")).toContainText("피드");
  await expect(page.getByTestId("chart-platforms-web")).toContainText("75%");
  await page.getByTestId("stats-range-30").click();
  await expect(page.getByTestId("chart-actions-workout_finish")).toContainText("2");
  if (process.env.STATS_SHOT) await page.screenshot({ path: process.env.STATS_SHOT, fullPage: true });

  // 제외 계정은 지금 숫자에서 바로 빠진다.
  sql(`update users set stats_excluded = true where id = '${u}'`);
  await page.reload();
  await expect(page.getByTestId("stat-dau")).toHaveText("2");
  sql(`delete from users where id = '${u}'`);
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
