// 화면 정리 P1 — 운동 블록 측정(SRS-069 수용 기준). 보고서 기준선: 360×640 첫 세트 체크 top 486px · 블록 머리 칩 9 · 빨강 7곳.
//
// 여기서 재는 것(좌표·계산 스타일) — 모두 옛 코드(v0.38.0)에서 한 번 돌려 실패하는 것을 확인했다(/qa code H-2·H-3·M-6·M-7):
//   · 첫 블록 첫 세트 체크 버튼 top — 360×640 ≤ 320 · 390×844 ≤ 320
//     (시드가 가장 붐비는 블록이다 — PR 두 조각이 자기 줄을 갖는다. 옛 v0.38.0 실측: 360 397 · 390 397 · 머리 247/213/192)
//   · 블록마다 머리 높이(블록 top → 첫 세트 체크 top, 블록 상대값) ≤ 170 — PR 두 조각·한쪽 입력처럼 가장 붐비는 블록까지
//   · 블록 머리에 브랜드 빨강 0(글자·테두리·배경·SVG 채움/선) · 세트 표 안 빨강은 「눌린 세트 체크」·「세트 추가」만
//   · 그림과 이름 사이가 붙지 않는다(F3 — 겹침이 아니라 간격을 잰다) · 머리에 순서 화살표가 없다(⋯ 메뉴로)
//   · kg│lb 는 누르는 자리 높이 44px, 두 자리 사이에 틈, 아래 무게 칸을 침범하지 않는다(H-1)
//   · [원본] 부가 행동은 「더 보기」 안 · 펼침은 이번 운동 동안만 기억(M-1) · 첫 그림부터 펼친 채(M-2)
//   · [개선 SPEC-057] 「더 보기」 없음 — 운동 방법 ▾ · 다른 조합(n) · 이전기록 숨기기가 늘 보인다.
//     그래서 상한을 줄 하나만큼 올렸다: 첫 세트 체크 top ≤ 370 · 머리 높이는 블록마다(실측 + 여유 7px)
import { expect, test } from "@playwright/test";
import {
  블록,
  붐비는_운동_화면,
  빠른_운동_시작,
  안내_띠_닫기,
  지난_기록_채우기,
  카탈로그_준비,
  종목_추가,
} from "./fixtures/declutter-seed";
import { 블록_행동_보임 } from "./helpers/block";

type Page = import("@playwright/test").Page;

async function 첫세트_체크_top(page: Page): Promise<number> {
  const btn = page.getByTestId("set-list").first().locator("> div").first().getByTestId("set-done");
  await expect(btn).toBeVisible({ timeout: 15_000 });
  const box = await btn.boundingBox();
  return box ? Math.round(box.y) : 9999;
}

/** 블록마다 머리 높이 — 블록 top 부터 그 블록 첫 세트 체크 top 까지(위쪽 막대·안내 띠와 무관한 상대값) */
async function 머리_높이들(page: Page): Promise<number[]> {
  return page.getByTestId("workout-exercises").evaluate((list) =>
    Array.from(list.children).map((card) => {
      const done = card.querySelector('[data-testid="set-done"]');
      if (!done) return -1;
      return Math.round(done.getBoundingClientRect().top - card.getBoundingClientRect().top);
    }),
  );
}

/**
 * 블록의 브랜드 빨강 — 글자·테두리·배경·SVG(fill/stroke, currentColor 포함). 종목 그림(근육 강조)은 뺀다.
 * 머리(세트 표 앞)는 0 이어야 하고, 세트 표 안은 눌린 세트 체크·세트 추가만 허용(스펙: 블록 안 브랜드색은 그 둘뿐).
 */
