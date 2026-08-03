// 발견 · 커스텀 종목 · 프로그램 생성 e2e
//
// 확인하는 것:
//   · 발견은 **팔로우와 무관하게** 공개 글을 보여 주고, 검색은 사람·태그·글을 한 번에 찾는다
//   · 커스텀 종목은 **이름만으로** 만들 수 있고, 만들면 카탈로그와 피커에 바로 나온다
//   · 프로그램 생성은 미리보기를 주고, 채택해야 내 루틴이 된다(교체·제외가 결과에 반영된다)
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

function freshEmail(tag: string): string {
  return `e2e-disc-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
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

test("발견은 팔로우하지 않은 사람의 공개 글도 보여 준다", async ({ page, context }) => {
  const 글 = `발견 실험 ${Date.now()}`;
  await 가입(page, freshEmail("author"), `발견주인${Date.now().toString(36)}`);
  await page.goto("/feed");
  await page.getByTestId("feed-caption").fill(`${글} #발견태그`);
  await page.getByTestId("feed-post").click();
  await expect(page.getByTestId("feed-list")).toContainText(글, { timeout: 20_000 });

  // 아무도 팔로우하지 않은 새 사람.
  await context.clearCookies();
  await page.evaluate(() => localStorage.removeItem("liftgram.refreshToken"));
  await 가입(page, freshEmail("newbie"), "새사람");

  // 피드는 비어 있다(팔로우가 없다).
  await page.goto("/feed");
  await expect(page.getByTestId("feed-list")).not.toContainText(글);

  // 발견에는 남의 글이 있다.
  //
  // **내가 방금 쓴 글이 목록에 있는지로 확인하지 않는다.** 인기 목록은 좋아요 순 상위 N개라,
  // 서버에 글이 쌓이면 갓 쓴 글(좋아요 0)은 밀려난다 — 그건 정상 동작이지 실패가 아니다.
  // 확인할 것은 "팔로우가 없어도 남의 글이 보인다"이고, 특정 글에 닿는 경로는 검색이 맡는다(다음 테스트).
  await page.getByTestId("feed-explore").click();
  await expect(page.getByTestId("explore-body")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("post-author").first()).toBeVisible({ timeout: 20_000 });
  // 트렌딩 태그도 뜬다 — 방금 쓴 글의 태그가 그중 하나다.
  await expect(page.getByTestId("explore-body")).toContainText("#발견태그", { timeout: 20_000 });
});

test("검색은 사람·태그·글을 한 번에 찾는다", async ({ page }) => {
  const 낱말 = `검색낱말${Date.now().toString(36)}`;
  await 가입(page, freshEmail("search"), `검색인${Date.now().toString(36)}`);
  await page.goto("/feed");
  await page.getByTestId("feed-caption").fill(`${낱말} 들어간 글 #${낱말}`);
  await page.getByTestId("feed-post").click();
  await expect(page.getByTestId("feed-list")).toContainText(낱말, { timeout: 20_000 });

  await page.goto("/explore");
  await page.getByTestId("explore-query").fill(낱말);
  await expect(page.getByTestId("explore-results")).toBeVisible({ timeout: 20_000 });
  // 태그와 글이 함께 나온다.
  await expect(page.getByTestId("explore-results")).toContainText(`#${낱말}`);
  await expect(page.getByTestId("explore-results")).toContainText("들어간 글");

  // 검색어를 지우면 발견으로 돌아간다.
  await page.getByTestId("explore-query").fill("");
  await expect(page.getByTestId("explore-results")).toHaveCount(0, { timeout: 20_000 });
});

test("커스텀 종목은 이름만으로 만들 수 있고 바로 쓸 수 있다", async ({ page }) => {
  const 이름 = `내종목${Date.now().toString(36)}`;

  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });
  await page.getByTestId("btn-new-exercise").click();
  await expect(page.getByTestId("exercise-form")).toBeVisible({ timeout: 20_000 });

  // 이름을 넣기 전에는 저장할 수 없다.
  await expect(page.getByTestId("form-save")).toBeDisabled();
  await page.getByTestId("form-name-ko").fill(이름);
  await expect(page.getByTestId("form-save")).toBeEnabled();
  await page.getByTestId("form-save").click();

  // 목록으로 돌아오고, 방금 만든 종목이 있다.
  await expect(page).toHaveURL(/\/exercises$/, { timeout: 20_000 });
  await page.getByTestId("search-input").fill(이름);
  await expect(page.getByTestId("exercise-list")).toContainText(이름, { timeout: 20_000 });

  // 세션의 종목 피커에서도 고를 수 있다(로컬 저장소에 남았다는 뜻).
  await page.goto("/workout");
  await expect(page.getByTestId("btn-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill(이름);
  await expect(page.getByTestId("picker-list")).toContainText(이름, { timeout: 20_000 });
});

test("프로그램은 미리보기를 거쳐 루틴이 된다", async ({ page }) => {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });

  await page.goto("/program");
  await expect(page.getByTestId("program-form")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("program-generate").click();

  // 미리보기가 뜬다 — 아직 내 루틴이 아니다.
  await expect(page.getByTestId("program-preview")).toBeVisible({ timeout: 20_000 });
  const 요일수 = await page.getByTestId("program-day").count();
  expect(요일수).toBeGreaterThan(0);

  // 한 종목을 빼도 미리보기 안에서만 바뀐다.
  const 첫날 = page.getByTestId("program-day").first();
  const 처음개수 = await 첫날.getByTestId("program-remove").count();
  await 첫날.getByTestId("program-remove").first().click();
  await expect(첫날.getByTestId("program-remove")).toHaveCount(처음개수 - 1);

  // 채택하면 운동 탭에 **프로그램 이름의 폴더**로 묶여 들어온다(낱개가 아니라).
  await page.getByTestId("program-adopt").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await expect(page.locator("main")).toContainText("근비대", { timeout: 20_000 });
});
