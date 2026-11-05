// 통계(SPEC-033 Phase 3). 앱 시험 admin-stats 42, 68, 133, 345줄을 옮겼다.
import { expect, logIn, makeAccount, sql, test } from "./helpers/base";

test.describe.configure({ mode: "serial" });

test("관리자가 아니면 통계를 부르지도 못하고 메뉴도 없다", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("AdminService")) calls.push(r.url());
  });
  await logIn(page, await makeAccount("coworker"));
  await expect(page.getByTestId("home")).toBeVisible();
  await expect(page.getByTestId("menu-stats")).toHaveCount(0);
  await page.goto("/stats");
  await expect(page.getByTestId("role-denied")).toBeVisible();
  expect(calls).toEqual([]);
});

test("로그인 없는 호출은 운영 프록시를 지나도 백엔드가 401 로 막는다", async ({ request }) => {
  const res = await request.post("/api/admin.v1.AdminService/GetSignupStats", { data: {} });
  expect(res.status()).toBe(401);
});

test("모더레이터도 통계를 부르지 못한다", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("AdminService")) calls.push(r.url());
  });
  await logIn(page, await makeAccount("moderator"));
  await page.goto("/stats");
  await expect(page.getByTestId("role-denied")).toBeVisible();
  expect(calls).toEqual([]);
});

