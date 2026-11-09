// SPEC-051 세트 방식별 휴식 e2e
//
// 확인하는 것:
//   · 다음 세트 기준 — 탑·백오프: 웜업 → 웜업 0:45 · 웜업 → 피더 1:30 · 피더 → 탑 4:00 · 탑 → 백오프 3:00
//   · ⏱ 휴식 시트 — 기본 세트 + 그 종목 칸만 · 「탑 직전」 4:30 으로 → 점 · 칩 점 · 새로고침 뒤에도 그대로
//   · 다음 운동에서 같은 방식을 고르면 4:30 이 이어진다 → 피더 완료 시 4:30 · 「권장값으로」
//   · 일반 종목은 시트 한 줄(지금 그대로) · 360px 넘침 없음 · 다크에서 점·줄이 토큰 색
//   · 루틴에 반영(리뷰) — 오늘 시트에서 바꾸면 「세트별 휴식」이 켜진 채 뜨고, 기억으로만 실린 다음 운동엔 뜨지 않는다
import { expect, test, type Page } from "@playwright/test";

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
}

async function 빠른_운동(page: Page, 종목: string) {
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill(종목);
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  await expect(page.getByTestId("exercise-picker")).toHaveCount(0);
  await expect(블록(page).getByTestId("set-list")).toBeVisible({ timeout: 15_000 });
}

const 블록 = (page: Page) => page.getByTestId("workout-exercises").locator("> div").first();
const 세트들 = (page: Page) => 블록(page).getByTestId("set-list").locator("> div");

async function 방식_바꾸기(page: Page, id: string) {
  await 블록(page).getByTestId("btn-we-menu").click();
  await page.getByTestId("btn-change-scheme").click();
  await page.getByTestId(`we-scheme-${id}`).click();
  // 직접 적은 값이 있으면 「다시 짜기」를 묻는다 — 뜨면 누른다
  const ask = page.getByTestId("confirm-change-scheme").getByTestId("dialog-confirm");
  const done = 블록(page).locator(`[data-testid="we-scheme"][data-scheme="${id}"]`);
  await expect(ask.or(done)).toBeVisible({ timeout: 15_000 });
  if (await ask.isVisible().catch(() => false)) await ask.click();
  await expect(블록(page).getByTestId("we-scheme")).toHaveAttribute("data-scheme", id, { timeout: 15_000 });
}

async function 세트_하기(page: Page, k: number) {
  const row = 세트들(page).nth(k);
  await row.getByTestId("set-weight").fill("40");
  await row.getByTestId("set-reps").fill("5");
  await row.getByTestId("set-reps").blur();
  await row.getByTestId("set-done").click();
  await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
}

/** 휴식 막대가 m:ss(또는 1초 지난 값)에서 시작했는가 — 막대를 건너뛰어 다음 세트를 깨끗하게 */
async function 휴식_확인(page: Page, sec: number) {
  const bar = page.getByTestId("rest-bar");
  await expect(bar).toBeVisible({ timeout: 5_000 });
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const ok = [clock(sec), clock(sec - 1), clock(sec - 2)];
  await expect(bar).toContainText(new RegExp(`휴식 (${ok.join("|")})`));
  await page.getByTestId("rest-skip").click();
  await expect(bar).toHaveCount(0);
}

