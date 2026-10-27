// @plm SRS-066  하단 고정 요소가 화면 안에 있는가 — 좌표로 본다 (피드백 #45 · #43)
//
// 앱 셸의 main 이 overflow-x:hidden 이면 overflow-y 가 auto 가 되어 main 자체가 스크롤 상자가 된다.
// main 은 실제로 스크롤하지 않으므로 그 안의 `sticky bottom-*` 는 **화면이 아니라 main 상자 끝**에 붙는다
// → 종목이 많으면 휴식 막대가 화면 밖(맨 끝)으로 밀리고, 짧은 화면에서는 아래가 잘렸다(2026-10-27 운영 재현).
//
// 그래서 「보이는가」가 아니라 **경계 상자가 화면 높이 안에 들어오는가**를 스크롤 위·아래에서 잰다.
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
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

async function 첫_세트_체크(page: Page) {
  const row = page
    .getByTestId("workout-exercises")
    .locator("> div")
    .first()
    .getByTestId("set-list")
    .locator("> div")
    .first();
  await row.getByTestId("set-weight").fill("40");
  await row.getByTestId("set-reps").fill("10");
  await row.getByTestId("set-reps").blur();
  await row.getByTestId("set-done").click();
  await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
}

/** 요소의 경계 상자가 화면(뷰포트) 세로 범위 안에 온전히 들어오는가. */
async function 화면_안(page: Page, testId: string) {
  const vh = page.viewportSize()?.height ?? 0;
  const box = await page.getByTestId(testId).boundingBox();
  expect(box, `${testId} 가 그려지지 않았다`).not.toBeNull();
  if (!box) return;
  expect(box.y, `${testId} 위가 화면 위로 넘친다`).toBeGreaterThanOrEqual(0);
  expect(
    box.y + box.height,
    `${testId} 아래가 화면(${vh}) 밖이다 — bottom ${box.y + box.height}`,
  ).toBeLessThanOrEqual(vh + 0.5);
}

async function 맨위로(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
}
async function 맨아래로(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(150);
}

const 네종목 = ["바벨 벤치프레스", "덤벨 플라이", "바벨 스쿼트", "데드리프트"];

test.describe("390×844 · 종목 4개", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("휴식 막대는 스크롤 위·아래 어디서나 화면 안에 있다", async ({ page }) => {
    test.setTimeout(180_000);
    await 카탈로그_준비(page);
    await 빠른_운동(page, 네종목);
    await 첫_세트_체크(page);
    await expect(page.getByTestId("rest-bar")).toBeVisible();
    await 맨위로(page);
    await 화면_안(page, "rest-bar");
    await 맨아래로(page);
    await 화면_안(page, "rest-bar");
  });
});

test.describe("360×560 · 짧은 화면", () => {
  test.use({ viewport: { width: 360, height: 560 } });

  test("휴식 막대 아래가 잘리지 않는다", async ({ page }) => {
    test.setTimeout(180_000);
    await 카탈로그_준비(page);
    await 빠른_운동(page, ["바벨 벤치프레스"]);
    await 첫_세트_체크(page);
    await 맨위로(page);
    await 화면_안(page, "rest-bar");
    await 맨아래로(page);
    await 화면_안(page, "rest-bar");
  });

  test("루틴 편집 하단 버튼(완료)은 종목이 많아도 화면 안에 있다 — #43", async ({ page }) => {
    test.setTimeout(180_000);
    await 카탈로그_준비(page);
    // 종목은 넓은 화면에서 넣는다(짧은 화면에서는 「종목 추가」가 하단 막대 뒤에 깔린다) → 짧은 화면으로 줄여 잰다.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByTestId("btn-new-routine").click();
    await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("routine-name").fill(`하단 ${Date.now().toString(36)}`);
    await page.getByTestId("routine-name").blur();
    const rows = page.getByTestId("routine-exercises").locator("> div");
    for (const [i, 종목] of 네종목.entries()) {
      // 「종목 추가」는 목록 맨 끝이라 스크롤해 오면 하단 탭바에 덮인다 — 키보드로 누른다(측정 대상이 아님).
      await page.getByTestId("btn-add-routine-exercise").focus();
      await page.keyboard.press("Enter");
      await page.getByTestId("picker-search").fill(종목);
      await page.getByTestId("picker-list").locator("button").first().click();
      await expect(rows).toHaveCount(i + 1, { timeout: 10_000 });
    }
    await page.setViewportSize({ width: 360, height: 560 });
    await 맨위로(page);
    await 화면_안(page, "btn-routine-done");
  });

  test("요약 화면 하단 「완료」 버튼은 화면 안에 있다", async ({ page }) => {
    test.setTimeout(180_000);
    await 카탈로그_준비(page);
    await 빠른_운동(page, 네종목);
    // 종목마다 한 세트씩 — 요약에 줄이 쌓여 화면보다 길어진다
    for (let i = 0; i < 네종목.length; i++) {
      const row = page
        .getByTestId("workout-exercises")
        .locator("> div")
        .nth(i)
        .getByTestId("set-list")
        .locator("> div")
        .first();
      await row.getByTestId("set-weight").fill("30");
      await row.getByTestId("set-reps").fill("10");
      await row.getByTestId("set-reps").blur();
      await row.getByTestId("set-done").click();
      await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
    }
    await page.getByTestId("btn-complete").click();
    await page.getByTestId("dialog-confirm").click();
    await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("btn-finish-dont-save").click();
    await expect(page.getByTestId("finish-name")).toHaveCount(0);
    await 맨위로(page);
    await 화면_안(page, "btn-summary-close");
  });
});

