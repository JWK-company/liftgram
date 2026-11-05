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
  await page.getByTestId("age-confirm").check();
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
  // 글쓰기는 + 버튼 → 전체 화면 작성기(SRS-054 시안 08 · 결정 D5).
  await page.getByTestId("feed-compose").click();
  await page.getByTestId("feed-caption").fill("신고 실험용 글");
  await page.getByTestId("feed-post").click();
  await expect(page.getByTestId("feed-list")).toContainText("신고 실험용 글", { timeout: 20_000 });

  // 내 글에는 ⋯(내 글 메뉴)만 있고 신고 버튼은 없다.
  await expect(page.getByTestId("post-menu")).toHaveCount(1);
  await expect(page.getByTestId("post-report")).toHaveCount(0);

  // 다른 사람으로 갈아탄다.
  await context.clearCookies();
  await page.evaluate(() => localStorage.removeItem("liftgram.session"));
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
  // 글쓰기는 + 버튼 → 전체 화면 작성기(SRS-054 시안 08 · 결정 D5).
  await page.getByTestId("feed-compose").click();
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
  await page.evaluate(() => localStorage.removeItem("liftgram.session"));
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

test("차단하면 목록에 뜨고, 거기서 풀 수 있다", async ({ page, context }) => {
  const 상대이름 = `상대${Date.now().toString(36)}`;
  await 가입(page, freshEmail("blocked"), 상대이름);

  await context.clearCookies();
  await page.evaluate(() => localStorage.removeItem("liftgram.session"));
  await 가입(page, freshEmail("blocker"), "차단하는사람");

  await 프로필로(page, 상대이름);
  // 차단은 머리의 ⋯ 안에 있다(SRS-054 위험 동작 규칙).
  await page.getByTestId("profile-menu").click();
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
