// SPEC-057 모양 통일 가드 — 누르는 것은 4px(R1) · 원은 원인 것만(R3) · 고른 칩은 바탕 채움 없음(R1b) · 잘림·겹침 없음.
//   SPEC-056 가드(flat-design.spec.ts)와 따로 둔다 — 장면마다 시험을 나눠 시간 제한(240초)을 넘지 않게(REV-128 A15).
//
//   G1 모서리: 훑는 범위 main · 열린 [role=dialog] · 전역 운동 막대. 대상 = 누르는 것(button·a·label·role=button|radio|tab|checkbox|option)과
//      그 자손 중 **보이는 판**(바탕 불투명 또는 보이는 테두리)을 가지고 **보이는 글자**(1px 로 잘린 sr-only 글자 제외)가 있는 요소.
//      모서리는 자기와 「누르는 것 안의 잘라 내는 조상(overflow ≠ visible)」 중 큰 값. r > 4.5px 이면 실패(알약은 늘 여기 걸린다).
//      글자 없는 판(아이콘 원형 버튼·스위치 트랙·점)은 대상 밖. data-shape="round" 는 가로·세로 차 ≤ 2px,
//      data-shape="badge"(숫자 배지)는 높이 ≤ 22px · 폭 ≤ 높이×2 일 때만 인정(역검사 · 탈출구 남용 방지 · REV-129).
//   G2 면: 고른 칩([aria-pressed|checked|selected=true])과 그 자손의 바탕이 brand-muted 가 아니다(선택은 테두리로 · R1b).
//   G4 잘림·겹침·넘침: 글자 있는 누르는 것과 그 자손이 잘리지 않고(말줄임은 허용 — 긴 종목 이름), 화면 가로 밖으로 나가지 않고,
//      화면 안 중심점이 자기(또는 자손)에 닿는다. 떠 있는 막대에 가리면 가운데로 굴려 다시 잰다.
//   ALLOW: 아직 고치지 않은 요소의 testId(자기 것, 없으면 그 누르는 것의 것) 정규식 — 단계마다 줄여 Phase 4 끝에 0.
import { expect, type Page, test } from "@playwright/test";
import {
  빠른_운동_시작,
  세트_기록,
  안내_띠_닫기,
  카탈로그_준비,
  종목_추가,
  마치기,
  지난_기록_채우기,
} from "./fixtures/declutter-seed";

test.use({ viewport: { width: 360, height: 780 }, locale: "ko-KR" });

/** 아직 고치지 않은 곳 — testId 정규식. Phase 2~4 에서 파일을 고칠 때마다 지운다(REV-129: 가드별·자기 testId 만). */
const ALLOW = {
  // [원본] Phase 3 몫 — btn-complete · btn-discard · btn-rest-setting · btn-note-open · global-workout-bar · global-workout-cancel
  //        · schedule-block- · today-chip · btn-wizard · scheme-chip → SPEC-057 Phase 3 에서 고쳐 뺐다
  // [원본] Phase 4 몫 — day-\d+ · btn-brag-month(CalendarClient) → SPEC-057 Phase 4 에서 고쳐 뺐다. 허용 목록 0.
  g1: [] as RegExp[],
  // [원본] g2: [/^schedule-block-/] — Phase 3 에서 뺐다
  g2: [] as RegExp[],
  g2b: [] as RegExp[],
};

type Shot = { scheme: "light" | "dark"; scene: string };
type Hit = { id: string; msg: string };

