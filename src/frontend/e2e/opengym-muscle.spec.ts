// @plm SRS-075 SRS-076  근육 지도·근육 균형 e2e (openGym P2 · ADR-039)
//
// 확인하는 것(스펙 P2 검증):
//   1. 오늘 카드에 작은 그림(앞·뒤)과 「가슴… 중심」 글자 — 목록 줄(RoutineRow)에는 그림이 없다
//   2. 「근육 그림 보기」를 끄면 카드 그림·운동 중 「오늘 근육」 버튼이 DOM 에서 사라진다 · 끈 상태 좌표 = 기준선
//   3. 세트 완료 → 시트 열기 → 가슴 +1 · 삼두/어깨 +0.5 (다시 완료 → 다시 열기 → 또 +1/+0.5)
//   4. 통계: 근육 섹션은 하나(옛 「근육군 분포」 없음) · 줄 숫자 · 주 이동 ‹ › · 「안 한 근육」 칩 → 카탈로그 부위 필터(양방향)
//   5. 대비(칠한 구역·윤곽선 vs 바탕 ≥3:1 · 글자 ≥4.5:1) — 화면의 실제 계산된 색으로 잰다(라이트·다크)
//   6. 360·390 좌표 겹침(카드 글자·그림·버튼 / 시트 줄 / 통계 줄)
// SHOTS=1 이면 라이트·다크 캡처를 .ouroboros-work/shots/p2/ 에 남긴다(커밋 안 함).
import { expect, test } from "@playwright/test";
import { 마치기, 세트_기록, 안내_띠_닫기, 내려쓰기_대기, 준비 } from "./helpers/opengym";

type Page = import("@playwright/test").Page;
type Locator = import("@playwright/test").Locator;

const SHOTS = process.env.SHOTS === "1";
const SHOT_DIR = process.env.SHOT_DIR ?? "../../.ouroboros-work/shots/p2"; // 실행 위치 = src/frontend

async function 근육그림_설정(page: Page, on: boolean): Promise<void> {
  await page.goto("/profile");
  const sw = page.getByTestId("switch-muscle-map");
  await expect(sw).toBeVisible({ timeout: 20_000 });
  if ((await sw.getAttribute("aria-checked")) !== String(on)) await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", String(on));
  await 내려쓰기_대기(page);
}

/** 벤치프레스 루틴을 만들어 오늘 요일에 배정 → 오늘 카드 */
async function 오늘_루틴(page: Page, 이름: string): Promise<void> {
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await page.getByTestId("routine-name").fill(이름);
  await page.getByTestId("routine-name").blur();
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("routine-exercises").locator("> div")).toHaveCount(1, { timeout: 20_000 });
  await page.getByTestId("btn-routine-done").click();
  await expect(page.getByTestId("routine-list")).toContainText(이름, { timeout: 20_000 });

  await page.getByTestId("entry-schedule").click();
  await expect(page.getByTestId("schedule-editor")).toBeVisible({ timeout: 20_000 });
  const today = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
  await page.getByTestId(`schedule-day-${today}`).click();
  await page.getByTestId("schedule-day-picker").getByText(이름).click();
  await page.getByTestId("schedule-save").click();
  await expect(page.getByTestId("schedule-editor")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId("today-card")).toBeVisible({ timeout: 20_000 });
}

type Box = { x: number; y: number; width: number; height: number };
function 겹침(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width - 0.5 &&
    b.x < a.x + a.width - 0.5 &&
    a.y < b.y + b.height - 0.5 &&
    b.y < a.y + a.height - 0.5
  );
}
async function 상자(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  if (!b) throw new Error("상자 없음");
  return b;
}

