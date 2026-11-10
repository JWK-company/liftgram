// SPEC-023 — 루틴 세트 표 · 세트 타입 통일 · 강도 목표 · 운동 화면 헤더 · 새 루틴 벗어나기
import { expect, type Page, test } from "@playwright/test";
import { 내려쓰기_대기 } from "./helpers/opengym";

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
}
async function 새_루틴(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("btn-new-routine")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
}
async function 종목_추가(page: Page, 이름 = "바벨 벤치프레스") {
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill(이름);
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  await expect(page.getByTestId("exercise-picker")).toHaveCount(0);
  await expect(page.getByTestId("set-table").first()).toBeVisible({ timeout: 15_000 });
}
const 줄 = (page: Page) => page.getByTestId("set-table").first().getByTestId("set-table-row");
async function 타입(page: Page, i: number, 라벨: string) {
  await 줄(page).nth(i).getByTestId("rx-type").click();
  await page.getByTestId("rx-type-sheet").getByText(라벨).click();
}
async function 무게(page: Page, i: number, kg: number) {
  await 줄(page).nth(i).getByTestId("rx-weight").fill(String(kg));
  await 줄(page).nth(i).getByTestId("rx-weight").blur();
}
async function 내려쓰기(page: Page) {
  await 내려쓰기_대기(page);
}
async function 루틴_목록(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("btn-new-routine")).toBeVisible({ timeout: 20_000 });
}

test("세트 표 → 운동 화면 — 타입·무게·횟수가 그대로 · 메뉴는 여섯 타입 · 가이드 없음", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await 새_루틴(page);
  await page.getByTestId("routine-name").fill(`표${Date.now().toString(36)}`);
  await page.getByTestId("routine-name").blur();
  await 종목_추가(page);

  // 기본 3줄 + 드롭 줄 + 맨 앞 웜업 줄 = W 탑 백오프 일반 드롭
  await page.getByTestId("rx-add-set").click();
  await page.getByTestId("rx-add-set").click();
  await page.getByTestId("rx-add-warmup").click();
  await expect(줄(page)).toHaveCount(6);
  // [원본] 줄 메뉴(…)에서 지우기 — SPEC-041 에서 번호 시트로 옮겼다
  // await 줄(page).nth(5).getByTestId("rx-more").click();
  // await page.getByTestId("rx-delete").click();
  // [원본] 번호 시트에서 지우기(SPEC-041) — 줄 끝 🗑 로 옮겼다(세트 휴지통)
  // await 줄(page).nth(5).getByTestId("rx-type").click();
  // await page.getByTestId("rx-delete").click();
  // [개선]
  await 줄(page).nth(5).getByTestId("rx-remove").click();
  await expect(줄(page)).toHaveCount(5);
  await 타입(page, 1, "탑세트 (T)");
  await 타입(page, 2, "백오프 (B)");
  await 타입(page, 4, "드롭세트 (D)");
  await 무게(page, 0, 40);
  await 무게(page, 1, 100);
  await 무게(page, 2, 80);
  await 무게(page, 3, 70);
  await 무게(page, 4, 50);
  await 줄(page).nth(1).getByTestId("rx-rep-min").fill("5");
  await 줄(page).nth(1).getByTestId("rx-rep-max").fill("5");
  await 줄(page).nth(1).getByTestId("rx-rep-max").blur();
  // [원본] 강도 목표 — SPEC-041 에서 루틴 편집기에서 뺐다
  // await page.getByTestId("effort-2").click();
  // await expect(page.getByTestId("effort-goal")).toHaveAttribute("data-goal", "2");
  await expect(page.getByTestId("effort-goal")).toHaveCount(0);
  // 포커스를 둔 채 시작해도 입력값이 반영된다
  await 줄(page).nth(3).getByTestId("rx-weight").fill("75");
  await page.getByTestId("btn-routine-start").click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });

  const sets = page.getByTestId("set-list").first().locator("> div");
  await expect(sets).toHaveCount(5, { timeout: 15_000 });
  const 라벨 = await sets.locator('[data-testid="set-type"]').allInnerTexts();
  expect(라벨.map((x) => x.trim())).toEqual(["W", "T", "B", "1", "D"]);
  const 값 = await sets
    .getByTestId("set-weight")
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  expect(값).toEqual(["40", "100", "80", "75", "50"]);
  await expect(sets.nth(1).getByTestId("set-reps")).toHaveValue("5");
  // [원본] 강도 목표는 웜업·드롭을 뺀 세트에 — 강도 목표는 SPEC-041 에서 뺐다
  // await expect(sets.nth(1)).toContainText("여유 2회");

  // 메뉴 — 실패·플레이트 계산 없음
  await sets.nth(3).getByTestId("set-type").click();
  const sheet = page.getByTestId("set-type-sheet");
  for (const 있음 of ["일반 세트", "워밍업 (W)", "피더 (P)", "드롭세트 (D)", "탑세트 (T)", "백오프 (B)"]) {
    await expect(sheet.getByText(있음)).toBeVisible();
  }
  await expect(sheet.getByText("실패 (F)")).toHaveCount(0);
  await expect(sheet.getByText(/플레이트/)).toHaveCount(0);
  await sheet.getByText("백오프 (B)").click();
  await expect(sets.nth(3).getByTestId("set-type")).toHaveText("B");
  await sets.nth(1).getByTestId("set-type").click();
  await sheet.getByText("일반 세트").click();
  await expect(sets.nth(1).getByTestId("set-type")).toHaveText("1");

  await expect(page.getByTestId("btn-guide-rir")).toHaveCount(0);
  await expect(page.getByTestId("btn-guide-warmup")).toHaveCount(0);
});