async function 빨강(page: Page, n: number): Promise<{ head: string[]; table: string[] }> {
  return 블록(page, n).evaluate((card) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-brand)";
    document.body.appendChild(probe);
    const brand = getComputedStyle(probe).color;
    probe.remove();
    const setList = card.querySelector('[data-testid="set-list"]');
    const allowed = (el: Element) =>
      !!el.closest('[data-testid="set-done"][aria-pressed="true"]') ||
      !!el.closest('[data-testid="btn-add-set"]') ||
      // 세트 방식 이름(빨강 글자)은 누르는 ② 메타가 됐다 — 허용 예외(SPEC-046 · 꺾쇠는 회색)
      !!el.closest('[data-testid="btn-scheme-name"]');
    const head: string[] = [];
    const table: string[] = [];
    const name = (el: Element) => (el as HTMLElement).dataset?.testid ?? el.tagName.toLowerCase();
    for (const el of Array.from(card.querySelectorAll("*"))) {
      // 종목 그림 안의 근육 강조(주황)는 그림의 일부다 — UI 색 의미(행동·완료)와 별개라 세지 않는다
      if (el.closest('[data-testid="we-picto"]')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const hits: string[] = [];
      const sides = ["top", "right", "bottom", "left"];
      if (
        sides.some(
          (s) =>
            Number.parseFloat(cs.getPropertyValue(`border-${s}-width`)) > 0 &&
            cs.getPropertyValue(`border-${s}-color`) === brand,
        )
      )
        hits.push("border");
      if (cs.backgroundColor === brand) hits.push("bg");
      const ownText = Array.from(el.childNodes).some((x) => x.nodeType === 3 && (x.textContent ?? "").trim());
      if (ownText && cs.color === brand) hits.push("text");
      if (el instanceof SVGElement) {
        const f = cs.fill;
        const s = cs.stroke;
        if (f === brand || s === brand) hits.push("svg");
      }
      if (hits.length === 0) continue;
      const tag = `${hits.join("+")}:${name(el)}`;
      const inTable = !!setList && (el === setList || setList.contains(el));
      const afterTable =
        !!setList && !!(setList.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (inTable || afterTable) {
        if (!allowed(el)) table.push(tag);
      } else head.push(tag);
    }
    return { head, table };
  });
}

/** 그림 오른쪽 끝 ↔ 이름 왼쪽 끝 간격(F3). 그림이 없으면 null. */
async function 그림_이름_간격(page: Page, n: number): Promise<number | null> {
  const card = 블록(page, n);
  if ((await card.getByTestId("we-picto").count()) === 0) return null;
  const picto = await card.getByTestId("we-picto").boundingBox();
  const name = await card.getByTestId("we-name").boundingBox();
  if (!picto || !name) return null;
  return Math.round(name.x - (picto.x + picto.width));
}

/** kg│lb 누르는 자리 — 버튼 위·아래 끝 근처를 눌렀을 때 그 버튼인지, 두 버튼 사이는 어느 쪽도 아닌지, 무게 칸과 겹치지 않는지 */
async function 단위_누르는_자리(page: Page): Promise<{
  kgTop: boolean;
  kgBottom: boolean;
  between: string | null;
  intoInput: boolean;
}> {
  return 블록(page, 0).evaluate((card) => {
    const kg = card.querySelector('[data-testid="unit-toggle-kg"]') as HTMLElement;
    const lb = card.querySelector('[data-testid="unit-toggle-lb"]') as HTMLElement;
    const input = card.querySelector('[data-testid="set-weight"]') as HTMLElement;
    const a = kg.getBoundingClientRect();
    const b = lb.getBoundingClientRect();
    const hit = (x: number, y: number) =>
      (document.elementFromPoint(x, y)?.closest("button") as HTMLElement | null)?.dataset.testid ?? null;
    const cx = a.left + a.width / 2;
    // 보이는 글자(28px) 위 10px · 아래 2px 지점 — 넓힌 누르는 자리(44px) 안
    const kgTop = hit(cx, a.top - 10) === "unit-toggle-kg";
    const kgBottom = hit(cx, a.bottom + 2) === "unit-toggle-kg";
    const between = hit((a.right + b.left) / 2, a.top + a.height / 2);
    // 무게 칸 위쪽 끝 바로 안을 누르면 입력칸이어야 한다(토글이 가로채면 안 된다)
    const ir = input.getBoundingClientRect();
    const top = document.elementFromPoint(ir.left + ir.width / 2, ir.top + 1);
    const intoInput = !!top?.closest('[data-testid^="unit-toggle"]');
    return { kgTop, kgBottom, between, intoInput };
  });
}

