// 화면 지도 #T18(S-159 h.prev) — 첫 안내는 그 버튼 옆 말풍선 · 「알겠어요」 없음 · 몇 초 뒤 저절로 · 어디를 눌러도 사라짐
//
// 확인하는 것(360px · 다크):
//   · 「이전」 안내가 보이는 첫 「이전」 칩과 겹치거나 맞닿는다(꼬리 칸이 칩에 닿음) · 화면 밖으로 넘치지 않는다
//   · 「알겠어요」 버튼이 없다 · 낭독기 알림 칸(role=status)에 글이 들어간다
//   · 버튼이 아닌 곳을 누르면 바로 사라지고 본 것 → 새로 열어도 다시 안 뜸
//   · 아무것도 안 하면 몇 초 뒤(여기선 liftgram.hint.ms=3000) 저절로 사라지고 본 것
//   · 말풍선은 누름을 받지 않는다(덮은 자리 버튼이 그대로) · 스크롤 끌기는 닫지 않는다
//   · 루틴 세트 번호 안내도 세트 번호 옆
import { expect, type Locator, type Page, test } from "@playwright/test";
import { 빈곳 } from "./helpers/blankSpot";

const base = process.env.BASE ?? "http://127.0.0.1:3100";
const 저장소 = (ms: string) => ({
  cookies: [],
  origins: [
    {
      origin: base,
      localStorage: [
        { name: "onboarding_seen_v1", value: "yes" },
        { name: "liftgram.nudge.suppressed", value: "e2e" },
        { name: "liftgram.hint.ms", value: ms },
      ],
    },
  ],
});

test.use({ viewport: { width: 360, height: 740 }, colorScheme: "dark" });

const PREV = '[data-testid="set-prev"]:not([disabled])';
const 첫세트 = (page: Page) => page.getByTestId("set-list").first().locator("> div").first();

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
}

async function 빠른_운동(page: Page, 종목: string[]) {
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  for (const 이름 of 종목) {
    await page.getByTestId("btn-add-exercise").click();
    await page.getByTestId("picker-search").fill(이름);
    await page.getByTestId("picker-list").locator("button").first().click();
    await page.getByTestId("picker-confirm").click();
    await expect(page.getByTestId("exercise-picker")).toHaveCount(0);
  }
}

async function 기록_하나_남기기(page: Page) {
  await 빠른_운동(page, ["바벨 벤치프레스"]);
  const row = 첫세트(page);
  await row.getByTestId("set-weight").fill("60");
  await row.getByTestId("set-reps").fill("8");
  await row.getByTestId("set-reps").blur();
  await row.getByTestId("set-done").click();
  await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 15_000 });
  for (const id of ["btn-finish-dont-save", "btn-finish-today"]) {
    const b = page.getByTestId(id);
    if (await b.isVisible()) await b.click();
  }
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

/** 말풍선 상자와 대상 상자가 겹치거나 맞닿는다(2px 안) · 가로로도 대상 위에 걸친다 · 화면 안 */
async function 붙어_있음(page: Page, hint: Locator, target: Locator) {
  await expect
    .poll(async () => {
      const h = await hint.boundingBox();
      const t = await target.boundingBox();
      if (!h || !t) return "없음";
      const gapY = Math.max(t.y - (h.y + h.height), h.y - (t.y + t.height));
      const overlapX = Math.min(h.x + h.width, t.x + t.width) - Math.max(h.x, t.x);
      const inView = h.x >= 0 && h.x + h.width <= 360 && h.y >= 0 && h.y + h.height <= 740;
      return gapY <= 2 && overlapX > 0 && inView ? "ok" : JSON.stringify({ h, t, gapY, overlapX });
    })
    .toBe("ok");
}

async function 다크_말풍선(hint: Locator) {
  const c = await hint.evaluate((el) => {
    const card = el.firstElementChild as HTMLElement;
    return {
      bg: getComputedStyle(card).backgroundColor,
      ink: getComputedStyle(card.querySelector("*") as Element).color,
    };
  });
  // 다크에서 말풍선 바탕은 밝은 잉크(#F5F7F9), 글은 어두운 바탕색 — 서로 다르다
  expect(c.bg).toBe("rgb(245, 247, 249)");
  expect(c.ink).not.toBe(c.bg);
}

