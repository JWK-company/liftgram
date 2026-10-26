// 데이터 보호 e2e — 오프라인으로 쓰던 기록이 **조용히 사라지지 않는가** (2026-10-26 사고 뒤)
//
// 그날 일어난 일: 옛 앱의 동기가 두 달 동안 매번 실패했는데 화면은 말이 없었고, 그 사이 기록은 기기에만
// 쌓였다. 주소를 옮기자 그 기록을 꺼낼 길이 없었다. 여기서 그 경로를 하나씩 막았는지 본다:
//   · 올라가지 않은 기록이 있는데 다른 계정으로 로그인하면 **지우지 않고 멈춘다**(가드)
//   · 백업이 실패하면 **화면 위에 경고가 뜬다**
//   · 백업 파일로 꺼내 **다른 기기에서 되살릴 수 있다**
//   · 주간 목표 같은 설정이 **계정을 따라간다**(기기 저장소에만 있다가 사라지지 않는다)
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

const PW = "hunter22!";
const SYNC_ROUTE = "**/api/sync.v1.SyncService/**";

function freshEmail(tag: string): string {
  return `e2e-safe-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function 준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
}

async function 가입(page: Page, email: string) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill(PW);
  await page.getByTestId("auth-name-input").fill("보호테스트");
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

async function 로그인(page: Page, email: string) {
  await page.goto("/account");
  // /account 는 로그인부터 연다(로그인/가입 탭 없음 — SRS-054 시안 10).
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill(PW);
  await page.getByTestId("btn-auth-submit").click();
}

async function 운동하고_마치기(page: Page) {
  await page.goto("/workout");
  await expect(page.getByTestId("btn-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-start").click();
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
  await page.getByTestId("btn-summary-close").click();
}

async function 기록에_있다(page: Page) {
  await page.goto("/history");
  await expect(page.getByTestId("history-list")).toContainText("600kg", { timeout: 20_000 });
}

test("올라가지 않은 기록이 있으면 다른 계정으로 로그인해도 지우지 않는다", async ({ page }) => {
  test.setTimeout(180_000);
  const A = freshEmail("guard-a");
  const B = freshEmail("guard-b");

  await 준비(page);
  await 가입(page, A);
  // 서버에 못 닿게 막고 운동한다 — 기록은 기기에만 남는다.
  await page.route(SYNC_ROUTE, (r) => r.abort());
  await 운동하고_마치기(page);

  await page.goto("/account");
  await page.getByTestId("btn-logout").click();
  await page.unroute(SYNC_ROUTE);
  await 가입(page, B);

  // 지우지 않고 멈춘다 — 사람에게 고르게 한다.
  await expect(page.getByTestId("account-guard")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-guard-logout").click();
  await 기록에_있다(page);

  // 원래 계정으로 돌아가면 그 계정으로 올라간다.
  await 로그인(page, A);
  await expect(page.getByTestId("account-guard")).toHaveCount(0);
  await page.getByTestId("btn-sync-now").click();
  await expect(page.getByTestId("sync-status")).toHaveText("동기 완료", { timeout: 30_000 });
  await expect(page.getByTestId("sync-pending")).toHaveText("모든 기록이 서버에 백업돼 있어요", {
    timeout: 20_000,
  });
});

test("백업이 계속 실패하면 화면 위에 경고가 뜬다", async ({ page }) => {
  test.setTimeout(150_000);
  await 준비(page);
  await 가입(page, freshEmail("stalled"));
  await page.route(SYNC_ROUTE, (r) => r.abort());
  await 운동하고_마치기(page);

  await page.goto("/account");
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("btn-sync-now").click();
    await expect(page.getByTestId("sync-status")).not.toHaveText("동기 중…", { timeout: 20_000 });
  }
  await expect(page.getByTestId("sync-pending")).toContainText("서버에 아직 안 올라간 기록");

  await page.goto("/");
  await expect(page.getByTestId("sync-stalled-banner")).toBeVisible({ timeout: 20_000 });

  // 다시 닿으면 경고가 걷힌다.
  await page.unroute(SYNC_ROUTE);
  await page.goto("/account");
  await page.getByTestId("btn-sync-now").click();
  await expect(page.getByTestId("sync-status")).toHaveText("동기 완료", { timeout: 30_000 });
  await page.goto("/");
  await expect(page.getByTestId("sync-stalled-banner")).toHaveCount(0);
});

test("백업 파일로 꺼내 다른 기기에서 되살린다", async ({ page, browser }) => {
  test.setTimeout(180_000);
  // 로그인하지 않은 기기 — 기록은 이 기기에만 있다.
  await 준비(page);
  await 운동하고_마치기(page);

  await page.goto("/account");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("btn-backup-export").click(),
  ]);
  const file = await download.path();
  expect(file).toBeTruthy();

  // 저장소가 완전히 따로인 새 기기.
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await 준비(other);
  await other.goto("/account");
  await other.getByTestId("backup-file-input").setInputFiles(file as string);
  await expect(other.getByTestId("backup-status")).toContainText("가져왔어요", { timeout: 30_000 });
  await 기록에_있다(other);

  // 두 번 가져와도 늘지 않는다(이미 같은 기록이다).
  await other.goto("/account");
  await other.getByTestId("backup-file-input").setInputFiles(file as string);
  await expect(other.getByTestId("backup-status")).toContainText("가져올 새 기록이 없어요", {
    timeout: 30_000,
  });
  await ctx.close();
});

test("주간 목표가 계정을 따라 다른 기기로 간다", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const 메일 = freshEmail("prefs");
  await 준비(page);
  await 가입(page, 메일);

  await page.goto("/calendar");
  const goal = page.getByTestId("weekly-goal");
  const before = await goal.innerText();
  await page.getByTestId("goal-row").click();
  await page.getByRole("button", { name: "목표 늘리기" }).click();
  await expect(goal).not.toHaveText(before);
  const after = await goal.innerText();

  await page.goto("/account");
  await page.getByTestId("btn-sync-now").click();
  await expect(page.getByTestId("sync-status")).toHaveText("동기 완료", { timeout: 30_000 });

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await 준비(other);
  await 로그인(other, 메일);
  await expect(other.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  await other.getByTestId("btn-sync-now").click();
  await expect(other.getByTestId("sync-status")).toHaveText("동기 완료", { timeout: 30_000 });
  await other.goto("/calendar");
  await expect(other.getByTestId("weekly-goal")).toHaveText(after, { timeout: 20_000 });
  await ctx.close();
});
