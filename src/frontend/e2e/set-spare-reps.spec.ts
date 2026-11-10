// SPEC-055 Phase 3(S-86 · B안) — 세트 줄 「여유」 칸
//
// 확인 목록:
//   · 누를 때마다 비움 → 0 → 1 → 2 → 3 → 4+ → 비움 · 저장(마지막 탭 600ms 뒤) 뒤 새로고침해도 남는다
//   · 완료한 세트에서도 바뀐다(kg·회는 잠김)
//   · 4+ 표시(저장 4) · 길게 누르면 비움 · 바뀐 값은 aria-live 로
//   · 360×740: kg 「102.5」·회 「12」가 잘리지 않고 가로 넘침 없음 · 칸 겉보기 ≤ 36 · 누르는 높이 44 · ✓ 와 8px 이상 · 표 머리 같은 폭
//   · 워밍업 줄은 같은 폭의 빈 자리(✓ 자리가 다른 줄과 같다)
//   · 분석 탭 힘든 정도 카드는 기록이 0개면 아무것도 없다
//   [개선] 코드 리뷰 반영(REV H-1·M-1~M-5·L-2·L-3)
//   · 360×740 — 이전 칸 「102.5×12」(지난 운동 102.5kg×12) 가 잘리지 않고 한 줄 · 칸 폭·글자 폭 · 표 머리 정렬 · ✓·⌄ 누르는 자리 44
//   · 옛 0.5 → 「+0.5」 · 누르면 「+1」 / 4 보다 큰 옛 값 → 「4+」 · 누르면 비움 / rpe 만 → 「–」
//   · 연타 3번 = 저장 1번 · 가려지면(visibilitychange) 곧바로 저장 · 600ms 안에 다른 화면으로 가도 값이 남는다
//   · 지운 세트·버린 운동에 기다리던 저장 — 오류 토스트 없음 · 움직이며 누르면 길게 누르기 취소
import { expect, test } from "@playwright/test";
import {
  idb_행_고치기,
  마치기,
  빠른_운동_시작,
  세트_기록,
  세트_줄,
  안내_띠_닫기,
  여유_칸,
  준비,
  종목_추가,
  내려쓰기_대기,
  빈_문서,
  세트_id,
} from "./helpers/opengym";

type Page = import("@playwright/test").Page;

async function 시작(page: Page): Promise<void> {
  await 준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 안내_띠_닫기(page);
}

/** 저장(600ms) + LokiJS 내려쓰기까지 기다린 뒤 다시 연다 */
async function 저장_뒤_새로고침(page: Page): Promise<void> {
  await page.waitForTimeout(900);
  await 내려쓰기_대기(page);
  await page.reload();
  await expect(세트_줄(page)).toBeVisible({ timeout: 20_000 });
}

test("누를 때마다 비움 → 0 → +1 → +2 → +3 → 4+ → 비움 · 저장 뒤 새로고침해도 남는다", async ({ page }) => {
  test.setTimeout(120_000);
  await 시작(page);
  const cell = await 여유_칸(page);
  await expect(cell).toHaveText("–");
  await expect(cell).toHaveAttribute("data-rir", "");
  const seen: string[] = [];
  for (let k = 0; k < 6; k++) {
    await cell.click();
    seen.push((await cell.textContent()) ?? "");
  }
  expect(seen).toEqual(["0", "+1", "+2", "+3", "4+", "–"]);
  // 세 번 더 → +2 에서 멈추고 저장
  for (let k = 0; k < 3; k++) await cell.click();
  await expect(cell).toHaveText("+2");
  // [원본] await expect(cell).toHaveAttribute("aria-label", "세트 1 여유 2개 — 눌러서 바꾸기");
  // [개선] 보이는 글자로 시작(WCAG 2.5.3 · REV M-4)
  await expect(cell).toHaveAttribute("aria-label", "+2 · 세트 1 여유 — 눌러서 바꾸기");
  await 저장_뒤_새로고침(page);
  const again = await 여유_칸(page);
  await expect(again).toHaveText("+2");
  await expect(again).toHaveAttribute("data-rir", "2");
});

