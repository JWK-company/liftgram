// 요약과 운영 상태(SPEC-033 Phase 2)
import { expect, logIn, makeAccount, sql, test } from "./helpers/base";

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

function setBackups(dailyHoursAgo: number | null, restoreOk = true) {
  sql("delete from ops_backup_runs");
  if (dailyHoursAgo !== null) {
    sql(
      `insert into ops_backup_runs (kind, ok, size_bytes, disk_free_bytes, detail, created_at) values ('daily', true, 1048576, 53687091200, 'e2e', now() - interval '${dailyHoursAgo} hours')`,
    );
  }
  sql(
    `insert into ops_backup_runs (kind, ok, detail, created_at) values ('restore_test', ${restoreOk}, 'e2e', now() - interval '1 day')`,
  );
}

/** 멈춘 기기 보고. 실패 3회, 5일 전 성공, 방금 보고. */
function stallDevice(email: string, reportedAgo = "1 minute") {
  sql(`insert into client_health (user_id, device_id, app_version, last_success_at, last_attempt_at, consecutive_failures, pending, blocked, last_error, first_reported_at, reported_at)
    select id, 'e2e-device', '9.9.9', now() - interval '5 days', now() - interval '${reportedAgo}', 3, 7, false, 'e2e 오류', now() - interval '5 days', now() - interval '${reportedAgo}' from users where email = ${lit(email)}
    on conflict (user_id, device_id) do update set reported_at = excluded.reported_at, last_attempt_at = excluded.last_attempt_at`);
  // 서버의 마지막 동기가 멈춘 뒤라야 멈춤으로 본다. 기록을 남기지 않으면 조건에 맞는다.
}

test.describe.configure({ mode: "serial" });

test("관리자 요약은 네 칸을 보고, 경고 이유와 메뉴 점이 보인다", async ({ page }) => {
  setBackups(40);
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home-alert-reason")).toContainText(["일일 백업이 36시간"]);
  await expect(page.getByTestId("menu-ops-dot")).toBeVisible();
  await expect(page.getByTestId("home-queue-count")).toBeVisible();
  await expect(page.getByTestId("home-feedback-count")).toBeVisible();
  await expect(page.getByTestId("home-usage")).toBeVisible();
});

test("협업자는 의견 칸만, 모더레이터는 신고 칸만 본다. 금지 RPC 를 부르지 않는다", async ({
  page,
  browser,
  extraHTTPHeaders,
}) => {
  const asks: string[] = [];
  const watch = (u: string) => {
    if (/AdminService|OpsService|ListQueue/.test(u)) asks.push(u);
  };
  page.on("request", (r) => watch(r.url()));
  await logIn(page, await makeAccount("coworker"));
  await expect(page.getByTestId("home-feedback-count")).toBeVisible();
  await expect(page.getByTestId("home-queue")).toHaveCount(0);
  await expect(page.getByTestId("home-alert")).toHaveCount(0);
  await expect(page.getByTestId("home-usage")).toHaveCount(0);
  await expect(page.getByTestId("menu-ops")).toHaveCount(0);
  await expect(page.getByTestId("home-feedback-error")).toHaveCount(0);
  expect(asks).toEqual([]);

  const ctx = await browser.newContext({ extraHTTPHeaders });
  const mod = await ctx.newPage();
  const modAsks: string[] = [];
  mod.on("request", (r) => {
    if (/AdminService|OpsService|ListEntries/.test(r.url())) modAsks.push(r.url());
  });
  await logIn(mod, await makeAccount("moderator"));
  await expect(mod.getByTestId("home-queue-count")).toBeVisible();
  await expect(mod.getByTestId("home-feedback")).toHaveCount(0);
  await expect(mod.getByTestId("home-queue-error")).toHaveCount(0);
  expect(modAsks).toEqual([]);
  await ctx.close();
});

test("신고 대기는 큐 줄 수다: 같은 글의 신고 여러 건도 한 줄", async ({ page }) => {
  setBackups(1);
  await logIn(page, await makeAccount("admin"));
  const before = Number(await page.getByTestId("home-queue-count").innerText());
  const author = await makeAccount("user");
  const postId = `e2e-post-${Date.now()}`;
  sql(
    `insert into posts (id, author_id, caption) select ${lit(postId)}, id, 'e2e 글' from users where email = ${lit(author)}`,
  );
  for (const r of ["a", "b", "c"]) {
    const reporter = await makeAccount("user");
    sql(
      `insert into reports (id, reporter_id, target_type, target_id, reason) select ${lit(`${postId}-${r}`)}, id, 'post', ${lit(postId)}, 'spam' from users where email = ${lit(reporter)}`,
    );
  }
  await page.reload();
  await expect(page.getByTestId("home-queue-count")).toHaveText(String(before + 1));
  sql(`delete from reports where target_id = ${lit(postId)}`);
  sql(`delete from posts where id = ${lit(postId)}`);
});