async function 시트_닫기(page: Page) {
  await page.getByTestId("rest-sheet").getByRole("button", { name: "확인" }).click();
  await expect(page.getByTestId("rest-sheet")).toHaveCount(0);
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

test("탑·백오프 — 다음 세트 기준 휴식 · 「탑 직전」 4:30 · 새로고침·다음 운동에도 · 권장값으로", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await 카탈로그_준비(page);
  await 빠른_운동(page, "바벨 벤치프레스");
  await 방식_바꾸기(page, "topBackoff");
  await expect(세트들(page)).toHaveCount(5); // W W P T B

  // ① 권장값 — W→W 0:45 · W→P 1:30 · P→T 4:00 · T→B 3:00
  await 세트_하기(page, 0);
  await 휴식_확인(page, 45);
  await 세트_하기(page, 1);
  await 휴식_확인(page, 90);
  await 세트_하기(page, 2);
  await 휴식_확인(page, 240);
  await 세트_하기(page, 3);
  await 휴식_확인(page, 180);

  // ② 휴식 시트 — 기본 세트 + 웜업 사이 · 피더 전 · 탑 직전 · 탑 뒤
  const chip = 블록(page).getByTestId("btn-rest-setting");
  await expect(chip).toContainText("휴식 2:00");
  await expect(chip.getByTestId("rest-kind-dot")).toHaveCount(0);
  await chip.click();
  const sheet = page.getByTestId("rest-sheet");
  await expect(sheet.getByTestId("rest-kinds")).toBeVisible();
  const ids = await sheet
    .locator("[data-testid^=rest-kind-][data-changed]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
  expect(ids).toEqual([
    "rest-kind-base",
    "rest-kind-warmup",
    "rest-kind-feeder",
    "rest-kind-beforeTop",
    "rest-kind-afterTop",
  ]);
  await expect(sheet.getByTestId("rest-kind-beforeTop-value")).toHaveText("4:00");
  await sheet.getByTestId("rest-kind-beforeTop-plus").click();
  await sheet.getByTestId("rest-kind-beforeTop-plus").click();
  await expect(sheet.getByTestId("rest-kind-beforeTop-value")).toHaveText("4:30");
  await expect(sheet.getByTestId("rest-kind-beforeTop-dot")).toBeVisible();
  await expect(sheet.getByTestId("rest-kind-reset")).toBeVisible();
  // 누르는 자리 44px
  const plus = await sheet.getByTestId("rest-kind-beforeTop-plus").boundingBox();
  expect(plus && plus.width >= 44 && plus.height >= 44, `+ 버튼 ${JSON.stringify(plus)}`).toBeTruthy();
  await 시트_닫기(page);
  // 칩 글자는 그대로 + 점
  await expect(chip).toContainText("휴식 2:00");
  await expect(chip.getByTestId("rest-kind-dot")).toBeVisible();

  // ③ 새로고침 뒤에도 그대로
  await page.waitForTimeout(800); // 디스크 내려쓰기
  await page.reload();
  await expect(블록(page).getByTestId("we-scheme")).toHaveAttribute("data-scheme", "topBackoff", {
    timeout: 20_000,
  });
  await expect(블록(page).getByTestId("btn-rest-setting").getByTestId("rest-kind-dot")).toBeVisible();
  await 블록(page).getByTestId("btn-rest-setting").click();
  await expect(page.getByTestId("rest-kind-beforeTop-value")).toHaveText("4:30");
  await 시트_닫기(page);
  await 세트_하기(page, 4);
  await 마치기(page);

  // ④ 다음 운동 — 같은 방식을 고르면 4:30 이 이어진다 → 피더 완료 시 4:30
  await 빠른_운동(page, "바벨 벤치프레스");
  await 방식_바꾸기(page, "topBackoff");
  await expect(블록(page).getByTestId("btn-rest-setting").getByTestId("rest-kind-dot")).toBeVisible();
  await 세트_하기(page, 0);
  await 휴식_확인(page, 45);
  await 세트_하기(page, 1);
  await 휴식_확인(page, 90);
  await 세트_하기(page, 2);
  await 휴식_확인(page, 270);

  // ⑤ 권장값으로 — 점이 사라지고 다음 탑 직전은 4:00
  await 블록(page).getByTestId("btn-rest-setting").click();
  await page.getByTestId("rest-kind-reset").click();
  await expect(page.getByTestId("rest-kind-beforeTop-value")).toHaveText("4:00");
  await expect(page.getByTestId("rest-kind-beforeTop-dot")).toHaveCount(0);
  await 시트_닫기(page);
  await expect(블록(page).getByTestId("btn-rest-setting").getByTestId("rest-kind-dot")).toHaveCount(0);
  // 피더를 다시 해 본다 — 피더 완료 취소 후 다시 완료 → 다음 안 한 세트는 탑 → 4:00
  await 세트들(page).nth(2).getByTestId("set-done").click();
  await expect(세트들(page).nth(2).getByTestId("set-done")).toHaveAttribute("aria-pressed", "false");
  await 세트들(page).nth(2).getByTestId("set-done").click();
  await 휴식_확인(page, 240);
});

test("일반 종목은 시트 한 줄 그대로 · 세트 방식 시트 360px 넘침 없음 · 다크", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 360, height: 780 });
  await 카탈로그_준비(page);
  await 빠른_운동(page, "바벨 스쿼트");

  // 일반 — 한 줄(지금 스테퍼) · 종류 줄 없음 · 완료하면 종목 휴식 2:00
  await 블록(page).getByTestId("btn-rest-setting").click();
  await expect(page.getByTestId("rest-seconds")).toBeVisible();
  await expect(page.getByTestId("rest-kinds")).toHaveCount(0);
  await 시트_닫기(page);
  await 세트_하기(page, 0);
  await 휴식_확인(page, 120);

  // 피라미드로(끝낸 세트를 되돌려 틀 전체로) — 기본 세트 · 첫 본세트 직전 · 세트 사이(점점 늘림) · 360px 넘침 없음
  await 세트들(page).nth(0).getByTestId("set-done").click();
  await expect(세트들(page).nth(0).getByTestId("set-done")).toHaveAttribute("aria-pressed", "false");
  await 방식_바꾸기(page, "pyramid");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await 블록(page).getByTestId("btn-rest-setting").click();
  const sheet = page.getByTestId("rest-sheet");
  await expect(sheet.getByTestId("rest-kind-ramp")).toBeVisible();
  await expect(sheet.getByTestId("rest-kind-ramp")).toContainText("세트 사이(점점 늘림)");
  await expect(sheet.getByTestId("rest-kind-beforeWork")).toBeVisible();
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over, "가로 넘침").toBeLessThanOrEqual(0);
  for (const id of ["rest-kind-base", "rest-kind-beforeWork", "rest-kind-ramp"]) {
    const box = await sheet.getByTestId(id).boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 360, `${id} ${JSON.stringify(box)}`).toBeTruthy();
  }
  // 점 — 다크에서도 토큰 색(빨강 아님 · 완료 전용)
  await sheet.getByTestId("rest-kind-ramp-plus").click();
  const dot = sheet.getByTestId("rest-kind-ramp-dot");
  await expect(dot).toBeVisible();
  const colors = await page.evaluate(() => {
    const d = document.querySelector('[data-testid="rest-kind-ramp-dot"]') as HTMLElement;
    const probe = document.createElement("span");
    probe.style.color = "var(--color-ink2)";
    document.body.appendChild(probe);
    const ink2 = getComputedStyle(probe).color;
    probe.style.color = "var(--color-brand)";
    const brand = getComputedStyle(probe).color;
    probe.remove();
    return { dot: getComputedStyle(d).backgroundColor, ink2, brand };
  });
  expect(colors.dot).toBe(colors.ink2);
  expect(colors.dot).not.toBe(colors.brand);
  await 시트_닫기(page);
});