/** 페이지 안에서 WCAG 대비를 계산 — 구역 칠·윤곽선은 실제 계산된 색(투명도는 바탕과 섞어서) */
async function 대비_재기(
  page: Page,
  svgTestId: string,
): Promise<{
  fill3: number;
  fill2: number | null;
  outline1: number | null;
  outline0: number | null;
}> {
  return page.evaluate((tid) => {
    const parse = (s: string): [number, number, number, number] => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 0];
      const p = m[1]
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      return [p[0], p[1], p[2], p[3] ?? 1];
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a: number[], b: number[]) => {
      const x = lum(a);
      const y = lum(b);
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const svg = document.querySelector(`[data-testid="${tid}"]`) as SVGElement;
    // 바탕: 위로 올라가며 처음 만나는 불투명 배경
    let el: Element | null = svg;
    let bg = [255, 255, 255];
    while (el) {
      const c = parse(getComputedStyle(el).backgroundColor);
      if (c[3] > 0.99) {
        bg = c.slice(0, 3);
        break;
      }
      el = el.parentElement;
    }
    const zone = (lv: string) => svg.querySelector(`g[data-level="${lv}"] path`) as SVGPathElement | null;
    const fillOf = (p: SVGPathElement) => {
      const cs = getComputedStyle(p);
      const c = parse(cs.fill);
      const a = Number(cs.fillOpacity) * c[3];
      return [0, 1, 2].map((i) => c[i] * a + bg[i] * (1 - a));
    };
    const strokeOf = (p: SVGPathElement) => parse(getComputedStyle(p).stroke).slice(0, 3);
    const z3 = zone("3");
    const z2 = zone("2");
    const z1 = zone("1");
    const z0 = zone("0");
    return {
      fill3: z3 ? ratio(fillOf(z3), bg) : 0,
      fill2: z2 ? ratio(fillOf(z2), bg) : null,
      outline1: z1 ? ratio(strokeOf(z1), bg) : null,
      outline0: z0 ? ratio(strokeOf(z0), bg) : null,
    };
  }, svgTestId);
}

async function 글자_대비(l: Locator): Promise<number> {
  return l.evaluate((node) => {
    const parse = (s: string) => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      const p = m
        ? m[1]
            .split(/[ ,/]+/)
            .filter(Boolean)
            .map(Number)
        : [0, 0, 0, 1];
      return [p[0], p[1], p[2], p[3] ?? 1];
    };
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    let el: Element | null = node as Element;
    let bg = [255, 255, 255];
    while (el) {
      const c = parse(getComputedStyle(el).backgroundColor);
      if (c[3] > 0.99) {
        bg = c.slice(0, 3);
        break;
      }
      el = el.parentElement;
    }
    const fg = parse(getComputedStyle(node as Element).color).slice(0, 3);
    const x = lum(fg);
    const y = lum(bg);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  });
}

