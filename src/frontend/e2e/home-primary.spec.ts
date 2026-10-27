// 운동 홈의 주 행동 하나(화면 정리 M-2 확정 A · SRS-072) — 상태마다 「무엇이 빨강 채움인가」를 잰다.
//
//   루틴 없음          → 빠른 운동 시작
//   루틴 있음(이력 없음) → 오늘 할 루틴(첫 루틴) 「시작」, 빠른 운동 시작은 보조
//   스케줄상 오늘 배정   → 오늘 카드 「시작」
//   오늘 이미 운동함     → 빠른 운동 시작
//   운동 중            → 홈에는 빨강 채움이 없다(셸 하단 막대 「열기」가 주 행동)
import { expect, test } from "@playwright/test";
import { 카탈로그_준비 } from "./fixtures/declutter-seed";

type Page = import("@playwright/test").Page;

test.use({ viewport: { width: 390, height: 844 } });

async function brandRgb(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.createElement("span");
    el.style.color = "var(--color-brand)";
    document.body.appendChild(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  });
}

/** main 안에서 바탕이 브랜드색인 보이는 버튼들의 testid(셸 막대·탭바 제외). */
async function filledBrand(page: Page): Promise<string[]> {
  const brand = await brandRgb(page);
  return page.evaluate((brand) => {
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
  }, brand);
}

async function 루틴_만들기(page: Page, 이름: string) {
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
}

/**
 * 콜드 로드 동안 「빨강 채움」이 어디에 나타났는지를 프레임마다 기록한다(/qa M-2 H-1·H-2 · M-6-1).
 *   __seen     처음 나타난 순서대로의 빨강 testid(한 번이라도 빨강이었으면 들어간다)
 *   __atReady  `home-ready` 가 처음 붙은 프레임의 빨강 목록(표식을 믿을 수 있는가)
 *   __quickTops 빠른 시작이 **누를 수 있는 동안**의 위치(px) 변화 — 눌릴 수 있는 버튼이 밀려 내려가면 오탭(M-2)
 * 문서마다 다시 깔리므로(addInitScript) 마지막으로 연 문서의 기록이다. 클라이언트 이동을 잴 때는 `빨강_기록_초기화`.
 */
async function 빨강_관찰(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__seen = [];
    w.__atReady = null;
    w.__quickTops = [];
    const loop = () => {
      try {
        // 홈 화면만 잰다 — 요약의 「완료」 같은 다른 화면의 주 행동은 셈하지 않는다
        if (document.body && location.pathname === "/") {
          let probe = w.__probe as HTMLElement | undefined;
          if (!probe) {
            probe = document.createElement("span");
            probe.style.color = "var(--color-brand)";
            probe.style.display = "none";
            document.body.appendChild(probe);
            w.__probe = probe;
          }
          const brand = getComputedStyle(probe).color;
          const ids = [...document.querySelectorAll("main button, main a")]
            .filter(
              (el) =>
                !el.closest('[data-testid="shell-nav"]') && !el.closest('[data-testid="global-workout-bar"]'),
            )
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0 && getComputedStyle(el).backgroundColor === brand;
            })
            .map((el) => el.getAttribute("data-testid") ?? "?");
          const seen = w.__seen as string[];
          for (const id of ids) if (!seen.includes(id)) seen.push(id);
          if (w.__atReady === null && document.querySelector('[data-testid="home-ready"]')) w.__atReady = ids;
          const q = document.querySelector('[data-testid="btn-quick-start"]') as HTMLButtonElement | null;
          if (q && !q.disabled) {
            const top = Math.round(q.getBoundingClientRect().top + window.scrollY);
            const tops = w.__quickTops as number[];
            if (tops[tops.length - 1] !== top) tops.push(top);
          }
        }
      } catch {
        // 측정 실패는 다음 프레임에 다시
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

async function 빨강_기록(
  page: Page,
): Promise<{ seen: string[]; atReady: string[] | null; quickTops: number[] }> {
  // 표식 뒤에도 잠깐 더 본다 — 늦게 오는 값(진행 중 운동·추천)이 빨강을 옮기는지
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    return {
      seen: w.__seen as string[],
      atReady: w.__atReady as string[] | null,
      quickTops: w.__quickTops as number[],
    };
  });
}

async function 빨강_기록_초기화(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__seen = [];
    w.__atReady = null;
    w.__quickTops = [];
  });
}

