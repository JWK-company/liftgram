// 사진 자동 검사(SPEC-031) — 실제 검사 컨테이너를 띄우고 기준값을 0 으로 둔 서버에서만 돈다.
//   IMAGE_SCAN_URL=… IMAGE_SCAN_THRESHOLD=0 IMAGE_SCAN_SINCE=2026-01-01T00:00:00+09:00 ./bin/server
//   E2E_SCAN=1 npx playwright test photo-scan
// 모든 사진이 걸리므로 다른 시험과 같은 서버에서 돌리지 않는다.
import { expect, test, type Browser, type Page } from "@playwright/test";

test.skip(!process.env.E2E_SCAN, "검사 서버 전용 시험");

// 1x1 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==",
  "base64",
);
const uid = () => `${Date.now()}${Math.floor(Math.random() * 10000)}`;

async function 가입(browser: Browser, 이름: string): Promise<{ page: Page; email: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = `scan-${uid()}@example.com`;
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill(이름);
  await page.getByTestId("age-confirm").check();
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  return { page, email };
}

test("걸린 사진의 글은 작성자에게만 보인다", async ({ browser }) => {
  test.setTimeout(120_000);
  const 표식 = uid();
  const { page: 작성자 } = await 가입(browser, `작성${표식}`);
  await 작성자.goto("/feed");
  await 작성자.getByTestId("feed-compose").click();
  await 작성자.getByTestId("feed-caption").fill(`사진글 ${표식}`);
  await 작성자
    .getByTestId("compose-file")
    .setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PNG });
  const 업로드 = 작성자.waitForResponse(/UploadImage/);
  const 사진응답 = 작성자.waitForResponse(/\/media\/file\//);
  await 작성자.getByTestId("feed-post").click();
  await 업로드;
  const 카드 = 작성자.getByTestId("post-card").filter({ hasText: `사진글 ${표식}` });
  await expect(카드.getByTestId("post-under-review")).toBeVisible({ timeout: 20_000 });
  // 사진은 주소로도 열리지 않고, 깨진 그림 대신 「검토 중」 자리가 보인다.
  const 막힘 = await 사진응답;
  expect(막힘.status()).toBe(404);
  await expect(카드.getByTestId("post-image-held")).toBeVisible({ timeout: 20_000 });

  // 새로고침해도 작성자에게는 남는다
  await 작성자.reload();
  const 새카드 = 작성자.getByTestId("post-card").filter({ hasText: `사진글 ${표식}` });
  await expect(새카드).toBeVisible({ timeout: 20_000 });
  await expect(새카드.getByTestId("post-under-review")).toBeVisible();
  await expect(새카드.getByTestId("post-image-held")).toBeVisible({ timeout: 20_000 });

  // 검토 중인 스토리도 작성자에게는 남고 안내가 보인다
  await 작성자.getByTestId("story-file").setInputFiles({ name: "s.png", mimeType: "image/png", buffer: PNG });
  await expect(작성자.getByTestId("story-mine")).toBeVisible({ timeout: 20_000 });
  await 작성자.getByTestId("story-mine").click();
  await expect(작성자.getByTestId("story-under-review")).toBeVisible({ timeout: 20_000 });
  await 작성자.getByTestId("story-close").click();

  // 다른 사람에게는 글 자체가 보이지 않는다
  const { page: 제삼자 } = await 가입(browser, `제삼${표식}`);
  await 제삼자.goto("/feed?tab=recommended");
  await 제삼자.waitForLoadState("networkidle");
  await expect(제삼자.getByTestId("post-card").filter({ hasText: `사진글 ${표식}` })).toHaveCount(0);

  // 프로필 사진은 저장하지 않고 이유를 알린다
  await 작성자.goto("/account");
  await 작성자
    .getByTestId("avatar-file")
    .setInputFiles({ name: "b.png", mimeType: "image/png", buffer: PNG });
  await expect(작성자.getByTestId("profile-edit-status")).toContainText("사용할 수 없", { timeout: 20_000 });
});
