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
          // [원본] [data-affordance] — 단추 자신의 box 표시로도 통과했다 → 값을 셋으로 한정(리뷰 L-2)
          '[role="switch"],[role="tab"],[aria-pressed],[data-affordance="cell"],[data-affordance="text"],[data-affordance="tile"],:disabled,[aria-disabled="true"]',
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
    // [원본] "main button, [role='dialog'] button, main a[role='button']" — 글자만 있는 링크(「프로필 열기」 등)를 못 봤다(사용자 지시 2650)
    // 시트는 main 밖(portal)이라 시트 안 링크도 따로(리뷰 H-1)
    const scope = [
      ...document.querySelectorAll("main button, [role='dialog'] button, main a, [role='dialog'] a"),
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
      // 프로필 사진(아바타)이 앞에 있는 이름 줄 — 「사진 + 이름 = 그 사람 프로필」은 흔히 알아보는 모양(피드 글쓴이 등 · 전체 시험에서 잡힘)
      if (el.querySelector('[data-shape="round"], img.rounded-full')) continue;
      const iconish = el.querySelector("svg, img") || /[›‹▾▴▶✕×＋+✓⋯]/.test(text);
      // [원본] if (iconish && !el.matches("[data-variant='quiet']")) continue; — 아이콘만 붙으면 통과라 「▶ 시작」·「이 루틴 시작」이
      //   다크에서 글자처럼 보이는데도 걸리지 않았다(사용자 지시 2650).
      // [개선] 아이콘을 인정하는 곳은 셋뿐: ① 줄(폭 60% 이상 — 목록 줄·꺾쇠 줄) ② 꺾쇠로 끝나는 것(›·chevron — 이동·시트 열기 SPEC-061 3A)
      //   ③ 글자가 아이콘 기호뿐인 것. 그 밖의 「아이콘 + 글자」는 상자·밑줄이 있어야 한다.
      const row = r.width >= window.innerWidth * 0.6;
      const onlyIcons = !text.replace(/[›‹▾▴▶✕×＋+✓⋯\s]/g, "");
      // 꺾쇠는 마지막 아이콘이 이동 꺾쇠(›·‹)일 때만 — 접고 펴는 chevron-up/down 은 꺾쇠로 치지 않는다(리뷰 M-1)
      //   (주제 칸처럼 제목 바로 뒤에 붙고 아래 줄이 더 있는 칸도 있어 위치로는 가르지 않는다)
      const icons = [...el.querySelectorAll("svg[data-icon]")];
      const lastIcon = icons[icons.length - 1];
      const iconAtEnd =
        !!lastIcon &&
        /^chevron-(forward|back)$|^arrow-back$/.test(lastIcon.getAttribute("data-icon") ?? "");
      const chevron = /[›‹▾]\s*$|^\s*‹/.test(text) || iconAtEnd;
      if (iconish && (row || chevron || onlyIcons)) continue;
      // [원본] if (el.tagName === "A" && (row || chevron)) continue; — 넓은 글자만 있는 링크가 통과했다(리뷰 H-2)
      // 금색 PR — 글자색은 대개 안쪽 글자 조각에 있다(REV-150 5c)
      if (cs.color === pr || [...el.querySelectorAll("*")].some((c) => getComputedStyle(c).color === pr))
        continue;
      out.push(`${el.getAttribute("data-testid") ?? el.tagName.toLowerCase()} "${text.slice(0, 24)}"`);
    }
    return out;
  });
}

