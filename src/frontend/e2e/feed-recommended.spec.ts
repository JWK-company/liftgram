// 추천 탭·공개 범위·14세 확인(SPEC-030). 시행일 전이면 탭이 잠겨 있어 앱 시계를 시행 뒤로 맞춘다.
// 서버는 시행일 전 글도 후보가 되게 FEED_RECOMMEND_SINCE=2026-11-01T00:00:00+09:00 으로 띄운 뒤 돌린다 —
// 기본값(시행일)으로 띄우면 시행일 전에는 추천 시험이 실패한다.
import { expect, test, type Browser, type Page } from "@playwright/test";

const AFTER_START = new Date("2026-11-13T12:00:00+09:00");
const uid = () => `${Date.now()}${Math.floor(Math.random() * 10000)}`;

async function 가입(browser: Browser, 이름: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.clock.setFixedTime(AFTER_START);
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(`rec-${uid()}@example.com`);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill(이름);
  await page.getByTestId("age-confirm").check();
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  return page;
}

async function 글쓰기(page: Page, 내용: string, 범위?: "visibility-followers" | "visibility-private") {
  await page.goto("/feed");
  await page.getByTestId("feed-compose").click();
  await page.getByTestId("feed-caption").fill(내용);
  if (범위) await page.getByTestId(범위).click();
  await page.getByTestId("feed-post").click();
  await expect(page.getByTestId("feed-list")).toContainText(내용, { timeout: 20_000 });
}

test("14세 확인 없이는 가입되지 않고 서버도 거절한다", async ({ page }) => {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(`rec-${uid()}@example.com`);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill("어린이");
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-error")).toContainText("만 14세");
  await expect(page.getByTestId("auth-email")).toHaveCount(0);

  const status = await page.evaluate(async (email) => {
    const res = await fetch("/api/auth.v1.AuthService/SignUp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "hunter22!", displayName: "우회" }),
    });
    return res.status;
  }, `rec-${uid()}@example.com`);
  expect(status).toBe(400);
});

test("추천에 공개 글만 나오고, 팔로우하면 팔로잉에 보인다", async ({ browser }) => {
  const 표식 = uid();
  const 작성자 = await 가입(browser, `작성자${표식}`);
  await 글쓰기(작성자, `공개글 ${표식}`);
  await 글쓰기(작성자, `팔로워글 ${표식}`, "visibility-followers");
  await 글쓰기(작성자, `비밀글 ${표식}`, "visibility-private");

  const 독자 = await 가입(browser, `독자${표식}`);
  await 독자.goto("/feed");
  await expect(독자.getByTestId("feed-discover")).toHaveCount(0);
  // 추천이 앞 탭이고 처음 열면 추천이 보인다(사용자 지시 2026-11-06)
  await expect(독자.getByTestId("feed-tabs").getByRole("tab").first()).toContainText("추천");
  await expect(독자.getByTestId("feed-recommended-list")).toBeVisible({ timeout: 20_000 });
  const 목록 = 독자.getByTestId("feed-recommended-list");
  await expect(목록).toContainText(`공개글 ${표식}`, { timeout: 20_000 });
  await expect(목록).not.toContainText(`팔로워글 ${표식}`);
  await expect(목록).not.toContainText(`비밀글 ${표식}`);

  // 새로고침해도 보던 탭이 남고, 서버 HTML 과 어긋나지 않는다
  const 화면오류: string[] = [];
  독자.on("pageerror", (e) => 화면오류.push(e.message));
  독자.on("console", (m) => {
    if (m.type() === "error" && /hydrat/i.test(m.text())) 화면오류.push(m.text());
  });
  await 독자.reload();
  await expect(독자.getByTestId("feed-recommended-list")).toContainText(`공개글 ${표식}`, {
    timeout: 20_000,
  });

  expect(화면오류).toEqual([]);

  const 버튼 = 독자
    .getByTestId("feed-recommended-list")
    .getByTestId("post-card")
    .filter({ hasText: `공개글 ${표식}` })
    .getByTestId("post-follow");
  await expect(버튼).toHaveText("팔로우");
  await 버튼.click();
  await expect(버튼).toHaveText("팔로잉", { timeout: 20_000 });

  await 독자.getByTestId("feed-following").click();
  await expect(독자.getByTestId("feed-list")).toContainText(`공개글 ${표식}`, { timeout: 20_000 });
  await expect(독자.getByTestId("feed-list")).toContainText(`팔로워글 ${표식}`);
  await expect(독자.getByTestId("feed-list")).not.toContainText(`비밀글 ${표식}`);

  // 팔로잉에서 누른 좋아요가 추천에도 보인다
  const 팔로잉카드 = 독자
    .getByTestId("feed-list")
    .getByTestId("post-card")
    .filter({ hasText: `공개글 ${표식}` });
  await 팔로잉카드.getByTestId("post-like").click();
  await expect(팔로잉카드.getByTestId("post-like")).toHaveAttribute("aria-pressed", "true");
  await 독자.getByTestId("feed-recommended").click();
  await expect(
    독자
      .getByTestId("feed-recommended-list")
      .getByTestId("post-card")
      .filter({ hasText: `공개글 ${표식}` })
      .getByTestId("post-like"),
  ).toHaveAttribute("aria-pressed", "true");
});