/** 주 행동 계산(추천 읽기)이 끝났다는 표식을 기다린다. 표식이 없던 옛 빌드에서 수정 전 실패를 확인할 때는
 *  HOME_READY_OPTIONAL=1 로 고정 대기만 한다(표식 부재가 아니라 빨강 위치로 실패하는지 보려고). */
async function 주행동_계산_대기(page: Page) {
  if (process.env.HOME_READY_OPTIONAL) {
    await page.waitForTimeout(3000);
    return;
  }
  await expect(page.getByTestId("home-ready")).toHaveCount(1, { timeout: 20_000 });
}

/** 홈이 다 그려질 때까지 — 빠른 시작이 보이고 주 행동 계산(추천 읽기)이 끝난 뒤. */
async function 홈(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeVisible({ timeout: 20_000 });
  await 주행동_계산_대기(page);
}

test("루틴이 없으면 빠른 운동 시작이 유일한 주 행동", async ({ page }) => {
  await 카탈로그_준비(page);
  await 홈(page);
  expect(await filledBrand(page)).toEqual(["btn-quick-start"]);
});

test("루틴이 있으면 오늘 할 루틴 「시작」이 주 행동, 빠른 운동 시작은 보조", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await 루틴_만들기(page, "주행동 루틴");
  await 홈(page);
  await expect(page.getByTestId("next-card")).toContainText("주행동 루틴");
  expect(await filledBrand(page)).toEqual(["btn-start-next"]);
});

test("스케줄상 오늘 배정이면 오늘 카드 「시작」이 주 행동", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  const 이름 = `오늘루틴${Date.now().toString(36)}`;
  await 루틴_만들기(page, 이름);
  await page.goto("/");
  await page.getByTestId("entry-schedule").click();
  await expect(page.getByTestId("schedule-editor")).toBeVisible({ timeout: 20_000 });
  const today = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
  await page.getByTestId(`schedule-day-${today}`).click();
  await page.getByTestId("schedule-day-picker").getByText(이름).click();
  await page.getByTestId("schedule-save").click();
  await expect(page.getByTestId("schedule-editor")).toHaveCount(0, { timeout: 20_000 });
  await 홈(page);
  await expect(page.getByTestId("btn-start-today")).toBeVisible();
  expect(await filledBrand(page)).toEqual(["btn-start-today"]);
});

test("오늘 이미 운동했으면 빠른 운동 시작이 주 행동 · 운동 중이면 홈에 빨강 채움이 없다", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await 카탈로그_준비(page);
  await 루틴_만들기(page, "완료할 루틴");

  // 운동 중 — 루틴으로 시작해 세트 하나를 기록한다.
  await page.getByTestId("btn-start-routine").first().click();
  await expect(page.getByTestId("btn-complete")).toBeVisible({ timeout: 20_000 });
  const row = page.getByTestId("set-list").first().locator("> div").first();
  await row.getByTestId("set-weight").fill("60");
  await row.getByTestId("set-reps").fill("8");
  await row.getByTestId("set-reps").blur();
  await row.getByTestId("set-done").click();
  await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
  await page.goto("/");
  await expect(page.getByTestId("global-workout-bar")).toBeVisible({ timeout: 20_000 });
  await 주행동_계산_대기(page);
  expect(await filledBrand(page)).toEqual([]);

  // 완료 — 오늘 운동을 마쳤으니 다시 빠른 운동 시작이 주 행동.
  await page.goto("/workout");
  await expect(page.getByTestId("btn-complete")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  const close = page.getByTestId("btn-summary-close");
  await expect(close).toBeVisible({ timeout: 20_000 });
  // 완료 직후 루틴 반영 시트가 요약 위에 뜨면 「오늘만」으로 닫는다.
  const today = page.getByTestId("btn-finish-today");
  if (await today.isVisible()) await today.click();
  await close.click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await 홈(page);
  expect(await filledBrand(page)).toEqual(["btn-quick-start"]);
});

// ── /qa M-2 반영(H-1·H-2·M-1·M-3·M-6) ───────────────────────────────────────────────