/** 브라우저 쪽 공용 함수 — evaluate 마다 문자열로 넣는다 */
const LIB = `
  window.__g = {
    visible(el) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) !== 0;
    },
    clear(c) { return /rgba\\([^)]*,\\s*0\\)|transparent/.test(c); },
    plate(el) {
      const cs = getComputedStyle(el);
      if (!this.clear(cs.backgroundColor)) return true;
      return ["top", "right", "bottom", "left"].some(
        (s) => parseFloat(cs.getPropertyValue("border-" + s + "-width")) > 0 && !this.clear(cs.getPropertyValue("border-" + s + "-color")));
    },
    shown(el) {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let s = "";
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const p = n.parentElement; if (!p) continue;
        const r = p.getBoundingClientRect(); const cs = getComputedStyle(p);
        if (r.width <= 1 || r.height <= 1 || cs.visibility === "hidden" || cs.clip === "rect(0px, 0px, 0px, 0px)") continue;
        s += n.textContent;
      }
      return s.trim();
    },
    radius(el) {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      return Math.max(...[cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius]
        .map((v) => { const f = (v.split(" ")[0] || "0"); const n = parseFloat(f) || 0; return f.endsWith("%") ? (n * Math.min(r.width, r.height)) / 100 : n; }));
    },
    id(c, p) { return c.getAttribute("data-testid") || p.getAttribute("data-testid") || ""; },
    roots() {
      const bar = document.querySelector('[data-testid="global-workout-bar"]')?.parentElement;
      return [...document.querySelectorAll('main, [role="dialog"]'), ...(bar ? [bar] : [])];
    },
    SEL: 'button, a, label, [role="button"], [role="radio"], [role="tab"], [role="checkbox"], [role="option"]',
  };
`;

async function g1(page: Page): Promise<Hit[]> {
  await page.addScriptTag({ content: LIB });
  return page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: 브라우저 쪽 공용 함수
    const g = (window as any).__g;
    const out: Hit[] = [];
    const seen = new Set<Element>();
    for (const root of g.roots())
      for (const p of root.querySelectorAll(g.SEL)) {
        if (!g.visible(p) && getComputedStyle(p).display !== "contents") continue;
        for (const c of [p, ...p.querySelectorAll("*")]) {
          if (seen.has(c)) continue;
          seen.add(c);
          if (!g.visible(c) || !g.plate(c) || c.matches("input, textarea, select")) continue;
          const txt = g.shown(c);
          if (!txt) continue; // 글자 없는 판 — 아이콘 원·스위치·점
          const id = g.id(c, p);
          const r = c.getBoundingClientRect();
          const shape = c.closest("[data-shape]");
          if (shape && p.contains(shape)) {
            const sr = shape.getBoundingClientRect();
            const kind = shape.getAttribute("data-shape");
            const ok =
              kind === "round"
                ? Math.abs(sr.width - sr.height) <= 2
                : kind === "badge" && sr.height <= 22 && sr.width <= sr.height * 2;
            if (!ok) out.push({ id, msg: `data-shape=${kind} 이 맞지 않음 [${id}] "${txt.slice(0, 20)}"` });
            continue;
          }
          let rad = g.radius(c);
          // 누르는 것 안에서 둥글게 잘라 내는 조상(판 없는 rounded-full overflow-hidden)도 모양을 만든다
          for (let a = c.parentElement; a && p.contains(a); a = a.parentElement)
            if (getComputedStyle(a).overflow !== "visible") rad = Math.max(rad, g.radius(a));
          if (rad > 4.5)
            out.push({
              id,
              msg: `${c.tagName.toLowerCase()}[${id}] "${txt.replace(/\s+/g, " ").slice(0, 24)}" r=${rad.toFixed(1)} (h=${r.height.toFixed(0)})`,
            });
        }
      }
    return out;
  });
}

async function g2(page: Page): Promise<Hit[]> {
  return page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = "var(--color-brand-muted)";
    document.body.appendChild(probe);
    const muted = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return [
      ...document.querySelectorAll('[aria-pressed="true"], [aria-checked="true"], [aria-selected="true"]'),
    ]
      .filter((el) =>
        [el, ...el.querySelectorAll("*")].some((x) => getComputedStyle(x).backgroundColor === muted),
      )
      .map((el) => {
        const id = el.getAttribute("data-testid") ?? "";
        return {
          id,
          msg: `고른 칩 바탕 brand-muted [${id}] "${((el as HTMLElement).innerText ?? "").trim().slice(0, 20)}"`,
        };
      });
  });
}