test("루틴에 반영 — 오늘 바꾸면 「세트별 휴식」이 뜨고 · 기억으로 실린 다음 운동엔 안 뜬다", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await 카탈로그_준비(page);
  // 탑·백오프 루틴(휴식 값 없음)
  const 이름 = `휴식${Date.now().toString(36)}`;
  await page.goto("/");
  await expect(page.getByTestId("btn-new-routine")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("routine-name").fill(이름);
  await page.getByTestId("routine-name").blur();
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  const 표 = page.getByTestId("set-table").first();
  await expect(표).toBeVisible({ timeout: 15_000 });
  await 표.getByTestId("scheme-chip").click();
  await page.getByTestId("scheme-topBackoff").click();
  await expect(표.getByTestId("scheme-chip")).toHaveAttribute("data-scheme", "topBackoff");
  await page.getByTestId("btn-routine-done").click();
  const 행 = page
    .getByTestId("routine-list")
    .locator("[data-testid^=routine-]")
    .filter({ hasText: 이름 })
    .first();
  await expect(행).toBeVisible({ timeout: 20_000 });
  const id = ((await 행.getAttribute("data-testid")) ?? "").replace("routine-", "");
  const 루틴_시작 = async () => {
    await page.goto("/");
    await page.getByTestId(`routine-${id}`).getByTestId("btn-start-routine").click();
    await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });
    await expect(블록(page).getByTestId("we-scheme")).toHaveAttribute("data-scheme", "topBackoff", {
      timeout: 20_000,
    });
  };
  const 완료 = async () => {
    await page.getByTestId("btn-complete").click();
    await page.getByTestId("dialog-confirm").click();
    await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 15_000 });
  };

  // ① 오늘 「탑 직전」 4:30 으로 → 완료 → 「세트별 휴식」 켜짐
  await 루틴_시작();
  await expect(블록(page).getByTestId("btn-rest-setting").getByTestId("rest-kind-dot")).toHaveCount(0);
  await 블록(page).getByTestId("btn-rest-setting").click();
  await page.getByTestId("rest-kind-beforeTop-plus").click();
  await page.getByTestId("rest-kind-beforeTop-plus").click();
  await expect(page.getByTestId("rest-kind-beforeTop-value")).toHaveText("4:30");
  // [−][+] 버튼 이름에 지금 값(리뷰)
  await expect(page.getByTestId("rest-kind-beforeTop-plus")).toHaveAttribute(
    "aria-label",
    /탑 직전 휴식 4:30/,
  );
  await 시트_닫기(page);
  for (const k of [0, 1, 2, 3, 4]) await 세트_하기(page, k);
  await 완료();
  await expect(page.getByTestId("finish-routine")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("btn-finish-apply").click();
  await expect(page.getByTestId("finish-change-rest")).toBeVisible();
  await expect(page.getByTestId("finish-change-rest")).toContainText("세트별 휴식");
  await expect(page.getByTestId("finish-change-rest").locator("input[type=checkbox]")).toBeChecked();
  // 이번엔 루틴에 쓰지 않는다(오늘만) — 다음 운동은 기억으로 4:30 이 실린다
  await page.getByTestId("finish-pick").getByRole("button", { name: "취소" }).click();
  await page.getByTestId("btn-finish-today").click();
  await expect(page.getByTestId("finish-routine")).toHaveCount(0);
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

  // ② 다음 운동 — 기억으로 4:30(점) · 안 바꾸고 완료 → 「세트별 휴식」 없음
  await 루틴_시작();
  await expect(블록(page).getByTestId("btn-rest-setting").getByTestId("rest-kind-dot")).toBeVisible();
  for (const k of [0, 1, 2, 3, 4]) await 세트_하기(page, k);
  await 완료();
  await page.waitForTimeout(1_500); // 완료 뒤 묻는 시트가 뜰 틈
  if (await page.getByTestId("finish-routine").isVisible()) {
    if (await page.getByTestId("btn-finish-apply").isEnabled()) {
      await page.getByTestId("btn-finish-apply").click();
      await expect(page.getByTestId("finish-pick")).toBeVisible();
      await expect(page.getByTestId("finish-change-rest")).toHaveCount(0);
    }
  } else {
    await expect(page.getByTestId("finish-change-rest")).toHaveCount(0);
  }
});
