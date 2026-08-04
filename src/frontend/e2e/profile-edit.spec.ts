// 프로필 편집 · 종목 보관 e2e
//
// 둘 다 **이번에 발견한 빠진 기능**이다(앱에는 있는데 웹에 없었다).
//   · 표시 이름·사진은 남이 보는 값이라 서버 프로필에 적힌다
//   · 종목은 지우지 않고 **감춘다** — 지난 기록이 그 이름을 가리키고 있다
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

function freshEmail(): string {
  return `e2e-pe-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function 가입(page: Page, name: string) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(freshEmail());
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill(name);
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

test("표시 이름을 바꾸면 다른 화면에도 그 이름으로 나온다", async ({ page }) => {
  test.setTimeout(120_000);
  const 처음이름 = `처음${Date.now().toString(36)}`;
  const 바꾼이름 = `바꾼${Date.now().toString(36)}`;
  await 가입(page, 처음이름);

  await expect(page.getByTestId("profile-edit")).toBeVisible({ timeout: 20_000 });
  // 그대로면 저장할 것이 없다.
  await expect(page.getByTestId("btn-save-profile")).toBeDisabled();

  await page.getByTestId("profile-name-input").fill(바꾼이름);
  await expect(page.getByTestId("btn-save-profile")).toBeEnabled();
  await page.getByTestId("btn-save-profile").click();
  await expect(page.getByTestId("profile-edit-status")).toBeVisible({ timeout: 20_000 });

  // 계정 카드가 새 이름으로 바뀐다.
  await expect(page.getByTestId("auth-email")).toHaveText(바꾼이름, { timeout: 20_000 });

  // 새로고침해도 그대로다(서버에 남았다는 뜻).
  await page.reload();
  await expect(page.getByTestId("auth-email")).toHaveText(바꾼이름, { timeout: 20_000 });

  // 남이 보는 곳에서도 새 이름이다 — 글을 쓰면 작성자가 그 이름으로 나온다.
  await page.goto("/feed");
  await page.getByTestId("feed-caption").fill(`이름 확인 ${Date.now()}`);
  await page.getByTestId("feed-post").click();
  await expect(page.getByTestId("feed-list")).toContainText(바꾼이름, { timeout: 20_000 });
});

test("프로필 사진을 바꾸면 실제로 그려진다", async ({ page }) => {
  test.setTimeout(120_000);
  await 가입(page, `사진${Date.now().toString(36)}`);

  await page.getByTestId("avatar-file").setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await expect(page.getByTestId("profile-edit-status")).toBeVisible({ timeout: 30_000 });

  // 주소만 바뀐 것이 아니라 **그려져야** 한다.
  const 사진 = page.getByTestId("profile-edit").locator("img").first();
  await expect(사진).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => await 사진.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 20_000 })
    .toBeGreaterThan(0);
});

test("내가 만든 종목은 고칠 수 있고, 보관하면 목록에서 빠진다", async ({ page }) => {
  test.setTimeout(120_000);
  const 이름 = `보관종목${Date.now().toString(36)}`;
  const 고친이름 = `${이름}수정`;

  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
  await page.getByTestId("btn-new-exercise").click();
  await page.getByTestId("form-name-ko").fill(이름);
  await page.getByTestId("form-save").click();
  await expect(page).toHaveURL(/\/exercises$/, { timeout: 20_000 });

  // 목록 행의 연필로 곧바로 고친다.
  // (내가 만든 종목은 로컬에만 있어 서버가 렌더하는 상세 페이지가 없다 — 그래서 진입이 여기다.)
  await page.getByTestId("search-input").fill(이름);
  await expect(page.getByTestId("exercise-list")).toContainText(이름, { timeout: 20_000 });
  await page.getByTestId("exercise-list").locator("[data-testid^='edit-']").first().click();
  await expect(page.getByTestId("exercise-form")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("form-name-ko").fill(고친이름);
  await page.getByTestId("form-save").click();
  await expect(page).toHaveURL(/\/exercises$/, { timeout: 20_000 });
  await page.getByTestId("search-input").fill(고친이름);
  await expect(page.getByTestId("exercise-list")).toContainText(고친이름, { timeout: 20_000 });

  // 기본 카탈로그 종목은 상세에서 보관할 수 있다 — 지운 것이 아니라 감춘 것이다.
  await page.getByTestId("search-input").fill("바벨 벤치프레스");
  await page.getByTestId("exercise-list").locator("a").first().click();
  await expect(page.getByTestId("btn-archive-exercise")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-archive-exercise").click();
  await page.getByTestId("confirm-archive-exercise").getByTestId("dialog-confirm").click();
  await expect(page).toHaveURL(/\/exercises$/, { timeout: 20_000 });
  await page.getByTestId("search-input").fill("바벨 벤치프레스");
  // 결과가 없으면 목록 자체가 빈 상태로 바뀐다 — "목록에 없다"가 아니라 "목록이 없다"이다.
  await expect(page.getByTestId("exercise-list")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator("main")).toContainText("결과가 없어요");
});

test("마친 운동을 피드에 올리면 오운완 카드가 된다", async ({ page }) => {
  test.setTimeout(180_000);
  await 가입(page, `공유${Date.now().toString(36)}`);

  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });

  await page.goto("/workout");
  await expect(page.getByTestId("btn-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("set-weight").first().fill("70");
  await page.getByTestId("set-reps").first().fill("8");
  await page.getByTestId("set-done").first().click();
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 20_000 });

  // 요약에 공유 자리가 있다 — 한마디를 비워도 올릴 수 있다.
  await expect(page.getByTestId("share-workout")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-share-workout").click();
  await expect(page.getByTestId("btn-share-workout")).toBeDisabled({ timeout: 20_000 });

  // 피드에 **오운완 카드**로 뜬다 — 숫자가 실리고, 펼치면 종목·세트까지 있다.
  await page.goto("/feed");
  await expect(page.getByTestId("feed-list")).toContainText("560kg", { timeout: 20_000 });
  await expect(page.getByTestId("feed-list")).toContainText("PR 갱신 2회");
  await page.getByTestId("feed-list").getByText("루틴 보기").first().click();
  await expect(page.getByTestId("feed-list")).toContainText("벤치프레스", { timeout: 20_000 });
});
