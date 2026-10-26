// 오프라인 셸 e2e — 서비스워커가 화면을 기기에 보관해, 끊긴 상태에서도 앱이 열리고 운동이 기록되는가
//
// 서비스워커는 **운영 빌드에서만** 등록된다(개발 서버에 붙으면 HMR과 엉킨다). 그래서 이 파일은
// 등록이 안 되는 대상(dev)에서는 건너뛴다. 운영 빌드에 대고 돌린다:
//   BASE=http://127.0.0.1:3100 bunx playwright test -c frontend/playwright.config.ts offline   (make start 뒤)
//   BASE=https://liftgram.tarae.org …                                                          (배포 뒤 — 서버에 쓰지 않는다)
//
// 로그인하지 않고 돈다. 기록은 기기 DB에만 남고 서버로 가지 않는다 — 운영에 대고 돌려도 안전하다.
import { expect, test, type Page } from "@playwright/test";

/** 워커가 이 페이지를 **제어할 때까지** 기다린다. 못 하면(dev) 건너뛴다. */
async function 워커_제어(page: Page) {
  await page.goto("/");
  const ok = await page
    .waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 })
    .then(() => true)
    .catch(async () => {
      // 첫 방문은 설치만 하고 제어는 다음 로드부터일 수 있다 — 한 번 다시 연다.
      await page.reload();
      return page
        .waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
    });
  test.skip(!ok, "서비스워커가 등록되지 않는 대상(개발 서버) — 운영 빌드에 대고 돌린다");
}

test("끊긴 상태에서도 주요 탭이 열린다", async ({ page, context }) => {
  await 워커_제어(page);
  await context.setOffline(true);

  // 설치 때 미리 받은 셸들 — 한 번도 열지 않은 탭도 열려야 한다.
  for (const path of ["/workout", "/history", "/calendar", "/stats"]) {
    await page.goto(path);
    await expect(page.getByTestId("offline-page")).toHaveCount(0);
    await expect(page.locator("nav")).toBeVisible();
  }
});

test("기기에 없는 화면은 오프라인 안내로 대신한다", async ({ page, context }) => {
  await 워커_제어(page);
  await context.setOffline(true);

  await page.goto("/feed/never-seen-post");
  await expect(page.getByTestId("offline-page")).toBeVisible();
  await page.getByTestId("offline-home").click();
  await expect(page.getByTestId("offline-page")).toHaveCount(0);
});

test("끊긴 상태에서 운동을 시작하고 세트를 기록한다", async ({ page, context }) => {
  await 워커_제어(page);
  // 카탈로그는 첫 방문 때 기기 DB로 내려온다 — 그것까지는 온라인에서 끝낸다.
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });

  await context.setOffline(true);
  await page.goto("/workout");
  await expect(page.getByTestId("btn-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("벤치");
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("workout-exercises").locator("> div")).toHaveCount(1);

  const row = page.getByTestId("set-list").locator("> div").nth(0);
  await row.getByTestId("set-weight").fill("60");
  await row.getByTestId("set-reps").fill("8");
  await row.getByTestId("set-reps").blur();

  // 새로고침해도(=앱을 다시 열어도) 진행 중인 세션이 남아 있다 — 셸은 워커가, 기록은 기기 DB가 쥔다.
  await page.reload();
  await expect(page.getByTestId("workout-exercises").locator("> div")).toHaveCount(1, { timeout: 20_000 });
});