test.describe("길게(60초) — 자리 · 버튼 없음 · 누르면 사라짐", () => {
  test.use({ storageState: 저장소("60000") });

  test("「이전」 칩 옆 말풍선 · 「알겠어요」 없음 · 빈 곳을 누르면 바로 사라지고 다시 안 뜸", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await 카탈로그_준비(page);
    await 기록_하나_남기기(page);
    await 빠른_운동(page, ["바벨 벤치프레스"]);
    const hint = page.getByTestId("hint-prev");
    await expect(hint).toBeVisible({ timeout: 15_000 });
    await expect(hint).toContainText("이전");
    await expect(page.getByTestId("hint-prev-ok")).toHaveCount(0);
    await expect(hint.locator("button")).toHaveCount(0);
    await expect(page.getByTestId("hint-prev-live")).toHaveAttribute("role", "status");
    await expect(page.getByTestId("hint-prev-live")).toContainText("이전");
    await 붙어_있음(page, hint, page.locator(PREV).first());
    await 다크_말풍선(hint);
    // 말풍선은 누름을 받지 않는다 — 덮은 자리의 버튼이 그대로 눌린다(REV-109 #1)
    const under = await hint.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { pe: getComputedStyle(el).pointerEvents, inside: !!hit && el.contains(hit) };
    });
    expect(under).toEqual({ pe: "none", inside: false });
    const w = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(w).toBeLessThanOrEqual(0);
    // 몇 초가 지나도(60초 설정) 그대로 — 저절로 사라지는 건 시간 때문이다
    await page.waitForTimeout(1500);
    await expect(hint).toBeVisible();

    const p = await 빈곳(page);
    await page.mouse.click(p.x, p.y);
    await expect(hint).toHaveCount(0);
    await expect(page).toHaveURL(/\/workout/);
    expect(await page.evaluate(() => localStorage.getItem("liftgram.hint.prev"))).toBe("seen");
    await page.reload();
    await expect(page.locator(PREV).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(800);
    await expect(hint).toHaveCount(0);
  });

  test("끌어서 스크롤(10px 넘게 움직인 누름)은 닫지 않는다 · 키보드로 칩을 눌러도 동작 경로로 본 것", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await 카탈로그_준비(page);
    await 기록_하나_남기기(page);
    await 빠른_운동(page, ["바벨 벤치프레스"]);
    const hint = page.getByTestId("hint-prev");
    await expect(hint).toBeVisible({ timeout: 15_000 });
    const p = await 빈곳(page);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x, p.y - 40, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(hint).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("liftgram.hint.prev"))).toBeNull();
    // 키보드로 칩 — 누름(포인터)이 없어도 그 동작을 했으니 본 것(SetRowEdit 의 markCoachMarkSeen)
    await 첫세트(page).getByTestId("set-prev").focus();
    await page.keyboard.press("Enter");
    await expect(hint).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("liftgram.hint.prev"))).toBe("seen");
  });

  test("칩 자체를 누르면 — 말풍선은 사라지고 칩 동작(지난 값 채우기)은 그대로", async ({ page }) => {
    test.setTimeout(240_000);
    await 카탈로그_준비(page);
    await 기록_하나_남기기(page);
    await 빠른_운동(page, ["바벨 벤치프레스"]);
    const hint = page.getByTestId("hint-prev");
    await expect(hint).toBeVisible({ timeout: 15_000 });
    await 첫세트(page).getByTestId("set-prev").click();
    await expect(hint).toHaveCount(0);
    await expect(첫세트(page).getByTestId("set-weight")).toHaveValue("60");
  });

  test("루틴 세트 번호 안내도 세트 번호 옆", async ({ page }) => {
    test.setTimeout(150_000);
    await 카탈로그_준비(page);
    await page.goto("/");
    await page.getByTestId("btn-new-routine").click();
    await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("btn-add-routine-exercise").click();
    await page.getByTestId("picker-search").fill("바벨 벤치프레스");
    await page.getByTestId("picker-list").locator("button").first().click();
    await page.getByTestId("picker-confirm").click();
    const hint = page.getByTestId("hint-rx-type");
    // 세트 번호가 아래 저장 막대 뒤에 있는 동안은 뜨지 않는다(가린 버튼을 가리키지 않음) — 굴려서 보이게 하면 뜬다
    await expect(page.getByTestId("set-table").first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    await expect(hint).toBeHidden();
    await page
      .getByTestId("rx-type")
      .first()
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
    await expect(hint).toBeVisible({ timeout: 15_000 });
    await expect(hint.locator("button")).toHaveCount(0);
    await 붙어_있음(page, hint, page.getByTestId("rx-type").first());
  });
});

test.describe("짧게(3초) — 저절로 사라짐", () => {
  test.use({ storageState: 저장소("3000") });

  test("아무것도 안 하면 몇 초 뒤 사라지고 본 것 · 다시 안 뜸", async ({ page }) => {
    test.setTimeout(240_000);
    await 카탈로그_준비(page);
    await 기록_하나_남기기(page);
    await 빠른_운동(page, ["바벨 벤치프레스"]);
    const hint = page.getByTestId("hint-prev");
    await expect(hint).toBeVisible({ timeout: 15_000 });
    const t0 = Date.now();
    await expect(hint).toHaveCount(0, { timeout: 8_000 });
    // 바로 사라진 게 아니다(3초 + 사라지는 0.2초 · 감지가 1초 늦어도 남는 하한 1초 · REV-109 #8)
    expect(Date.now() - t0).toBeGreaterThan(1000);
    expect(await page.evaluate(() => localStorage.getItem("liftgram.hint.prev"))).toBe("seen");
    // 낭독기 알림 칸 글은 말풍선이 사라져도 남는다(읽는 중에 끊지 않게)
    await expect(page.getByTestId("hint-prev-live")).toContainText("이전");
    await page.reload();
    await expect(page.locator(PREV).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(3500);
    await expect(hint).toHaveCount(0);
  });
});