/** a 의 아래 끝이 b 의 위 끝보다 위에 있는가(겹치지 않는가). */
async function 위에(page: Page, a: string, b: string) {
  const ba = await page.getByTestId(a).boundingBox();
  const bb = await page.getByTestId(b).boundingBox();
  expect(ba && bb, `${a}/${b} 가 그려지지 않았다`).toBeTruthy();
  if (!ba || !bb) return;
  expect(ba.y + ba.height, `${a} 가 ${b} 밑에 깔린다`).toBeLessThanOrEqual(bb.y + 0.5);
}

test.describe("360×560 · 탭바가 있는 화면의 입력창", () => {
  test.use({ viewport: { width: 360, height: 560 } });

  test("댓글 입력창은 댓글이 많아도 화면 안·탭바와 운동 중 막대 위에 있다", async ({ page }) => {
    test.setTimeout(180_000);
    await 카탈로그_준비(page);
    // 운동 중 막대가 떠 있는 상태를 만든다(빠른 운동을 켜 두고 다른 탭으로 간다)
    await 빠른_운동(page, ["바벨 벤치프레스"]);
    await page.goto("/account");
    await page.getByTestId("mode-signup").click();
    await page
      .getByTestId("auth-email-input")
      .fill(`e2e-sticky-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`);
    await page.getByTestId("auth-password-input").fill("hunter22!");
    await page.getByTestId("auth-name-input").fill("하단점검");
    await page.getByTestId("btn-auth-submit").click();
    await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
    await page.goto("/feed");
    await page.getByTestId("feed-compose").click();
    await page.getByTestId("feed-caption").fill("하단 점검 글");
    await page.getByTestId("feed-post").click();
    await expect(page.getByTestId("feed-list")).toContainText("하단 점검 글", { timeout: 20_000 });
    await page.getByTestId("post-comments").first().click();
    await expect(page.getByTestId("comment-input")).toBeVisible({ timeout: 20_000 });
    for (let i = 0; i < 6; i++) {
      await page.getByTestId("comment-input").fill(`댓글 ${i} — 목록을 화면보다 길게 만든다`);
      await page.getByTestId("comment-post").click();
      await expect(page.getByTestId("comments-list")).toContainText(`댓글 ${i}`, { timeout: 20_000 });
    }
    await expect(page.getByTestId("global-workout-bar")).toBeVisible();
    await 맨위로(page);
    await 화면_안(page, "comment-input");
    await 위에(page, "comment-input", "global-workout-bar");
    await 위에(page, "global-workout-bar", "shell-nav");
  });
});

// QA M-2 — 넓은 화면(lg)에서는 진행 중 막대가 바닥에서 16px 떠 있다. 높이를 60px 로 박아 두면 하단 막대가 그 밑에 9px 깔렸다.
test.describe("1280×560 · 넓은 화면(세로 탭바)", () => {
  test.use({ viewport: { width: 1280, height: 560 } });

  test("루틴 편집 하단 막대가 진행 중 막대 밑에 깔리지 않는다", async ({ page }) => {
    test.setTimeout(180_000);
    await 카탈로그_준비(page);
    await 빠른_운동(page, ["바벨 벤치프레스"]); // 진행 중 막대를 띄운다
    await page.goto("/");
    await page.getByTestId("btn-new-routine").click();
    await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("routine-name").fill(`넓은 ${Date.now().toString(36)}`);
    await page.getByTestId("routine-name").blur();
    const rows = page.getByTestId("routine-exercises").locator("> div");
    for (const [i, 종목] of 네종목.entries()) {
      await page.getByTestId("btn-add-routine-exercise").focus();
      await page.keyboard.press("Enter");
      await page.getByTestId("picker-search").fill(종목);
      await page.getByTestId("picker-list").locator("button").first().click();
      await expect(rows).toHaveCount(i + 1, { timeout: 10_000 });
    }
    await 맨위로(page);
    await expect(page.getByTestId("global-workout-bar")).toBeVisible();
    // 버튼이 든 **sticky 상자**의 아래 끝이 진행 중 막대 위 끝보다 위에 있어야 한다
    const got = await page.evaluate(() => {
      let el = document.querySelector<HTMLElement>('[data-testid="btn-routine-done"]');
      while (el && getComputedStyle(el).position !== "sticky") el = el.parentElement;
      const bar = document.querySelector('[data-testid="global-workout-bar"]')?.getBoundingClientRect();
      return el && bar ? { stickyBottom: el.getBoundingClientRect().bottom, barTop: bar.top } : null;
    });
    expect(got, "sticky 하단·막대가 그려지지 않았다").toBeTruthy();
    if (!got) return;
    expect(got.stickyBottom, "루틴 편집 하단이 진행 중 막대 밑에 깔린다").toBeLessThanOrEqual(
      got.barTop + 0.5,
    );
  });
});
