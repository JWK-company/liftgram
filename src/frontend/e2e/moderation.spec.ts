// 신고·모더레이션 e2e — 신고하고, 권한이 있어야 검토하고, 내리면 실제로 사라지는가
//
// 확인하는 것:
//   · 남의 글·댓글은 신고할 수 있고, 내 글에는 신고 버튼이 없다
//   · 같은 사람이 여러 번 신고해도 한 건이다(서버가 멱등)
//   · **권한이 없으면 큐를 볼 수 없다** — 이유를 그대로 보여 준다
//   · 차단 목록에서 차단을 풀 수 있다(푸는 곳은 여기뿐이다)
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

function freshEmail(tag: string): string {
  return `e2e-mod-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function 가입(page: Page, email: string, name: string) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill(name);
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

async function 프로필로(page: Page, 이름: string) {
  await page.goto("/discover");
  await page.getByTestId("discover-query").fill(이름);
  await expect(page.getByTestId("discover-list")).toContainText(이름, { timeout: 20_000 });
  await page.getByTestId("discover-user").first().click();
  await expect(page.getByTestId("profile-name")).toHaveText(이름, { timeout: 20_000 });
}

test("남의 글은 신고할 수 있고, 내 글에는 신고 버튼이 없다", async ({ page, context }) => {
  const 주인이름 = `주인${Date.now().toString(36)}`;
  await 가입(page, freshEmail("owner"), 주인이름);
  await page.goto("/feed");
  await page.getByTestId("feed-caption").fill("신고 실험용 글");
  await page.getByTestId("feed-post").click();
  await expect(page.getByTestId("feed-list")).toContainText("신고 실험용 글", { timeout: 20_000 });

  // 내 글에는 ⋯(내 글 메뉴)만 있고 신고 버튼은 없다.
  await expect(page.getByTestId("post-menu")).toHaveCount(1);
  await expect(page.getByTestId("post-report")).toHaveCount(0);

  // 다른 사람으로 갈아탄다.
  await context.clearCookies();
  await page.evaluate(() => localStorage.removeItem("liftgram.refreshToken"));
  await 가입(page, freshEmail("reporter"), "신고자");

  await 프로필로(page, 주인이름);
  await page.getByTestId("post-report").first().click();
  await expect(page.getByTestId("report-sheet")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("report-reason").first().click(); // 스팸
  await expect(page.getByTestId("report-sheet")).toHaveCount(0, { timeout: 20_000 });

  // 같은 글을 다시 신고해도 오류 없이 받아 준다(서버가 한 건으로 친다).
  await page.getByTestId("post-report").first().click();
  await page.getByTestId("report-reason").nth(1).click();
  await expect(page.getByTestId("report-sheet")).toHaveCount(0, { timeout: 20_000 });
});

test("댓글도 신고할 수 있다 — 내 댓글은 삭제, 남의 댓글은 신고", async ({ page, context }) => {
  const 주인이름 = `댓글주인${Date.now().toString(36)}`;
  await 가입(page, freshEmail("cowner"), 주인이름);
  await page.goto("/feed");
  await page.getByTestId("feed-caption").fill("댓글 신고 실험");
  await page.getByTestId("feed-post").click();
  await expect(page.getByTestId("feed-list")).toContainText("댓글 신고 실험", { timeout: 20_000 });
  await page.getByTestId("post-comments").first().click();
  await page.getByTestId("comment-input").fill("주인의 댓글");
  await page.getByTestId("comment-post").click();
  await expect(page.getByTestId("comments-list")).toContainText("주인의 댓글", { timeout: 20_000 });
  // 내 댓글에는 삭제만.
  await expect(page.getByTestId("comment-delete")).toHaveCount(1);
  await expect(page.getByTestId("comment-report")).toHaveCount(0);

  await context.clearCookies();
  await page.evaluate(() => localStorage.removeItem("liftgram.refreshToken"));
  await 가입(page, freshEmail("creporter"), "댓글신고자");

  await 프로필로(page, 주인이름);
  await page.getByTestId("post-comments").first().click();
  await expect(page.getByTestId("comments-list")).toContainText("주인의 댓글", { timeout: 20_000 });
  // 남의 댓글에는 신고만.
  await expect(page.getByTestId("comment-delete")).toHaveCount(0);
  await page.getByTestId("comment-report").first().click();
  await expect(page.getByTestId("report-sheet")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("report-reason").first().click();
  await expect(page.getByTestId("report-sheet")).toHaveCount(0, { timeout: 20_000 });
});

test("권한이 없으면 모더레이션 큐를 볼 수 없다", async ({ page }) => {
  await 가입(page, freshEmail("plain"), "일반");

  // 프로필에 큐 링크 자체가 없다(누를 수 없는 문은 그리지 않는다).
  await page.goto("/profile");
  await expect(page.getByTestId("btn-blocked")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("btn-moderation")).toHaveCount(0);

  // 주소를 직접 쳐도 서버가 거절하고, 화면은 그 이유를 보여 준다.
  await page.goto("/moderation");
  await expect(page.getByTestId("mod-error")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("mod-error")).toContainText("권한");
});

test("차단하면 목록에 뜨고, 거기서 풀 수 있다", async ({ page, context }) => {
  const 상대이름 = `상대${Date.now().toString(36)}`;
  await 가입(page, freshEmail("blocked"), 상대이름);

  await context.clearCookies();
  await page.evaluate(() => localStorage.removeItem("liftgram.refreshToken"));
  await 가입(page, freshEmail("blocker"), "차단하는사람");

  await 프로필로(page, 상대이름);
  await page.getByTestId("profile-block").click();
  // 차단하면 그 자리에서 해제 버튼으로 바뀐다.
  await expect(page.getByTestId("profile-unblock")).toBeVisible({ timeout: 20_000 });

  // 차단 목록에 있고, 거기서 풀 수 있다.
  await page.goto("/blocked");
  await expect(page.getByTestId("block-list")).toContainText(상대이름, { timeout: 20_000 });
  await page.getByTestId("block-unblock").first().click();
  await expect(page.getByTestId("block-list")).not.toContainText(상대이름, { timeout: 20_000 });

  // 새로고침해도 풀린 상태다.
  await page.reload();
  await expect(page.getByTestId("block-list")).not.toContainText(상대이름, { timeout: 20_000 });
});

// 검토자 흐름 — **역할이 있는 계정**이 큐에서 실제로 내릴 수 있는가.
//
// 역할은 화면에서 줄 수 없다(관리자가 준다). 그래서 이 테스트는 `MOD_EMAIL`이 주어졌을 때만 돈다:
//   MOD_EMAIL=<moderator 계정> bunx playwright test e2e/moderation.spec.ts
// 없으면 건너뛴다 — 못 도는 검사를 실패로 남기면 진짜 실패가 묻힌다.
test("검토자는 큐에서 글을 내릴 수 있다", async ({ page, context }) => {
  const 모더레이터메일 = process.env.MOD_EMAIL ?? "";
  test.skip(!모더레이터메일, "MOD_EMAIL이 없다 — 역할이 있는 계정이 필요하다");
  test.setTimeout(120_000);

  test.setTimeout(120_000);
  const ts = Date.now();
  const 주인이름 = `큐주인${ts.toString(36)}`;
  await 가입(page, `q-owner-${ts}@x.com`, 주인이름);
  await page.goto("/feed");
  const 글 = `큐에 올라갈 글 ${ts}`;
  await page.getByTestId("feed-caption").fill(글);
  await page.getByTestId("feed-post").click();
  await expect(page.getByTestId("feed-list")).toContainText(글, { timeout: 20_000 });

  await context.clearCookies();
  await page.evaluate(() => localStorage.removeItem("liftgram.refreshToken"));
  await 가입(page, `q-rep-${ts}@x.com`, "신고자");
  await page.goto("/discover");
  await page.getByTestId("discover-query").fill(주인이름);
  await expect(page.getByTestId("discover-list")).toContainText(주인이름, { timeout: 20_000 });
  await page.getByTestId("discover-user").first().click();
  await page.getByTestId("post-report").first().click();
  await page.getByTestId("report-reason").first().click();
  await expect(page.getByTestId("report-sheet")).toHaveCount(0, { timeout: 20_000 });

  // 검토자 계정 — 역할은 밖에서 부여한다(테스트 스크립트가 psql로 준다).
  await context.clearCookies();
  await page.evaluate(() => localStorage.removeItem("liftgram.refreshToken"));
  await page.goto("/account");
  await page.getByTestId("mode-login").click();
  await page.getByTestId("auth-email-input").fill(모더레이터메일);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });

  // 프로필에 큐 링크가 뜬다(역할이 있는 사람에게만).
  await page.goto("/profile");
  await expect(page.getByTestId("btn-moderation")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-moderation").click();

  await expect(page.getByTestId("mod-list")).toContainText(글, { timeout: 20_000 });
  await expect(page.getByTestId("mod-list")).toContainText(글);
  await expect(page.getByTestId("mod-list")).toContainText("스팸");

  // 내가 신고한 그 줄의 [제거]를 누르면 목록에서 사라진다.
  const 그줄 = page.getByTestId("mod-item").filter({ hasText: 글 });
  await 그줄.getByTestId("mod-remove").click();
  await expect(page.getByTestId("mod-list")).not.toContainText(글, { timeout: 20_000 });

  // 내려간 글은 피드에서도 안 보인다.
  await page.goto("/feed");
  await expect(page.getByTestId("feed-list")).not.toContainText(글);
  console.log("=== 검토자 화면 통과 ===");
});
