// 화면 지도 #T17(S-163 y.404 · S-168 y.apk404) — 「없는 화면」은 사과하는 자연어 화면이다
//
// 확인하는 것:
//   · 없는 주소 · 없는 종목 id · 없는 /downloads/x.apk — 상태 404 그대로
//   · 「404」「not found」「This page could not be found」 같은 개발자 글자가 안 보이고 자연어 제목·버튼이 보인다
//   · 종목은 종목 문구(「이 종목을 찾을 수 없어요」) + 종목 목록 버튼
//   · /downloads 는 text/html · attachment 없음 · no-store(.apk 로 저장되지 않게 · M-1)
//   · 360px 에서 가로 넘침 없음 · 다크에서도 글자가 바탕과 다른 색
import { expect, type Page, test } from "@playwright/test";

const 개발자글자 = /\b404\b|not found|could not be found/i;

async function 넘침없음(page: Page) {
  const w = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(w.sw).toBeLessThanOrEqual(w.cw);
}

test.use({ viewport: { width: 360, height: 740 }, locale: "ko-KR" });

test("없는 주소 — 404 · 「죄송해요. 찾는 화면이 없어요」 · 운동 홈 / 뒤로 가기", async ({ page }) => {
  await page.goto("/exercises");
  const res = await page.goto("/no-such-page-t17");
  expect(res?.status()).toBe(404);
  const box = page.getByTestId("not-found");
  await expect(box).toContainText("죄송해요. 찾는 화면이 없어요");
  await expect(page.getByTestId("not-found-home")).toHaveText("운동 홈으로");
  await expect(page.getByTestId("not-found-back")).toHaveText("뒤로 가기");
  await expect(page.locator("body")).not.toContainText(개발자글자);
  await 넘침없음(page);
  // 뒤로 가기 = 들어오기 전 화면
  await page.getByTestId("not-found-back").click();
  await expect(page).toHaveURL(/\/exercises$/);
});

test("링크로 바로 연 없는 주소 — 뒤로 가기는 운동 홈으로", async ({ page }) => {
  await page.goto("/no-such-page-t17b");
  await page.getByTestId("not-found-back").click();
  await expect(page).toHaveURL(/\/$/);
});

test("없는 종목 id — 404 · 종목 문구 · 종목 목록 버튼", async ({ page }) => {
  const res = await page.goto("/exercise/seed-does-not-exist-t17");
  expect(res?.status()).toBe(404);
  await expect(page.getByTestId("not-found")).toContainText("이 종목을 찾을 수 없어요");
  await expect(page.getByTestId("not-found-home")).toHaveText("종목 목록으로");
  await expect(page.getByTestId("not-found-home")).toHaveAttribute("href", "/exercises");
  await expect(page.locator("body")).not.toContainText(개발자글자);
  await 넘침없음(page);
});

test("모양이 틀린 종목 id(한글 · 129자) — 500 오류가 아니라 같은 404 종목 화면", async ({ page }) => {
  for (const id of [encodeURIComponent("ㅋ없는종목"), "a".repeat(129)]) {
    const res = await page.goto(`/exercise/${id}`);
    expect(res?.status()).toBe(404);
    await expect(page.getByTestId("not-found")).toContainText("이 종목을 찾을 수 없어요");
  }
});

test("없는 /downloads/x.apk — 404 · 자연어 HTML · 저장되지 않음 · 360px · 다크", async ({
  page,
  request,
}) => {
  const r = await request.get("/downloads/liftgram-9.9.9-1-deadbeef.apk");
  expect(r.status()).toBe(404);
  expect(r.headers()["content-type"]).toContain("text/html");
  expect(r.headers()["content-disposition"]).toBeUndefined();
  expect(r.headers()["cache-control"]).toContain("no-store");
  const h = await request.head("/downloads/liftgram-9.9.9-1-deadbeef.apk");
  expect(h.status()).toBe(404);
  expect(h.headers()["content-type"]).toContain("text/html");
  expect(Number(h.headers()["content-length"])).toBeGreaterThan(0);
  expect((await h.body()).length).toBe(0);

  await page.emulateMedia({ colorScheme: "dark" });
  // 저장(download)이 아니라 화면으로 열린다 — goto 가 download 로 끝나면 여기서 실패한다
  const res = await page.goto("/downloads/liftgram-9.9.9-1-deadbeef.apk");
  expect(res?.status()).toBe(404);
  const box = page.getByTestId("download-missing");
  await expect(box).toContainText("죄송해요. 이 설치 파일을 찾을 수 없어요");
  await expect(page.getByTestId("download-missing-app")).toHaveAttribute("href", "/app");
  await expect(page.getByTestId("download-missing-home")).toHaveAttribute("href", "/");
  await expect(page.locator("body")).not.toContainText(개발자글자);
  await 넘침없음(page);
  const c = await page.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    ink: getComputedStyle(document.querySelector("h1") as Element).color,
  }));
  expect(c.bg).toBe("rgb(22, 22, 22)");
  expect(c.ink).not.toBe(c.bg);
});

test("영어 브라우저여도 — 앱과 같이 한국어 자연어(앱이 ko 고정인 동안)", async ({ request }) => {
  const r = await request.get("/downloads/nope.apk", { headers: { "accept-language": "en-US,en;q=0.9" } });
  expect(r.status()).toBe(404);
  const html = await r.text();
  expect(html).toContain("죄송해요. 이 설치 파일을 찾을 수 없어요");
  expect(html).not.toMatch(/\b404\b|not found/i);
});
