// SPEC-034 운동 영상 e2e — 재생 · 대체 · 동작 줄이기 · 저장소 · 고지 · 목록 썸네일.
// 표본 클립: MOTION_ID 종목(기본 벤치프레스)의 파일이 public/motion 에 있어야 한다.
import { expect, test } from "@playwright/test";

const ID = process.env.MOTION_ID ?? "seed-barbell-bench-press";

test("상세: 영상이 재생되면 픽토그램을 덮고 고지가 보인다", async ({ page }) => {
  await page.goto(`/exercise/${ID}`);
  const video = page.getByTestId("exercise-motion-video");
  await expect(video).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => video.evaluate((v: HTMLVideoElement) => v.currentTime > 0 && !v.paused), {
      timeout: 15_000,
    })
    .toBe(true);
  await expect(video).toHaveCSS("opacity", "1"); // 픽토그램을 실제로 덮는다
  await expect(page.getByTestId("motion-notice")).toContainText("AI 보정");
  const cached = await page.evaluate(
    async () => (await (await caches.open("liftgram-motion")).keys()).length,
  );
  expect(cached).toBeGreaterThan(0);
});

test("동작 줄이기: 영상 없이 픽토그램만", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(`/exercise/${ID}`);
  await expect(page.getByTestId("exercise-motion-picto")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("exercise-motion-video")).toHaveCount(0);
  await expect(page.getByTestId("motion-notice")).toHaveCount(0); // 영상이 없으면 고지도 없다
  await ctx.close();
});

test("영상 파일 실패: 픽토그램으로 돌아간다", async ({ page }) => {
  await page.route("**/motion/*.mp4", (r) => r.fulfill({ status: 404, body: "" }));
  await page.goto(`/exercise/${ID}`);
  await expect(page.getByTestId("exercise-motion-picto")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("exercise-motion-picto").locator("svg")).toBeVisible();
  await expect(page.getByTestId("exercise-motion-video")).toHaveCount(0);
  await expect(page.getByTestId("motion-notice")).toHaveCount(0);
});

test("망가진 저장본: 지우고 다시 받아 재생한다", async ({ page }) => {
  await page.goto(`/exercise/${ID}`);
  await expect(page.getByTestId("exercise-motion-video")).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => page.evaluate(async () => (await (await caches.open("liftgram-motion")).keys()).length))
    .toBeGreaterThan(0);
  await page.evaluate(async () => {
    const c = await caches.open("liftgram-motion");
    const [k] = await c.keys();
    if (k) await c.put(k, new Response("garbage", { headers: { "content-type": "video/mp4" } }));
  });
  await page.reload();
  const video = page.getByTestId("exercise-motion-video");
  await expect(video).toHaveCSS("opacity", "1", { timeout: 20_000 });
  await expect
    .poll(async () => video.evaluate((v: HTMLVideoElement) => !v.src.startsWith("blob:")))
    .toBe(true);
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const c = await caches.open("liftgram-motion");
        return (await c.keys()).length;
      }),
    )
    .toBe(0);
});

test("받은 파일이 영상이 아니면 저장하지 않는다", async ({ page }) => {
  await page.route("**/motion/*.mp4", (r) =>
    r.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" }),
  );
  await page.goto(`/exercise/${ID}`);
  await expect(page.getByTestId("exercise-motion-picto").locator("svg")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  const n = await page.evaluate(async () => (await (await caches.open("liftgram-motion")).keys()).length);
  expect(n).toBe(0);
});

test("다시 열면 저장소에서 재생한다(오프라인)", async ({ page, context }) => {
  await page.goto(`/exercise/${ID}`);
  await expect(page.getByTestId("exercise-motion-video")).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => page.evaluate(async () => (await (await caches.open("liftgram-motion")).keys()).length))
    .toBeGreaterThan(0);
  await page.route("**/motion/*.mp4", (r) => r.abort());
  await page.reload();
  const video = page.getByTestId("exercise-motion-video");
  await expect(video).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => video.evaluate((v: HTMLVideoElement) => v.src.startsWith("blob:")))
    .toBe(true);
  await expect(video).toHaveCSS("opacity", "1"); // 저장본으로 실제로 재생된다
  void context;
});

test("목록: 영상이 있는 종목은 정지 사진을 그린다", async ({ page }) => {
  await page.goto("/exercises");
  const thumb = page.locator('img[src^="/motion/"][src$=".webp"]').first();
  await expect(thumb).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => thumb.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0))
    .toBe(true);
});