test("지난 기록 먼저 — 같은 무게 세트는 지난 기록으로 시작한다", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  const 이름 = `기록${Date.now().toString(36)}`;
  await 새_루틴(page);
  await page.getByTestId("routine-name").fill(이름);
  await page.getByTestId("routine-name").blur();
  await 종목_추가(page);
  await 무게(page, 0, 60);
  await 무게(page, 1, 60);
  await 무게(page, 2, 60);
  // [원본] 고정 줄 — 줄 메뉴(…)는 SPEC-041 에서 뺐다(옛 루틴의 고정 줄은 그대로 계산한다)
  // await 줄(page).nth(2).getByTestId("rx-more").click();
  // await page.getByTestId("rx-basis-fixed").click();
  await expect(page.getByTestId("set-table-hint")).toBeVisible();
  await page.getByTestId("btn-routine-start").click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });
  const sets = page.getByTestId("set-list").first().locator("> div");
  await expect(sets).toHaveCount(3, { timeout: 15_000 });
  for (const i of [0, 1, 2]) {
    await sets.nth(i).getByTestId("set-weight").fill("70");
    await sets.nth(i).getByTestId("set-weight").blur();
    await sets.nth(i).getByTestId("set-done").click();
  }
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 15_000 });
  for (const id of ["btn-finish-dont-save", "btn-finish-today"]) {
    const b = page.getByTestId(id);
    if (await b.isVisible()) await b.click();
  }
  await 내려쓰기_대기(page);

  await page.goto("/");
  const 행 = page
    .getByTestId("routine-list")
    .locator("[data-testid^=routine-]")
    .filter({ hasText: 이름 })
    .first();
  await expect(행).toBeVisible({ timeout: 20_000 });
  await 행.getByTestId("btn-start-routine").click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });
  const next = page.getByTestId("set-list").first().locator("> div");
  await expect(next.nth(0).getByTestId("set-weight")).toHaveValue("70", { timeout: 15_000 });
  await expect(next.nth(1).getByTestId("set-weight")).toHaveValue("70");
  // [원본] 고정 줄은 표의 무게
  // await expect(next.nth(2).getByTestId("set-weight")).toHaveValue("60");
  await expect(next.nth(2).getByTestId("set-weight")).toHaveValue("70");
});

