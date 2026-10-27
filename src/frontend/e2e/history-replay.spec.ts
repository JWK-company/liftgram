// @plm SRS-064 SRS-065  기록 돌아보기·다시 하기 e2e (피드백 #52 · #59)
//
// 확인하는 것:
//   · 운동 총평 — 요약에서 적으면 기록 상세에 남고, 상세에서 고치면 캘린더 날짜에 두 줄로 보인다(나만 봄)
//   · 기록 상세에 수행 조합(플레이트·한쪽 입력)이 보이고, 상세를 열기 전 목록 카드는 그대로다
//   · 「이 운동 그대로 다시 시작」 — 요약·기록 상세에서 같은 종목·순서·세트 수로 새 운동이 시작된다
//   · 피드의 남의 운동 「바로 시작」 — 루틴을 만들지 않고 그 구성으로 바로 시작한다
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
}

function 블록(page: Page, i: number) {
  return page.getByTestId("workout-exercises").locator("> div").nth(i);
}

async function 빠른_운동(page: Page, 종목들: string[]) {
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  for (const 종목 of 종목들) {
    await page.getByTestId("btn-add-exercise").click();
    await page.getByTestId("picker-search").fill(종목);
    await page.getByTestId("picker-list").locator("button").first().click();
    await expect(page.getByTestId("exercise-picker")).toHaveCount(0);
  }
  await expect(page.getByTestId("workout-exercises").locator("> div")).toHaveCount(종목들.length);
}

/** i 번째 블록의 세트 n 개를 체크한다(없으면 세트를 더한다). */
async function 세트_하기(page: Page, i: number, n: number, kg = 40, reps = 10) {
  const rows = 블록(page, i).getByTestId("set-list").locator("> div");
  while ((await rows.count()) < n) {
    const before = await rows.count();
    await 블록(page, i).getByTestId("btn-add-set").click();
    await expect(rows).toHaveCount(before + 1);
  }
  for (let k = 0; k < n; k++) {
    const row = rows.nth(k);
    await row.getByTestId("set-weight").fill(String(kg));
    await row.getByTestId("set-reps").fill(String(reps));
    await row.getByTestId("set-reps").blur();
    await row.getByTestId("set-done").click();
    await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
  }
}

async function 완료(page: Page) {
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 15_000 });
  // 빠른 운동이면 「루틴으로 저장할까요?」가 먼저 뜬다(SRS-060) — 저장하지 않는다
  const skip = page.getByTestId("btn-finish-dont-save");
  if (await skip.isVisible()) await skip.click();
  await expect(page.getByTestId("finish-name")).toHaveCount(0);
}

async function 최근_기록_열기(page: Page) {
  await page.goto("/history");
  await page.getByTestId("history-list").locator("a").first().click();
  await expect(page.getByTestId("detail-exercises")).toBeVisible({ timeout: 20_000 });
}

test("총평 — 요약에서 적고, 기록 상세에서 고치고, 캘린더 날짜에서 본다", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await 빠른_운동(page, ["바벨 스쿼트"]);
  await 세트_하기(page, 0, 1, 60, 5);
  await 완료(page);

  await page.getByTestId("workout-note-input").fill("무릎 컨디션 좋음");
  await page.getByTestId("workout-note-input").blur();
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

  await 최근_기록_열기(page);
  await expect(page.getByTestId("workout-note-input")).toHaveValue("무릎 컨디션 좋음");
  await page.getByTestId("workout-note-input").fill("무릎 컨디션 좋음\n다음엔 5kg 올리기");
  await page.getByTestId("workout-note-input").blur();

  await page.goto("/calendar");
  await expect(page.getByTestId("calendar-workout-note").first()).toContainText("다음엔 5kg 올리기", {
    timeout: 20_000,
  });
});

test("기록 상세에 수행 조합 — 플레이트 · 한쪽 입력이 보인다", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await 빠른_운동(page, ["머신 체스트 프레스"]);
  await page.getByTestId("variant-trigger").first().click();
  await expect(page.getByTestId("variant-sheet")).toBeVisible();
  await page.getByTestId("slot-load-plate").click();
  await page.getByTestId("slot-plate-one-side-input").check();
  await page
    .getByTestId("variant-sheet")
    .locator("xpath=..")
    .locator('button[aria-label="닫기"]')
    .click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId("variant-sheet")).toHaveCount(0);
  await 세트_하기(page, 0, 1, 40, 10);
  await 완료(page);
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

  await 최근_기록_열기(page);
  await expect(page.getByTestId("detail-slot").first()).toContainText("플레이트");
  await expect(page.getByTestId("detail-set-oneside").first()).toContainText("×2");
});

