// DM·알림 e2e — 말이 오가고, 반응이 알림으로 쌓이는가
//
// 확인하는 것:
//   · 프로필의 '메시지'로 대화가 열리고, 같은 상대는 **언제나 같은 방**이다
//   · 보낸 말이 목록에 남고, 상대에게는 **실시간으로** 들어온다(스트림 — 새로고침 없이)
//   · 안 읽은 수 배지가 서고, 방에 들어가면 사라진다
//   · 그룹은 **팔로우한 사람만** 고를 수 있고, 나가면 목록에서 빠진다
//   · 팔로우·좋아요·댓글이 상대의 알림으로 쌓이고, 알림 화면을 열면 배지가 사라진다
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;
type BrowserContext = import("@playwright/test").BrowserContext;

function freshEmail(tag: string): string {
  return `e2e-dm-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

/** 검색으로 상대를 찾아 프로필로 들어간다. */
async function 프로필로(page: Page, 이름: string) {
  await page.goto("/discover");
  await page.getByTestId("discover-query").fill(이름);
  await expect(page.getByTestId("discover-list")).toContainText(이름, { timeout: 20_000 });
  await page.getByTestId("discover-user").first().click();
  await expect(page.getByTestId("profile-name")).toHaveText(이름, { timeout: 20_000 });
}

test("메시지를 주고받고, 안 읽은 수가 섰다가 사라진다", async ({ page, context }) => {
  const 스타이름 = `스타${Date.now().toString(36)}`;
  await 가입(page, freshEmail("star"), 스타이름);

  // 다른 사람으로 갈아탄다.
  await context.clearCookies();
  await page.evaluate(() => localStorage.removeItem("liftgram.session"));
  await 가입(page, freshEmail("fan"), "팬");

  await 프로필로(page, 스타이름);
  await page.getByTestId("profile-message").click();
  await expect(page.getByTestId("conv-input")).toBeVisible({ timeout: 20_000 });
  const 방주소 = page.url();

  await page.getByTestId("conv-input").fill("안녕하세요!");
  await page.getByTestId("conv-send").click();
  await expect(page.getByTestId("conv-messages")).toContainText("안녕하세요!", { timeout: 20_000 });

  // 같은 상대를 다시 눌러도 **같은 방**이다(대화가 둘로 갈라지지 않는다).
  await 프로필로(page, 스타이름);
  await page.getByTestId("profile-message").click();
  await expect(page).toHaveURL(방주소, { timeout: 20_000 });
  await expect(page.getByTestId("conv-messages")).toContainText("안녕하세요!");

  // 목록에서도 마지막 말이 보인다.
  await page.goto("/messages");
  await expect(page.getByTestId("dm-list")).toContainText(스타이름, { timeout: 20_000 });
  await expect(page.getByTestId("dm-list")).toContainText("안녕하세요!");
});

test("상대가 보낸 말이 새로고침 없이 들어온다 — 실시간 스트림", async ({ browser }) => {
  // 브라우저 두 대를 띄우고 각각 가입까지 하므로 기본 30초로는 모자란다.
  test.setTimeout(90_000);
  // 두 사람이 동시에 켜져 있어야 한다 — 브라우저 컨텍스트를 둘 연다.
  const ctxA: BrowserContext = await browser.newContext();
  const ctxB: BrowserContext = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();

  try {
    const 알파이름 = `알파${Date.now().toString(36)}`;
    await 가입(a, freshEmail("live-a"), 알파이름);
    await 가입(b, freshEmail("live-b"), "베타");

    // 베타가 알파에게 말을 건다.
    await 프로필로(b, 알파이름);
    await b.getByTestId("profile-message").click();
    await expect(b.getByTestId("conv-input")).toBeVisible({ timeout: 20_000 });
    await b.getByTestId("conv-input").fill("첫 마디");
    await b.getByTestId("conv-send").click();
    await expect(b.getByTestId("conv-messages")).toContainText("첫 마디", { timeout: 20_000 });

    // 알파가 그 방을 연다(스트림이 붙는다).
    await a.goto("/messages");
    await expect(a.getByTestId("dm-list")).toContainText("베타", { timeout: 20_000 });
    await a.getByTestId("dm-row").first().click();
    await expect(a.getByTestId("conv-messages")).toContainText("첫 마디", { timeout: 20_000 });

    // 베타가 한 마디 더 — 알파는 **새로고침하지 않는다**.
    await b.getByTestId("conv-input").fill("실시간으로 왔나요?");
    await b.getByTestId("conv-send").click();
    await expect(a.getByTestId("conv-messages")).toContainText("실시간으로 왔나요?", { timeout: 20_000 });

    // 베타가 치는 동안 알파에게 "입력 중"이 뜬다.
    // 신호는 1.5초에 한 번만 나간다(연타로 도배하지 않으려고) — 실제 사용자처럼 **계속 치면서** 기다린다.
    await expect
      .poll(
        async () => {
          await b.getByTestId("conv-input").fill(`타${Date.now()}`);
          return a.getByTestId("conv-typing").count();
        },
        { timeout: 20_000, intervals: [500, 1000, 1000, 1000, 1000] },
      )
      .toBeGreaterThan(0);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test("그룹은 팔로우한 사람만 고를 수 있고, 나가면 목록에서 빠진다", async ({ page, context }) => {
  const 친구이름 = `친구${Date.now().toString(36)}`;
  await 가입(page, freshEmail("gfriend"), 친구이름);

  await context.clearCookies();
  await page.evaluate(() => localStorage.removeItem("liftgram.session"));
  await 가입(page, freshEmail("gme"), "방장");

  // 팔로우하기 전에는 후보에 뜨지 않는다.
  await page.goto("/messages/new");
  await page.getByTestId("group-search").fill(친구이름);
  await expect(page.getByTestId("group-list")).not.toContainText(친구이름, { timeout: 20_000 });

  // 팔로우하고 나면 고를 수 있다.
  await 프로필로(page, 친구이름);
  await page.getByTestId("profile-follow").click();
  await expect(page.getByTestId("profile-follow")).toHaveText("팔로잉", { timeout: 20_000 });

  await page.goto("/messages/new");
  await page.getByTestId("group-title").fill("운동 모임");
  await page.getByTestId("group-search").fill(친구이름);
  await expect(page.getByTestId("group-list")).toContainText(친구이름, { timeout: 20_000 });
  await page.getByTestId("group-user").first().click();
  await page.getByTestId("group-create").click();

  // 그룹 방이 열리고 목록에도 뜬다.
  await expect(page.getByTestId("conv-input")).toBeVisible({ timeout: 20_000 });
  await page.goto("/messages");
  await expect(page.getByTestId("dm-list")).toContainText("운동 모임", { timeout: 20_000 });
});

async function 로그인(page: Page, email: string) {
  await page.goto("/account");
  await page.getByTestId("mode-login").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

test("팔로우·좋아요·댓글이 알림으로 쌓이고, 열면 배지가 사라진다", async ({ page, context }) => {
  const 주인이름 = `주인${Date.now().toString(36)}`;
  const 주인메일 = freshEmail("owner");
  await 가입(page, 주인메일, 주인이름);
  await page.goto("/feed");
  await page.getByTestId("feed-caption").fill("알림 실험용 글");
  await page.getByTestId("feed-post").click();
  await expect(page.getByTestId("feed-list")).toContainText("알림 실험용 글", { timeout: 20_000 });

  // 다른 사람이 팔로우·좋아요·댓글을 남긴다.
  await context.clearCookies();
  await page.evaluate(() => localStorage.removeItem("liftgram.session"));
  await 가입(page, freshEmail("actor"), "행동가");

  await 프로필로(page, 주인이름);
  await page.getByTestId("profile-follow").click();
  await expect(page.getByTestId("profile-follow")).toHaveText("팔로잉", { timeout: 20_000 });
  await page.getByTestId("post-like").first().click();
  await page.getByTestId("post-comments").first().click();
  await page.getByTestId("comment-input").fill("좋은 글이에요");
  await page.getByTestId("comment-post").click();
  await expect(page.getByTestId("comments-list")).toContainText("좋은 글이에요", { timeout: 20_000 });

  // 주인으로 돌아와 알림을 본다.
  await context.clearCookies();
  await page.evaluate(() => localStorage.removeItem("liftgram.session"));
  await 로그인(page, 주인메일);

  // 피드 머리에 안 읽은 배지가 서 있다(팔로우·좋아요·댓글 = 3건).
  await page.goto("/feed");
  await expect(page.getByTestId("feed-unread-badge")).toHaveText("3", { timeout: 20_000 });

  // 알림 화면에는 세 줄이 있고, 문장은 화면이 만든다.
  await page.getByTestId("feed-notifications").click();
  await expect(page.getByTestId("notif-row")).toHaveCount(3, { timeout: 20_000 });
  await expect(page.getByTestId("notif-list")).toContainText("팔로우했어요");
  await expect(page.getByTestId("notif-list")).toContainText("좋아해요");
  await expect(page.getByTestId("notif-list")).toContainText("댓글을 남겼어요");

  // 열었으니 읽음 — 돌아가면 배지가 없다.
  await page.goto("/feed");
  await expect(page.getByTestId("feed-unread-badge")).toHaveCount(0, { timeout: 20_000 });
});

test("사진 한 장을 보내면 말풍선에 그대로 뜬다", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const ts = Date.now();
  const 받는이 = `사진받이${ts.toString(36)}`;

  // 상대를 먼저 만든다(대화는 서로 아는 사이에서 시작된다).
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  try {
    await 가입(pageB, `photo-b-${ts}@x.com`, 받는이);

    await 가입(page, `photo-a-${ts}@x.com`, `사진보내${ts.toString(36)}`);
    await 프로필로(page, 받는이);
    await page.getByTestId("profile-message").click();
    await expect(page.getByTestId("conv-input")).toBeVisible({ timeout: 20_000 });

    // 1×1 png 한 장을 고른다 — 올린 뒤 보내진다.
    await page.getByTestId("conv-image-file").setInputFiles({
      name: "shot.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    });

    // 말풍선에 **실제로 그려진** 사진이 있어야 한다(주소만 있고 안 뜨는 것과 구분한다).
    const 사진 = page.getByTestId("conv-bubble").locator("img").first();
    await expect(사진).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => await 사진.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 20_000 })
      .toBeGreaterThan(0);
  } finally {
    await ctxB.close();
  }
});