test("타입을 바꿨다 되돌려도 표가 그대로 · 비운 칸은 다시 들어와도 빈칸 · Enter 로도 올라간다", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await 카탈로그_준비(page);
  await 새_루틴(page);
  await page.getByTestId("routine-name").fill(`비움${Date.now().toString(36)}`);
  await page.getByTestId("routine-name").blur();
  await 종목_추가(page);
  // 일반을 드롭으로 → 다시 일반으로(강도 목표는 SPEC-041 에서 뺐다)
  await 타입(page, 2, "드롭세트 (D)");
  await 타입(page, 2, "일반 세트");
  await expect(줄(page).nth(2).getByTestId("rx-type")).toHaveText("3");
  // 번호는 테두리 없는 ▾ 하나 · 시트를 연다고 알린다(SPEC-046)
  await expect(줄(page).nth(2).getByTestId("rx-type").locator("svg")).toHaveCount(1);
  await expect(줄(page).nth(2).getByTestId("rx-type")).toHaveAttribute("aria-haspopup", "dialog");
  // 맨 앞 웜업은 비우고 작업 줄만 채운다 — Enter 로 올린다
  await page.getByTestId("rx-add-warmup").click();
  await 줄(page).nth(1).getByTestId("rx-weight").fill("100");
  await 줄(page).nth(1).getByTestId("rx-weight").press("Enter");
  // [원본] await expect(page.getByTestId("rx-apply-rest")).toBeVisible(); — 「다른 세트도 똑같이」로 넓혔다(SPEC-042)
  await expect(page.getByTestId("rx-copy-rest")).toBeVisible();
  // 완료 뒤 저장된 루틴을 다시 연다
  await page.getByTestId("btn-routine-done").click();
  const 행 = page
    .getByTestId("routine-list")
    .locator("[data-testid^=routine-]")
    .filter({ hasText: "비움" })
    .first();
  await expect(행).toBeVisible({ timeout: 20_000 });
  const tid = await 행.getAttribute("data-testid");
  await 내려쓰기(page);
  await page.goto(`/routines/${(tid ?? "").replace("routine-", "")}`);
  await expect(page.getByTestId("set-table").first()).toBeVisible({ timeout: 20_000 });
  await expect(줄(page).nth(0).getByTestId("rx-weight")).toHaveValue("");
  await expect(줄(page).nth(1).getByTestId("rx-weight")).toHaveValue("100");
  await expect(줄(page).nth(2).getByTestId("rx-weight")).toHaveValue("");
  // 잘못된 값은 칸에 남지 않는다
  await 줄(page).nth(1).getByTestId("rx-rep-min").fill("0");
  await 줄(page).nth(1).getByTestId("rx-rep-min").blur();
  await expect(줄(page).nth(1).getByTestId("rx-rep-min")).toHaveValue("");
});

test("한쪽 입력 머신 — 칸의 값 그대로 시작한다(절반이 되지 않는다)", async ({ page }) => {
  test.setTimeout(120_000);
  await 카탈로그_준비(page);
  await 새_루틴(page);
  await page.getByTestId("routine-name").fill(`한쪽${Date.now().toString(36)}`);
  await page.getByTestId("routine-name").blur();
  await 종목_추가(page, "머신 하이 로우");
  await expect(page.getByTestId("set-table").first()).toContainText("한쪽");
  await 무게(page, 0, 50);
  // [원본] 고정 — 줄 메뉴(…)는 SPEC-041 에서 뺐다
  // await 줄(page).nth(0).getByTestId("rx-more").click();
  // await page.getByTestId("rx-basis-fixed").click();
  await expect(줄(page).nth(0).getByTestId("rx-weight")).toHaveValue("50");
  await 무게(page, 1, 30);
  await page.getByTestId("btn-routine-start").click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });
  const sets = page.getByTestId("set-list").first().locator("> div");
  await expect(sets.nth(0).getByTestId("set-weight")).toHaveValue("50", { timeout: 15_000 });
  await expect(sets.nth(1).getByTestId("set-weight")).toHaveValue("30");
});

test("시작한 뒤 뒤로 가도 편집기에 갇히지 않고 루틴이 남는다", async ({ page }) => {
  test.setTimeout(120_000);
  await 카탈로그_준비(page);
  const 이름 = `시작${Date.now().toString(36)}`;
  await 새_루틴(page);
  await page.getByTestId("routine-name").fill(이름);
  await page.getByTestId("routine-name").blur();
  await 종목_추가(page);
  await page.getByTestId("btn-routine-start").click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });
  await page.goBack();
  await page.waitForTimeout(800);
  await expect(page.getByTestId("routine-name")).toHaveCount(0);
  await expect(page.getByTestId("confirm-exit-routine")).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByTestId("routine-list")).toContainText(이름, { timeout: 20_000 });
});