/** 루틴 하나(폴더가 있으면 그 폴더에) — 놓친 루틴·오늘 카드·폴더 줄을 화면에 띄우려고(사용자 지시 2650) */
async function 루틴_만들기(page: Page, 이름: string, folder?: string) {
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await page.getByTestId("routine-name").fill(이름);
  await page.getByTestId("routine-name").blur();
  if (folder) {
    await page.getByTestId("routine-folder").fill(folder);
    await page.getByTestId("routine-folder").blur();
  }
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  await expect(page.getByTestId("routine-exercises").locator("> div")).toHaveCount(1, { timeout: 20_000 });
  await page.getByTestId("btn-routine-done").click();
  await expect(page.getByText(folder ?? 이름).first()).toBeVisible({ timeout: 20_000 });
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

    // 조건이 있어야 뜨는 카드 — 오늘 루틴·놓친 루틴(어제 배정)·폴더(사용자 지시 2650: 놓친 루틴 「이 루틴 시작」을 못 봤다)
    await 루틴_만들기(page, "오늘루틴");
    await 루틴_만들기(page, "어제루틴");
    await 루틴_만들기(page, "폴더루틴", "상체");
    await page.goto("/");
    await page.getByTestId("entry-schedule").click();
    await expect(page.getByTestId("schedule-editor")).toBeVisible({ timeout: 20_000 });
    const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const d = new Date().getDay();
    await page.getByTestId(`schedule-day-${keys[d]}`).click();
    await page.getByTestId("schedule-day-picker").getByText("오늘루틴").click();
    await page.getByTestId(`schedule-day-${keys[(d + 6) % 7]}`).click();
    await page.getByTestId("schedule-day-picker").getByText("어제루틴").click();
    await page.getByTestId("schedule-save").click();
    await expect(page.getByTestId("schedule-editor")).toHaveCount(0, { timeout: 20_000 });
    await page.goto("/");
    await expect(page.getByTestId("catchup-card")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("folder-toggle").first().click();
    await expect(page.getByTestId("btn-start-folder-routine").first()).toBeVisible();
    await page.waitForTimeout(500);
    await page.mouse.move(0, 0);
    expect(await bare(page), "홈(오늘·놓친 루틴·폴더)의 글자만 있는 단추").toEqual([]);

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
      "/stats/summary",
      "/routines/import",
      "/program",
      "/discover",
      "/gyms",
      "/bookmarks",
      "/account",
      "/awards",
      "/app",
      "/reset?token=e2e-bad",
      "/verify-email?token=e2e-bad",
    ]) {
      await page.goto(route);
      await page.waitForTimeout(1500);
      await page.mouse.move(0, 0);
      expect(await bare(page), `${route} 글자만 있는 단추`).toEqual([]);
    }

    // 로그인해야 보이는 화면(사용자 지시 2650)
    await page.goto("/account");
    await page.getByTestId("mode-signup").click();
    await page.getByTestId("auth-email-input").fill(`e2e-btn-${scheme}-${Date.now()}@example.com`);
    await page.getByTestId("auth-password-input").fill("hunter22!");
    await page.getByTestId("auth-name-input").fill("단추검사");
    await page.getByTestId("age-confirm").check();
    await page.getByTestId("btn-auth-submit").click();
    await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
    for (const route of [
      "/account",
      "/feed",
      "/people",
      "/messages",
      "/messages/new",
      "/notifications",
      "/coaching",
      "/coaching/join",
      "/profile",
      "/profile/feedback",
      "/awards",
    ]) {
      await page.goto(route);
      await page.waitForTimeout(1500);
      await page.mouse.move(0, 0);
      expect(await bare(page), `${route}(로그인) 글자만 있는 단추`).toEqual([]);
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
        '<button type="button" data-testid="canary-box" style="border:1px solid #747474">상자</button>' +
        '<button type="button" data-testid="canary-play">▶ 시작</button>' +
        '<a href="#" data-testid="canary-link">프로필 열기</a>' +
        '<a href="#" data-testid="canary-wide" style="display:block">돌아가기</a>' +
        '<button type="button" data-testid="canary-mid">펼치기 <svg data-icon="chevron-down" width="8" height="8"></svg></button>';
      main.prepend(box);
    });
    const found = await bare(page);
    expect(found.some((x) => x.startsWith("canary-bare"))).toBe(true);
    expect(
      found.some((x) => x.startsWith("canary-chip")),
      "안쪽 칩만으로는 통과하지 않는다",
    ).toBe(true);
    expect(found.some((x) => x.startsWith("canary-ul") || x.startsWith("canary-box"))).toBe(false);
    // 아이콘이 붙은 글자 단추·글자만 있는 링크도 잡는다(사용자 지시 2650)
    expect(found.some((x) => x.startsWith("canary-play"))).toBe(true);
    expect(found.some((x) => x.startsWith("canary-link"))).toBe(true);
    // 넓은 글자만 있는 링크 · 접고 펴는 ▾ 아이콘만 있는 단추도 잡는다(리뷰 H-2 · M-1)
    expect(found.some((x) => x.startsWith("canary-wide"))).toBe(true);
    expect(found.some((x) => x.startsWith("canary-mid"))).toBe(true);
  });