test("완료한 세트에서도 바뀐다 — kg·회는 잠겨 있다", async ({ page }) => {
  test.setTimeout(120_000);
  await 시작(page);
  await 세트_기록(page, 0, 0, 60, 8);
  const row = 세트_줄(page, 0, 0);
  await expect(row.getByTestId("set-weight")).toBeDisabled();
  const cell = await 여유_칸(page);
  await expect(cell).toBeEnabled();
  await cell.click();
  await cell.click();
  await expect(cell).toHaveText("+1");
  await 저장_뒤_새로고침(page);
  await expect(세트_줄(page, 0, 0).getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
  await expect(await 여유_칸(page)).toHaveText("+1");
});

test("4+ 는 4 로 저장 · 길게 누르면 비움 · 바뀐 값을 읽어 준다", async ({ page }) => {
  test.setTimeout(120_000);
  await 시작(page);
  const cell = await 여유_칸(page);
  // [원본] 칸마다 읽어 주기 영역(set-spare-live-<id>)
  // [원본] const id = ((await cell.getAttribute("data-testid")) ?? "").replace(/^set-spare-/, "");
  // [원본] const live = page.getByTestId(`set-spare-live-${id}`);
  // [원본] await expect(live).toHaveAttribute("aria-live", "polite");
  // [원본] await expect(live).toHaveText(""); // 처음엔 읽지 않는다
  // [개선] 페이지에 하나뿐인 영역(버튼 바깥) — 처음엔 없다(아무것도 읽지 않는다 · REV M-4)
  const live = page.getByTestId("set-spare-live");
  await expect(live).toHaveCount(0);
  await expect(cell.locator("[aria-live]")).toHaveCount(0);
  for (let k = 0; k < 5; k++) await cell.click();
  await expect(cell).toHaveText("4+");
  await expect(cell).toHaveAttribute("data-rir", "4");
  // [원본] await expect(cell).toHaveAttribute("aria-label", "세트 1 여유 4개 이상 — 눌러서 바꾸기");
  await expect(cell).toHaveAttribute("aria-label", "4+ · 세트 1 여유 — 눌러서 바꾸기");
  await expect(live).toHaveCount(1);
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveText("여유 4개 이상");
  await 저장_뒤_새로고침(page);
  const c2 = await 여유_칸(page);
  await expect(c2).toHaveText("4+");

  // 길게 누르기(500ms 넘게) → 비움 · 손을 뗀 클릭은 값을 넘기지 않는다
  const box = await c2.boundingBox();
  if (!box) throw new Error("여유 칸 자리 없음");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(c2).toHaveText("–");
  // [원본] await expect(c2).toHaveAttribute("aria-label", "세트 1 여유 비움 — 눌러서 바꾸기");
  // [원본] await expect(page.getByTestId(`set-spare-live-${id}`)).toHaveText("여유 비움");
  await expect(c2).toHaveAttribute("aria-label", "여유 없음 · 세트 1 — 눌러서 바꾸기");
  await expect(page.getByTestId("set-spare-live")).toHaveText("여유 없음");
  await 저장_뒤_새로고침(page);
  await expect(await 여유_칸(page)).toHaveText("–");
});

test("360×740 — kg 102.5·회 12 가 잘리지 않고 넘침 없음 · 칸 ≤36 · 누르는 높이 44 · ✓ 와 8px · 머리 같은 폭", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await 시작(page);
  const row = 세트_줄(page, 0, 0);
  await row.getByTestId("set-weight").fill("102.5");
  await row.getByTestId("set-reps").fill("12");
  await row.getByTestId("set-reps").blur();
  const cell = await 여유_칸(page);
  for (let k = 0; k < 5; k++) await cell.click(); // 「4+」 — 가장 넓은 글자
  await expect(cell).toHaveText("4+");

  const m = await row.evaluate((el) => {
    const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    const spare = el.querySelector(
      '[data-testid^="set-spare-"]:not([data-testid^="set-spare-live"])',
    ) as HTMLElement;
    const r = (e: Element) => e.getBoundingClientRect();
    const c = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
    const fit = (input: HTMLInputElement) => {
      const cs = getComputedStyle(input);
      c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      return { text: c.measureText(input.value).width, room: input.clientWidth };
    };
    const sr = r(spare);
    const x = sr.left + sr.width / 2;
    const up = document.elementFromPoint(x, sr.top - 1.5);
    const down = document.elementFromPoint(x, sr.bottom + 1.5);
    const upOut = document.elementFromPoint(x, sr.top - 3);
    const head = document.querySelector('[data-testid="head-spare"]') as HTMLElement;
    const w = (id: string) => Math.round(r(q(id)).width * 10) / 10;
    return {
      widths: {
        type: w("set-type"),
        prev: w("set-prev"),
        weight: w("set-weight"),
        reps: w("set-reps"),
        spare: Math.round(sr.width * 10) / 10,
        done: w("set-done"),
        more: w("set-more"),
      },
      weightFit: fit(q("set-weight") as HTMLInputElement),
      repsFit: fit(q("set-reps") as HTMLInputElement),
      hit: {
        h: Math.round(sr.height + 4),
        up: !!up && spare.contains(up),
        down: !!down && spare.contains(down),
      },
      upOut: !!upOut && spare.contains(upOut),
      gapToDone: Math.round((r(q("set-done")).left - sr.right) * 10) / 10,
      head: head ? { left: Math.round(r(head).left), width: Math.round(r(head).width) } : null,
      spareLeft: Math.round(sr.left),
      sw: document.documentElement.scrollWidth,
    };
  });
  test.info().annotations.push({ type: "360 칸 폭", description: JSON.stringify(m) });
  console.log("360 칸 폭", JSON.stringify(m));
  expect(m.sw).toBeLessThanOrEqual(360);
  expect(m.weightFit.text).toBeLessThanOrEqual(m.weightFit.room);
  expect(m.repsFit.text).toBeLessThanOrEqual(m.repsFit.room);
  expect(m.widths.spare).toBeLessThanOrEqual(36);
  expect(m.hit).toEqual({ h: 44, up: true, down: true });
  expect(m.upOut).toBe(false); // 2px 바깥은 다른 것(줄 여백)
  expect(m.gapToDone).toBeGreaterThanOrEqual(8);
  expect(m.head).toEqual({ left: m.spareLeft, width: Math.round(m.widths.spare) });
  await page.screenshot({ path: "test-results/set-spare-360.png" });
});