test("그대로 다시 시작 — 요약·기록 상세에서 같은 종목·순서·세트 수로 시작한다", async ({ page }) => {
  test.setTimeout(240_000);
  await 카탈로그_준비(page);
  await 빠른_운동(page, ["바벨 벤치프레스", "덤벨 플라이"]);
  await 세트_하기(page, 0, 2, 60, 8);
  await 세트_하기(page, 1, 4, 14, 12);
  await 완료(page);

  // ① 요약에서 — 같은 화면에서 새 운동으로 넘어간다
  await page.getByTestId("btn-summary-replay").click();
  await expect(page.getByTestId("summary-volume")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("workout-exercises").locator("> div")).toHaveCount(2, { timeout: 15_000 });
  await expect(블록(page, 0).getByTestId("we-name")).toHaveText("바벨 벤치프레스");
  await expect(블록(page, 1).getByTestId("we-name")).toHaveText("덤벨 플라이");
  await expect(블록(page, 0).getByTestId("set-list").locator("> div")).toHaveCount(2);
  await expect(블록(page, 1).getByTestId("set-list").locator("> div")).toHaveCount(4);
  // 무게는 이전 기록(방금 한 것)으로 채워진다
  await expect(
    블록(page, 1).getByTestId("set-list").locator("> div").first().getByTestId("set-weight"),
  ).toHaveValue("14");

  // ② 진행 중인 운동이 있는데 기록 상세에서 다시 시작하면 묻는다 → 폐기하고 새로 시작
  await 최근_기록_열기(page);
  await page.getByTestId("btn-replay").click();
  await expect(page.getByTestId("active-exists")).toBeVisible();
  await page.getByTestId("active-exists").getByText("폐기하고 새로 시작").click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 15_000 });
  await expect(page.getByTestId("workout-exercises").locator("> div")).toHaveCount(2, { timeout: 15_000 });
  await expect(블록(page, 1).getByTestId("set-list").locator("> div")).toHaveCount(4);
});

test("피드의 남의 운동 「바로 시작」 — 루틴을 만들지 않고 그 구성으로 시작한다", async ({
  page: author,
  browser,
}) => {
  let page = author;
  test.setTimeout(300_000);
  const 이름 = `바로${Date.now().toString(36)}`;
  // ① 올리는 사람 — 운동을 마치고 오운완으로 올린다
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(`e2e-replay-a-${Date.now()}@example.com`);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill(이름);
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  await 카탈로그_준비(page);
  await 빠른_운동(page, ["바벨 데드리프트", "덤벨 컬"]);
  await 세트_하기(page, 0, 3, 100, 5);
  await 세트_하기(page, 1, 2, 12, 10);
  await 완료(page);
  await expect(page.getByTestId("share-workout")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-share-workout").click();
  await expect(page.getByTestId("btn-share-workout")).toBeDisabled({ timeout: 20_000 });
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

  // ② 보는 사람 — **다른 기기**(새 브라우저 컨텍스트)에서 가입해 팔로우한다.
  //    같은 기기에서 갈아타면 올라가지 않은 앞사람 기록 때문에 계정 보호가 동기를 멈춘다(데이터 안전 — 의도된 동작).
  const base = process.env.BASE ?? "http://127.0.0.1:3100";
  const other = await browser.newContext({
    baseURL: base,
    storageState: {
      cookies: [],
      origins: [{ origin: base, localStorage: [{ name: "onboarding_seen_v1", value: "yes" }] }],
    },
  });
  const viewer = await other.newPage();
  await viewer.goto("/account");
  await viewer.getByTestId("mode-signup").click();
  await viewer.getByTestId("auth-email-input").fill(`e2e-replay-b-${Date.now()}@example.com`);
  await viewer.getByTestId("auth-password-input").fill("hunter22!");
  await viewer.getByTestId("auth-name-input").fill("따라하는사람");
  await viewer.getByTestId("btn-auth-submit").click();
  await expect(viewer.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  await 카탈로그_준비(viewer);
  await viewer.goto("/feed");
  await viewer.getByTestId("feed-discover").click();
  await viewer.getByTestId("discover-query").fill(이름);
  await expect(viewer.getByTestId("discover-list")).toContainText(이름, { timeout: 20_000 });
  await viewer.getByTestId("discover-follow").first().click();
  await expect(viewer.getByTestId("discover-follow").first()).toHaveText("팔로잉", { timeout: 20_000 });
  page = viewer;

  await page.goto("/feed");
  await expect(page.getByTestId("post-workout").first()).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("post-start-now").first().click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });
  await expect(page.getByTestId("workout-exercises").locator("> div")).toHaveCount(2, { timeout: 15_000 });
  await expect(블록(page, 0).getByTestId("we-name")).toHaveText("바벨 데드리프트");
  await expect(블록(page, 0).getByTestId("set-list").locator("> div")).toHaveCount(3);
  await expect(블록(page, 1).getByTestId("set-list").locator("> div")).toHaveCount(2);
  // 루틴은 만들지 않는다
  await page.getByTestId("btn-close-session").click();
  await expect(page.getByTestId("routine-list")).toHaveCount(0);
  await other.close();
});

