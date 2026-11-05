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
  sql(`insert into users (id, email, display_name, password_hash, email_verified_at) values ('${uid}', '${uid}@example.com', 'x', 'x', now())`);
  const startMs = Date.now() - 3600_000;
  sql(
    `insert into sync_records (id, user_id, collection, record_id, payload) values
     ('${uid}-w1', '${uid}', 'workouts', 'w1', '{"state":"completed","started_at":${startMs},"duration_seconds":1800,"routine_id":"r1"}'::jsonb),
     ('${uid}-w2', '${uid}', 'workouts', 'w2', '{"state":"completed","started_at":${startMs},"duration_seconds":2400}'::jsonb),
     ('${uid}-r1', '${uid}', 'routines', 'r1', '{"is_archived":false}'::jsonb)`,
  );
  sql(`insert into reports (id, target_type, target_id, reporter_id, reason) values ('${uid}-rp', 'post', 'x', '${uid}', 'spam')`);

  await page.goto("/admin");
  await page.getByTestId("row-stats").click();
  await expect(page.getByTestId("stats-screen")).toBeVisible();

  const total = sql(`select count(*) from users where role='user' and not stats_excluded`);
  await expect(page.getByTestId("stat-signup-total")).toHaveText(Number(total).toLocaleString());
  await expect(page.getByTestId("stats-signup-at")).toBeVisible();
  await expect(page.getByTestId("chart-signup")).toBeVisible();

  // 신고 대기·콘텐츠
  await expect(page.getByTestId("stat-pending-reports")).toContainText(sql(`select count(*) from reports where status='pending'`));
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
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
});

test("한 구역 실패는 그 구역만 막고 다시 시도로 살아난다 · 시행 전 상태", async ({ page }) => {
  const email = freshEmail("admin2");
  await 가입(page, email);
  await 역할(page, email, "admin");

  let fail = true;
  await page.route("**/admin.v1.AdminService/GetContentStats", (route) =>
    fail ? route.fulfill({ status: 500, contentType: "application/json", body: '{"code":"internal","message":"x"}' }) : route.fallback(),
  );
  await page.route("**/admin.v1.AdminService/GetRoutineStats", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ generatedAt: "2026-11-01T00:00:00Z", started: false, usageSince: "2026-11-05T00:00:00+09:00" }),
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