/** G2b(REV-129 H2) — 바탕 없는 테두리 동작 버튼(R1a)은 테두리가 뒤 바탕과 3:1 이상이어야 버튼으로 보인다. */
async function g2b(page: Page): Promise<Hit[]> {
  await page.addScriptTag({ content: LIB });
  return page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: 브라우저 쪽 공용 함수
    const g = (window as any).__g;
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const lum = (c: number[]) => {
      const f = (v: number) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0] ?? 0) + 0.7152 * f(c[1] ?? 0) + 0.0722 * f(c[2] ?? 0);
    };
    const ratio = (a: number[], b: number[]) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };
    // 사진·그라데이션 위에 뜬 버튼은 뒤 바탕을 알 수 없다 — 판정하지 않는다(REV-131 H5)
    // [원본 REV-131] 조상 전부의 배경 그림 · 조부모의 직계 img 만 봤다 — 옆 아바타 때문에 건너뛰고, 형제 img 위 버튼은 놓쳤다(REV-132)
    // const onImage = (el: Element | null) => {
    //   for (let q = el; q; q = q.parentElement)
    //     if (getComputedStyle(q).backgroundImage !== "none") return true;
    //   return (
    //     !!el?.closest("figure, picture") || !!el?.parentElement?.querySelector(":scope > img, :scope > video")
    //   );
    // };
    // [개선 REV-132] 위로 올라가며 불투명 바탕을 만나기 전까지만 — 배경 그림이 있거나, 그 층의 img·video·canvas 가 x 와 겹칠 때만 건너뛴다
    const onImage = (x: Element) => {
      const r = x.getBoundingClientRect();
      for (let q = x.parentElement; q; q = q.parentElement) {
        const cs = getComputedStyle(q);
        if (cs.backgroundImage !== "none") return true;
        for (const m of q.querySelectorAll(
          ":scope > img, :scope > video, :scope > canvas, :scope > picture",
        )) {
          if (m.contains(x)) continue;
          const b = m.getBoundingClientRect();
          if (b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top) return true;
        }
        const c = rgb(cs.backgroundColor);
        if (c.length >= 3 && (c[3] ?? 1) >= 0.99) return false;
      }
      return false;
    };
    const backOf = (el: Element | null): number[] => {
      for (let q = el; q; q = q.parentElement) {
        const c = rgb(getComputedStyle(q).backgroundColor);
        if (c.length >= 3 && (c[3] ?? 1) >= 0.99) return c;
      }
      return rgb(getComputedStyle(document.body).backgroundColor);
    };
    const over = (c: number[], b: number[]) => {
      const al = c[3] ?? 1;
      return [0, 1, 2].map((i) => al * (c[i] ?? 0) + (1 - al) * (b[i] ?? 0));
    };
    // [원본 REV-131 전] 버튼 자기 위쪽 테두리 하나만 · 채운 버튼은 통째로 건너뜀 · 알파 무시
    // [개선 REV-131] 버튼과 그 자손 판까지 · 네 변 중 가장 낮은 대비 · 테두리 알파는 뒤 바탕에 섞어서 · 뒤와 같은 색 채움은 테두리 버튼으로 본다
    const out: { id: string; msg: string }[] = [];
    const seen = new Set<Element>();
    for (const root of g.roots()) {
      for (const el of root.querySelectorAll("button, a, [role=button]")) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (!g.visible(el) || !g.shown(el)) continue;
        if (el.matches('[aria-pressed], [aria-checked], [role="switch"], [role="tab"]')) continue; // 고르는 칩·토글은 R1b·R1d
        if (el.matches(':disabled, [aria-disabled="true"]')) continue; // 비활성은 대비 예외(WCAG 1.4.11)
        for (const x of [el, ...el.querySelectorAll("*")]) {
          if (x !== el && !g.visible(x)) continue;
          const cs = getComputedStyle(x);
          const sides = ["Top", "Right", "Bottom", "Left"] as const;
          // 네 변이 다 있는 상자만 — 줄 사이 구분선(위·아래 한 변)은 버튼 테두리가 아니다
          if (
            sides.some(
              (d) => !(Number.parseFloat(cs.getPropertyValue(`border-${d.toLowerCase()}-width`)) >= 1),
            )
          )
            continue;
          if (cs.borderTopStyle === "none") continue;
          // [원본 REV-131] if (onImage(x.parentElement)) continue;
          if (onImage(x)) continue;
          const back = backOf(x.parentElement);
          const own = rgb(cs.backgroundColor);
          if (own.length >= 3 && (own[3] ?? 1) >= 0.99 && ratio(own, back) >= 1.2) continue; // 뒤와 다른 채움은 판이 말한다
          const worst = Math.min(
            ...sides.map((d) => {
              const c = rgb(cs.getPropertyValue(`border-${d.toLowerCase()}-color`));
              return (c[3] ?? 1) < 0.05 ? 99 : ratio(over(c, back), back); // 투명 변은 테두리가 아니다
            }),
          );
          if (worst === 99) continue;
          if (worst < 3) {
            const id = el.getAttribute("data-testid") ?? "";
            out.push({
              id,
              msg: `테두리 대비 ${worst.toFixed(2)} < 3 [${id}] "${((el as HTMLElement).innerText ?? "").trim().slice(0, 20)}"`,
            });
            break;
          }
        }
      }
    }
    // 고른 칩(R1b)의 선택 테두리가 실제로 보이는지 — 자기 판과 3:1 이상, 안 고른 형제와 테두리 색이 다르다(REV-131)
    for (const root of g.roots()) {
      // [원본 REV-131] '[aria-pressed="true"], [aria-checked="true"]' — 탭 모양 분할 토글(role=tab)도 고른 칸 테두리를 본다(REV-132)
      for (const el of root.querySelectorAll(
        '[aria-pressed="true"], [aria-checked="true"], [role="tab"][aria-selected="true"]',
      )) {
        // 글자 없는 토글(세트 체크 ✓ 등)·스위치는 칩이 아니다
        if (!g.visible(el) || !g.shown(el) || el.matches('[role="switch"]')) continue;
        const cs = getComputedStyle(el);
        if (!(Number.parseFloat(cs.borderTopWidth) >= 1)) continue; // 테두리 없는 토글(세트 체크 등)은 대상 밖
        const own = rgb(cs.backgroundColor);
        const plate = own.length >= 3 && (own[3] ?? 1) >= 0.99 ? own : backOf(el.parentElement);
        const bc = rgb(cs.borderTopColor);
        const r = (bc[3] ?? 1) < 0.05 ? 1 : ratio(over(bc, plate), plate);
        const sib = [...(el.parentElement?.children ?? [])].find(
          (o) =>
            o !== el &&
            o.tagName === el.tagName &&
            o.matches('[aria-pressed="false"], [aria-checked="false"], [role="tab"][aria-selected="false"]'),
        );
        const same = sib ? getComputedStyle(sib).borderTopColor === cs.borderTopColor : false;
        if (r < 3 || same) {
          const id = el.getAttribute("data-testid") ?? "";
          out.push({
            id,
            msg: `고른 칩 테두리가 안 보임(대비 ${r.toFixed(2)}${same ? " · 안 고른 칩과 같은 색" : ""}) [${id}] "${((el as HTMLElement).innerText ?? "").trim().slice(0, 20)}"`,
          });
        }
      }
    }
    return out;
  });
}