test("글쓰기 뒤 팔로잉 맨 위로 돌아오고, 내 글에는 공개 범위가 보인다", async ({ browser }) => {
  const 표식 = uid();
  const 작성자 = await 가입(browser, `범위${표식}`);
  await 글쓰기(작성자, `나만 ${표식}`, "visibility-private");
  await expect(작성자.getByTestId("feed-list")).toContainText("나만 보기");
  expect(await 작성자.evaluate(() => window.scrollY)).toBe(0);
});

test("검토 중인 내 글에는 안내가 붙는다", async ({ browser }) => {
  const 표식 = uid();
  const 작성자 = await 가입(browser, `검토${표식}`);
  await 글쓰기(작성자, `검토글 ${표식}`);
  await 작성자.route("**/feed.v1.FeedService/ListFeed", async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    for (const p of body.posts ?? []) p.underReview = true;
    await route.fulfill({ response: res, json: body });
  });
  await 작성자.reload();
  await expect(작성자.getByTestId("post-under-review").first()).toContainText("검토 중", {
    timeout: 20_000,
  });
});

test("내 글을 추천에서 끄면 다른 사람에게 나오지 않는다", async ({ browser }) => {
  const 표식 = uid();
  const 작성자 = await 가입(browser, `끄는이${표식}`);
  await 글쓰기(작성자, `끈 글 ${표식}`);
  await 작성자.goto("/profile");
  const 스위치 = 작성자.getByTestId("switch-recommend-opt");
  await expect(스위치).toHaveAttribute("aria-checked", "true", { timeout: 20_000 });
  await 스위치.click();
  await expect(스위치).toHaveAttribute("aria-checked", "false");
  await expect
    .poll(
      async () => {
        await 작성자.reload();
        return 작성자.getByTestId("switch-recommend-opt").getAttribute("aria-checked");
      },
      { timeout: 20_000 },
    )
    .toBe("false");

  // 대조 글 — 목록이 다 온 뒤에 「없음」을 확인하려고 쓴다
  const 대조 = await 가입(browser, `대조${표식}`);
  await 글쓰기(대조, `대조 글 ${표식}`);

  const 독자 = await 가입(browser, `독자${표식}`);
  await 독자.goto("/feed?tab=recommended");
  await expect(독자.getByTestId("feed-recommended-list")).toContainText(`대조 글 ${표식}`, {
    timeout: 20_000,
  });
  await expect(독자.getByTestId("feed-recommended-list")).not.toContainText(`끈 글 ${표식}`);
});

test("시행일 전에는 발견 탭이 그대로다", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-04T12:00:00+09:00"));
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(`rec-${uid()}@example.com`);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill("시행전");
  await page.getByTestId("age-confirm").check();
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  await page.goto("/feed");
  await expect(page.getByTestId("feed-discover")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("feed-recommended")).toHaveCount(0);
});