test("운동 블록 — 첫 세트까지 짧고, 머리에 빨강이 없고, 그림·이름이 붙지 않고, 단위 토글은 누르기 쉽다", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await 지난_기록_채우기(page);
  await 붐비는_운동_화면(page);

  const top390 = await 첫세트_체크_top(page);
  const red = [await 빨강(page, 0), await 빨강(page, 1), await 빨강(page, 2)];
  const gap = await 그림_이름_간격(page, 0);
  // [원본] 블록 안 어디든 센다 — 피드백 #62 로 순서 버튼이 세트 표 뒤 도구 줄로 나왔다(머리에는 여전히 없어야 한다) @plm SRS-084
  // const headArrows = await 블록(page, 0).getByTestId("btn-move-down").count();
  // const oldArrows = await 블록(page, 0).getByRole("button", { name: "아래로 이동" }).count();
  const 머리_화살표 = (sel: string) =>
    블록(page, 0).evaluate((card, s) => {
      const list = card.querySelector('[data-testid="set-list"]');
      return Array.from(card.querySelectorAll(s)).filter(
        (el) => !list || !!(list.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING),
      ).length;
    }, sel);
  const headArrows = await 머리_화살표('[data-testid="btn-move-down"],[data-testid="btn-move-up"]');
  const oldArrows = await 머리_화살표('button[aria-label="아래로 이동"],button[aria-label="위로 이동"]');
  const unit = await 단위_누르는_자리(page);

  await page.setViewportSize({ width: 360, height: 640 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const top360 = await 첫세트_체크_top(page);
  const heads360 = await 머리_높이들(page);
  // 접힌 상태 측정값을 먼저 남긴다 — 옛 빌드(「더 보기」 없음)에서도 「전」 실측이 남게(M-7 ②)
  console.log(
    JSON.stringify({ closed: { top360, top390, heads360, red, gap, headArrows, oldArrows, unit } }),
  );

  // [원본] 펼친 상태(더 보기)도 잰다 — 블록_더보기 뒤 top360Open(≤ 480)
  // [개선 SPEC-057] 「더 보기」가 없어 지금 상태가 곧 펼친 상태 — 버튼 줄이 다 그려진 뒤에 잰 값인지 확인한다(늦게 끼어든 줄을 놓치지 않게)
  await 블록_행동_보임(블록(page, 0));
  await expect(블록(page, 0).getByTestId("btn-other-slots")).toBeVisible();
  await expect(블록(page, 0).getByTestId("prev-clear")).toBeVisible();
  expect(await 첫세트_체크_top(page), "버튼 줄이 다 그려진 뒤에도 같은 top").toBe(top360);

  console.log(JSON.stringify({ top360, top390, heads360, red, gap, headArrows, oldArrows, unit }));
  // [원본] top360·top390 ≤ 320(접힌 상태) · top360Open ≤ 480(「더 보기」를 편 상태) · 머리 높이 ≤ 170
  // [개선 SPEC-057] 「더 보기」를 걷어 부가 행동 줄(운동 방법 ▾ · 다른 조합 · 이전기록 숨기기 — 32px 줄)이 늘 보인다.
  //   실측 2026-11-11: top 364(= 옛 접힘 320 + 줄 하나 44) · 머리 203/179/191 — 옛 「편 상태」 상한 480 보다 116px 짧다.
  //   상한은 줄 하나만큼 올리고(여유 6px), 줄이 두 줄로 꺾이면(360px 에서 오른쪽 묶음이 내려가면) 걸리게 둔다.
  expect(top360, "360×640 첫 세트 체크 top").toBeLessThanOrEqual(370);
  expect(top390, "390×844 첫 세트 체크 top").toBeLessThanOrEqual(370);
  // [원본] expect(top360Open, …).toBeLessThanOrEqual(370); for (…) expect(h, …).toBeLessThanOrEqual(210);
  // [개선 REV-130] 블록마다 상한(실측 203/179/191 + 7) — 한 상한이면 덜 붐비는 블록이 두 줄로 꺾여도 통과했다
  const headMax = [210, 186, 198];
  expect(heads360.length, "블록 수").toBe(headMax.length);
  for (const [i, h] of heads360.entries()) {
    expect(h, `블록 ${i} 머리 높이(360) — 세트 체크가 없으면 -1`).toBeGreaterThan(0);
    expect(h, `블록 ${i} 머리 높이(360)`).toBeLessThanOrEqual(headMax[i] ?? 210);
  }
  for (const [i, r] of red.entries()) {
    expect(r.head, `블록 ${i} 머리 빨강`).toEqual([]);
    expect(r.table, `블록 ${i} 세트 표 빨강(허용: 눌린 체크·세트 추가)`).toEqual([]);
  }
  expect(gap, "그림 ↔ 이름 간격").not.toBeNull();
  expect(gap ?? 0, "그림 ↔ 이름 간격").toBeGreaterThanOrEqual(4);
  expect(headArrows + oldArrows, "머리의 순서 화살표(⋯ 메뉴로 옮김)").toBe(0);
  expect(unit.kgTop, "kg 누르는 자리 — 글자 위 10px").toBe(true);
  expect(unit.kgBottom, "kg 누르는 자리 — 글자 아래 2px").toBe(true);
  expect(unit.between, "kg·lb 사이는 어느 쪽도 아니다").toBeNull();
  expect(unit.intoInput, "무게 칸 위 끝을 토글이 가로채지 않는다").toBe(false);
});

/* [원본] test("운동 블록 — 부가 행동은 「더 보기」 안, 모든 블록이 함께 펴지고, 이번 운동 동안만 기억한다") —
   접기·같이 펴짐·이번 운동 동안 기억·새로고침 첫 그림을 쟀다. SPEC-057 에서 「더 보기」를 걷어(사용자 지적 1821) 잴 것이 없어졌다.
   원복 시 커밋 a35b535 의 이 파일에서 되살린다. */
test("운동 블록 — 부가 행동은 처음부터 보이고(「더 보기」 없음), 꺾쇠 없이 글자만, 버튼 없는 블록은 빈 줄이 없다(SPEC-057)", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await 카탈로그_준비(page);
  await 지난_기록_채우기(page);
  await 붐비는_운동_화면(page);

  const card = 블록(page, 0);
  await expect(card.getByTestId("block-more")).toHaveCount(0);
  await expect(card.getByTestId("tip-toggle")).toBeVisible({ timeout: 15_000 });
  await expect(card.getByTestId("tip-toggle")).toHaveAttribute("aria-expanded", "false");
  const other = card.getByTestId("btn-other-slots");
  const prev = card.getByTestId("prev-clear");
  await expect(other).toBeVisible();
  await expect(prev).toBeVisible();
  // 다른 화면으로 가지 않는 버튼 — 꺾쇠 없음(R5) · 시트를 연다(aria-haspopup) · 누르는 자리 44px
  await expect(other.locator("svg")).toHaveCount(0);
  await expect(prev.locator("svg")).toHaveCount(0);
  await expect(other).toHaveAttribute("aria-haspopup", "dialog");
  await expect(other).toContainText(/다른 조합\(\d+\)/);
  const tip = card.getByTestId("tip-toggle");
  for (const b of [other, prev, tip]) expect((await b.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  // 같은 줄의 누르는 글자는 한 모양(REV-130) — 크기·굵기·색이 같다
  const looks = await Promise.all(
    [tip, other, prev].map((b) =>
      b.evaluate((el) => {
        const cs = getComputedStyle(el);
        return `${cs.fontSize} ${cs.fontWeight} ${cs.color}`;
      }),
    ),
  );
  expect(new Set(looks).size, `운동 방법 · 다른 조합 · 이전기록 숨기기 모양 ${looks.join(" | ")}`).toBe(1);
  // 넓힌 누르는 자리가 아래 kg│lb 와 겹치지 않는다(REV-130 — 겹친 곳은 무엇이 눌릴지 모른다)
  const unitBox = await card.getByTestId("unit-toggle").first().boundingBox();
  for (const b of [other, prev, tip]) {
    const bb = await b.boundingBox();
    if (bb && unitBox)
      expect(bb.y + bb.height, "버튼 아래 끝 ≤ kg│lb 위 끝").toBeLessThanOrEqual(unitBox.y + 0.5);
  }
  // 숨기기 ↔ 보이기 — 이전 칸이 비고 PR 이 숨고, 상태를 읽어 준다
  const live = card.locator('[aria-live="polite"]');
  const firstPrev = card.getByTestId("set-prev").first();
  await expect(live).toHaveText("");
  await expect(prev).toHaveText("이전기록 숨기기");
  await expect(firstPrev).not.toHaveAttribute("aria-label", "이전 기록 없음");
  await expect(card.getByTestId("pr-chip-weight")).toBeVisible();
  await prev.click();
  await expect(prev).toHaveText("이전기록 보이기");
  await expect(live).toHaveText("이전 기록을 숨겼어요");
  // 빈 이전 칸은 「–」 + 「이전 기록 없음」
  await expect(firstPrev).toHaveAttribute("aria-label", "이전 기록 없음");
  await expect(card.getByTestId("pr-chip-weight")).toHaveCount(0);
  await prev.click();
  await expect(prev).toHaveText("이전기록 숨기기");
  await expect(live).toHaveText("이전 기록을 다시 표시했어요");
  await expect(firstPrev).not.toHaveAttribute("aria-label", "이전 기록 없음");
  await expect(card.getByTestId("pr-chip-weight")).toBeVisible();
  // 운동 방법은 그 자리에서 펼친다(aria-expanded)
  await tip.click();
  await expect(tip).toHaveAttribute("aria-expanded", "true");
  // aria-controls 는 블록마다 다른 id 를 가리킨다(같은 종목 블록이 둘이어도 겹치지 않게 · REV-130)
  const ctl = await tip.getAttribute("aria-controls");
  expect(ctl).toMatch(/^tip-body-/);
  await expect(card.locator(`[id="${ctl}"]`)).toBeVisible();
  await expect(page.locator(`[id="${ctl}"]`)).toHaveCount(1);

  // 처음 하는 종목(지난 기록·다른 조합 없음)에는 버튼 줄이 없다 — 빈 줄 금지
  await 종목_추가(page, "덤벨 컬");
  const freshBlock = 블록(page, (await page.getByTestId("workout-exercises").locator("> div").count()) - 1);
  await expect(freshBlock.getByTestId("we-name")).toHaveText("덤벨 컬");
  await expect(freshBlock.getByTestId("tip-toggle")).toBeVisible();
  await expect(freshBlock.getByTestId("block-actions")).toHaveCount(0);

  // 유산소 종목에는 운동 방법·버튼 줄·읽어 주는 칸이 없다 — 첫 그림에 잠깐 생겼다 빠지지도 않는다(REV-130)
  await page.evaluate(() => {
    const w = window as unknown as { __cardioRow?: boolean };
    w.__cardioRow = false;
    const list = document.querySelector('[data-testid="workout-exercises"]');
    if (!list) return;
    new MutationObserver(() => {
      const last = list.lastElementChild;
      if (
        last?.textContent?.includes("러닝머신") &&
        last.querySelector('[data-testid="tip-toggle"],[data-testid="block-actions"]')
      )
        w.__cardioRow = true;
    }).observe(list, { childList: true, subtree: true });
  });
  await 종목_추가(page, "러닝머신");
  const cardio = 블록(page, (await page.getByTestId("workout-exercises").locator("> div").count()) - 1);
  await expect(cardio.getByTestId("we-name")).toHaveText("러닝머신");
  await expect(cardio.getByTestId("tip-toggle")).toHaveCount(0);
  await expect(cardio.getByTestId("block-actions")).toHaveCount(0);
  await expect(cardio.locator('[aria-live="polite"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __cardioRow?: boolean }).__cardioRow)).toBe(false);
});

// [원본] SPEC-057 전 「더 보기」 테스트 — 「더 보기」를 걷어 위 테스트로 바꿨다(되살릴 때 helpers/block.ts 의 블록_더보기 도)
/*
test("운동 블록 — 부가 행동은 「더 보기」 안, 모든 블록이 함께 펴지고, 이번 운동 동안만 기억한다", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await 카탈로그_준비(page);
  await 지난_기록_채우기(page);
  await 붐비는_운동_화면(page);

  const card = 블록(page, 0);
  // 접힌 처음에는 부가 행동이 보이지 않는다
  await expect(card.getByTestId("block-more")).toHaveAttribute("aria-expanded", "false");
  await expect(card.getByTestId("btn-other-slots")).toBeHidden();
  await expect(card.getByTestId("tip-toggle")).toBeHidden();

  await 블록_더보기(card);
  await expect(card.getByTestId("btn-other-slots")).toBeVisible();
  await expect(card.getByTestId("tip-toggle")).toBeVisible();
  await expect(card.getByTestId("prev-clear")).toBeVisible();
  // 라벨은 고정, 상태는 aria-expanded 가 말한다(L-5)
  await expect(card.getByTestId("block-more")).toContainText("더 보기");
  // 블록 전체가 하나 — 다른 블록도 함께 펴진다(/qa spec Q6)
  await expect(블록(page, 1).getByTestId("block-more")).toHaveAttribute("aria-expanded", "true");

  // 다시 열어도 펼쳐져 있고, 첫 그림부터 펼친 채다(M-2 — 접힘 → 펼침으로 튀지 않는다)
  await page.addInitScript(() => {
    (window as unknown as { __firstPanel?: boolean | null }).__firstPanel = null;
    new MutationObserver((_m, obs) => {
      const more = document.querySelector('[data-testid="block-more"]');
      if (!more) return;
      (window as unknown as { __firstPanel?: boolean }).__firstPanel =
        more.getAttribute("aria-expanded") === "true";
      obs.disconnect();
    }).observe(document, { childList: true, subtree: true, attributes: true });
  });
  await page.reload();
  await expect(블록(page, 0).getByTestId("block-more")).toHaveAttribute("aria-expanded", "true", {
    timeout: 20_000,
  });
  const first = await page.evaluate(
    () => (window as unknown as { __firstPanel?: boolean | null }).__firstPanel,
  );
  expect(first, "새로고침 뒤 첫 그림의 「더 보기」 상태").toBe(true);

  // 운동을 버리고 새로 시작하면 접힌 채로(M-1 — 지난 운동의 펼침이 넘어오지 않는다)
  // [원본] await page.getByTestId("btn-session-menu").click(); — ⋯ 없이 머리 「취소」를 바로 누른다(SPEC-055 Phase 2)
  await page.getByTestId("btn-discard").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await 빠른_운동_시작(page);
  await 종목_추가(page, "케이블 푸시다운");
  await 안내_띠_닫기(page);
  await expect(블록(page, 0).getByTestId("block-more")).toHaveAttribute("aria-expanded", "false", {
    timeout: 15_000,
  });
});
*/

test("운동 블록 — PR 은 금색 글자, 누르면 안 한 첫 세트에 채우고(값이 실제로 바뀐다) ⓘ 는 기록으로", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await 카탈로그_준비(page);
  await 지난_기록_채우기(page);
  await 붐비는_운동_화면(page);

  const card = 블록(page, 0);
  const pr = card.getByTestId("pr-chip-weight");
  await expect(pr).toContainText("40", { timeout: 15_000 });
  await expect(card.getByTestId("pr-chip-volume")).toContainText("35");
  // 테두리 상자가 아니다(글자) · 누르는 자리는 32px 이상
  const s = await pr.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bw: cs.borderTopWidth, h: el.getBoundingClientRect().height };
  });
  expect(s.bw).toBe("0px");
  expect(s.h).toBeGreaterThanOrEqual(32);

  // 첫 세트를 다른 값으로 바꿔 둔 뒤 누른다 — 이미 같은 값이면 아무 일이 없어도 통과해 버린다(H-2)
  const row = card.getByTestId("set-list").locator("> div").first();
  await row.getByTestId("set-weight").fill("20");
  await row.getByTestId("set-reps").fill("3");
  await row.getByTestId("set-reps").blur();
  await expect(row.getByTestId("set-weight")).toHaveValue("20");
  await pr.click();
  await expect(row.getByTestId("set-weight")).toHaveValue("40", { timeout: 10_000 });
  await expect(row.getByTestId("set-reps")).toHaveValue("5");
  await expect(page.getByTestId("toast-root")).toContainText("40");

  await card.getByTestId("pr-chip-weight-history").click();
  await expect(page).toHaveURL(/\/history\//, { timeout: 15_000 });
});

// [원본] 「순서는 ⋯ 메뉴의 「아래로 이동」으로 바꾼다」 — 피드백 #62 로 블록 아래 도구 줄 ⌄ 로 바뀌었다 @plm SRS-084
test("운동 블록 — 순서는 블록 아래 도구 줄의 「아래로 이동」으로 바꾼다", async ({ page }) => {
  test.setTimeout(240_000);
  await 카탈로그_준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "케이블 푸시다운");
  await 종목_추가(page, "바벨 벤치프레스");
  await 안내_띠_닫기(page);

  await expect(블록(page, 0).getByTestId("we-name")).toContainText("푸시다운");
  // [원본] await 블록(page, 0).getByTestId("btn-we-menu").click(); await page.getByTestId("btn-move-down").click();
  await 블록(page, 0).getByTestId("btn-move-down").click();
  await expect(블록(page, 0).getByTestId("we-name")).toContainText("벤치프레스", { timeout: 10_000 });
  await expect(블록(page, 1).getByTestId("we-name")).toContainText("푸시다운");
});