async function g4(page: Page): Promise<string[]> {
  await page.addScriptTag({ content: LIB });
  return page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: 브라우저 쪽 공용 함수
    const g = (window as any).__g;
    const out: string[] = [];
    const W = window.innerWidth;
    const H = window.innerHeight;
    const floatingAt = (hit: Element) => {
      for (let q: Element | null = hit; q; q = q.parentElement) {
        const ps = getComputedStyle(q).position;
        if (ps === "fixed" || ps === "sticky") return true;
      }
      return false;
    };
    // 시트·확인창이 열려 있으면 그 안만 잰다 — 뒤 화면은 덮개에 가려 있는 게 맞다
    const modals = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].filter((d) =>
      g.visible(d),
    );
    for (const root of modals.length ? modals : g.roots())
      for (const p of root.querySelectorAll(g.SEL)) {
        const el = p as HTMLElement;
        if (!g.visible(el) || !g.shown(el)) continue;
        const id = el.getAttribute("data-testid") ?? g.shown(el).slice(0, 20);
        for (const x of [el, ...el.querySelectorAll("*")] as HTMLElement[]) {
          if (x.getBoundingClientRect().width <= 1) continue; // sr-only(1px 로 잘라 둔 읽어 주는 글)
          const cs = getComputedStyle(x);
          if (
            cs.overflowX !== "visible" &&
            cs.textOverflow !== "ellipsis" &&
            x.scrollWidth > x.clientWidth + 1
          ) {
            out.push(`잘림 ${id}`);
            break;
          }
        }
        const r = el.getBoundingClientRect();
        let clipped = false;
        for (let a = el.parentElement; a; a = a.parentElement) {
          const ox = getComputedStyle(a).overflowX;
          if (ox === "auto" || ox === "scroll") clipped = true; // 가로 스크롤 줄 안
        }
        if (!clipped && (r.right > W + 0.5 || r.left < -0.5)) out.push(`가로 넘침 ${id}`);
        const cx = r.left + r.width / 2;
        let cy = r.top + r.height / 2;
        if (cx < 0 || cy < 0 || cx > W || cy > H) continue;
        let hit = document.elementFromPoint(cx, cy);
        if (!hit || el.contains(hit) || hit.contains(el)) continue;
        // 다른 대화상자가 위에 있으면(시트가 열린 장면에서 뒤 화면) 넘어간다
        const dlg = hit.closest('[role="dialog"]');
        if (dlg && !dlg.contains(el)) continue;
        if (floatingAt(hit)) {
          el.scrollIntoView({ block: "center" });
          const r2 = el.getBoundingClientRect();
          cy = r2.top + r2.height / 2;
          hit = document.elementFromPoint(r2.left + r2.width / 2, cy);
          if (!hit || el.contains(hit) || hit.contains(el)) continue;
          out.push(`가림 ${id}`);
          continue;
        }
        out.push(`겹침 ${id}`);
      }
    window.scrollTo(0, 0);
    return out;
  });
}

