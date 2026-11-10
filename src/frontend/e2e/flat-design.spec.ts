// SPEC-056 평평한 기록지 가드 — 화면 안에 「둥근 + 3면 이상 테두리」 상자가 다시 생기지 않게, 빨강 채움은 하나, 완료 줄은 채우지 않게, 360px 넘침 없음.
//   라이트·다크 두 번. 예외: 시트·확인창(role=dialog)·고정/붙는 막대(fixed·sticky 조상)·data-card=boxed(고르는 칸)·알약(둥근 정도 ≥ 높이/2)·
//   누르는 컨트롤(button·a·input·textarea·select·label — 경계가 뜻을 가짐)·알림 띠(role=alert·status)·그림(img·svg·canvas·video).
import { expect, type Page, test } from "@playwright/test";
import {
  빠른_운동_시작,
  세트_기록,
  안내_띠_닫기,
  카탈로그_준비,
  종목_추가,
  마치기,
} from "./fixtures/declutter-seed";

test.use({ viewport: { width: 360, height: 780 }, locale: "ko-KR" });

/** 화면 안의 상자 — 허용 목록 밖에서 둥근 모서리 + 테두리 3면 이상인 보이는 요소 */
async function boxes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const allowed = (el: Element): boolean => {
      for (let p: Element | null = el; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.position === "fixed" || cs.position === "sticky") return true;
        if (p.matches('[role="dialog"],[role="alert"],[role="status"],[data-card="boxed"]')) return true;
        if (p.matches("button,a,input,textarea,select,label,img,svg,canvas,video")) return true;
      }
      return false;
    };
    const out: string[] = [];
    for (const el of document.querySelectorAll("main *")) {
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 24) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
      const radius = Number.parseFloat(cs.borderTopLeftRadius) || 0;
      if (radius <= 0 || radius >= r.height / 2) continue;
      const sides = [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].filter(
        (w) => Number.parseFloat(w) > 0,
      ).length;
      if (sides < 3) continue;
      if (allowed(el)) continue;
      out.push(
        `${el.tagName.toLowerCase()}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""} "${(el.textContent ?? "").trim().slice(0, 24)}"`,
      );
    }
    return out;
  });
}

/** main 안 바탕이 브랜드색인 보이는 버튼·링크(셸 막대·탭바 제외) — home-primary.spec.ts 와 같은 셈 */
async function filledBrand(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-brand)";
    document.body.appendChild(probe);
    const brand = getComputedStyle(probe).color;
    probe.remove();
    const shell = (el: Element) =>
      el.closest('[data-testid="shell-nav"]') || el.closest('[data-testid="global-workout-bar"]');
    return [...document.querySelectorAll("main button, main a")]
      .filter((el) => {
        if (shell(el)) return false;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        return getComputedStyle(el).backgroundColor === brand;
      })
      .map((el) => el.getAttribute("data-testid") ?? el.textContent?.trim() ?? "?");
  });
}

async function noOverflow(page: Page) {
  const o = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(o.sw, "가로 넘침").toBeLessThanOrEqual(o.cw);
}

for (const scheme of ["light", "dark"] as const) {
  test(`평평한 기록지 가드 — ${scheme}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ colorScheme: scheme });
    await 카탈로그_준비(page);
    await page.evaluate((s) => document.documentElement.setAttribute("data-theme", s), scheme);

    // 운동 중 — 완료 세트 줄은 채우지 않는다(F6) · 상자 없음 · 빨강 채움 「완료」 하나
    await 빠른_운동_시작(page);
    await 종목_추가(page, "바벨 벤치프레스");
    await 안내_띠_닫기(page);
    await 세트_기록(page, 0, 0, 60, 8);
    await page.waitForTimeout(500);
    const doneBg = await page
      .locator('[data-testid^="set-"]')
      .filter({ has: page.locator('[data-testid="set-more"]') })
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(doneBg, "완료 세트 줄 바탕은 투명").toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    expect(await boxes(page), "운동 중 화면 안 상자").toEqual([]);
    expect((await filledBrand(page)).length, "운동 중 빨강 채움").toBeLessThanOrEqual(1);
    await noOverflow(page);
    await 마치기(page);

    for (const route of ["/", "/calendar", "/stats", "/profile", "/exercises"]) {
      await page.goto(route);
      await page.evaluate((s) => document.documentElement.setAttribute("data-theme", s), scheme);
      await page.waitForTimeout(1500);
      expect(await boxes(page), `${route} 화면 안 상자`).toEqual([]);
      expect((await filledBrand(page)).length, `${route} 빨강 채움`).toBeLessThanOrEqual(1);
      await noOverflow(page);
    }
  });
}
