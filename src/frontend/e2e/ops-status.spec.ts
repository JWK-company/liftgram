// @plm SRS-088 SRS-087  운영 상태 e2e — 기기 보고가 운영진(admin) 화면에 닿는가 · 일반 계정은 막히는가
//
// 확인하는 것:
//   · 일반 계정: 프로필에 「운영 상태」 줄이 없고, /ops 를 직접 열어도 「운영진 계정만 볼 수 있어요」(서버가 막는다)
//   · 다른 계정의 동기를 막아(Push·Pull 500) 3번 실패시키면 → 기기가 곧바로 보고한다(3회 문턱은 쓰로틀 없이 즉시)
//     → admin 의 /ops 「동기가 멈춘 사용자」에 그 사람이 보인다 · 프로필 탭에 빨간 점 · 「운영 상태」 줄에 빨간 점
//   · ops_backup_runs 에 40시간 전 daily 만 있으면 이유 「일일 백업이 36시간 넘게 성공하지 않았어요」
//   · 그 보고를 4일 전으로 돌리면(앱을 다시 안 연 사용자) → 「멈춤」·경보 이유에서 빠지고 「연락 끊긴 기기」(회색)에만 (qa code H-1)
//   · 일반 계정은 GetOpsAlert 를 부르지도 않는다(qa code L-7)
//
// ── 돌리는 법(로컬 운영 빌드 · 새 DB) ─────────────────────────────────────────
//   admin 역할은 화면으로 줄 수 없어 **테스트 DB 를 직접 고친다**(docker 공유 db · `E2E_DB` 필수 — 없으면 건너뜀):
//     docker exec liftgram-db-1 psql -U app -d app -c "create database e2e_ops_<시각>"
//     (DATABASE_URL 을 그 DB 로 → ./bin/migrate → API 3201 · 웹 3200 — 메모리 「로컬 운영 빌드 e2e」 순서)
//     E2E_DB=e2e_ops_<시각> BASE=http://127.0.0.1:3200 bunx playwright test -c frontend/playwright.config.ts e2e/ops-status.spec.ts
//   테스트가 하는 DB 조작: `update users set role='admin' where email=<이 테스트가 만든 주소>` ·
//   ops_backup_runs 에 detail='e2e-ops' 줄 넣기(끝나면 지움). **새 DB 에서만** 돌린다(백업 줄 판정이 「마지막 줄」 기준이다).
//   역할을 바꾼 뒤 새로고침하면 access 토큰이 갱신되며 서버가 DB 역할을 다시 읽는다(claim 이 admin 이 된다).
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

const PW = "hunter22!";
const SYNC_ROUTE = "**/api/sync.v1.SyncService/**";
const DB = process.env.E2E_DB;

/** 테스트 DB 에 SQL 한 줄(결과 문자열). 값은 이 파일이 만든 것만 넣는다(따옴표는 두 겹으로). */
function sql(q: string): string {
  if (!DB) throw new Error("E2E_DB 없음");
  return execFileSync("docker", ["exec", "-i", "liftgram-db-1", "psql", "-U", "app", "-d", DB, "-tAc", q], {
    encoding: "utf8",
  }).trim();
}
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

