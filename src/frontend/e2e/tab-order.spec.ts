// 탭 순서(2026-11-10 사용자 지시): 피드 → 운동 → 기록 → 분석 → 프로필 — 좁은 화면(아래 막대)·넓은 화면(세로 막대) 모두
import { expect, test } from "@playwright/test";

const ORDER = ["nav-feed", "nav-workout", "nav-history", "nav-stats", "nav-profile"];

for (const vp of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test(`탭 순서 피드·운동·기록·분석·프로필 · ${vp.width}px`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/");
    const nav = page.locator('[data-testid="shell-nav"]:visible').first();
    await expect(nav).toBeVisible({ timeout: 20_000 });
    const ids = await nav
      .locator('[data-testid^="nav-"]')
      .evaluateAll((els) =>
        els
          .map((e) => e.getAttribute("data-testid"))
          .filter((id): id is string => !!id && !id.endsWith("-dot")),
      );
    expect(ids).toEqual(ORDER);
    // 보이는 자리도 그 순서 — 좁은 화면은 왼쪽→오른쪽, 넓은 화면(세로 막대)은 위→아래
    const boxes = [];
    for (const id of ORDER) {
      const b = await nav.getByTestId(id).boundingBox();
      if (!b) throw new Error(`${id} 가 화면에 없음`);
      boxes.push(b);
    }
    const wide = vp.width >= 1024;
    for (let i = 1; i < boxes.length; i++) {
      if (wide) expect(boxes[i].y).toBeGreaterThan(boxes[i - 1].y);
      else expect(boxes[i].x).toBeGreaterThan(boxes[i - 1].x);
    }
    // 운동 탭은 여전히 첫 화면(/)이 켠다
    await expect(nav.getByTestId("nav-workout")).toHaveAttribute("aria-current", "page");
  });
}
