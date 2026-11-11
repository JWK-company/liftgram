// SPEC-061 단추 알아보기 가드 — 「누르는 것」이 안내 글과 모양으로 갈리는지 라이트·다크 두 번 본다.
//   보이는 <button>(시트·확인창 안 포함) 중 글자가 있는데 테두리·바탕·밑줄·아이콘·꺾쇠 글자가 모두 없는 것을 모은다 → 0개여야 한다.
//   빼는 것: 셸 막대·탭바, 스위치(role=switch)·탭(role=tab · tablist 안)·켜고 끄는 칩(aria-pressed), 세트 표의 값 칸(data-affordance="cell"),
//   관례로 글자만 두는 곳(data-affordance="text" — 댓글 「답글」 등), 금색 PR 글자(색이 신호).
//   quiet·ghost 단추는 아이콘이 있어도 테두리가 있어야 한다(REV-149 8).
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

/** 단추로 안 보이는 단추 — 「testid "글자"」 목록 */
async function bare(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-pr)";
    document.body.appendChild(probe);
    const pr = getComputedStyle(probe).color;
    probe.remove();
    // 투명 — rgba(…, 0) · transparent · 슬래시 표기(oklab(… / 0)) 모두(REV-150 5f)
    const clear = (c: string) => /rgba\([^)]*,\s*0\)|transparent|\/\s*0\)/.test(c);
    const seen = (w: string, c: string) => Number.parseFloat(w) > 0 && !clear(c);
    const skip = (el: Element): boolean => {
      if (el.closest('[data-testid="shell-nav"],[data-testid="global-workout-bar"],[role="tablist"]'))
        return true;
      if (
        el.matches(
          '[role="switch"],[role="tab"],[aria-pressed],[data-affordance],:disabled,[aria-disabled="true"]',
        )
      )
        return true;
      if (el.querySelector('[role="switch"]')) return true; // 스위치가 붙은 줄 — 스위치가 단추다(REV-149 5)
      if (/^day-\d+$/.test(el.getAttribute("data-testid") ?? "")) return true; // 달력 날짜 칸
      if (el.closest('[data-affordance="cell"],[data-affordance="text"]')) return true;
      return false;
    };
    // 바탕이 둘레와 다른가 — 위로 올라가며 처음 만난 불투명 바탕과 비교
    const ownFill = (el: Element): boolean => {
      const bg = getComputedStyle(el).backgroundColor;
      if (clear(bg)) return false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const pb = getComputedStyle(p).backgroundColor;
        if (!clear(pb)) return pb !== bg;
      }
      return true;
    };
    const decorated = (el: Element): boolean => {
      const cs = getComputedStyle(el);
      const sides = [
        seen(cs.borderTopWidth, cs.borderTopColor),
        seen(cs.borderRightWidth, cs.borderRightColor),
        seen(cs.borderBottomWidth, cs.borderBottomColor),
        seen(cs.borderLeftWidth, cs.borderLeftColor),
      ].filter(Boolean).length;
      if (sides >= 3 || ownFill(el)) return true;
      // 안쪽 조각 — 밑줄, 또는 단추 모양이라고 표시한 조각(data-affordance=box · 값 칩 얼굴)만 인정한다.
      // 아무 자손의 테두리·바탕(오늘 칩·태그 등)으로 맨 글자 단추가 통과하지 않게(REV-150 5a)
      for (const c of el.querySelectorAll("*")) {
        const s = getComputedStyle(c);
        if (s.textDecorationLine.includes("underline")) return true;
        if (!c.matches('[data-affordance="box"],[data-chip-face]')) continue;
        const cs2 = [
          seen(s.borderTopWidth, s.borderTopColor),
          seen(s.borderBottomWidth, s.borderBottomColor),
          seen(s.borderLeftWidth, s.borderLeftColor),
          seen(s.borderRightWidth, s.borderRightColor),
        ].filter(Boolean).length;
        if (cs2 >= 3 || ownFill(c)) return true;
      }
      return cs.textDecorationLine.includes("underline");
    };
    const out: string[] = [];
    const scope = [
      ...document.querySelectorAll("main button, [role='dialog'] button, main a[role='button']"),
    ];
    for (const el of scope) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
      if (skip(el)) continue;
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!text) continue; // 아이콘 단추
      if (/^[–-]$/.test(text)) continue; // 값이 없는 칸(「–」 — 세트 표의 이전 기록 없음)
      if (decorated(el)) continue;
      const iconish = el.querySelector("svg, img") || /[›‹▾▴▶✕×＋+✓⋯]/.test(text);
      // quiet·ghost 처럼 상자가 있어야 하는 공용 단추(data-variant)는 아이콘이 있어도 통과 못 한다
      // ghost 는 판 없는 빨강 글자 + ▶ 아이콘으로 둔다(REV-149 14)
      if (iconish && !el.matches("[data-variant='quiet']")) continue;
      // 금색 PR — 글자색은 대개 안쪽 글자 조각에 있다(REV-150 5c)
      if (cs.color === pr || [...el.querySelectorAll("*")].some((c) => getComputedStyle(c).color === pr))
        continue;
      out.push(`${el.getAttribute("data-testid") ?? el.tagName.toLowerCase()} "${text.slice(0, 24)}"`);
    }
    return out;
  });
}

