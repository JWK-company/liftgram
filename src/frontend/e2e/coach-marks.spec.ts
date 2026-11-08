// 숨은 동작 첫 안내 e2e(SPEC-046 · SRS-111 R4·R5)
//
// 기본 설정(playwright.config.ts)은 liftgram.hint.suppressed 로 안내를 막는다 — 여기서만 막지 않는다.
//   (a) 「이전」: 처음 한 번 · 창이 열리면 숨고 닫히면 다시 · 입력 중엔 숨음 · 「알겠어요」 뒤엔 다시 와도 안 뜸 ·
//       포커스를 옮기지 않음 · 설정 「안내 다시 보기」로 다시 뜸 · 「이전」을 누르면 본 것
//   (b) 루틴 세트 번호: 세트 표가 보이면 · 번호를 누르면 본 것
//   (c) 슈퍼셋 묶음 완료로 휴식이 걸리면 휴식 막대 위에
import { expect, test, type Page } from "@playwright/test";

const base = process.env.BASE ?? "http://127.0.0.1:3100";
test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: base,
        localStorage: [
          { name: "onboarding_seen_v1", value: "yes" },
          { name: "liftgram.nudge.suppressed", value: "e2e" },
        ],
      },
    ],
  },
});

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

const PREV = '[data-testid="set-prev"]:not([disabled])';

/** 본 안내 — 전제(눌리는 「이전」 칩)가 참이 된 뒤에도 안 뜬다 */
async function 안_뜸(page: Page, hint: ReturnType<Page["getByTestId"]>) {
  await expect(page.locator(PREV).first()).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => localStorage.getItem("liftgram.hint.prev"))).toBe("seen");
  await expect(hint).toHaveCount(0);
}

const 첫세트 = (page: Page) => page.getByTestId("set-list").first().locator("> div").first();

async function 세트_기록(page: Page, kg: number, reps: number) {
  const row = 첫세트(page);
  await row.getByTestId("set-weight").fill(String(kg));
  await row.getByTestId("set-reps").fill(String(reps));
  await row.getByTestId("set-reps").blur();
  await row.getByTestId("set-done").click();
  await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
}

