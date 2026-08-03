// 피드 e2e — 올리고, 서로 보고, 반응하는 한 바퀴
//
// 확인하는 것:
//   · 로그인하지 않으면 **막지 않고 안내한다**(피드만 계정이 필요한 화면이다)
//   · 글을 올리면 바로 목록에 뜬다
//   · 해시태그는 링크이고, 눌러서 간 목록에 그 글이 있다
//   · 저장(북마크)은 저장함에 모이고, 해제하면 빠진다
//   · 다른 사람을 찾아 팔로우하면 **내 피드에 그 사람의 글이 들어온다**
//   · 댓글과 답글 — 답글은 펼쳐야 보이고, 내 것만 지울 수 있다
//   · 내 글은 캡션을 고치고 지울 수 있다
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

function freshEmail(tag: string): string {
  return `e2e-feed-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

async function 글쓰기(page: Page, caption: string) {
  await page.goto("/feed");
  await page.getByTestId("feed-caption").fill(caption);
  await page.getByTestId("feed-post").click();
  await expect(page.getByTestId("feed-list")).toContainText(caption, { timeout: 20_000 });
}

test("로그인하지 않으면 피드는 막지 않고 안내한다", async ({ page }) => {
  await page.goto("/feed");
  // 탭 자체는 열린다 — 로그인하라는 말과 갈 곳을 준다.
  await expect(page.getByTestId("feed-go-profile")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("screen-title")).toHaveText("피드");
});

test("글을 올리면 목록에 뜨고, 고치고 지울 수 있다", async ({ page }) => {
  await 가입(page, freshEmail("own"), "글쓴이");
  await 글쓰기(page, "오늘도 한 세트 더");

  // 내 글에는 점 세 개 메뉴가 붙는다.
  await page.getByTestId("post-menu").first().click();
  await page.getByTestId("post-edit").click();
  await page.getByTestId("post-edit-caption").fill("고쳐 쓴 캡션");
  await page.getByTestId("post-edit-save").click();
  await expect(page.getByTestId("feed-list")).toContainText("고쳐 쓴 캡션", { timeout: 20_000 });

  await page.getByTestId("post-menu").first().click();
  await page.getByTestId("post-delete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("feed-list")).not.toContainText("고쳐 쓴 캡션", { timeout: 20_000 });
});

test("해시태그는 링크이고 그 태그 목록에 글이 모인다", async ({ page }) => {
  const tag = `t${Date.now().toString(36)}`;
  await 가입(page, freshEmail("tag"), "태그쓴이");
  await 글쓰기(page, `가슴 다 태웠다 #${tag}`);

  await page.getByTestId("hashtag-link").first().click();
  await expect(page.getByTestId("screen-title")).toHaveText(`#${tag}`, { timeout: 20_000 });
  await expect(page.getByTestId("hashtag-list")).toContainText("가슴 다 태웠다");
});

test("저장하면 저장함에 모이고 해제하면 빠진다", async ({ page }) => {
  await 가입(page, freshEmail("mark"), "저장하는사람");
  await 글쓰기(page, "나중에 다시 볼 글");

  await page.getByTestId("post-bookmark").first().click();
  await expect(page.getByTestId("post-bookmark").first()).toHaveAttribute("aria-pressed", "true");

  await page.goto("/bookmarks");
  await expect(page.getByTestId("bookmark-list")).toContainText("나중에 다시 볼 글", { timeout: 20_000 });

  // 저장함에서 해제하면 다시 들어왔을 때 없다.
  await page.getByTestId("post-bookmark").first().click();
  await page.goto("/bookmarks");
  await expect(page.getByTestId("bookmark-list")).not.toContainText("나중에 다시 볼 글", {
    timeout: 20_000,
  });
});