for (const scheme of ["light", "dark"] as const) {
  test(`단추 알아보기 가드 — ${scheme}`, async ({ page }) => {
    test.setTimeout(240_000);
    // 다크는 실제 테마 설정으로 — dark: 변형은 data-theme 일 때만 켜진다(REV-149 7). 그림 전에 layout 의 THEME_INIT 이 읽는다
    await page.addInitScript((v) => {
      try {
        localStorage.setItem("liftgram.theme", v);
      } catch {}
    }, scheme);
    await page.emulateMedia({ colorScheme: scheme });
    await 카탈로그_준비(page);

    await 빠른_운동_시작(page);
    await 종목_추가(page, "바벨 벤치프레스");
    await 안내_띠_닫기(page);
    await 세트_기록(page, 0, 0, 60, 8);
    await page.waitForTimeout(500);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe(scheme === "dark" ? "rgb(22, 22, 22)" : "rgb(255, 255, 255)");
    await page.mouse.move(0, 0); // hover 바탕을 「단추 모양」으로 착각하지 않게(REV-149 6)
    expect(await bare(page), "운동 중 화면의 글자만 있는 단추").toEqual([]);
    await 마치기(page);

    // flat-design 가드와 같은 화면 목록(REV-149 2)
    for (const route of [
      "/",
      "/calendar",
      "/stats",
      "/profile",
      "/exercises",
      "/gear",
      "/history",
      "/routines/new",
      "/feed",
      "/people",
      "/messages",
      "/notifications",
      "/explore",
    ]) {
      await page.goto(route);
      await page.waitForTimeout(1500);
      await page.mouse.move(0, 0);
      expect(await bare(page), `${route} 글자만 있는 단추`).toEqual([]);
    }
  });
}

// 가드가 실제로 잡는지(카나리아 · REV-149 6) — 맨 글자 단추는 잡고, 안쪽 밑줄·테두리 상자는 통과
for (const scheme of ["light", "dark"] as const)
  test(`단추 알아보기 가드 — 카나리아 ${scheme}`, async ({ page }) => {
    await page.addInitScript((v) => {
      try {
        localStorage.setItem("liftgram.theme", v);
      } catch {}
    }, scheme);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");
    await page.evaluate(() => {
      const main = document.querySelector("main") ?? document.body;
      const box = document.createElement("div");
      box.innerHTML =
        '<button type="button" data-testid="canary-bare">맨 글자</button>' +
        '<button type="button" data-testid="canary-ul"><span style="text-decoration:underline">밑줄</span></button>' +
        '<button type="button" data-testid="canary-chip">글자 <span style="border:1px solid #747474;padding:2px">오늘</span></button>' +
        '<button type="button" data-testid="canary-box" style="border:1px solid #747474">상자</button>';
      main.prepend(box);
    });
    const found = await bare(page);
    expect(found.some((x) => x.startsWith("canary-bare"))).toBe(true);
    expect(
      found.some((x) => x.startsWith("canary-chip")),
      "안쪽 칩만으로는 통과하지 않는다",
    ).toBe(true);
    expect(found.some((x) => x.startsWith("canary-ul") || x.startsWith("canary-box"))).toBe(false);
  });