// [원본] test("「나머지 일반 세트도」 — 한 번에 맞춘다") — rx-apply-rest(무게만) → rx-copy-rest(무게·횟수 · SPEC-042)
test("「다른 세트도 똑같이」 — 무게·횟수를 한 번에 맞추고 웜업은 건드리지 않는다", async ({ page }) => {
  test.setTimeout(120_000);
  await 카탈로그_준비(page);
  await 새_루틴(page);
  await 종목_추가(page);
  await page.getByTestId("rx-add-warmup").click();
  await 무게(page, 1, 100);
  await 줄(page).nth(1).getByTestId("rx-rep-min").fill("5");
  await 줄(page).nth(1).getByTestId("rx-rep-min").blur();
  await 줄(page).nth(1).getByTestId("rx-rep-max").fill("5");
  await 줄(page).nth(1).getByTestId("rx-rep-max").blur();
  await expect(page.getByTestId("rx-copy-rest")).toContainText("2세트");
  await page.getByTestId("rx-copy-rest").click();
  for (const k of [2, 3]) {
    await expect(줄(page).nth(k).getByTestId("rx-weight")).toHaveValue("100");
    await expect(줄(page).nth(k).getByTestId("rx-rep-min")).toHaveValue("5");
    await expect(줄(page).nth(k).getByTestId("rx-rep-max")).toHaveValue("5");
  }
  await expect(줄(page).nth(0).getByTestId("rx-weight")).toHaveValue("");
  await expect(page.getByTestId("rx-copy-rest")).toHaveCount(0);
  // 번호 시트에서도 — 다 같으면 항목이 없다
  await 줄(page).nth(1).getByTestId("rx-type").click();
  await expect(page.getByTestId("rx-copy")).toHaveCount(0);
  await page.keyboard.press("Escape");
  // 칸을 누르면 숫자 전체가 선택된다 — 바로 치면 바뀐다
  await 줄(page).nth(2).getByTestId("rx-rep-min").click();
  await page.keyboard.type("8");
  await expect(줄(page).nth(2).getByTestId("rx-rep-min")).toHaveValue("8");
});

test("360px — 세트 표·운동 헤더가 넘치지 않고 누르는 자리 44px", async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await 카탈로그_준비(page);
  await 새_루틴(page);
  await page.getByTestId("routine-name").fill(`긴이름${Date.now().toString(36)}`.padEnd(40, "가"));
  await page.getByTestId("routine-name").blur();
  await 종목_추가(page);
  await 무게(page, 0, 102.5);
  const row = 줄(page).first();
  // [원본] rx-more — 줄 메뉴는 SPEC-041 에서 뺐다 · 세트 방식 칩을 함께 잰다
  for (const id of ["rx-type", "rx-weight", "rx-rep-min", "rx-rep-max"]) {
    const b = await row.getByTestId(id).boundingBox();
    expect(b?.height, id).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.screenshot({ path: "test-results/set-table-360.png" });

  await page.getByTestId("btn-routine-start").click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });
  const header = page.getByTestId("session-header");
  await expect(header).toBeVisible({ timeout: 15_000 });
  // 1시간 넘긴 시계·큰 볼륨에서도 줄바꿈으로 헤더가 커지지 않는다
  const before = (await header.boundingBox())?.height ?? 0;
  const after = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="elapsed"]');
    const vol = document.querySelector('[data-testid="live-volume"]');
    if (el) el.textContent = "1:00:00";
    if (vol) vol.textContent = "볼륨 123,456 kg 볼륨 123,456 kg";
    const h = document.querySelector('[data-testid="session-header"]');
    return { h: h?.getBoundingClientRect().height ?? 0, sw: document.documentElement.scrollWidth };
  });
  expect(after.h).toBeLessThanOrEqual(before + 1);
  expect(after.sw).toBeLessThanOrEqual(360);
  await page.screenshot({ path: "test-results/session-header-360.png" });
});