async function 캡처(page: Page, name: string, target?: Locator): Promise<void> {
  if (!SHOTS) return;
  if (target) await target.screenshot({ path: `${SHOT_DIR}/${name}.png` });
  else await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

test("근육 지도 — 오늘 카드 · 설정 끄기 · 운동 중 시트 숫자 · 통계 근육 균형 · 카탈로그 필터", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await 준비(page);
  const 이름 = `근육루틴${Date.now().toString(36)}`;
  await 오늘_루틴(page, 이름);
  await 안내_띠_닫기(page);

  // ── 1. 오늘 카드: 그림 + 글자 · 목록 줄에는 그림 없음 ──
  const card = page.getByTestId("today-card");
  const mini = card.getByTestId("routine-muscle-mini");
  await expect(mini).toBeVisible({ timeout: 15_000 });
  await expect(mini).toHaveAttribute("aria-hidden", "true");
  await expect(mini.locator('g[data-muscle="chest"]').first()).toHaveAttribute("data-level", "3");
  await expect(mini.locator('g[data-muscle="triceps"]').first()).toHaveAttribute("data-level", "2");
  await expect(mini.locator('g[data-muscle="quads"]').first()).toHaveAttribute("data-level", "0");
  await expect(card.getByTestId("routine-muscle-focus")).toHaveText(/가슴.*중심/);
  await expect(page.getByTestId("routine-muscle-mini")).toHaveCount(1); // 목록 줄(RoutineRow)에는 없다
  const slot = await 상자(card.getByTestId("routine-muscle-slot"));
  expect(Math.round(slot.height)).toBe(56);

  // ── 2. 끄면 카드 그림·버튼 없음, 좌표 = 기준선 ──
  await 근육그림_설정(page, false);
  await page.goto("/");
  await expect(page.getByTestId("today-card")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(500);
  await expect(page.getByTestId("routine-muscle-slot")).toHaveCount(0);
  await expect(page.getByTestId("routine-muscle-focus")).toHaveCount(0);

  // 운동 시작(오늘 카드) — 끈 상태 기준선 좌표
  await page.getByTestId("btn-start-today").click();
  await expect(page.getByTestId("btn-guide-rir")).toBeVisible({ timeout: 20_000 });
  await 안내_띠_닫기(page);
  await expect(page.getByTestId("btn-today-muscles")).toHaveCount(0);
  const baseRir = await 상자(page.getByTestId("btn-guide-rir"));
  const baseSet = await 상자(page.getByTestId("set-list").first());

  // 켜면 버튼이 생긴다(같은 운동 화면 · 다른 탭 변경도 따름 — 여기서는 프로필에서 켜고 돌아온다)
  await 근육그림_설정(page, true);
  await page.goto("/workout");
  const btn = page.getByTestId("btn-today-muscles");
  await expect(btn).toBeVisible({ timeout: 20_000 });
  await 안내_띠_닫기(page);
  const bb = await 상자(btn);
  // 보이는 높이 36 · 누르는 자리 44(위 8px 바깥도 이 버튼)
  const hit = await page.evaluate(
    ({ x, top, bottom }) =>
      [top, bottom].map(
        (y) => document.elementFromPoint(x, y)?.closest('[data-testid="btn-today-muscles"]') !== null,
      ),
    { x: bb.x + bb.width / 2, top: bb.y - 7.5, bottom: bb.y + bb.height - 1 },
  );
  expect(bb.height + 8).toBeGreaterThanOrEqual(44);
  expect(hit).toEqual([true, true]);
  const onRir = await 상자(page.getByTestId("btn-guide-rir"));
  expect(Math.round(onRir.y)).toBe(Math.round(baseRir.y)); // 줄 시작은 그대로
  expect(겹침(bb, onRir)).toBe(false);
  const onSet = await 상자(page.getByTestId("set-list").first());
  // 켠 상태도 줄 높이는 그대로(누르는 자리만 ::before 로 넓힘) — 첫 세트 좌표가 끈 상태와 같다
  expect(Math.round(onSet.y)).toBe(Math.round(baseSet.y));
  console.log(
    `좌표(390) 끔 rir ${Math.round(baseRir.y)}/${Math.round(baseRir.height)} set ${Math.round(baseSet.y)} · 켬 rir ${Math.round(onRir.y)}/${Math.round(onRir.height)} set ${Math.round(onSet.y)}`,
  );

  // 다시 끄면 기준선과 같은 좌표
  await 근육그림_설정(page, false);
  await page.goto("/workout");
  await expect(page.getByTestId("btn-guide-rir")).toBeVisible({ timeout: 20_000 });
  await 안내_띠_닫기(page);
  await expect(page.getByTestId("btn-today-muscles")).toHaveCount(0);
  const offRir = await 상자(page.getByTestId("btn-guide-rir"));
  const offSet = await 상자(page.getByTestId("set-list").first());
  expect([Math.round(offRir.y), Math.round(offRir.height), Math.round(offSet.y)]).toEqual([
    Math.round(baseRir.y),
    Math.round(baseRir.height),
    Math.round(baseSet.y),
  ]);
  await 근육그림_설정(page, true);
  await page.goto("/workout");

  // ── 3. 세트 완료 → 시트 열기 → +1 / +0.5 ──
  await expect(page.getByTestId("btn-today-muscles")).toBeVisible({ timeout: 20_000 });
  await 세트_기록(page, 0, 0, 60, 8);
  await page.getByTestId("btn-today-muscles").click();
  const sheet = page.getByTestId("muscle-sheet");
  await expect(sheet.getByTestId("muscle-sheet-map")).toBeVisible({ timeout: 15_000 });
  await expect(sheet.getByTestId("muscle-row-chest")).toHaveAttribute("data-done", "1");
  await expect(sheet.getByTestId("muscle-row-triceps")).toHaveAttribute("data-done", "0.5");
  await expect(sheet.getByTestId("muscle-row-shoulders")).toHaveAttribute("data-done", "0.5");
  const planned = Number(await sheet.getByTestId("muscle-row-chest").getAttribute("data-planned"));
  expect(planned).toBeGreaterThanOrEqual(2);
  await expect(sheet.getByTestId("muscle-sheet-map")).toHaveAttribute("role", "img");
  await expect(sheet.getByTestId("muscle-sheet-map")).toHaveAttribute(
    "aria-label",
    /많이 한 근육: 가슴 1세트/,
  );
  await expect(sheet.getByTestId("muscle-sheet-list")).toBeVisible(); // 실제 <ul> 목록
  // 줄을 누르면 그 근육만 brand(선택)
  await sheet.getByTestId("muscle-row-triceps").click();
  await expect(sheet.getByTestId("muscle-row-triceps")).toHaveAttribute("aria-pressed", "true");
  await expect(
    sheet.locator('[data-testid="muscle-sheet-map"] g[data-muscle="triceps"]').first(),
  ).toHaveAttribute("data-level", "sel");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("btn-today-muscles")).toBeFocused();

  await 세트_기록(page, 0, 1, 60, 8);
  await page.getByTestId("btn-today-muscles").click();
  await expect(sheet.getByTestId("muscle-row-chest")).toHaveAttribute("data-done", "2", { timeout: 15_000 });
  await expect(sheet.getByTestId("muscle-row-triceps")).toHaveAttribute("data-done", "1");
  await expect(sheet.getByTestId("muscle-row-shoulders")).toHaveAttribute("data-done", "1");
  await page.keyboard.press("Escape");

  await 마치기(page);

  // ── 4. 통계: 근육 섹션 하나 · 숫자 · 주 이동 · 안 한 근육 칩 → 카탈로그 ──
  await page.goto("/stats");
  const bal = page.getByTestId("muscle-balance-card");
  await expect(bal.getByTestId("muscle-balance-map")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("근육군 분포")).toHaveCount(0);
  await expect(page.getByTestId("muscle-balance-title")).toHaveCount(1);
  await expect(bal.getByTestId("muscle-balance-row-chest")).toHaveAttribute("data-sets", "2");
  await expect(bal.getByTestId("muscle-balance-row-triceps")).toHaveAttribute("data-sets", "1");
  await expect(bal.getByTestId("muscle-balance-row-chest")).toHaveAttribute("aria-label", /가슴 2세트, 볼륨/);
  // 주 이동: 다음은 막혀 있고, 이전으로 가면 빈 기간 → 다시 다음으로
  await expect(page.getByTestId("muscle-balance-next")).toBeDisabled();
  const range0 = await page.getByTestId("muscle-balance-range").textContent();
  await page.getByTestId("muscle-balance-prev").click();
  await expect(page.getByTestId("muscle-balance-range")).not.toHaveText(range0 ?? "");
  await expect(bal.getByTestId("muscle-balance-empty")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("muscle-balance-next").click();
  await expect(bal.getByTestId("muscle-balance-row-chest")).toBeVisible({ timeout: 15_000 });
  // 위쪽 기간을 바꿔도 카드는 하나, 같은 숫자(이번 운동은 모든 기간 안)
  await page.getByTestId("period-month").click();
  await expect(bal.getByTestId("muscle-balance-row-chest")).toHaveAttribute("data-sets", "2", {
    timeout: 15_000,
  });
  await page.getByTestId("period-week").click();
  await expect(bal.getByTestId("muscle-balance-row-chest")).toBeVisible({ timeout: 15_000 });

  // 대비(라이트) — 통계 그림
  const cLight = await 대비_재기(page, "muscle-balance-map");
  expect(cLight.fill3).toBeGreaterThanOrEqual(3);
  if (cLight.fill2 !== null) expect(cLight.fill2).toBeGreaterThanOrEqual(3);
  if (cLight.outline1 !== null) expect(cLight.outline1).toBeGreaterThanOrEqual(3);
  expect(cLight.outline0 ?? 0).toBeGreaterThanOrEqual(3);
  expect(
    await 글자_대비(bal.getByTestId("muscle-balance-row-chest").locator("span").nth(1)),
  ).toBeGreaterThanOrEqual(4.5);
  console.log("대비 라이트(통계)", JSON.stringify(cLight));

  // 안 한 근육 칩 → 카탈로그 종아리 필터
  const chip = bal.getByTestId("untrained-chip-calves");
  await expect(chip).toBeVisible();
  expect((await 상자(chip)).height).toBeGreaterThanOrEqual(44);
  await chip.click();
  await expect(page).toHaveURL(/\/exercises\?muscle=calves/, { timeout: 15_000 });
  await expect(page.getByTestId("chip-muscle-calves")).toHaveAttribute("aria-pressed", "true", {
    timeout: 20_000,
  });
  // 칩 → 주소(양방향): 다른 부위 → 주소 바뀜 · 다시 눌러 끔 → 쿼리 없음
  await page.getByTestId("chip-muscle-back").click();
  await expect(page).toHaveURL(/muscle=back/);
  await page.getByTestId("chip-muscle-back").click();
  await expect(page).not.toHaveURL(/muscle=/);
  // 새로고침해도 주소의 필터로 연다
  await page.goto("/exercises?muscle=glutes");
  await expect(page.getByTestId("chip-muscle-glutes")).toHaveAttribute("aria-pressed", "true", {
    timeout: 20_000,
  });
  await page.goto("/exercises?muscle=nope");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
  await expect(page.locator('[data-testid^="chip-muscle-"][aria-pressed="true"]')).toHaveCount(0);
});

test("근육 지도 — 360·390 겹침 · 다크 대비 · 캡처", async ({ page }) => {
  test.setTimeout(300_000);
  await 준비(page);
  const 이름 = `근육좌표${Date.now().toString(36)}`;
  await 오늘_루틴(page, 이름);
  // 기록 하나(통계 카드용)
  await page.getByTestId("btn-start-today").click();
  await expect(page.getByTestId("btn-today-muscles")).toBeVisible({ timeout: 20_000 });
  await 세트_기록(page, 0, 0, 60, 8);
  await 마치기(page);
  await 안내_띠_닫기(page);

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [w, h] of [
      [360, 640],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });

      // 홈 오늘 카드: 글자 열·그림·버튼이 겹치지 않고 카드 안
      await page.goto("/");
      const card = page.getByTestId("today-card");
      await expect(card.getByTestId("routine-muscle-mini")).toBeVisible({ timeout: 20_000 });
      const cardBox = await 상자(card);
      const slot = await 상자(card.getByTestId("routine-muscle-slot"));
      const start = await 상자(card.getByTestId("btn-start-today"));
      const focus = await 상자(card.getByTestId("routine-muscle-focus"));
      expect(겹침(slot, start)).toBe(false);
      expect(겹침(slot, focus)).toBe(false);
      expect(slot.x >= cardBox.x && slot.x + slot.width <= cardBox.x + cardBox.width).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const cMini = await 대비_재기(page, "routine-muscle-mini");
      expect(cMini.fill3).toBeGreaterThanOrEqual(3);
      if (cMini.fill2 !== null) expect(cMini.fill2).toBeGreaterThanOrEqual(3);
      expect(cMini.outline0 ?? 0).toBeGreaterThanOrEqual(3);
      expect(await 글자_대비(card.getByTestId("routine-muscle-focus"))).toBeGreaterThanOrEqual(4.5);
      if (w === 360) console.log(`대비 ${scheme}(오늘 카드 mini)`, JSON.stringify(cMini));
      await 캡처(page, `home-todaycard-${w}-${scheme}`, card);

      // 운동 중 시트
      await page.getByTestId("btn-start-today").click();
      await expect(page.getByTestId("btn-today-muscles")).toBeVisible({ timeout: 20_000 });
      const guideRow = [
        await 상자(page.getByTestId("btn-guide-rir")),
        await 상자(page.getByTestId("btn-guide-warmup")),
        await 상자(page.getByTestId("btn-today-muscles")),
      ];
      expect(겹침(guideRow[0], guideRow[1]) || 겹침(guideRow[1], guideRow[2])).toBe(false);
      expect(guideRow[2].x + guideRow[2].width).toBeLessThanOrEqual(w);
      await 세트_기록(page, 0, 0, 60, 8);
      await page.getByTestId("btn-today-muscles").click();
      const sheet = page.getByTestId("muscle-sheet");
      await expect(sheet.getByTestId("muscle-sheet-map")).toBeVisible({ timeout: 15_000 });
      const rows = sheet.locator('[data-testid^="muscle-row-"]');
      const n = await rows.count();
      for (let i = 0; i < n; i++) {
        const r = await 상자(rows.nth(i));
        expect(r.height).toBeGreaterThanOrEqual(44);
        expect(r.x + r.width).toBeLessThanOrEqual(w);
        if (i > 0) expect(겹침(r, await 상자(rows.nth(i - 1)))).toBe(false);
      }
      const cSheet = await 대비_재기(page, "muscle-sheet-map");
      expect(cSheet.fill3).toBeGreaterThanOrEqual(3);
      expect(cSheet.outline0 ?? 0).toBeGreaterThanOrEqual(3);
      if (w === 360) console.log(`대비 ${scheme}(시트)`, JSON.stringify(cSheet));
      await 캡처(page, `session-sheet-${w}-${scheme}`);
      await page.keyboard.press("Escape");
      // 이 운동은 버린다(통계 숫자를 흔들지 않게)
      await page.getByTestId("btn-session-menu").click();
      await page.getByTestId("btn-discard").click();
      await page.getByTestId("confirm-discard").getByTestId("dialog-confirm").click();
      await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

      // 통계 카드
      await page.goto("/stats");
      const bal = page.getByTestId("muscle-balance-card");
      await expect(bal.getByTestId("muscle-balance-map")).toBeVisible({ timeout: 20_000 });
      const bRows = bal.locator('[data-testid^="muscle-balance-row-"]');
      const bn = await bRows.count();
      for (let i = 0; i < bn; i++) {
        const r = await 상자(bRows.nth(i));
        expect(r.height).toBeGreaterThanOrEqual(44);
        if (i > 0) expect(겹침(r, await 상자(bRows.nth(i - 1)))).toBe(false);
      }
      const nav = [
        await 상자(page.getByTestId("muscle-balance-prev")),
        await 상자(page.getByTestId("muscle-balance-next")),
      ];
      expect(nav[0].width).toBeGreaterThanOrEqual(44);
      expect(nav[1].x + nav[1].width).toBeLessThanOrEqual(w);
      const chips = bal.locator('[data-testid^="untrained-chip-"]');
      const cn = await chips.count();
      const chipBoxes: Box[] = [];
      for (let i = 0; i < cn; i++) chipBoxes.push(await 상자(chips.nth(i)));
      for (let i = 0; i < cn; i++)
        for (let j = i + 1; j < cn; j++) expect(겹침(chipBoxes[i], chipBoxes[j])).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const cStats = await 대비_재기(page, "muscle-balance-map");
      expect(cStats.fill3).toBeGreaterThanOrEqual(3);
      expect(cStats.outline0 ?? 0).toBeGreaterThanOrEqual(3);
      if (w === 360) console.log(`대비 ${scheme}(통계)`, JSON.stringify(cStats));
      if (SHOTS) {
        await bal.scrollIntoViewIfNeeded();
        await 캡처(page, `stats-balance-${w}-${scheme}`, bal);
      }

      // 카탈로그 필터
      await bal.getByTestId("untrained-chip-calves").click();
      await expect(page.getByTestId("chip-muscle-calves")).toHaveAttribute("aria-pressed", "true", {
        timeout: 20_000,
      });
      const chipBox = await 상자(page.getByTestId("chip-muscle-calves"));
      expect(chipBox.x).toBeGreaterThanOrEqual(0);
      expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(w); // 고른 칩이 보이게 굴렸다
      await 캡처(page, `catalog-filter-${w}-${scheme}`);
    }
  }
});

test("시안 비교 캡처(빨강 농도 vs 무채 농도)", async ({ page }) => {
  test.skip(!SHOTS || !process.env.PROPOSAL_DIR, "SHOTS=1 · PROPOSAL_DIR 일 때만");
  for (const scheme of ["light", "dark"]) {
    await page.setViewportSize({ width: 1300, height: 900 });
    await page.goto(`file://${process.env.PROPOSAL_DIR}/sheet-${scheme}.html`);
    await page.screenshot({ path: `${SHOT_DIR}/proposal-${scheme}.png`, fullPage: true });
  }
});