// QA M-4 — 슈퍼셋·워밍업이 그대로 · 「이어서 하기」는 진행 중 운동을 건드리지 않는다 · 워밍업만 한 운동엔 버튼이 없다(H-1)
test("다시 시작 — 슈퍼셋 묶음과 워밍업 세트가 그대로 · 이어서 하기는 진행 중 운동 유지", async ({ page }) => {
  test.setTimeout(240_000);
  await 카탈로그_준비(page);
  await 빠른_운동(page, ["바벨 벤치프레스", "바벨 로우"]);
  await 세트_하기(page, 0, 3, 60, 8);
  await 세트_하기(page, 1, 2, 50, 10);
  // 첫 종목 첫 세트를 워밍업으로
  const first = 블록(page, 0).getByTestId("set-list").locator("> div").first();
  await first.getByTestId("set-type").click();
  await page.getByTestId("set-type-sheet").getByText("워밍업 (W)").click();
  await expect(first.getByTestId("set-type")).toHaveText("W");
  // 두 종목을 슈퍼셋으로
  await 블록(page, 0).getByTestId("btn-we-menu").click();
  await page.getByTestId("btn-superset").click();
  await page.getByTestId("superset-option").first().click();
  await expect(page.getByTestId("btn-unlink-superset")).toBeVisible({ timeout: 10_000 });
  await 완료(page);

  await page.getByTestId("btn-summary-replay").click();
  await expect(page.getByTestId("summary-volume")).toHaveCount(0, { timeout: 15_000 });
  // 묶음이 그대로 — 한 컨테이너 안에 두 종목
  await expect(page.getByTestId("btn-unlink-superset")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("workout-exercises").locator("> div")).toHaveCount(1);
  const lists = page.getByTestId("workout-exercises").getByTestId("set-list");
  await expect(lists).toHaveCount(2);
  await expect(lists.nth(0).locator("> div")).toHaveCount(3); // 워밍업 1 + 워킹 2
  await expect(lists.nth(0).locator("> div").first().getByTestId("set-type")).toHaveText("W");
  await expect(lists.nth(1).locator("> div")).toHaveCount(2);

  // 진행 중인 운동이 있을 때 기록 상세에서 다시 시작 → 「이어서 하기」 → 지금 운동 그대로
  await 최근_기록_열기(page);
  await page.getByTestId("btn-replay").click();
  await expect(page.getByTestId("active-exists")).toBeVisible();
  await page.getByTestId("active-exists").getByText("이어서 하기").click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 15_000 });
  await expect(page.getByTestId("btn-unlink-superset")).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByTestId("workout-exercises").getByTestId("set-list").nth(0).locator("> div"),
  ).toHaveCount(3);
});

test("워밍업만 한 운동은 다시 시작 버튼이 없다 — 진행 중 운동을 폐기하고 아무것도 시작 못 하던 길(QA H-1)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await 빠른_운동(page, ["바벨 스쿼트"]);
  await 세트_하기(page, 0, 1, 40, 10);
  const row = 블록(page, 0).getByTestId("set-list").locator("> div").first();
  await row.getByTestId("set-type").click();
  await page.getByTestId("set-type-sheet").getByText("워밍업 (W)").click();
  await expect(row.getByTestId("set-type")).toHaveText("W");
  await 완료(page);
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await 최근_기록_열기(page);
  await expect(page.getByTestId("btn-replay")).toHaveCount(0);
});