test("워밍업 줄은 같은 폭의 빈 자리 — ✓ 자리가 다른 줄과 같다", async ({ page }) => {
  test.setTimeout(120_000);
  await 시작(page);
  await page.getByTestId("btn-add-set").first().click();
  await expect(세트_줄(page, 0, 1)).toBeVisible();
  await 세트_줄(page, 0, 0).getByTestId("set-type").click();
  await page.getByTestId("set-type-sheet").getByText("워밍업 (W)").click();
  const warm = 세트_줄(page, 0, 0);
  await expect(warm.getByTestId("set-spare-blank")).toHaveCount(1, { timeout: 10_000 });
  await expect(warm.locator('[data-testid^="set-spare-"]:not([data-testid="set-spare-blank"])')).toHaveCount(
    0,
  );
  const work = 세트_줄(page, 0, 1);
  await expect(work.locator('button[data-testid^="set-spare-"]')).toHaveCount(1);
  const a = await warm.getByTestId("set-done").boundingBox();
  const b = await work.getByTestId("set-done").boundingBox();
  expect(Math.round(a?.x ?? -1)).toBe(Math.round(b?.x ?? -2));
  const blank = await warm.getByTestId("set-spare-blank").boundingBox();
  const cell = await work.locator('button[data-testid^="set-spare-"]').boundingBox();
  expect(Math.round(blank?.width ?? -1)).toBe(Math.round(cell?.width ?? -2));
});

test("분석 — 여유를 적은 세트가 없으면 힘든 정도 카드가 아무것도 그리지 않는다", async ({ page }) => {
  test.setTimeout(120_000);
  await 시작(page);
  await 세트_기록(page, 0, 0, 60, 10);
  await 마치기(page);
  await 내려쓰기_대기(page);
  await page.goto("/stats");
  await expect(page.getByTestId("stats-1rm")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_000); // 카드가 늦게 끼어들지 않는지
  await expect(page.getByTestId("effort-card")).toHaveCount(0);
  await expect(page.getByTestId("effort-title")).toHaveCount(0);
  await expect(page.getByTestId("effort-empty")).toHaveCount(0);
  await expect(page.getByTestId("effort-loading")).toHaveCount(0);
});

// ── 코드 리뷰 반영(REV H-1·M-1~M-5·L-2·L-3) ─────────────────────────────────

/** 오류 토스트를 지켜본다 — 돌려준 함수를 부르면 그동안 뜬 오류 토스트 글 목록 */
async function 오류_토스트_감시(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const w = window as unknown as { __errToasts: string[] };
    w.__errToasts = [];
    const seen = new WeakSet<Element>();
    const scan = () => {
      for (const el of document.querySelectorAll('[data-testid="toast"][data-tone="error"]')) {
        if (seen.has(el)) continue;
        seen.add(el);
        w.__errToasts.push(el.textContent ?? "");
      }
    };
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
  });
  return () => page.evaluate(() => (window as unknown as { __errToasts: string[] }).__errToasts);
}