test("팔로우하면 그 사람의 글이 내 피드에 들어온다", async ({ page, context }) => {
  const 스타 = freshEmail("star");
  const 이름 = `스타${Date.now().toString(36)}`;
  await 가입(page, 스타, 이름);
  await 글쓰기(page, "팔로워에게 보일 글");

  // 다른 사람으로 갈아탄다 — 저장된 세션을 지우고 새로 가입한다.
  await context.clearCookies();
  await page.evaluate(() => localStorage.removeItem("liftgram.session"));
  await 가입(page, freshEmail("fan"), "팬");

  // 팔로우 전에는 남의 글이 안 보인다.
  await page.goto("/feed");
  await expect(page.getByTestId("feed-list")).not.toContainText("팔로워에게 보일 글");

  await page.getByTestId("feed-discover").click();
  await page.getByTestId("discover-query").fill(이름);
  await expect(page.getByTestId("discover-list")).toContainText(이름, { timeout: 20_000 });
  await page.getByTestId("discover-follow").first().click();
  await expect(page.getByTestId("discover-follow").first()).toHaveText("팔로잉", { timeout: 20_000 });

  await page.goto("/feed");
  await expect(page.getByTestId("feed-list")).toContainText("팔로워에게 보일 글", { timeout: 20_000 });

  // 프로필로 들어가면 카운트와 관계가 맞는다.
  await page.getByTestId("post-author").first().click();
  await expect(page.getByTestId("profile-name")).toHaveText(이름, { timeout: 20_000 });
  await expect(page.getByTestId("profile-follow")).toHaveText("팔로잉");
});

test("댓글과 답글 — 답글은 펼쳐야 보인다", async ({ page }) => {
  await 가입(page, freshEmail("talk"), "말하는사람");
  await 글쓰기(page, "댓글 달아 주세요");

  await page.getByTestId("post-comments").first().click();
  await expect(page.getByTestId("screen-title")).toHaveText("댓글", { timeout: 20_000 });

  await page.getByTestId("comment-input").fill("첫 댓글");
  await page.getByTestId("comment-post").click();
  await expect(page.getByTestId("comments-list")).toContainText("첫 댓글", { timeout: 20_000 });

  // 답글을 달면 그 자리에 펼쳐진 채로 붙는다.
  await page.getByTestId("comment-reply").first().click();
  await page.getByTestId("comment-input").fill("셀프 답글");
  await page.getByTestId("comment-post").click();
  await expect(page.getByTestId("comments-list")).toContainText("셀프 답글", { timeout: 20_000 });

  // 접으면 사라지고, 다시 펼치면 나온다.
  await page.getByTestId("comment-replies-toggle").click();
  await expect(page.getByTestId("comments-list")).not.toContainText("셀프 답글");
  await page.getByTestId("comment-replies-toggle").click();
  await expect(page.getByTestId("comments-list")).toContainText("셀프 답글");

  // 좋아요는 두 번 눌러도 하나다.
  const 좋아요 = page.getByTestId("comment-like").first();
  await 좋아요.click();
  await expect(좋아요).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
  await 좋아요.click();
  await expect(좋아요).toHaveAttribute("aria-pressed", "false", { timeout: 20_000 });
});