async function 마치기(page: Page) {
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

test("(a) 「이전」 첫 안내 — 한 번만 · 창·입력 중엔 숨음 · 포커스 그대로 · 다시 보기", async ({ page }) => {
  test.setTimeout(240_000);
  await 카탈로그_준비(page);
  // 이전 기록이 없으면 안 뜬다
  await 빠른_운동(page, ["바벨 벤치프레스"]);
  await expect(page.getByTestId("set-list").first()).toBeVisible({ timeout: 15_000 });
  // 전제가 거짓(눌리는 「이전」 칩 없음)이라 안 뜬다 — 시간을 기다리지 않는다
  await expect(page.locator(PREV)).toHaveCount(0);
  await expect(page.getByTestId("hint-prev")).toHaveCount(0);
  await 세트_기록(page, 60, 8);
  await 마치기(page);

  // 이전 기록이 생긴 뒤 — 안내가 뜬다(낭독기는 status 로 한 번 · 포커스는 옮기지 않는다)
  await 빠른_운동(page, ["바벨 벤치프레스"]);
  const hint = page.getByTestId("hint-prev");
  await expect(hint).toBeVisible({ timeout: 15_000 });
  await expect(hint).toContainText("이전");
  // 낭독기 알림 칸(늘 붙어 있는 status)에 한 번 들어간다
  const live = page.getByTestId("hint-prev-live");
  await expect(live).toHaveAttribute("role", "status");
  await expect(live).toContainText("이전");
  // 포커스를 옮기지 않는다 — 다른 버튼에 둔 포커스가 그대로
  await page.getByTestId("btn-add-exercise").focus();
  await expect(hint).toBeVisible();
  await expect(page.getByTestId("btn-add-exercise")).toBeFocused();

  // 입력 중엔 숨는다
  await 첫세트(page).getByTestId("set-weight").focus();
  await expect(hint).toHaveCount(0);
  await 첫세트(page).getByTestId("set-weight").blur();
  await expect(hint).toBeVisible();

  // 창이 열리면 숨고 닫히면 다시
  await page.getByTestId("btn-we-menu").first().click();
  await expect(hint).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(hint).toBeVisible({ timeout: 5_000 });
  // 시트의 Esc 가 안내까지 닫지 않았다 · 다시 떠도 알림 칸 글은 그대로(다시 읽지 않음)
  expect(await page.evaluate(() => localStorage.getItem("liftgram.hint.prev"))).toBeNull();
  await expect(live).toHaveCount(1);

  // 말풍선 밖은 그대로 눌린다 — 안내가 떠 있어도 「이전」 칩을 누를 수 있다(누르면 본 것)
  await 첫세트(page).getByTestId("set-prev").click();
  await expect(첫세트(page).getByTestId("set-weight")).toHaveValue("60");
  await expect(hint).toHaveCount(0);
  await page.reload();
  await 안_뜸(page, hint);

  // 설정 「안내 다시 보기」 → 다시 뜬다 → 「알겠어요」 → 다시 와도 안 뜬다
  await page.goto("/profile");
  await page.getByTestId("row-hints-reset").click();
  await expect(page.getByText("사용법 안내를 다시 보여 드릴게요")).toBeVisible();
  await page.goto("/workout");
  // 위에서 「이전」을 채운 세트는 아직 안 마쳤다 — 「이전」 칩이 여전히 눌린다
  await expect(hint).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("hint-prev-ok").click();
  await expect(hint).toHaveCount(0);
  await page.reload();
  await 안_뜸(page, hint);

  // e2e 억제 표식은 「다시 보기」로 지워지지 않는다
  await page.evaluate(() => localStorage.setItem("liftgram.hint.suppressed", "e2e"));
  await page.goto("/profile");
  await page.getByTestId("row-hints-reset").click();
  expect(await page.evaluate(() => localStorage.getItem("liftgram.hint.suppressed"))).toBe("e2e");
  expect(await page.evaluate(() => localStorage.getItem("liftgram.hint.prev"))).toBeNull();
  await page.goto("/workout");
  await expect(page.locator(PREV).first()).toBeVisible({ timeout: 20_000 });
  await expect(hint).toHaveCount(0);
});

test("(b) 루틴 세트 번호 첫 안내 — 세트 표가 보이면 · 번호를 누르면 본 것", async ({ page }) => {
  test.setTimeout(150_000);
  await 카탈로그_준비(page);
  await page.goto("/");
  await expect(page.getByTestId("btn-new-routine")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  const hint = page.getByTestId("hint-rx-type");
  await expect(hint).toHaveCount(0);
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  await expect(page.getByTestId("set-table").first()).toBeVisible({ timeout: 15_000 });
  await expect(hint).toBeVisible({ timeout: 10_000 });
  await expect(hint).toContainText("세트 번호");
  await page.getByTestId("set-table-row").first().getByTestId("rx-type").click();
  await expect(page.getByTestId("rx-type-sheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("rx-type-sheet")).toHaveCount(0);
  await expect(hint).toHaveCount(0);
});

test("(c) 슈퍼셋 묶음 완료로 휴식이 걸리면 — 휴식 막대 위에 「길게 누르면 이 종목만」", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await 빠른_운동(page, ["바벨 벤치프레스", "바벨 로우"]);
  await page.getByTestId("workout-exercises").locator("> div").first().getByTestId("btn-we-menu").click();
  await page.getByTestId("btn-superset").click();
  await page.getByTestId("superset-option").first().click();
  await expect(page.getByTestId("btn-unlink-superset")).toBeVisible({ timeout: 10_000 });
  const hint = page.getByTestId("hint-long-done");
  await expect(hint).toHaveCount(0);
  await 세트_기록(page, 60, 8);
  await expect(page.getByTestId("rest-bar")).toBeVisible({ timeout: 10_000 });
  await expect(hint).toBeVisible({ timeout: 10_000 });
  await expect(hint).toContainText("길게");
  // 휴식 막대 위 — 막대가 자리를 잡을 때까지 다시 잰다
  await expect
    .poll(async () => {
      const h = await hint.boundingBox();
      const bar = await page.getByTestId("rest-bar").boundingBox();
      return h && bar ? h.y + h.height <= bar.y + 1 : false;
    })
    .toBe(true);
  await page.getByTestId("hint-long-done-ok").click();
  await expect(hint).toHaveCount(0);
});

test("하나씩 — 「이전」 안내가 떠 있어도 슈퍼셋 묶음 완료 순간엔 그 안내가 차례를 넘겨받는다", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await 카탈로그_준비(page);
  await 빠른_운동(page, ["바벨 벤치프레스"]);
  await 세트_기록(page, 60, 8);
  await 마치기(page);
  await 빠른_운동(page, ["바벨 벤치프레스", "바벨 로우"]);
  const prev = page.getByTestId("hint-prev");
  const long = page.getByTestId("hint-long-done");
  await expect(prev).toBeVisible({ timeout: 15_000 });
  await expect(long).toHaveCount(0);
  await page.getByTestId("workout-exercises").locator("> div").first().getByTestId("btn-we-menu").click();
  await page.getByTestId("btn-superset").click();
  await page.getByTestId("superset-option").first().click();
  await expect(page.getByTestId("btn-unlink-superset")).toBeVisible({ timeout: 10_000 });
  await 세트_기록(page, 60, 8);
  await expect(long).toBeVisible({ timeout: 10_000 });
  // 한 번에 하나 — 「이전」은 세트를 마쳤으니 본 것
  await expect(prev).toHaveCount(0);
  await page.getByTestId("hint-long-done-ok").click();
  await expect(long).toHaveCount(0);
});