test("콜드 로드 — 빨강은 처음부터 최종 주 행동 하나에만, 빠른 시작은 밀려 내려가지 않는다(H-1·M-2)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await 루틴_만들기(page, "깜빡임 루틴");
  await 빨강_관찰(page);
  await 홈(page);
  const log = await 빨강_기록(page);
  expect(log.seen, "로드 중에 빨강이 옮겨 다니면 안 된다").toEqual(["btn-start-next"]);
  expect(log.atReady, "home-ready 가 붙은 순간 이미 최종 주 행동").toEqual(["btn-start-next"]);
  expect(log.quickTops.length, `누를 수 있는 빠른 시작의 위치 변화 ${log.quickTops}`).toBeLessThanOrEqual(1);
  // 머리말은 근거별 — 「내 루틴」(구역 제목)과 겹치지 않는다(M-1)
  await expect(page.getByTestId("next-card")).toContainText("다음 운동");
  await expect(page.getByTestId("next-card")).not.toContainText("내 루틴");
  // 목록의 같은 루틴에는 「오늘」 칩
  await expect(page.getByTestId("routine-list").getByTestId("today-chip")).toHaveCount(1);
});

test("운동 중 콜드 로드 — 홈에 빨강 채움이 한 프레임도 없다(H-2 A)", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await 루틴_만들기(page, "진행중 루틴");
  await page.getByTestId("btn-start-routine").first().click();
  await expect(page.getByTestId("btn-complete")).toBeVisible({ timeout: 20_000 });
  await 빨강_관찰(page);
  await page.goto("/");
  await expect(page.getByTestId("global-workout-bar")).toBeVisible({ timeout: 20_000 });
  await 주행동_계산_대기(page);
  const log = await 빨강_기록(page);
  expect(log.seen).toEqual([]);
});

test("운동을 마치고 홈으로 돌아오는 순간 — 방금 끝낸 루틴을 빨강으로 권하지 않는다(H-2 B)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await 카탈로그_준비(page);
  await 루틴_만들기(page, "마친 루틴");
  await page.getByTestId("btn-start-routine").first().click();
  await expect(page.getByTestId("btn-complete")).toBeVisible({ timeout: 20_000 });
  const row = page.getByTestId("set-list").first().locator("> div").first();
  await row.getByTestId("set-weight").fill("60");
  await row.getByTestId("set-reps").fill("8");
  await row.getByTestId("set-reps").blur();
  await row.getByTestId("set-done").click();
  await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
  await 빨강_관찰(page);
  await page.goto("/workout");
  await expect(page.getByTestId("btn-complete")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  const close = page.getByTestId("btn-summary-close");
  await expect(close).toBeVisible({ timeout: 20_000 });
  const today = page.getByTestId("btn-finish-today");
  if (await today.isVisible()) await today.click();
  await 빨강_기록_초기화(page);
  await close.click(); // 클라이언트 이동 — 문서를 새로 받지 않는다
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await 주행동_계산_대기(page);
  const log = await 빨강_기록(page);
  expect(log.seen).toEqual(["btn-quick-start"]);
});

test("스케줄상 오늘 휴식이면 빠른 운동 시작이 주 행동", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await 루틴_만들기(page, "휴식일 루틴");
  await page.goto("/");
  await page.getByTestId("entry-schedule").click();
  await expect(page.getByTestId("schedule-editor")).toBeVisible({ timeout: 20_000 });
  const todayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
  await page.getByTestId(`schedule-day-${todayKey}`).click();
  await page.getByTestId("pick-rest").click();
  await page.getByTestId("schedule-save").click();
  await expect(page.getByTestId("schedule-editor")).toHaveCount(0, { timeout: 20_000 });
  await 홈(page);
  expect(await filledBrand(page)).toEqual(["btn-quick-start"]);
});

test("어제 놓친 루틴이 곧 오늘 할 루틴이면 카드는 한 장 — 놓친 루틴 카드를 따로 띄우지 않는다(M-3)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  const 이름 = `놓친루틴${Date.now().toString(36)}`;
  await 루틴_만들기(page, 이름);
  await page.goto("/");
  await page.getByTestId("entry-schedule").click();
  await expect(page.getByTestId("schedule-editor")).toBeVisible({ timeout: 20_000 });
  const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const yKey = keys[(new Date().getDay() + 6) % 7];
  await page.getByTestId(`schedule-day-${yKey}`).click();
  await page.getByTestId("schedule-day-picker").getByText(이름).click();
  await page.getByTestId("schedule-save").click();
  await expect(page.getByTestId("schedule-editor")).toHaveCount(0, { timeout: 20_000 });
  await 홈(page);
  await expect(page.getByTestId("next-card")).toContainText(이름);
  await expect(page.getByTestId("catchup-card")).toHaveCount(0);
  expect(await filledBrand(page)).toEqual(["btn-start-next"]);
});
