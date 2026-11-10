// #T18 — 「다른 곳을 누름」 시험용: 눌러도 아무 일도 없는 빈 곳 하나를 고른다.
// 버튼·링크·입력·라벨·role·tabindex 와 손가락 모양(cursor:pointer — onClick 이 있는 div 등)인 곳은 뺀다(REV-109 #9).
import { expect, type Page } from "@playwright/test";

export async function 빈곳(page: Page): Promise<{ x: number; y: number }> {
  const p = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const h = window.innerHeight;
    for (let y = Math.round(h * 0.15); y < h - 40; y += 17)
      for (let x = 6; x < w - 6; x += 23) {
        const el = document.elementFromPoint(x, y);
        if (!el || el === document.documentElement || el === document.body) continue;
        if (
          el.closest(
            'button, a, input, textarea, select, label, summary, [role], [tabindex], [contenteditable="true"]',
          )
        )
          continue;
        let cur: Element | null = el;
        let pointer = false;
        while (cur && cur !== document.body) {
          if (getComputedStyle(cur).cursor === "pointer") pointer = true;
          cur = cur.parentElement;
        }
        if (pointer) continue;
        return { x, y };
      }
    return null;
  });
  expect(p, "누를 빈 곳이 없다").not.toBeNull();
  return p as { x: number; y: number };
}

/** 빈 곳을 한 번 누른다(누른 뒤 주소가 그대로인지는 부르는 쪽이 본다) */
export async function 빈곳_누르기(page: Page): Promise<void> {
  const p = await 빈곳(page);
  await page.mouse.click(p.x, p.y);
}