async function check(page: Page, label: string, shot: Shot) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: test.info().outputPath(`${shot.scheme}-${shot.scene}.png`) });
  const pass = (list: RegExp[]) => (h: Hit) => !(h.id && list.some((re) => re.test(h.id)));
  expect
    .soft(
      (await g1(page)).filter(pass(ALLOW.g1)).map((h) => h.msg),
      `${label} — 4px 넘는 누르는 것(R1)`,
    )
    .toEqual([]);
  expect
    .soft(
      (await g2(page)).filter(pass(ALLOW.g2)).map((h) => h.msg),
      `${label} — 고른 칩 바탕 채움(R1b)`,
    )
    .toEqual([]);
  expect
    .soft(
      (await g2b(page)).filter(pass(ALLOW.g2b)).map((h) => h.msg),
      `${label} — 테두리 버튼 대비 3:1(R1a)`,
    )
    .toEqual([]);
  expect.soft(await g4(page), `${label} — 잘림·겹침·넘침`).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`모양 통일 가드 — ${scheme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
    });

    test("운동 중(지난 기록 있음) · 다른 화면의 전역 막대", async ({ page }) => {
      test.setTimeout(240_000);
      await 카탈로그_준비(page);
      await 지난_기록_채우기(page);
      await 빠른_운동_시작(page);
      await 종목_추가(page, "케이블 푸시다운");
      await 안내_띠_닫기(page);
      await 세트_기록(page, 0, 0, 40, 6);
      await page.evaluate(() => window.scrollTo(0, 0));
      // 다른 조합·이전기록 버튼이 실제로 화면에 있어야 가드가 그것을 잰다(REV-129) — 「더 보기」가 있으면(Phase 1) 편다
      const blk = page.getByTestId("workout-exercises").locator("> div").first();
      // [원본] if (await blk.getByTestId("block-more").count()) await blk.getByTestId("block-more").click(); — 「더 보기」를 걷었다(SPEC-057 Phase 2)
      await expect(blk.getByTestId("block-more")).toHaveCount(0);
      await expect(blk.getByTestId("btn-other-slots")).toBeVisible({ timeout: 15_000 });
      await expect(blk.getByTestId("prev-clear")).toBeVisible();
      // G3 — 그 자리 행동 줄: 「더 보기」 없음 · 시트·토글 버튼에 쐐기(›) 없음 · 누르는 자리 44px · 보조기기 표시(SPEC-057 Phase 2)
      await expect
        .soft(blk.getByTestId("btn-other-slots"), "다른 조합 — 시트를 연다")
        .toHaveAttribute("aria-haspopup", "dialog");
      await expect
        .soft(blk.getByTestId("tip-toggle"), "운동 방법 — 그 자리 펼침")
        .toHaveAttribute("aria-expanded", "false");
      for (const id of ["btn-other-slots", "prev-clear"]) {
        await expect.soft(blk.getByTestId(id).locator("svg"), `${id} 쐐기 없음(R5)`).toHaveCount(0);
      }
      for (const id of ["btn-other-slots", "prev-clear", "tip-toggle"]) {
        expect
          .soft((await blk.getByTestId(id).boundingBox())?.height ?? 0, `${id} 누르는 자리 44px`)
          .toBeGreaterThanOrEqual(44);
      }
      await check(page, "운동 중", { scheme, scene: "workout" });
      await page.goto("/calendar");
      await expect(page.getByTestId("global-workout-bar")).toBeVisible({ timeout: 15_000 });
      // 오늘 마친 기록이 읽힌 뒤에 잰다 — 자랑 버튼·운동한 날 칸이 실제로 그려져야 한다(REV-132)
      await expect(page.getByTestId("btn-brag-month")).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('[data-worked="1"]').first()).toBeVisible();
      await check(page, "다른 화면 + 전역 막대", { scheme, scene: "global-bar" });
      await page.locator('[data-worked="1"]').first().click();
      await page.waitForTimeout(400);
      await check(page, "달력 — 고른 날", { scheme, scene: "calendar-selected" });
      await page.goto("/workout");
      await expect(page.getByTestId("btn-add-exercise")).toBeVisible({ timeout: 15_000 });
      await 마치기(page);
    });

    test("홈(루틴 있음) · 스케줄 편집 시트", async ({ page }) => {
      test.setTimeout(240_000);
      await 카탈로그_준비(page);
      await page.goto("/");
      await page.getByTestId("btn-new-routine").click();
      await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
      await page.getByTestId("routine-name").fill(`모양${Date.now().toString(36)}`);
      await page.getByTestId("routine-name").blur();
      await page.getByTestId("btn-add-routine-exercise").click();
      await expect(page.getByTestId("picker-list")).toBeVisible({ timeout: 20_000 });
      await check(page, "종목 고르기", { scheme, scene: "picker" }); // REV-131 H6
      await page.getByTestId("picker-search").fill("바벨 벤치프레스");
      await page.getByTestId("picker-list").locator("button").first().click();
      await page.getByTestId("picker-confirm").click();
      await expect(page.getByTestId("routine-exercises").locator("> div")).toHaveCount(1, {
        timeout: 20_000,
      });
      // 세트 방식 칩은 비동기로 그려진다 — 그린 뒤에 잰다(REV-131)
      await expect(page.getByTestId("scheme-chip").first()).toBeVisible({ timeout: 15_000 });
      await check(page, "루틴 편집", { scheme, scene: "routine-edit" });
      await page.getByTestId("btn-routine-done").click();
      await expect(page.getByTestId("routine-list")).toBeVisible({ timeout: 20_000 });
      await check(page, "홈(루틴 있음)", { scheme, scene: "home" });
      await page.getByTestId("entry-schedule").click();
      await expect(page.getByTestId("schedule-editor")).toBeVisible({ timeout: 20_000 });
      await check(page, "스케줄 편집 시트", { scheme, scene: "schedule-editor" });
      // 스케줄을 저장해 홈의 주차 표시·오늘 표시까지 잰다 — ALLOW 에서 뺀 것이 실제로 화면에 있어야 한다(REV-131)
      const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
      await page.getByTestId(`schedule-day-${days[new Date().getDay()]}`).click();
      await expect(page.getByTestId("schedule-day-picker")).toBeVisible({ timeout: 20_000 });
      await page.getByTestId("schedule-day-picker").getByText(/^모양/).first().click();
      await page.getByTestId("schedule-block-4").click();
      await page.getByTestId("schedule-save").click();
      await expect(page.getByTestId("schedule-week-badge")).toBeVisible({ timeout: 20_000 });
      for (const id of ["schedule-week-badge", "today-chip"]) {
        const loc = page.getByTestId(id).first();
        await expect.soft(loc, `${id} 가 화면에 있다`).toBeVisible();
        if (await loc.count())
          expect
            .soft(await loc.evaluate((e) => getComputedStyle(e).backgroundColor), `${id} 판 없음(R2)`)
            .toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
      }
      await check(page, "홈(스케줄·블록)", { scheme, scene: "home-schedule" });
    });

    // 시트 장면(REV-131 H6) — 크리에이터 루틴 두 단계 · 루틴 가져오기 입력·검토
    test("시트 — 크리에이터 루틴", async ({ page }) => {
      test.setTimeout(240_000);
      await 카탈로그_준비(page);
      await page.goto("/");
      // [원본] page.getByTestId("concept-topic-pro-shoulders") — 주제 하나에 묶이지 않게 첫 주제(REV-132)
      const topic = page.locator('[data-testid^="concept-topic-"]').first();
      await expect(topic).toBeVisible({ timeout: 20_000 });
      await topic.click();
      await expect(page.getByTestId("creator-topic-sheet")).toBeVisible();
      await check(page, "크리에이터 주제 시트", { scheme, scene: "creator-topic" });
      await page
        .getByTestId("creator-topic-sheet")
        .locator('[data-testid^="creator-version-"]')
        .first()
        .click();
      await expect(page.getByTestId("creator-sheet")).toBeVisible();
      await check(page, "크리에이터 루틴 시트", { scheme, scene: "creator-routine" });
      // [원본 REV-132 전] 루틴 가져오기 입력·검토 장면 — 가져오기는 ADR-064 로 앱에서 뗐다(진입 링크 없음 · /routines/import 는 404). 다시 붙이면 살린다
      // // [원본] await page.goto("/"); await page.getByTestId("btn-routine-import").click(); — 진입 링크는 ADR-064 로 뗐다(REV-132)
      // await page.goto("/routines/import");
      // await expect(page.getByTestId("import-input")).toBeVisible({ timeout: 20_000 });
      // await check(page, "루틴 가져오기 입력", { scheme, scene: "import-input" });
      // await page.getByTestId("import-text").fill("월요일\n벤치프레스 3x10\n스쿼트 5x5\n랫풀다운 3세트 12회");
      // await page.getByTestId("import-make").click();
      // await expect(page.getByRole("alert")).toHaveCount(0);
      // await expect(page.getByTestId("import-review")).toBeVisible({ timeout: 20_000 });
      // await check(page, "루틴 가져오기 검토", { scheme, scene: "import-review" });
    });

    test("나머지 화면", async ({ page }) => {
      test.setTimeout(240_000);
      await 카탈로그_준비(page);
      for (const route of [
        "/profile",
        "/exercises",
        "/calendar",
        "/stats",
        "/history",
        "/gear",
        "/feed",
        "/explore",
        "/people",
        "/messages",
        "/notifications",
      ]) {
        await page.goto(route);
        await page.waitForTimeout(1200);
        if (route === "/exercises")
          await expect(page.getByTestId("btn-wizard")).toBeVisible({ timeout: 15_000 }); // REV-131
        await check(page, route, { scheme, scene: route.slice(1) || "root" });
      }
      // 프로필 시트 — 고른 칩(Chip)·분할 토글(Segmented)은 시트 안에만 그려진다(REV-132)
      // 재지 않는 것(빈 DB 라 그려지지 않음): explore-tag·gear-link·new-msg-chip·코칭 회원 화면·CoachBadge·CoachProfileFields
      for (const id of ["row-rest-sound", "row-equipment", "btn-edit-experience"]) {
        await page.goto("/profile");
        const row = page.getByTestId(id);
        await expect(row).toBeVisible({ timeout: 15_000 });
        await row.click();
        await page.waitForTimeout(600);
        await expect(page.getByRole("dialog").first()).toBeVisible();
        await check(page, `프로필 시트 ${id}`, { scheme, scene: `profile-${id}` });
      }
    });
  });
}

// 카나리아 — 가드가 정말 실패를 잡는지(REV-131). 일부러 틀린 버튼을 넣고 G1·G2b 가 각각 잡는지 본다.
test("가드 카나리아 — 알약 글자 버튼·옅은 테두리 버튼·자식 판 테두리를 잡는다", async ({ page }) => {
  await page.goto("/exercises");
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return;
    main.insertAdjacentHTML(
      "afterbegin",
      `<div style="padding:8px;background:var(--color-bg)">
        <button data-testid="canary-pill" style="border-radius:9999px;background:var(--color-surface-alt);padding:4px 12px">알약</button>
        <button data-testid="canary-faint" style="border:1px solid var(--color-line);background:transparent;padding:4px 12px">옅은 테두리</button>
        <button data-testid="canary-child" style="background:transparent"><span style="display:inline-block;border:1px solid var(--color-line);padding:4px 12px">자식 판</span></button>
        <div><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" style="width:32px;height:32px"/><div><button data-testid="canary-avatar-side" style="border:1px solid var(--color-line);background:transparent;padding:4px 12px">아바타 옆</button></div></div>
        <div style="position:relative;width:120px;height:60px"><img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" style="width:120px;height:60px"/><button data-testid="canary-on-img" style="position:absolute;left:8px;top:8px;border:1px solid var(--color-line);background:transparent;padding:4px 12px">사진 위</button></div>
      </div>`,
    );
  });
  const ids1 = (await g1(page)).map((h) => h.id);
  const ids2 = (await g2b(page)).map((h) => h.id);
  expect(ids1, "G1 이 알약 글자 버튼을 잡는다").toContain("canary-pill");
  expect(ids2, "G2b 가 옅은 테두리 버튼을 잡는다").toContain("canary-faint");
  expect(ids2, "G2b 가 자식 판의 옅은 테두리를 잡는다").toContain("canary-child");
  expect(ids2, "G2b 가 아바타 옆 옅은 테두리 버튼을 잡는다(REV-132)").toContain("canary-avatar-side");
  expect(ids2, "G2b 가 사진 위 버튼은 건너뛴다(REV-132)").not.toContain("canary-on-img");
});