test("고정 응답의 값이 칸마다 정확히 그려진다", async ({ page }) => {
  const actor = (user: number, guest: number) => ({ user, guest, total: user + guest });
  const json = (body: unknown) => ({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
  const at = "2026-11-05T01:00:00Z";
  await page.route("**/admin.v1.AdminService/GetUsageStats", (r) =>
    r.fulfill(
      json({
        generatedAt: at,
        started: true,
        usageSince: "2026-10-01T00:00:00Z",
        online: actor(1, 2),
        dau: actor(3, 4),
        wau: actor(5, 6),
        mau: actor(7, 8),
        daily: [{ day: "2026-11-05", user: 3, guest: 4 }],
        d1: { cohort: actor(10, 10), returned: actor(5, 1) },
        d7: { cohort: actor(10, 10), returned: actor(2, 0) },
        d30: { cohort: actor(0, 0), returned: actor(0, 0) },
      }),
    ),
  );
  await page.route("**/admin.v1.AdminService/GetSignupStats", (r) =>
    r.fulfill(
      json({
        generatedAt: at,
        started: true,
        usageSince: "2026-10-01T00:00:00Z",
        total: 8,
        emailVerified: 2,
        daily: [{ day: "2026-11-05", count: 8 }],
        providers: [{ name: "kakao", count: 8 }],
        firstWorkoutCohort: 4,
        firstWorkoutDone: 3,
      }),
    ),
  );
  await page.route("**/admin.v1.AdminService/GetRoutineStats", (r) =>
    r.fulfill(
      json({
        generatedAt: at,
        started: true,
        usageSince: "2026-01-01T00:00:00Z",
        routineBuckets: [{ name: "1", count: 6 }],
        workouts: 40,
        workoutsFromRoutine: 10,
        activeUsers: 5,
        medianDurationSeconds: 1800,
      }),
    ),
  );
  await page.route("**/admin.v1.AdminService/GetOperationsStats", (r) =>
    r.fulfill(
      json({
        generatedAt: at,
        pendingReports: 11,
        openUserFeedback: 12,
        openOpsFeedback: 13,
        usageBytes: 2048,
        usageRows24h: 99,
        usageWarn: true,
      }),
    ),
  );
  await logIn(page, await makeAccount("admin"));
  await page.goto("/stats");
  await expect(page.getByTestId("stat-online")).toHaveText("3");
  await expect(page.getByTestId("stat-mau")).toHaveText("15");
  await expect(page.getByTestId("retention-1").locator("td")).toHaveText(["50%", "10%", "30%"]);
  await expect(page.getByTestId("retention-7").locator("td")).toHaveText(["20%", "0%", "10%"]);
  await expect(page.getByTestId("retention-30").locator("td")).toHaveText(["—", "—", "—"]);
  await expect(page.getByTestId("stat-signup-total")).toHaveText("8");
  await expect(page.getByTestId("stat-email-verified")).toHaveText("25%");
  await expect(page.getByTestId("stat-first-workout")).toHaveText("75%");
  await expect(page.getByTestId("chart-providers-kakao")).toContainText("카카오");
  await expect(page.getByTestId("chart-routines-1")).toContainText("6");
  await expect(page.getByTestId("stat-from-routine")).toHaveText("25%");
  await expect(page.getByTestId("stat-weekly")).toHaveText("2.0");
  await expect(page.getByTestId("stat-median")).toHaveText("30분");
  await expect(page.getByTestId("stat-pending-reports").locator("span").last()).toHaveText("11");
  await expect(page.getByTestId("stat-open-user-feedback").getByRole("link")).toHaveAttribute(
    "href",
    "/user-feedback",
  );
  await expect(page.getByTestId("stat-open-ops-feedback").getByRole("link")).toHaveAttribute(
    "href",
    "/ops-feedback",
  );
  await expect(page.getByTestId("stat-open-ops-feedback")).toContainText("13");
  await expect(page.getByTestId("stat-usage-tables")).toContainText("99행");
  await expect(page.getByTestId("stat-usage-warn")).toBeVisible();

  // 표 값·합계, 키보드 포커스 툴팁과 해제.
  await page.getByTestId("chart-active-toggle").click();
  await expect(page.getByTestId("chart-active-table").locator("tbody tr").first().locator("td")).toHaveText([
    "3",
    "4",
    "7",
  ]);
  await page.getByTestId("chart-active-toggle").click();
  await page.getByTestId("chart-active").locator("button[aria-label]").first().focus();
  await expect(page.getByTestId("chart-active-tooltip")).toContainText("합계 7");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("chart-active-tooltip")).toHaveCount(0);
});

test("읽은 뒤 실패하면 숫자를 지우지 않고 알리며, 운영 상태를 모르면 정상이라 하지 않는다", async ({
  page,
}) => {
  let fail = false;
  await page.route("**/admin.v1.AdminService/GetSignupStats", (r) =>
    fail ? r.fulfill({ status: 502, contentType: "application/json", body: "{}" }) : r.fallback(),
  );
  await page.route("**/ops.v1.OpsService/GetOpsAlert", (r) =>
    r.fulfill({ status: 500, contentType: "application/json", body: '{"code":"internal","message":"x"}' }),
  );
  await logIn(page, await makeAccount("admin"));
  await page.goto("/stats");
  await expect(page.getByTestId("stat-signup-total")).toBeVisible();
  const shown = await page.getByTestId("stat-signup-total").textContent();
  await expect(page.getByTestId("stat-ops-status")).toContainText("확인 전");
  fail = true;
  await page.getByTestId("stats-refresh").click();
  await expect(page.getByTestId("stats-signup-error")).toBeVisible();
  await expect(page.getByTestId("stat-signup-total")).toHaveText(shown ?? "");
  fail = false;
  await page.getByTestId("stats-signup-retry").click();
  await expect(page.getByTestId("stats-signup-error")).toHaveCount(0);
});

test("관리자는 구역별 숫자를 보고, 제외 계정은 숫자에서 빠진다", async ({ page }) => {
  const uid = `e2e-stats-u-${Date.now()}`;
  sql(
    `insert into users (id, email, display_name, password_hash, email_verified_at) values ('${uid}', '${uid}@example.com', 'x', 'x', now())`,
  );
  const startMs = Date.now() - 3600_000;
  sql(`insert into sync_records (id, user_id, collection, record_id, payload) values
     ('${uid}-w1', '${uid}', 'workouts', 'w1', '{"state":"completed","started_at":${startMs},"duration_seconds":1800,"routine_id":"r1"}'::jsonb),
     ('${uid}-w2', '${uid}', 'workouts', 'w2', '{"state":"completed","started_at":${startMs},"duration_seconds":2400}'::jsonb),
     ('${uid}-r1', '${uid}', 'routines', 'r1', '{"is_archived":false}'::jsonb)`);
  sql(
    `insert into reports (id, target_type, target_id, reporter_id, reason) values ('${uid}-rp', 'post', 'x', '${uid}', 'spam')`,
  );

  await logIn(page, await makeAccount("admin"));
  await page.getByTestId("menu-stats").click();
  await expect(page.getByTestId("stats-screen")).toBeVisible();

  const total = Number(sql("select count(*) from users where role='user' and not stats_excluded"));
  await expect(page.getByTestId("stat-signup-total")).toHaveText(total.toLocaleString("ko-KR"));
  await expect(page.getByTestId("stats-signup-at")).toBeVisible();
  await expect(page.getByTestId("chart-signup")).toBeVisible();
  await expect(page.getByTestId("stat-pending-reports")).toContainText(
    sql("select count(*) from reports where status='pending'"),
  );
  await expect(page.getByTestId("stat-pending-reports").getByRole("link")).toHaveAttribute(
    "href",
    "/moderation",
  );
  await expect(page.getByTestId("content-post")).toBeVisible();
  await expect(page.getByTestId("chart-routines-1")).toBeVisible();
  const routines = Number(
    ((await page.getByTestId("chart-routines-1").textContent()) ?? "").replace(/[^0-9]/g, ""),
  );
  expect(routines).toBeGreaterThan(0);
  await expect(page.getByTestId("stat-from-routine")).toBeVisible();
  await expect(page.getByTestId("stat-median")).toContainText("분");

  sql(`update users set stats_excluded = true where id = '${uid}'`);
  await page.reload();
  await expect(page.getByTestId("stat-signup-total")).toHaveText((total - 1).toLocaleString("ko-KR"));
  sql(`update users set stats_excluded = false where id = '${uid}'`);

  await page.reload();
  await page.getByTestId("chart-signup-toggle").click();
  await expect(page.getByTestId("chart-signup-table")).toBeVisible();
  await page.getByTestId("chart-signup-toggle").click();
  await page.getByTestId("chart-signup").locator("button").nth(29).click();
  await expect(page.getByTestId("chart-signup-tooltip")).toBeVisible();

  await page.setViewportSize({ width: 360, height: 800 });
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
});

test("한 구역 실패는 그 구역만 막고 다시 시도로 살아난다 · 시행 전 상태", async ({ page }) => {
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
  await logIn(page, await makeAccount("admin"));
  await page.goto("/stats");
  await expect(page.getByTestId("stats-content-error")).toBeVisible();
  await expect(page.getByTestId("stat-signup-total")).toBeVisible();
  await expect(page.getByTestId("stats-routine-before")).toContainText("2026-11-05");
  fail = false;
  await page.getByTestId("stats-content-retry").click();
  await expect(page.getByTestId("content-post")).toBeVisible();
  await expect(page.getByTestId("stats-content-error")).toHaveCount(0);
});

test("사용자·기능 구역의 로그인·비로그인·합계가 맞고 기간이 주소에 남는다", async ({ page }) => {
  sql("delete from usage_events");
  sql("delete from usage_presence");
  sql("delete from usage_active_days");
  sql("delete from usage_daily");
  const u = `e2e-usage-u-${Date.now()}`;
  sql(`insert into users (id, email, display_name) values ('${u}', '${u}@example.com', 'x')`);
  const day = sql("select to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM-DD')");
  sql(`insert into usage_presence (actor_kind, actor_id, first_seen, last_seen) values
       ('user', '${u}', now(), now()), ('guest', 'g1', now(), now()), ('guest', 'g2', now(), now() - interval '10 minutes')`);
  sql(`insert into usage_active_days (day, actor_kind, actor_id) values
       ('${day}', 'user', '${u}'), ('${day}', 'guest', 'g1'), ('${day}', 'guest', 'g2')`);
  sql(`insert into usage_events (at, actor_kind, actor_id, client_event_id, event, platform) values
       (date_trunc('hour', now()), 'user', '${u}', gen_random_uuid(), 'workout_finish', 'android'),
       (date_trunc('hour', now()), 'guest', 'g1', gen_random_uuid(), 'workout_finish', 'web'),
       (date_trunc('hour', now()), 'guest', 'g1', gen_random_uuid(), 'screen_feed', 'web'),
       (date_trunc('hour', now()), 'guest', 'g2', gen_random_uuid(), 'screen_home', 'web')`);

  await logIn(page, await makeAccount("admin"));
  await page.goto("/stats");
  await expect(page.getByTestId("stat-online")).toHaveText("2");
  await expect(page.getByTestId("stats-users")).toContainText("로그인 1 · 비로그인 1");
  await expect(page.getByTestId("stat-dau")).toHaveText("3");
  await expect(page.getByTestId("stats-users-note")).toContainText("추세로만");
  await expect(page.getByTestId("retention-7")).toBeVisible();

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
  await expect(page).toHaveURL(/range=30/);
  await expect(page.getByTestId("chart-actions-workout_finish")).toContainText("2");
  await page.reload();
  await expect(page.getByTestId("stats-range-30")).toHaveAttribute("aria-pressed", "true");

  sql(`update users set stats_excluded = true where id = '${u}'`);
  await page.reload();
  await expect(page.getByTestId("stat-dau")).toHaveText("2");
  sql(`delete from users where id = '${u}'`);
});