test("H-1 360×740 — 이전 칸 「102.5×12」 가 잘리지 않고 한 줄 · 칸 폭·글자 폭 · 표 머리 정렬 · ✓·⌄ 누르는 자리 44", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await 시작(page);
  await 세트_기록(page, 0, 0, 102.5, 12);
  await 마치기(page);
  await 내려쓰기_대기(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 안내_띠_닫기(page);
  const row = 세트_줄(page, 0, 0);
  await expect(row.getByTestId("set-prev")).toHaveText("102.5×12", { timeout: 15_000 });
  await row.getByTestId("set-weight").fill("102.5");
  await row.getByTestId("set-reps").fill("100");
  await row.getByTestId("set-reps").blur();
  const cell = await 여유_칸(page);
  for (let k = 0; k < 5; k++) await cell.click(); // 「4+」
  await expect(cell).toHaveText("4+");

  const m = await row.evaluate((el) => {
    const q = (id: string) => el.querySelector(`[data-testid="${id}"]`) as HTMLElement;
    const spare = el.querySelector('button[data-testid^="set-spare-"]') as HTMLElement;
    const r = (e: Element) => e.getBoundingClientRect();
    const round = (v: number) => Math.round(v * 10) / 10;
    const c = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
    const inputFit = (input: HTMLInputElement) => {
      const cs = getComputedStyle(input);
      c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      return { text: round(c.measureText(input.value).width), room: input.clientWidth };
    };
    const boxFit = (e: HTMLElement) => ({
      scroll: e.scrollWidth,
      client: e.clientWidth,
      h: round(r(e).height),
    });
    const prevText = q("set-prev-text");
    const spareText = spare.querySelector("span") as HTMLElement;
    // 누르는 자리 — 가운데 줄을 1px 씩 훑어 그 버튼이 잡히는 이어진 폭·높이(이웃 버튼이 위에 있으면 줄어든다)
    const hit = (b: HTMLElement) => {
      const br = r(b);
      const cx = br.left + br.width / 2;
      const cy = br.top + br.height / 2;
      const at = (x: number, y: number) => {
        const e = document.elementFromPoint(x, y);
        return !!e && b.contains(e);
      };
      const span = (from: number, to: number, f: (v: number) => boolean) => {
        let lo = Number.NaN;
        let hi = Number.NaN;
        for (let v = from; v <= to; v += 1)
          if (f(v + 0.5)) {
            if (Number.isNaN(lo)) lo = v;
            hi = v + 1;
          }
        return Number.isNaN(lo) ? 0 : hi - lo;
      };
      return {
        w: span(Math.floor(br.left) - 30, Math.ceil(br.right) + 30, (x) => at(x, cy)),
        h: span(Math.floor(br.top) - 30, Math.ceil(br.bottom) + 30, (y) => at(cx, y)),
      };
    };
    const head = (id: string) => {
      const h = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
      return h ? { left: Math.round(r(h).left), width: Math.round(r(h).width) } : null;
    };
    const cellBox = (e: HTMLElement) => ({ left: Math.round(r(e).left), width: Math.round(r(e).width) });
    return {
      widths: {
        type: round(r(q("set-type")).width),
        prev: round(r(q("set-prev")).width),
        weight: round(r(q("set-weight")).width),
        reps: round(r(q("set-reps")).width),
        spare: round(r(spare).width),
        done: round(r(q("set-done")).width),
        more: round(r(q("set-more")).width),
      },
      prevText: {
        text: prevText.textContent,
        ...boxFit(prevText),
        font: getComputedStyle(prevText).fontSize,
      },
      spareText: boxFit(spareText),
      weightFit: inputFit(q("set-weight") as HTMLInputElement),
      repsFit: inputFit(q("set-reps") as HTMLInputElement),
      hitDone: hit(q("set-done")),
      hitMore: hit(q("set-more")),
      hitSpare: hit(spare),
      gapToDone: round(r(q("set-done")).left - r(spare).right),
      head: {
        weight: [head("head-weight"), cellBox(q("set-weight"))],
        spare: [head("head-spare"), cellBox(spare)],
        done: [head("head-done"), cellBox(q("set-done"))],
        more: [head("head-more"), cellBox(q("set-more"))],
      },
      sw: document.documentElement.scrollWidth,
    };
  });
  test.info().annotations.push({ type: "360 칸 폭(이전 102.5×12)", description: JSON.stringify(m) });
  console.log("360 칸 폭(이전 102.5×12)", JSON.stringify(m));
  expect(m.sw).toBeLessThanOrEqual(360);
  // 이전 칸 — 잘림 없음 · 한 줄(13px · 줄 높이 16)
  expect(m.prevText.text).toBe("102.5×12");
  expect(m.prevText.scroll).toBeLessThanOrEqual(m.prevText.client);
  expect(m.prevText.h).toBeLessThanOrEqual(17);
  expect(m.prevText.font).toBe("13px");
  // kg 「102.5」 · 회 「100」 · 여유 「4+」
  expect(m.weightFit.text).toBeLessThanOrEqual(m.weightFit.room);
  expect(m.repsFit.text).toBeLessThanOrEqual(m.repsFit.room);
  expect(m.spareText.scroll).toBeLessThanOrEqual(m.spareText.client);
  // 여유 칸 겉보기 28~32 · 누르는 높이 44 · ✓ 와 8px
  expect(m.widths.spare).toBeGreaterThanOrEqual(28);
  expect(m.widths.spare).toBeLessThanOrEqual(32);
  // 1px 씩 훑은 값이라 소수 자리 때문에 ±1
  expect(Math.abs(m.hitSpare.h - 44)).toBeLessThanOrEqual(1);
  expect(m.gapToDone).toBeGreaterThanOrEqual(8);
  // ✓·⌄ — 겉보기는 줄였고 누르는 자리는 44 × 44(이웃 칸과 겹치지 않는다)
  expect(m.widths.done).toBeLessThan(38);
  expect(m.widths.more).toBeLessThan(34);
  for (const [k, v] of Object.entries({ done: m.hitDone, more: m.hitMore })) {
    expect(Math.abs(v.w - 44), `${k} 누르는 폭 ${v.w}`).toBeLessThanOrEqual(1);
    expect(Math.abs(v.h - 44), `${k} 누르는 높이 ${v.h}`).toBeLessThanOrEqual(1);
  }
  // 표 머리와 칸 — 왼쪽·폭이 같다(±1px)
  for (const [k, [h, c]] of Object.entries(m.head)) {
    expect(h, `머리 ${k}`).not.toBeNull();
    expect(Math.abs((h?.left ?? -99) - (c?.left ?? 99)), `머리 ${k} 왼쪽`).toBeLessThanOrEqual(1);
    expect(Math.abs((h?.width ?? -99) - (c?.width ?? 99)), `머리 ${k} 폭`).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: "test-results/set-spare-360-prev.png" });
});