test("운영 상태: 멈춘 기기, 연락 끊긴 기기, 백업, 사용자 표", async ({ page }) => {
  setBackups(40);
  const stuck = await makeAccount("user");
  const name = sql(`select display_name from users where email = ${lit(stuck)}`);
  stallDevice(stuck);
  await logIn(page, await makeAccount("admin"));
  await page.getByTestId("menu-ops").click();
  await expect(page).toHaveURL(/\/ops$/);
  await expect(page.getByTestId("ops-summary")).toHaveAttribute("data-alert", "1");
  const item = page.getByTestId("ops-stalled-item").filter({ hasText: name });
  await expect(item).toBeVisible();
  await expect(item).toContainText("연속 실패 3");
  await expect(item).toContainText("안 올라간 기록 7");
  await expect(item).toContainText("e2e 오류");
  await expect(item).toContainText("e2e…");
  await expect(item).not.toContainText(stuck);
  await expect(page.locator('[data-testid="ops-reason"][data-reason="daily_stale"]')).toHaveText(
    "일일 백업이 36시간 넘게 성공하지 않았습니다",
  );
  await expect(page.locator('[data-testid="ops-reason"][data-reason="stalled"]')).toBeVisible();
  await expect(page.locator('[data-testid="ops-reason"][data-reason^="restore"]')).toHaveCount(0);
  // 이유는 빨강 글자이고 바탕을 채우지 않는다.
  const bg = await page.getByTestId("ops-summary").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(bg);
  await expect(page.getByTestId("ops-backup-daily")).toContainText("성공");
  await expect(page.getByTestId("ops-backup-daily")).toContainText("1.0MB");
  await expect(page.getByTestId("ops-disconnected")).toHaveCount(0);

  // 사용자 검색은 주소에 남고 새로고침해도 유지된다.
  await page.getByTestId("ops-user-search").fill(name);
  await expect(page).toHaveURL(/user=/);
  await expect(page.getByTestId("ops-user").filter({ hasText: name })).toBeVisible();
  await expect(page.getByTestId("ops-user")).not.toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("ops-user-search")).toHaveValue(name);
  await page.getByTestId("ops-user-search").fill("없는이름zzz");
  await expect(page.getByTestId("ops-users-empty")).toBeVisible();

  // 4일 전 보고는 경고가 아니라 회색 목록이다.
  sql(
    `update client_health h set reported_at = h.reported_at - interval '4 days', first_reported_at = h.first_reported_at - interval '4 days', last_attempt_at = h.last_attempt_at - interval '4 days', last_success_at = h.last_success_at - interval '4 days' from users u where u.id = h.user_id and u.email = ${lit(stuck)}`,
  );
  await page.getByTestId("refresh").click();
  await expect(page.getByTestId("ops-disconnected-item").filter({ hasText: name })).toBeVisible();
  await expect(page.getByTestId("ops-stalled-item").filter({ hasText: name })).toHaveCount(0);
  await expect(page.locator('[data-testid="ops-reason"][data-reason="stalled"]')).toHaveCount(0);
  const danger = await page
    .locator('[data-testid="ops-reason"]')
    .first()
    .evaluate((el) => getComputedStyle(el).color);
  const colors = await page
    .getByTestId("ops-disconnected")
    .locator("*")
    .evaluateAll((els) =>
      els.flatMap((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]),
    );
  expect(colors).not.toContain(danger);
  sql(`delete from client_health h using users u where u.id = h.user_id and u.email = ${lit(stuck)}`);
});

test("경고가 없으면 이상 없음이고 메뉴 점도 없다", async ({ page }) => {
  sql("delete from client_health");
  setBackups(1);
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home-alert-clear")).toBeVisible();
  await expect(page.getByTestId("menu-ops-dot")).toHaveCount(0);
  await page.goto("/ops");
  await expect(page.getByTestId("ops-all-clear")).toBeVisible();
  await expect(page.getByTestId("ops-stalled-empty")).toBeVisible();
});

test("권한 없는 주소는 안내만 보이고 RPC 를 부르지 않는다", async ({ page }) => {
  const asks: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("OpsService")) asks.push(r.url());
  });
  await logIn(page, await makeAccount("moderator"));
  await expect(page.getByTestId("home")).toBeVisible();
  await page.goto("/ops");
  await expect(page.getByTestId("role-denied")).toBeVisible();
  expect(asks).toEqual([]);
});

