// 화면 지도 「길이 이상한 곳」 정리(2026-11-09) e2e
//
// 확인하는 것:
//   · 내 종목 줄 → 고치기 화면(서버 상세 /exercise/<id> 는 내 종목을 몰라 404 — 실측)
//   · 저장함·약관 ← 는 들어온 곳으로, 처음 연 화면이면 정해 둔 곳으로 · 저장함은 프로필 탭
//   · 비로그인 피드 버튼 글자 · 비로그인 /explore 안내 · /verify-email 제목 · 한국어 404
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

function freshEmail(tag: string): string {
  return `e2e-path-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function 가입(page: Page, email: string, name: string) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill(name);
  await page.getByTestId("age-confirm").check();
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

test("내 종목 줄을 누르면 고치기 화면이 열린다(서버 상세는 404라서)", async ({ page }) => {
  const 이름 = `내종목${Date.now().toString(36)}`;
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });
  await page.getByTestId("btn-new-exercise").click();
  await page.getByTestId("form-name-ko").fill(이름);
  await page.getByTestId("form-save").click();
  await expect(page).toHaveURL(/\/exercises$/, { timeout: 20_000 });
  await page.getByTestId("search-input").fill(이름);
  const row = page.locator('a[data-testid^="exercise-"]', { hasText: 이름 }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row).toHaveAttribute("href", /^\/exercises\/[^/]+\/edit$/);
  await row.click();
  await expect(page).toHaveURL(/\/exercises\/[^/]+\/edit$/, { timeout: 20_000 });
  await expect(page.getByTestId("not-found")).toHaveCount(0);
  await expect(page.getByTestId("form-name-ko")).toHaveValue(이름, { timeout: 20_000 });
});

test("저장함 — 프로필 탭이 켜지고 ← 는 프로필로(들어온 곳 · 처음 연 화면 모두)", async ({
  page,
  browser,
}) => {
  await 가입(page, freshEmail("bm"), "저장함사람");
  await page.goto("/profile");
  await page.getByTestId("btn-bookmarks").click();
  await expect(page).toHaveURL(/\/bookmarks$/);
  await expect(page.getByTestId("nav-profile")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("nav-feed")).not.toHaveAttribute("aria-current", "page");
  await page.getByTestId("bookmark-list-back").click();
  await expect(page).toHaveURL(/\/profile$/);

  // 따로 연 브라우저에서 바로 연 저장함 — 앱 안 이전 화면이 없으니 정해 둔 프로필로
  // (같은 브라우저의 새 탭은 「다른 탭 사용 중」 보호가 걸려 이 길을 볼 수 없다)
  const ctx = await browser.newContext();
  const fresh = await ctx.newPage();
  await fresh.goto("/bookmarks");
  await fresh.getByTestId("bookmark-list-back").click();
  await expect(fresh).toHaveURL(/\/profile$/);

  // 첫 칸으로 되돌아온 뒤에도 ← 는 먹통이 아니다(REV 화면 이동 검토 중간) — 새 탭 저장함 → 피드 탭 → 브라우저 뒤로 → ←
  await ctx.close();
  const ctx2 = await browser.newContext();
  const again = await ctx2.newPage();
  await again.goto("/bookmarks");
  await again.getByTestId("nav-feed").click();
  await expect(again).toHaveURL(/\/feed/);
  await again.goBack();
  await expect(again).toHaveURL(/\/bookmarks$/);
  await again.getByTestId("bookmark-list-back").click();
  await expect(again).toHaveURL(/\/profile$/);
  await ctx2.close();
});

test("약관 ← 는 연 곳(가입 화면)으로 돌아간다 — 가입 모드 그대로", async ({ page }) => {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page
    .getByTestId("signup-legal")
    .getByRole("link", { name: /이용약관|약관/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/terms$/);
  await page.getByTestId("legal-back").click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByTestId("auth-name-input")).toBeVisible();
});

test("비로그인 — 피드 버튼은 「로그인 / 가입」 · /explore 는 로그인 안내", async ({ page }) => {
  await page.goto("/feed");
  await expect(page.getByTestId("feed-go-profile")).toHaveText(/로그인 \/ 가입/, { timeout: 20_000 });
  await page.goto("/explore");
  await expect(page.getByTestId("explore-login")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("explore-login").click();
  await expect(page).toHaveURL(/\/account/);
});

test("/verify-email — 잘못된 링크면 제목이 「확인하지 못했어요」", async ({ page }) => {
  await page.goto("/verify-email?token=nope");
  await expect(page.getByTestId("verify-bad")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("body")).toContainText("이메일을 확인하지 못했어요");
  await expect(page.locator("body")).not.toContainText("확인된 이메일");
});

test("없는 주소 — 404 상태 + 한국어 안내 + 운동 홈 버튼", async ({ page }) => {
  const res = await page.goto("/no-such-page-xyz");
  expect(res?.status()).toBe(404);
  await expect(page.getByTestId("not-found")).toContainText("없는 페이지예요");
  await page.getByTestId("not-found-home").click();
  await expect(page).toHaveURL(/\/$/);
});

async function 글쓰기(page: Page, 글: string, vis?: "followers") {
  await page.goto("/feed?tab=following");
  await page.getByTestId("feed-compose").click();
  await page.getByTestId("feed-caption").fill(글);
  if (vis) await page.getByTestId(`visibility-${vis}`).click();
  await page.getByTestId("feed-post").click();
  await expect(page.getByTestId("feed-list")).toContainText(글, { timeout: 20_000 });
}

test("글 링크 공유 — 복사한 링크는 글 보기(글 카드만 · 💬 는 시트)로 열린다 · 비로그인은 로그인 뒤 그 글로", async ({
  page,
  context,
  browser,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    // 데스크톱 크롬의 공유창 대신 복사 경로를 본다
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  });
  await 가입(page, freshEmail("share"), "공유사람");
  const 글 = `공유 실험 ${Date.now()}`;
  await 글쓰기(page, 글);
  const card = page.locator('[data-testid="feed-list"] > *', { hasText: 글 }).first();
  await card.getByTestId("post-share").click();
  await expect(page.locator("body")).toContainText("링크를 복사했어요");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const origin = new URL(page.url()).origin;
  expect(copied.startsWith(`${origin}/feed/`)).toBe(true);

  await page.goto(copied);
  await expect(page.getByTestId("post-view")).toContainText(글, { timeout: 20_000 });
  // 글 보기에는 댓글 목록이 없다 — 💬 를 누르면 시트가 뜬다
  await expect(page.getByTestId("comments-sheet")).toHaveCount(0);
  await page.getByTestId("post-view").getByTestId("post-comments").click();
  await expect(page.getByTestId("comments-sheet")).toBeVisible();
  await expect(page.getByTestId("comments-sheet")).not.toContainText(글); // 시트에 본문을 싣지 않는다

  // 받은 사람이 로그인하지 않았으면 — 실패 화면 대신 로그인 안내 · 로그인하면 그 글로 돌아온다
  const ctx = await browser.newContext();
  const guest = await ctx.newPage();
  await guest.goto(copied);
  await expect(guest.getByTestId("post-login")).toBeVisible({ timeout: 20_000 });
  await guest.getByTestId("post-login").click();
  await expect(guest).toHaveURL(/\/account\?next=%2Ffeed%2F/);
  await guest.getByTestId("mode-signup").click();
  await guest.getByTestId("auth-email-input").fill(freshEmail("guest"));
  await guest.getByTestId("auth-password-input").fill("hunter22!");
  await guest.getByTestId("auth-name-input").fill("받은사람");
  await guest.getByTestId("age-confirm").check();
  await guest.getByTestId("btn-auth-submit").click();
  await expect(guest).toHaveURL(new RegExp(`${new URL(copied).pathname}$`), { timeout: 20_000 });
  await expect(guest.getByTestId("post-view")).toContainText(글, { timeout: 20_000 });
  await ctx.close();
});

test("팔로워 전용 글 — 공유 버튼 없음 · 남이 링크로 열면 「볼 수 없는 글」", async ({ page, browser }) => {
  await 가입(page, freshEmail("fol"), "팔로워글사람");
  const 글 = `팔로워 전용 ${Date.now()}`;
  await 글쓰기(page, 글, "followers");
  const card = page.locator('[data-testid="feed-list"] > *', { hasText: 글 }).first();
  await expect(card.getByTestId("post-share")).toHaveCount(0);
  // [원본] post-comments 의 href — 지금은 시트를 여는 단추라 글 번호만 읽는다
  const href = `/feed/${await card.getByTestId("post-comments").getAttribute("data-post-id")}`;
  // 본인은 글 보기로 연다
  await page.goto(href);
  await expect(page.getByTestId("post-view")).toContainText(글, { timeout: 20_000 });

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await 가입(other, freshEmail("stranger"), "남");
  await other.goto(href);
  await expect(other.getByTestId("post-gone")).toBeVisible({ timeout: 20_000 });
  await expect(other.locator("body")).not.toContainText(글);
  await ctx.close();
});

test("댓글은 바닥 시트 — 피드에서 열고 달면 카드 숫자가 오르고, 닫으면 피드 그 자리 · 뒤로 = 시트만 닫기 · ?comments=1 은 바로 연다", async ({
  page,
}) => {
  await 가입(page, freshEmail("sheet"), "시트사람");
  const 글 = `시트 실험 ${Date.now()}`;
  await 글쓰기(page, 글);
  const card = page.locator('[data-testid="feed-list"] > *', { hasText: 글 }).first();
  const url0 = page.url();
  await card.getByTestId("post-comments").click();
  const sheet = page.getByTestId("comments-sheet");
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(url0); // 화면을 옮기지 않는다
  await expect(sheet).not.toContainText(글);
  await sheet.getByTestId("comment-input").fill("시트 첫 댓글");
  await sheet.getByTestId("comment-post").click();
  await expect(sheet.getByTestId("comments-list")).toContainText("시트 첫 댓글", { timeout: 20_000 });
  await expect(card.getByTestId("post-comments")).toContainText("1");

  // 기기·브라우저 뒤로 = 시트만 닫는다(피드 그대로)
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(url0);
  await expect(card).toBeVisible();

  // 닫기 단추로도 닫힌다
  await card.getByTestId("post-comments").click();
  await expect(sheet.getByTestId("comments-list")).toContainText("시트 첫 댓글", { timeout: 20_000 });
  await sheet.getByTestId("comments-sheet-close").click();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(url0);

  // 댓글 알림이 여는 주소 — 글 보기 + 시트 바로 · 주소의 표식은 지운다
  const id = await card.getByTestId("post-comments").getAttribute("data-post-id");
  await page.goto(`/feed/${id}?comments=1`);
  await expect(page.getByTestId("comments-sheet")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("comments-list")).toContainText("시트 첫 댓글", { timeout: 20_000 });
  await expect(page).toHaveURL(new RegExp(`/feed/${id}$`));
  await page.getByTestId("comments-sheet-close").click();
  await expect(page.getByTestId("post-view")).toContainText(글);
  await expect(page.getByTestId("post-view").getByTestId("post-comments")).toContainText("1");
});