test("M-5 옛 값 — 0.5 는 「+0.5」(누르면 「+1」) · 4 보다 큰 값은 「4+」(누르면 비움) · rpe 만 있으면 「–」", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await 시작(page);
  await page.getByTestId("btn-add-set").first().click();
  await page.getByTestId("btn-add-set").first().click();
  await expect(세트_줄(page, 0, 2)).toBeVisible();
  const ids = [
    await 세트_id(세트_줄(page, 0, 0)),
    await 세트_id(세트_줄(page, 0, 1)),
    await 세트_id(세트_줄(page, 0, 2)),
  ];
  await 내려쓰기_대기(page);
  await 빈_문서(page);
  const n = await idb_행_고치기(page, "set_logs", [
    { id: ids[0], set: { rir: 0.5, rpe: null } },
    { id: ids[1], set: { rir: 6, rpe: null } },
    { id: ids[2], set: { rir: null, rpe: 8 } },
  ]);
  expect(n).toBe(3);
  await page.goto("/workout");
  await expect(세트_줄(page, 0, 2)).toBeVisible({ timeout: 20_000 });
  const [a, b, c] = [await 여유_칸(page, 0, 0), await 여유_칸(page, 0, 1), await 여유_칸(page, 0, 2)];
  await expect(a).toHaveText("+0.5");
  await expect(a).toHaveAttribute("aria-label", "+0.5 · 세트 1 여유 — 눌러서 바꾸기");
  await expect(b).toHaveText("4+");
  await expect(b).toHaveAttribute("data-rir", "6");
  await expect(c).toHaveText("–");
  await expect(c).toHaveAttribute("data-rir", "");
  await a.click();
  await expect(a).toHaveText("+1");
  await b.click();
  await expect(b).toHaveText("–");
  await c.click();
  await expect(c).toHaveText("0");
  await page.waitForTimeout(900);
  await 내려쓰기_대기(page);
  await page.reload();
  await expect(세트_줄(page, 0, 2)).toBeVisible({ timeout: 20_000 });
  await expect(await 여유_칸(page, 0, 0)).toHaveText("+1");
  await expect(await 여유_칸(page, 0, 1)).toHaveText("–");
  await expect(await 여유_칸(page, 0, 2)).toHaveText("0");
});