test("사진을 올리면 글에 붙고, 새로고침해도 그 자리에 있다", async ({ page }) => {
  await 가입(page, freshEmail("photo"), "사진쓴이");
  await page.goto("/feed");

  // 진짜 PNG 한 장을 만들어 고른다(입력은 숨겨져 있으므로 직접 채운다).
  await page.getByTestId("compose-file").setInputFiles({
    name: "shot.png",
    mimeType: "image/png",
    // 8×8 빨간 사각형.
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVQoz2P8z8Dwn4EIwMQwqnBUIQBAaAMBpqrPRAAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  // 올리기 전에 미리 보여 준다 — app과 같은 순서다.
  await expect(page.getByTestId("compose-preview")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("feed-caption").fill("오늘의 한 컷");
  await page.getByTestId("feed-post").click();

  const 사진 = page.getByTestId("post-image").first();
  await expect(사진).toBeVisible({ timeout: 20_000 });
  // 화면에 그려졌다는 것만으로는 부족하다 — 서버가 진짜 바이트를 돌려줬는지 본다.
  await expect
    .poll(async () => 사진.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 20_000 })
    .toBeGreaterThan(0);

  // 새로고침해도 남는다(주소가 글에 저장됐다는 뜻).
  await page.reload();
  await expect(page.getByTestId("post-image").first()).toBeVisible({ timeout: 20_000 });
});

test("사진만 있고 글이 없어도 올릴 수 있다", async ({ page }) => {
  await 가입(page, freshEmail("photoonly"), "사진만");
  await page.goto("/feed");

  // 아무것도 없으면 게시 버튼은 눌리지 않는다.
  await expect(page.getByTestId("feed-post")).toBeDisabled();

  await page.getByTestId("compose-file").setInputFiles({
    name: "shot.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVQoz2P8z8Dwn4EIwMQwqnBUIQBAaAMBpqrPRAAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await expect(page.getByTestId("feed-post")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("feed-post").click();
  await expect(page.getByTestId("post-image").first()).toBeVisible({ timeout: 20_000 });
});

// 8×8 PNG 한 장 — 테스트마다 같은 그림을 쓴다.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVQoz2P8z8Dwn4EIwMQwqnBUIQBAaAMBpqrPRAAAAABJRU5ErkJggg==",
  "base64",
);

test("스토리를 올리면 트레이에 뜨고, 열면 안 본 표시가 풀린다", async ({ page }) => {
  await 가입(page, freshEmail("story"), "스토리쓴이");
  await page.goto("/feed");

  // 스토리가 없으면 첫 칸은 '+'다 — 눌러서 고르는 대신 숨은 입력을 직접 채운다.
  await expect(page.getByTestId("story-tray")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("story-file").setInputFiles({ name: "s.png", mimeType: "image/png", buffer: PNG });

  // 올라가면 내 타일에 썸네일이 생기고, 아직 안 본 상태(강조 링)다.
  const 내타일 = page.getByTestId("story-mine");
  await expect(내타일.locator("img")).toBeVisible({ timeout: 20_000 });
  await expect(내타일.locator("[data-unseen]")).toHaveAttribute("data-unseen", "true");

  // 열면 뷰어가 뜨고, 닫으면 '봤음'으로 바뀐다(표시는 기기에 남는다).
  await 내타일.click();
  await expect(page.getByTestId("story-viewer")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("story-image")).toBeVisible();
  await page.getByTestId("story-close").click();
  await expect(page.getByTestId("story-viewer")).toHaveCount(0);
  await expect(내타일.locator("[data-unseen]")).toHaveAttribute("data-unseen", "false");

  // 새로고침해도 표시가 남는다.
  await page.reload();
  await expect(page.getByTestId("story-mine").locator("[data-unseen]")).toHaveAttribute(
    "data-unseen",
    "false",
    { timeout: 20_000 },
  );
});

test("스토리는 두 컷을 넘겨 보고 마지막에서 닫힌다", async ({ page }) => {
  await 가입(page, freshEmail("story2"), "두컷");
  await page.goto("/feed");

  await page.getByTestId("story-file").setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("story-mine").locator("img")).toBeVisible({ timeout: 20_000 });
  // 이미 스토리가 있으면 '+' 배지로 계속 추가한다.
  await page.getByTestId("story-file").setInputFiles({ name: "b.png", mimeType: "image/png", buffer: PNG });
  // 두 번째가 반영될 때까지 기다린다(진행 막대가 두 칸이 되어야 한다).
  await expect
    .poll(
      async () => {
        await page.getByTestId("story-mine").click();
        const bars = await page.getByTestId("story-viewer").locator("> div").first().locator("span").count();
        await page.getByTestId("story-close").click();
        return bars;
      },
      { timeout: 20_000 },
    )
    .toBe(2);

  await page.getByTestId("story-mine").click();
  // 한 번 누르면 둘째 컷, 한 번 더 누르면 닫힌다.
  await page.getByTestId("story-advance").click();
  await expect(page.getByTestId("story-viewer")).toBeVisible();
  await page.getByTestId("story-advance").click();
  await expect(page.getByTestId("story-viewer")).toHaveCount(0);
});

test("팔로우한 사람의 스토리가 내 트레이에 들어온다", async ({ page, context }) => {
  const 이름 = `스타${Date.now().toString(36)}`;
  await 가입(page, freshEmail("storystar"), 이름);
  await page.goto("/feed");
  await page.getByTestId("story-file").setInputFiles({ name: "s.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("story-mine").locator("img")).toBeVisible({ timeout: 20_000 });

  await context.clearCookies();
  await page.evaluate(() => localStorage.removeItem("liftgram.session"));
  await 가입(page, freshEmail("storyfan"), "팬");

  // 팔로우 전에는 남의 스토리가 없다(내 타일 하나뿐).
  await page.goto("/feed");
  await expect(page.getByTestId("story-tray")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("story-tile")).toHaveCount(0);

  await page.getByTestId("feed-discover").click();
  await page.getByTestId("discover-query").fill(이름);
  await expect(page.getByTestId("discover-list")).toContainText(이름, { timeout: 20_000 });
  await page.getByTestId("discover-follow").first().click();
  await expect(page.getByTestId("discover-follow").first()).toHaveText("팔로잉", { timeout: 20_000 });

  await page.goto("/feed");
  await expect(page.getByTestId("story-tile")).toHaveCount(1, { timeout: 20_000 });
  await expect(page.getByTestId("story-tile")).toContainText(이름);
});
