// 브라우저 탭 아이콘 — link 태그가 없으면 탭에 지구 모양이 나온다(2026-11-06 사용자 신고)
import { expect, test } from "@playwright/test";

test("탭 아이콘 link 가 있고 주소마다 PNG 를 돌려준다", async ({ page, request }) => {
  await page.goto("/");
  const hrefs = await page
    .locator('link[rel="icon"]')
    .evaluateAll((links) => links.map((l) => l.getAttribute("href") ?? ""));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    const res = await request.get(href);
    expect(res.status(), href).toBe(200);
    expect(res.headers()["content-type"], href).toContain("image/png");
  }
});