test("다시 읽기가 실패해도 있던 데이터를 지우지 않고 알린다", async ({ page }) => {
  setBackups(1);
  await logIn(page, await makeAccount("admin"));
  await page.goto("/ops");
  await expect(page.getByTestId("ops-all-clear")).toBeVisible();
  await page.route("**/api/ops.v1.OpsService/GetOpsStatus", (r) =>
    r.fulfill({ status: 502, contentType: "application/json", body: "{}" }),
  );
  await page.getByTestId("refresh").click();
  await expect(page.getByTestId("stale-note")).toContainText("새로고침 실패");
  await expect(page.getByTestId("ops-all-clear")).toBeVisible();
});

test("칸 하나가 실패해도 다른 칸은 보인다", async ({ page }) => {
  await page.route("**/api/moderation.v1.ModerationService/ListQueue", (r) =>
    r.fulfill({ status: 502, contentType: "application/json", body: "{}" }),
  );
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home-queue-error")).toBeVisible();
  await expect(page.getByTestId("home-feedback-count")).toBeVisible();
});

test("휴대폰 폭에서 표는 표 안에서만 가로로 스크롤된다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home")).toBeVisible();
  await page.goto("/ops");
  await expect(page.getByTestId("ops-users")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("검색칸은 빠른 입력을 잃지 않고 서버 왕복을 하지 않으며, 다른 거르기와 함께 남는다", async ({
  page,
}) => {
  await logIn(page, await makeAccount("admin"));
  await page.goto("/ops");
  await expect(page.getByTestId("ops-users")).toBeVisible();
  const rsc: string[] = [];
  page.on("request", (r) => {
    // 메뉴 링크 미리 받기(prefetch)는 입력과 무관하다. 입력이 만든 왕복만 센다.
    if (r.url().includes("_rsc=") && /[?&](user|sort)=/.test(r.url())) rsc.push(r.url());
  });
  const box = page.getByTestId("ops-user-search");
  await box.pressSequentially("abcdefgh");
  await expect(box).toHaveValue("abcdefgh");
  await expect(page).toHaveURL(/user=abcdefgh/);
  await page.getByTestId("ops-user-sort").selectOption("active");
  await expect(page).toHaveURL(/user=abcdefgh.*sort=active/);
  expect(rsc).toEqual([]);
  await page.reload();
  await expect(page.getByTestId("ops-user-search")).toHaveValue("abcdefgh");
  await expect(page.getByTestId("ops-user-sort")).toHaveValue("active");
});

test("망가진 페이지 번호는 1쪽으로 본다", async ({ page }) => {
  await logIn(page, await makeAccount("admin"));
  await page.goto("/ops?page=abc");
  await expect(page.getByTestId("ops-user").first()).toBeVisible();
  await expect(page.getByTestId("ops-users-empty")).toHaveCount(0);
});

test("없는 주소는 한국어 안내이고, 미처리 수는 새 글·승인·진행 중을 모두 센다", async ({ page }) => {
  const tag = `${Date.now()}`;
  sql(`delete from feedback_items where kind = 'user'`);
  sql(`insert into feedback_items (kind, body, status) values
       ('user', '${tag}a', 'new'), ('user', '${tag}b', 'approved'), ('user', '${tag}c', 'in_progress'), ('user', '${tag}d', 'done')`);
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home-feedback-count")).toHaveText("3");
  sql(`insert into feedback_items (kind, body) select 'user', '${tag}x' || g from generate_series(1, 200) g`);
  await page.getByTestId("home-refresh").click();
  await expect(page.getByTestId("home-feedback-count")).toHaveText(/\+$/);
  sql(`delete from feedback_items where body like '${tag}%'`);
  await page.goto("/nothing-here");
  await expect(page.getByTestId("not-found")).toContainText("없는 주소");
});

test("요약 칸의 재로드 실패는 원인과 다시 시도를 보여 주고", async ({ page }) => {
  await logIn(page, await makeAccount("admin"));
  await expect(page.getByTestId("home-feedback-count")).toBeVisible();
  let fail = true;
  await page.route("**/feedback.v1.FeedbackService/ListEntries", (r) =>
    fail
      ? r.fulfill({
          status: 429,
          contentType: "application/json",
          body: '{"code":"resource_exhausted","message":"x"}',
        })
      : r.fallback(),
  );
  await page.getByTestId("home-refresh").click();
  const stale = page.getByTestId("home-feedback-stale");
  await expect(stale).toContainText("요청이 너무 많습니다");
  fail = false;
  await stale.getByRole("button").click();
  await expect(stale).toHaveCount(0);
});