test("달력 자랑하기는 공개 범위를 고른 뒤 올라간다", async ({ browser }) => {
  test.setTimeout(120_000);
  const 표식 = uid();
  const page = await 가입(browser, `자랑${표식}`);
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  await page.getByTestId("set-weight").first().fill("60");
  await page.getByTestId("set-reps").first().fill("10");
  await page.getByTestId("set-done").first().click();
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 20_000 });

  // 공유 시트를 닫았다 열어도 고른 범위가 남는다
  for (const id of ["btn-finish-dont-save", "btn-finish-today"]) {
    const b = page.getByTestId(id);
    if (await b.isVisible()) await b.click();
  }
  await page.getByTestId("btn-summary-share").click();
  await page.getByTestId("visibility-private").click();
  await page
    .getByTestId("share-sheet")
    .locator("xpath=..")
    .locator('button[aria-label="닫기"]')
    .first()
    .click();
  await expect(page.getByTestId("share-sheet")).toHaveCount(0);
  await page.getByTestId("btn-summary-share").click();
  await expect(page.getByTestId("visibility-private").locator("input")).toBeChecked();
  await page
    .getByTestId("share-sheet")
    .locator("xpath=..")
    .locator('button[aria-label="닫기"]')
    .first()
    .click();
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

  await page.goto("/calendar");
  await page.getByTestId("records-more").click({ timeout: 20_000 });
  await page.getByTestId("btn-brag-month").click();
  await expect(page.getByTestId("brag-sheet")).toBeVisible();
  await page.getByTestId("visibility-private").click();
  await page.getByTestId("brag-post").click();
  await expect(page.getByTestId("brag-sheet")).toHaveCount(0, { timeout: 20_000 });

  await page.goto("/feed?tab=following");
  await expect(page.getByTestId("post-card").first()).toContainText("나만 보기", { timeout: 20_000 });
});

test("추천이 앞 탭 · 스토리는 두 탭 모두 · 고른 탭은 앱 안에서 돌아와도 유지된다", async ({ browser }) => {
  const page = await 가입(browser, `탭${uid()}`);
  await page.goto("/feed");
  const tabs = page.getByTestId("feed-tabs").getByRole("tab");
  await expect(tabs.first()).toContainText("추천");
  await expect(tabs.nth(1)).toHaveText("팔로잉");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("story-tray")).toBeVisible();

  await tabs.nth(1).click();
  await expect(page).toHaveURL(/tab=following/);
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("story-tray")).toBeVisible();

  // 댓글·프로필의 ‹ 링크처럼 주소가 /feed 뿐이어도 팔로잉이 유지된다
  await page.goto("/feed");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await tabs.first().click();
  await page.goto("/feed");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  // 주소가 정하면 주소가 이긴다
  await page.goto("/feed?tab=following");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
});

test("짧은 목록에서는 + 버튼이 사라지지 않고, 내려서 마지막 글을 비킬 수 있다", async ({ browser }) => {
  const page = await 가입(browser, `짧은${uid()}`);
  await page.setViewportSize({ width: 412, height: 915 });
  await 글쓰기(page, `짧은 글 ${uid()}`);
  await page.goto("/feed?tab=following");
  const card = page.getByTestId("post-card").last();
  await expect(card).toBeVisible({ timeout: 20_000 });
  const box = await card.boundingBox();
  // 카드 끝이 + 버튼 자리에 오도록 화면 높이를 맞춘다(스크롤로 벗어날 수 없는 상태)
  await page.setViewportSize({ width: 412, height: Math.round((box?.y ?? 0) + (box?.height ?? 0) + 100) });
  const fab = page.getByTestId("feed-compose");
  await expect(page.getByTestId("feed-compose-room")).toHaveCount(1);
  await expect(fab).toHaveCSS("opacity", "1");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const [f, c] = [await fab.boundingBox(), await card.boundingBox()];
  expect((c?.y ?? 0) + (c?.height ?? 0)).toBeLessThanOrEqual(f?.y ?? 0);
  await fab.click();
  await expect(page.getByTestId("feed-composer")).toBeVisible();
});