test.describe("새 루틴 벗어나기", () => {
  // 새 브라우저 문맥이라 루틴이 하나도 없어야 한다 — 글자로 찾으면 「새 루틴」 버튼에 걸린다
  async function 목록에_없음(page: Page) {
    await 내려쓰기(page);
    await page.reload();
    await expect(page.getByTestId("btn-new-routine")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("btn-start-routine")).toHaveCount(0);
  }

  test("내용 있음 — 앱바 뒤로: 묻고, 계속 편집이면 남고, 나가기면 사라진다", async ({ page }) => {
    test.setTimeout(150_000);
    await 카탈로그_준비(page);
    const 이름 = `나감${Date.now().toString(36)}`;
    await 새_루틴(page);
    await page.getByTestId("routine-name").fill(이름);
    await page.getByTestId("routine-name").blur();
    await 종목_추가(page);
    await page
      .getByLabel(/뒤로|back/i)
      .first()
      .click();
    const dlg = page.getByTestId("confirm-exit-routine");
    await expect(dlg).toBeVisible();
    await dlg.getByText("계속 편집").click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByTestId("routine-name")).toHaveValue(이름);
    await page
      .getByLabel(/뒤로|back/i)
      .first()
      .click();
    await dlg.getByText("나가기").click();
    await expect(page.getByTestId("btn-new-routine")).toBeVisible({ timeout: 20_000 });
    // 나간 뒤 뒤로 가도 빈 편집기에 갇히지 않는다
    await page.goBack();
    await page.waitForTimeout(800);
    await expect(page.getByTestId("routine-name")).toHaveCount(0);
    await 목록에_없음(page);
  });

  test("비어 있음 — 묻지 않고, 폴더 「없음」만 눌러 생긴 행도 치운다", async ({ page }) => {
    test.setTimeout(150_000);
    await 카탈로그_준비(page);
    // 폴더 칩은 이미 폴더가 있어야 보인다 — 폴더 있는 루틴을 하나 만들어 둔다
    await 새_루틴(page);
    await page.getByTestId("routine-name").fill("폴더 있는 루틴");
    await page.getByTestId("routine-name").blur();
    await page
      .getByTestId("routine-folder")
      .locator("input")
      .or(page.locator('input[data-testid="routine-folder"]'))
      .first()
      .fill("상체");
    await page.getByTestId("routine-name").focus();
    await 종목_추가(page);
    await page.getByTestId("btn-routine-done").click();
    // 폴더 안 루틴은 접힌 폴더 한 줄로 보인다
    await expect(page.getByTestId("folder-toggle")).toHaveCount(1, { timeout: 20_000 });

    await 내려쓰기(page);
    await 새_루틴(page);
    await page.getByRole("button", { name: "폴더 없음", exact: true }).first().click();
    await page.waitForTimeout(400);
    await page
      .getByLabel(/뒤로|back/i)
      .first()
      .click();
    await expect(page.getByTestId("confirm-exit-routine")).toHaveCount(0);
    await expect(page.getByTestId("btn-new-routine")).toBeVisible({ timeout: 20_000 });
    await 내려쓰기(page);
    await page.reload();
    await expect(page.getByTestId("folder-toggle")).toHaveCount(1, { timeout: 20_000 });
    // 「없음」으로 생긴 빈 행이 폴더 밖에 남지 않았다
    await expect(page.getByTestId("btn-start-routine")).toHaveCount(0);
  });

  test("종목을 넣었다 빼면 빈 것으로 치운다", async ({ page }) => {
    test.setTimeout(120_000);
    await 카탈로그_준비(page);
    await 새_루틴(page);
    await 종목_추가(page);
    await page.getByTestId("btn-re-remove").first().click();
    await page.getByTestId("confirm-remove-routine-exercise").getByRole("button").last().click();
    await expect(page.getByTestId("set-table")).toHaveCount(0);
    await page
      .getByLabel(/뒤로|back/i)
      .first()
      .click();
    await expect(page.getByTestId("confirm-exit-routine")).toHaveCount(0);
    await expect(page.getByTestId("btn-new-routine")).toBeVisible({ timeout: 20_000 });
    await 목록에_없음(page);
  });

  test("브라우저 뒤로 — 묻고, 연타해도 안전 · 시트·피커가 열려 있으면 그것부터 닫는다", async ({ page }) => {
    test.setTimeout(180_000);
    await 카탈로그_준비(page);
    const 이름 = `브뒤${Date.now().toString(36)}`;
    await 새_루틴(page);
    await page.getByTestId("routine-name").fill(이름);
    await page.getByTestId("routine-name").blur();
    await 종목_추가(page);

    // 타입 시트 → 시트만 닫힘
    await 줄(page).first().getByTestId("rx-type").click();
    await expect(page.getByTestId("rx-type-sheet")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("rx-type-sheet")).toHaveCount(0);
    await expect(page.getByTestId("confirm-exit-routine")).toHaveCount(0);
    await expect(page.getByTestId("routine-name")).toBeVisible();

    // 피커 → 피커만 닫힘
    await page.getByTestId("btn-add-routine-exercise").click();
    await expect(page.getByTestId("exercise-picker")).toBeVisible();
    await page.goBack();
    await expect(page.getByTestId("exercise-picker")).toHaveCount(0);
    await expect(page.getByTestId("confirm-exit-routine")).toHaveCount(0);

    // 뒤로 → 확인창 → 다시 뒤로 = 계속 편집 → 다시 뒤로 → 확인창
    await page.goBack();
    const dlg = page.getByTestId("confirm-exit-routine");
    await expect(dlg).toBeVisible();
    await page.goBack();
    await expect(dlg).toHaveCount(0);
    // 연타 — 두 번 눌러도 편집기가 남거나 확인창 하나뿐이다
    await page.evaluate(async () => {
      history.back();
      await new Promise((r) => setTimeout(r, 80));
      history.back();
    });
    await page.waitForTimeout(800);
    await expect(page.getByTestId("routine-name")).toHaveValue(이름);
    if (await dlg.isVisible()) await dlg.getByText("계속 편집").click();
    await expect(dlg).toHaveCount(0);
    await expect(page.getByTestId("routine-name")).toHaveValue(이름);
    await page.goBack();
    await expect(dlg).toBeVisible();
    await dlg.getByText("나가기").click();
    await expect(page.getByTestId("btn-new-routine")).toBeVisible({ timeout: 20_000 });
    await 목록에_없음(page);
  });

  test("탭 막대 — 묻고, 나가면 고른 탭으로 · 계속 편집이면 그대로", async ({ page }) => {
    test.setTimeout(120_000);
    await 카탈로그_준비(page);
    const 이름 = `탭${Date.now().toString(36)}`;
    await 새_루틴(page);
    await page.getByTestId("routine-name").fill(이름);
    await page.getByTestId("routine-name").blur();
    await page.getByTestId("nav-profile").click();
    const dlg = page.getByTestId("confirm-exit-routine");
    await expect(dlg).toBeVisible();
    await dlg.getByText("계속 편집").click();
    await expect(page).toHaveURL(/\/routines\/new/);
    await page.getByTestId("nav-profile").click();
    await dlg.getByText("나가기").click();
    await expect(page).toHaveURL(/\/profile/, { timeout: 20_000 });
  });

  test("완료하면 남고 묻지 않으며, 뒤로 가도 편집기에 갇히지 않는다 · 기존 루틴은 묻지 않는다", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await 카탈로그_준비(page);
    const 이름 = `완료${Date.now().toString(36)}`;
    await 새_루틴(page);
    await page.getByTestId("routine-name").fill(이름);
    await page.getByTestId("routine-name").blur();
    await 종목_추가(page);
    await page.getByTestId("btn-routine-done").click();
    await expect(page.getByTestId("routine-list")).toContainText(이름, { timeout: 20_000 });
    await expect(page.getByTestId("confirm-exit-routine")).toHaveCount(0);
    await page.goBack();
    await page.waitForTimeout(800);
    await expect(page).not.toHaveURL(/\/routines\/new/);

    await page.goto("/");
    const 행 = page
      .getByTestId("routine-list")
      .locator("[data-testid^=routine-]")
      .filter({ hasText: 이름 })
      .first();
    const tid = await 행.getAttribute("data-testid");
    await page.goto(`/routines/${(tid ?? "").replace("routine-", "")}`);
    await expect(page.getByTestId("routine-name")).toHaveValue(이름, { timeout: 20_000 });
    await page
      .getByLabel(/뒤로|back/i)
      .first()
      .click();
    await expect(page.getByTestId("confirm-exit-routine")).toHaveCount(0);
    await expect(page.getByTestId("btn-new-routine")).toBeVisible({ timeout: 20_000 });
  });
});