test("M-5 연타 3번 = 저장 1번 · M-2 가려지면(visibilitychange hidden) 기다리지 않고 곧바로 저장", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await 시작(page);
  const cell = await 여유_칸(page);
  await expect(cell).not.toHaveAttribute("data-saves", /./);
  for (let k = 0; k < 3; k++) await cell.click();
  await expect(cell).toHaveText("+2");
  await page.waitForTimeout(1_200);
  await expect(cell).toHaveAttribute("data-saves", "1");
  await expect(cell).toHaveAttribute("data-rir", "2");

  // 한 번 더 누르고 600ms 안에 가려진다 → 곧바로 저장(2번째)
  await cell.click();
  await expect(cell).toHaveText("+3");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(cell).toHaveAttribute("data-saves", "2", { timeout: 300 });
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });
  await page.waitForTimeout(900);
  await expect(cell).toHaveAttribute("data-saves", "2"); // 타이머가 한 번 더 보내지 않는다
  await 저장_뒤_새로고침(page);
  await expect(await 여유_칸(page)).toHaveText("+3");
});

test("M-5 600ms 안에 다른 화면으로 가도 고른 값이 남는다", async ({ page }) => {
  test.setTimeout(120_000);
  await 시작(page);
  const cell = await 여유_칸(page);
  await cell.click();
  await cell.click();
  await expect(cell).toHaveText("+1");
  // 곧바로(600ms 안) 앱 안에서 뒤로(홈) — 운동 중엔 탭 바가 없다 · 페이지는 그대로라 칸이 사라지며 보낸다
  await page.goBack();
  await expect(page).not.toHaveURL(/\/workout/, { timeout: 10_000 });
  await 내려쓰기_대기(page);
  await page.goto("/workout");
  await expect(세트_줄(page)).toBeVisible({ timeout: 20_000 });
  await expect(await 여유_칸(page)).toHaveText("+1");
});

test("M-1 기다리던 저장이 지운 세트·버린 운동에 가도 오류 토스트가 없다", async ({ page }) => {
  test.setTimeout(150_000);
  await 시작(page);
  const errors = await 오류_토스트_감시(page);
  await page.getByTestId("btn-add-set").first().click();
  const row2 = 세트_줄(page, 0, 1);
  await expect(row2).toBeVisible();
  // ① 세트 삭제 — 누르고 600ms 안에 그 세트를 지운다
  const cell2 = await 여유_칸(page, 0, 1);
  await cell2.click();
  await row2.getByTestId("set-more").click();
  await row2.getByTestId("set-delete").click();
  await expect(세트_줄(page, 0, 1)).toHaveCount(0, { timeout: 10_000 });
  await page.waitForTimeout(2_000);
  expect(await errors(), "세트 삭제 뒤 오류 토스트").toEqual([]);

  // ② 운동 버림 — 누르고 곧바로 버린다
  const cell1 = await 여유_칸(page, 0, 0);
  await cell1.click();
  await page.getByTestId("btn-discard").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await page.waitForTimeout(2_000);
  expect(await errors(), "운동 버림 뒤 오류 토스트").toEqual([]);
});

test("L-3 누른 채 8px 넘게 움직이면 길게 누르기 취소 — 값이 비워지지 않는다 · L-2 그 뒤 키보드 Enter 가 먹는다", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await 시작(page);
  const cell = await 여유_칸(page);
  for (let k = 0; k < 3; k++) await cell.click();
  await expect(cell).toHaveText("+2");
  const box = await cell.boundingBox();
  if (!box) throw new Error("여유 칸 자리 없음");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy - 6);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 6, { steps: 3 }); // 12px — 칸 안에서 움직임
  await page.waitForTimeout(800);
  await expect(cell).toHaveText("+2"); // 비워지지 않았다
  await page.mouse.up();
  await expect(cell).toHaveText("+3"); // 손을 떼면 보통 누르기(칸 안)

  // 길게 눌러 비운 뒤 칸 밖에서 손을 떼도 상태가 풀려 다음 키보드 Enter 가 바로 먹는다(L-2)
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await expect(cell).toHaveText("–");
  await page.mouse.move(cx, cy + 120, { steps: 3 });
  await page.mouse.up();
  await cell.focus();
  await page.keyboard.press("Enter");
  await expect(cell).toHaveText("0");
});
