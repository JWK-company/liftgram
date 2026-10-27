// 화면 정리 P1 — 운동 블록 측정(SRS-069 수용 기준). 보고서 기준선: 360×640 첫 세트 체크 top 486px · 블록 머리 칩 9 · 빨강 7곳.
//
// 여기서 재는 것(좌표·계산 스타일):
//   · 첫 블록 첫 세트 체크 버튼 top — 360×640 ≤ 320 · 390×844 ≤ 300
//   · 블록 머리(세트 표 위)에 브랜드 빨강 테두리·글자 0
//   · 순서 화살표와 픽토그램이 겹치지 않는다(F3)
//   · 부가 행동(운동 방법·다른 조합·이전기록 지우기)은 「더 보기」를 펴면 나오고, 편 상태를 기억한다
import { expect, test } from "@playwright/test";
import { 블록, 붐비는_운동_화면, 지난_기록_채우기, 카탈로그_준비 } from "./fixtures/declutter-seed";
import { 블록_더보기 } from "./helpers/block";

type Page = import("@playwright/test").Page;

async function 첫세트_체크_top(page: Page): Promise<number> {
  const btn = page.getByTestId("set-list").first().locator("> div").first().getByTestId("set-done");
  await expect(btn).toBeVisible({ timeout: 15_000 });
  const box = await btn.boundingBox();
  return box ? Math.round(box.y) : 9999;
}

/** 블록 머리(세트 표 앞까지)에서 브랜드 빨강 테두리·글자를 쓰는 요소 수 */
async function 머리_빨강_수(page: Page): Promise<{ border: number; text: number; where: string[] }> {
  return 블록(page, 0).evaluate((card) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-brand)";
    document.body.appendChild(probe);
    const brand = getComputedStyle(probe).color;
    probe.remove();
    const setList = card.querySelector('[data-testid="set-list"]');
    const where: string[] = [];
    let border = 0;
    let text = 0;
    for (const el of Array.from(card.querySelectorAll<HTMLElement>("*"))) {
      if (setList && (el === setList || setList.contains(el))) continue;
      // 세트 표 뒤(세트 추가·메모)는 머리가 아니다
      if (setList && setList.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const sides = ["Top", "Right", "Bottom", "Left"] as const;
      if (
        sides.some(
          (s) =>
            Number.parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) > 0 &&
            cs.getPropertyValue(`border-${s.toLowerCase()}-color`) === brand,
        )
      ) {
        border += 1;
        where.push(`border:${el.dataset.testid ?? el.tagName}`);
      }
      const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim());
      if (ownText && cs.color === brand) {
        text += 1;
        where.push(`text:${el.dataset.testid ?? el.textContent?.slice(0, 12)}`);
      }
    }
    return { border, text, where };
  });
}

async function 겹침(page: Page): Promise<number> {
  const card = 블록(page, 0);
  const picto = await card.getByTestId("we-picto").boundingBox();
  const arrows = await card.getByRole("button", { name: "위로 이동" }).boundingBox();
  const down = await card.getByRole("button", { name: "아래로 이동" }).boundingBox();
  if (!picto || !arrows || !down) return -1;
  const inter = (a: typeof picto, b: typeof picto) => {
    const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  };
  return Math.round(inter(picto, arrows) + inter(picto, down));
}

test("운동 블록 — 첫 세트 체크까지 짧고, 머리에 빨강이 없고, 화살표가 그림과 겹치지 않는다", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await 지난_기록_채우기(page);
  await 붐비는_운동_화면(page);

  const top390 = await 첫세트_체크_top(page);
  const red = await 머리_빨강_수(page);
  const overlap = await 겹침(page);

  await page.setViewportSize({ width: 360, height: 640 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const top360 = await 첫세트_체크_top(page);

  console.log(JSON.stringify({ top360, top390, red, overlap }));
  expect(top360, "360×640 첫 세트 체크 top").toBeLessThanOrEqual(320);
  expect(top390, "390×844 첫 세트 체크 top").toBeLessThanOrEqual(300);
  expect(red.border, `머리 빨강 테두리 ${red.where.join(",")}`).toBe(0);
  expect(red.text, `머리 빨강 글자 ${red.where.join(",")}`).toBe(0);
  expect(overlap, "화살표·픽토그램 겹침 넓이").toBe(0);
});

test("운동 블록 — 부가 행동은 「더 보기」 안에 있고, 편 상태를 기억한다", async ({ page }) => {
  test.setTimeout(240_000);
  await 카탈로그_준비(page);
  await 지난_기록_채우기(page);
  await 붐비는_운동_화면(page);

  const card = 블록(page, 0);
  // 접힌 처음에는 부가 행동이 보이지 않는다
  await expect(card.getByTestId("block-more")).toHaveAttribute("aria-expanded", "false");
  await expect(card.getByTestId("btn-other-slots")).toBeHidden();
  await expect(card.getByTestId("tip-toggle")).toBeHidden();

  await 블록_더보기(page, card);
  await expect(card.getByTestId("btn-other-slots")).toBeVisible();
  await expect(card.getByTestId("tip-toggle")).toBeVisible();
  await expect(card.getByTestId("prev-clear")).toBeVisible();

  // 기억 — 다시 열어도 펼쳐져 있다(전역 하나 · /qa spec Q6)
  await page.reload();
  await expect(블록(page, 0).getByTestId("block-more")).toHaveAttribute("aria-expanded", "true", {
    timeout: 20_000,
  });
  await expect(블록(page, 0).getByTestId("btn-other-slots")).toBeVisible();
});

test("운동 블록 — PR 은 금색 글자 한 줄, 누르면 안 한 첫 세트에 채우고 ⓘ 는 기록으로", async ({ page }) => {
  test.setTimeout(240_000);
  await 카탈로그_준비(page);
  await 지난_기록_채우기(page);
  await 붐비는_운동_화면(page);

  const card = 블록(page, 0);
  const pr = card.getByTestId("pr-chip-both");
  await expect(pr).toContainText("35", { timeout: 15_000 });
  // 테두리 상자가 아니다(글자) · 누르는 자리는 32px 이상
  const s = await pr.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bw: cs.borderTopWidth, h: el.getBoundingClientRect().height };
  });
  expect(s.bw).toBe("0px");
  expect(s.h).toBeGreaterThanOrEqual(32);
  await pr.click();
  await expect(card.getByTestId("set-list").locator("> div").first().getByTestId("set-weight")).toHaveValue(
    "35",
  );
  await card.getByTestId("pr-chip-both-history").click();
  await expect(page).toHaveURL(/\/history\//, { timeout: 15_000 });
});