function freshEmail(tag: string): string {
  return `e2e-ops-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function 가입(page: Page, email: string, name: string) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill(PW);
  await page.getByTestId("auth-name-input").fill(name);
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

async function 운동하고_마치기(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("workout-exercises")).toContainText("벤치프레스", { timeout: 20_000 });
  await page.getByTestId("set-weight").first().fill("60");
  await page.getByTestId("set-reps").first().fill("10");
  await page.getByTestId("set-done").first().click();
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 20_000 });
  for (const id of ["btn-finish-dont-save", "btn-finish-today"]) {
    const b = page.getByTestId(id);
    if (await b.isVisible()) await b.click();
  }
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

test.describe("운영 상태", () => {
  test.skip(!DB, "E2E_DB 없음 — admin 역할·백업 줄을 테스트 DB 에 직접 넣어야 한다(파일 머리말)");

  test.afterAll(() => {
    if (DB) sql("delete from ops_backup_runs where detail = 'e2e-ops'");
  });

  test("일반 계정은 운영 상태 줄이 없고 /ops 도 막힌다", async ({ page }) => {
    // 탭 점용 질문은 admin 일 때만 — 일반 계정은 부르지도 않는다(qa code L-7)
    const alertAsks: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("OpsService/GetOpsAlert")) alertAsks.push(r.url());
    });
    await 가입(page, freshEmail("plain"), "일반운영시험");
    await page.goto("/profile");
    await expect(page.getByTestId("account-card")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("row-ops")).toHaveCount(0);
    await expect(page.getByTestId("nav-profile-ops-dot")).toHaveCount(0);
    expect(alertAsks).toEqual([]);
    await page.goto("/ops");
    await expect(page.getByTestId("ops-error")).toHaveText("운영진 계정만 볼 수 있어요", { timeout: 20_000 });
  });

  test("동기가 3번 실패한 사용자가 admin 운영 화면에 보이고 프로필 탭에 빨간 점이 뜬다", async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    // 백업 줄: 40시간 전 성공한 daily 하나 · 어제 복원 시험 성공 — 이유는 「36시간」 하나여야 한다.
    sql(
      "insert into ops_backup_runs (kind, ok, detail, created_at) values " +
        "('daily', true, 'e2e-ops', now() - interval '40 hours'), ('restore_test', true, 'e2e-ops', now() - interval '1 day')",
    );

    // ── 사용자 B: 동기를 막고 운동 → 3번 실패 ──
    const stuckName = `멈춘이${Date.now().toString(36)}`;
    const stuckEmail = freshEmail("stuck");
    const ctxB = await browser.newContext();
    const b = await ctxB.newPage();
    await 가입(b, stuckEmail, stuckName);
    await b.route(SYNC_ROUTE, (r) => r.fulfill({ status: 500, body: "e2e: sync blocked" }));
    await 운동하고_마치기(b);
    await b.goto("/account");
    for (let i = 0; i < 3; i++) {
      await b.getByTestId("btn-sync-now").click();
      await expect(b.getByTestId("sync-status")).not.toHaveText("동기 중…", { timeout: 20_000 });
    }
    await expect(b.getByTestId("sync-pending")).toContainText("서버에 아직 안 올라간 기록");
    // 3회 문턱은 쓰로틀 없이 곧바로 보고된다(qa spec H-1) — 서버 줄로 확인한다.
    await expect
      .poll(
        () =>
          Number(
            sql(
              `select coalesce(max(h.consecutive_failures), 0) from client_health h join users u on u.id = h.user_id where u.email = ${lit(stuckEmail)}`,
            ),
          ),
        { timeout: 20_000 },
      )
      .toBeGreaterThanOrEqual(3);
    // 기기 id 는 해시 16자로 간다(원래 id 를 싣지 않는다 · qa spec L-6)
    expect(
      sql(
        `select h.device_id from client_health h join users u on u.id = h.user_id where u.email = ${lit(stuckEmail)} limit 1`,
      ),
    ).toMatch(/^[0-9a-f]{16}$/);
    await ctxB.close();

    // ── admin A ──
    const adminEmail = freshEmail("admin");
    await 가입(page, adminEmail, "운영진시험");
    sql(`update users set role = 'admin' where email = ${lit(adminEmail)}`);
    // 새로고침 → access 토큰 갱신 때 서버가 DB 역할을 다시 읽는다(claim = admin) · Me 도 새 역할
    await page.goto("/profile");
    await page.reload();
    await expect(page.getByTestId("row-ops")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("row-ops-dot")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("nav-profile-ops-dot")).toBeVisible();
    // 같이 뜨면 빨강만(회색 업데이트 점은 그리지 않는다)
    await expect(page.getByTestId("nav-profile-update-dot")).toHaveCount(0);
    await expect(page.getByTestId("nav-profile")).toContainText("운영 확인 필요");

    await page.getByTestId("row-ops").click();
    await expect(page).toHaveURL(/\/ops$/);
    await expect(page.getByTestId("ops-summary")).toHaveAttribute("data-alert", "1", { timeout: 20_000 });
    const item = page.getByTestId("ops-stalled-item").filter({ hasText: stuckName });
    await expect(item).toBeVisible();
    await expect(item).toContainText("연속 실패 3");
    await expect(item).toContainText("e2e…"); // 이메일은 앞 3글자만
    await expect(item).not.toContainText(stuckEmail);
    await expect(page.locator('[data-testid="ops-reason"][data-reason="daily_stale"]')).toHaveText(
      "일일 백업이 36시간 넘게 성공하지 않았어요",
    );
    await expect(page.locator('[data-testid="ops-reason"][data-reason="stalled"]')).toBeVisible();
    // 복원 시험은 어제 성공 — 이유에 없다
    await expect(page.locator('[data-testid="ops-reason"][data-reason^="restore"]')).toHaveCount(0);
    // 이유는 빨강 **글자** — 바탕 채움이 아니다(화면 정리 규칙)
    const bg = await page.getByTestId("ops-summary").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(bg);

    await expect(page.getByTestId("ops-backup-daily")).toContainText("성공");
    await page.getByTestId("ops-users-toggle").click();
    await expect(page.getByTestId("ops-users")).toContainText(stuckName);
    await expect(page.getByTestId("ops-users")).toContainText("마지막 활동(토큰 갱신)");
    // 지금은 연락 끊긴 기기가 없다 — 칸째 없다
    await expect(page.getByTestId("ops-disconnected")).toHaveCount(0);

    // ── 오래된 보고는 경보가 아니다(qa code H-1) ──
    // B 가 그 뒤로 앱을 안 열었다 — 마지막 보고를 4일 전으로 돌린다(시각들을 같이 민다).
    sql(
      "update client_health h set reported_at = h.reported_at - interval '4 days', " +
        "first_reported_at = h.first_reported_at - interval '4 days', " +
        "last_attempt_at = h.last_attempt_at - interval '4 days', " +
        "last_success_at = h.last_success_at - interval '4 days' " +
        `from users u where u.id = h.user_id and u.email = ${lit(stuckEmail)}`,
    );
    await page.getByTestId("ops-refresh").click();
    await expect(page.getByTestId("ops-disconnected-item").filter({ hasText: stuckName })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByTestId("ops-stalled-item").filter({ hasText: stuckName })).toHaveCount(0);
    await expect(page.locator('[data-testid="ops-reason"][data-reason="stalled"]')).toHaveCount(0);
    // 이유는 백업 하나만 남는다
    await expect(page.locator('[data-testid="ops-reason"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="ops-reason"][data-reason="daily_stale"]')).toBeVisible();
    // 회색 — 빨강 글자가 아니다(글자·바탕 모두 · 메모리 「색 규칙 가드는 전 채널」)
    const danger = await page
      .locator('[data-testid="ops-reason"] span, [data-testid="ops-reason"] *')
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    const colors = await page
      .getByTestId("ops-disconnected")
      .locator("*")
      .evaluateAll((els) =>
        els.flatMap((el) => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]),
      );
    expect(colors).not.toContain(danger);
  });
});
