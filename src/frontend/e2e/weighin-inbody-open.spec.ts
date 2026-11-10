// 인바디 칸 늘 보임 · 운동 중 체중은 카드 안에(2026-11-10 사용자 요청 · 할일/인바디-기본-펼침)
//
// 확인 목록:
//   · 세 곳(프로필 「체중」 시트 바로 입력 · 운동 화면 「오늘 체중」 카드 · 통계 「기록」 시트) 모두 열자마자 골격근량·체지방률 칸이 보임 · 토글 없음
//     (시트 둘은 연 화면 그대로 화면 안 · 운동 카드는 페이지 안이라 칸까지 스크롤해서 잰다)
//     · 「선택 · 비워 두면 적지 않아요」 안내는 남는다 · 비워 두고 저장하면 인바디 없음(DB null)
//   · 고치기(프로필 고치기 · 운동 카드 「고치기」) — 적어 둔 인바디 값이 칸에 채워져 있고 그대로 저장하면 유지
//   · 체중 패널 하나(2026-11-10) — 세 곳이 같은 구역(바로 입력·목표 체중·지난 기록)·같은 testid · 목표 정하기/바꾸기 = 2번 · 지우기 = 1번
//     · 통계 카드 머리 「기록 ›」는 다른 카드 머리처럼 회색 글자(빨강 채움·테두리 없음) · ⋯ 없음
//   · 운동 화면 — 「기록 ⌄」를 누르면 바닥 시트가 아니라 카드 안에 펼침(aria-expanded) · 저장하면 접히고 값·✓ · 다시 누르면 접힘
//     · 360×560 · 휴식 막대가 떠 있어도 저장 버튼·입력칸이 가리지 않음 · 가로 넘침 없음 · 다크
//     (가상 키보드는 흉내 내지 않는다 — 칸을 화면 가운데로 올린 자리에서 elementFromPoint 로 잰다 · 실기기 확인은 따로)
import { expect, test } from "@playwright/test";
import {
  빈_문서,
  빠른_운동_시작,
  세트_기록,
  준비,
  종목_추가,
  idb_행,
  내려쓰기_대기,
} from "./helpers/opengym";

type Page = import("@playwright/test").Page;
type Locator = import("@playwright/test").Locator;

test.use({ serviceWorkers: "block" });

async function 이력_행(page: Page): Promise<Record<string, unknown>[]> {
  await 내려쓰기_대기(page);
  await 빈_문서(page);
  return (await idb_행(page, "bodyweight_logs")).filter((r) => r._status !== "deleted" && r.weight_kg !== 0);
}

async function 목록_줄수(page: Page): Promise<number> {
  await expect(
    page.locator(
      '[data-testid="bodyweight-history-list"][data-loaded="1"], [data-testid="bodyweight-history-empty"]',
    ),
  ).toHaveCount(1);
  return page.getByTestId("bodyweight-history-row").count();
}

/** 칸 둘이 열자마자 화면 안에 보이고 토글은 없다 · 안내 문구는 남는다 */
async function 인바디_칸_보임(scope: Locator): Promise<void> {
  await expect(scope.getByTestId("weighin-inbody-toggle")).toHaveCount(0);
  for (const id of ["weighin-smm", "weighin-pbf"]) {
    await expect(scope.getByTestId(id)).toBeVisible();
    await expect(scope.getByTestId(id)).toBeInViewport({ ratio: 1 });
    await expect(scope.getByTestId(id)).toHaveValue("");
  }
  await expect(scope.getByTestId("weighin-inbody-optional")).toHaveText("선택 · 비워 두면 적지 않아요");
}

/** 가로 넘침 없음(문서 · 묶음) */
async function 넘침_없음(page: Page, scope: Locator): Promise<void> {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
  expect(await scope.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
}

test("세 곳 모두 열자마자 인바디 칸 · 토글 없음 · 비워 두고 저장하면 인바디 없음(360×560)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 560 });
  await 준비(page);

  // ① 운동 화면 「오늘 체중」 카드(새 줄)
  await 빠른_운동_시작(page);
  const row = page.getByTestId("weighin-row");
  await row.click({ timeout: 20_000 });
  const editor = page.getByTestId("weighin-card-editor");
  await expect(editor).toBeVisible();
  await expect(page.getByTestId("weighin-sheet")).toHaveCount(0);
  await editor.getByTestId("weighin-smm").scrollIntoViewIfNeeded();
  await 인바디_칸_보임(editor);
  await 넘침_없음(page, editor);
  await editor.getByTestId("weighin-save").click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId("weighin-card")).toHaveAttribute("data-done", "1");

  // ② 프로필 「체중」 시트 바로 입력
  await page.goto("/profile");
  await page.getByTestId("bodyweight").click({ timeout: 20_000 });
  const entry = page.getByTestId("bodyweight-entry");
  await expect(entry).toBeVisible();
  await 인바디_칸_보임(entry);
  await 넘침_없음(page, page.getByTestId("bodyweight-sheet"));
  const n = await 목록_줄수(page);
  await entry.getByTestId("weighin-step-p0_5").click();
  await entry.getByTestId("weighin-save").click();
  await expect(page.getByTestId("bodyweight-history-row")).toHaveCount(n + 1);
  await expect(page.getByTestId("bodyweight-history-inbody")).toHaveCount(0);
  await page.getByTestId("bodyweight-history-close").click();

  // ③ 통계 「기록 ›」(= 같은 「체중」 시트) — 짧은 화면에서도 칸과 저장 버튼이 한 화면에
  await page.goto("/stats");
  await page.getByTestId("btn-bodyweight-card-record").click({ timeout: 20_000 });
  const rec = page.getByTestId("bodyweight-entry");
  await expect(rec).toBeVisible();
  await 인바디_칸_보임(rec);
  await expect(rec.getByTestId("weighin-save")).toBeInViewport({ ratio: 1 });
  await 넘침_없음(page, page.getByTestId("bodyweight-sheet"));
  const n2 = await 목록_줄수(page);
  await rec.getByTestId("weighin-step-p1").click();
  await rec.getByTestId("weighin-save").click();
  await expect(page.getByTestId("bodyweight-history-row")).toHaveCount(n2 + 1);
  await page.getByTestId("bodyweight-history-close").click();

  const rows = await 이력_행(page);
  expect(
    rows
      .map((r) => [r.weight_kg, r.source, r.skeletal_muscle_kg ?? null, r.body_fat_pct ?? null])
      .sort((a, b) => Number(a[0]) - Number(b[0])),
  ).toEqual([
    [70, "checkin", null, null],
    [70.5, "manual", null, null],
    [71.5, "manual", null, null],
  ]);
});

test("고치기 — 적어 둔 인바디 값이 칸에 · 그대로 저장하면 유지(프로필 고치기 · 운동 카드 「고치기」)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 640 });
  await 준비(page);

  // 인바디와 함께 한 줄
  await page.goto("/profile");
  await page.getByTestId("bodyweight").click({ timeout: 20_000 });
  const entry = page.getByTestId("bodyweight-entry");
  const n = await 목록_줄수(page);
  await entry.getByTestId("weighin-smm").fill("33.1");
  await entry.getByTestId("weighin-pbf").fill("18.5");
  await entry.getByTestId("weighin-save").click();
  await expect(page.getByTestId("bodyweight-history-row")).toHaveCount(n + 1);
  await expect(page.getByTestId("bodyweight-history-inbody")).toHaveText("골격근량 33.1kg · 체지방률 18.5%");

  // ① 프로필 고치기 — 칸에 채워져 열림 · 그대로 저장 → 유지 · 체중만 바꿔 저장 → 유지
  const ed = page.getByTestId("bodyweight-edit-sheet");
  await page.getByTestId("bodyweight-history-edit").first().click();
  await expect(ed.getByTestId("weighin-inbody-toggle")).toHaveCount(0);
  await expect(ed.getByTestId("weighin-smm")).toHaveValue("33.1");
  await expect(ed.getByTestId("weighin-pbf")).toHaveValue("18.5");
  await ed.getByTestId("weighin-save").click();
  await expect(ed).toHaveCount(0);
  await expect(page.getByTestId("bodyweight-history-inbody")).toHaveText("골격근량 33.1kg · 체지방률 18.5%");
  await page.getByTestId("bodyweight-history-edit").first().click();
  await expect(ed.getByTestId("weighin-smm")).toHaveValue("33.1");
  await ed.getByTestId("weighin-step-p0_1").click();
  await ed.getByTestId("weighin-save").click();
  await expect(ed).toHaveCount(0);
  await expect(page.getByTestId("bodyweight-history-row").first()).toContainText("70.1kg");
  await expect(page.getByTestId("bodyweight-history-inbody")).toHaveText("골격근량 33.1kg · 체지방률 18.5%");
  await page.getByTestId("bodyweight-history-close").click();

  // ② 운동 카드 「고치기」 — 오늘 그 줄을 고친다 · 칸에 채워져 펼침 · 체중만 바꿔 저장 → 인바디 유지
  await 빠른_운동_시작(page);
  const row = page.getByTestId("weighin-row");
  await expect(row).toHaveText("고치기", { timeout: 20_000 });
  await expect(page.getByTestId("weighin-card")).toContainText("골격근량 33.1kg · 체지방률 18.5%");
  await row.click();
  const editor = page.getByTestId("weighin-card-editor");
  await expect(editor.getByTestId("weighin-smm")).toHaveValue("33.1");
  await expect(editor.getByTestId("weighin-pbf")).toHaveValue("18.5");
  await editor.getByTestId("weighin-step-p0_1").click();
  await editor.getByTestId("weighin-save").click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId("weighin-card-value")).toHaveText("70.2kg");
  await expect(page.getByTestId("weighin-card")).toContainText("골격근량 33.1kg · 체지방률 18.5%");

  let rows = await 이력_행(page);
  expect(rows.map((r) => [r.weight_kg, r.skeletal_muscle_kg, r.body_fat_pct])).toEqual([[70.2, 33.1, 18.5]]);

  // ③ 운동 카드 고치기에서 채워진 체지방률을 지우고 저장 → 그 값만 지움(골격근량 유지 · 리뷰 L-7)
  await page.goto("/workout");
  await expect(row).toHaveText("고치기", { timeout: 20_000 });
  await row.click();
  await expect(editor.getByTestId("weighin-pbf")).toHaveValue("18.5");
  await editor.getByTestId("weighin-pbf").fill("");
  await editor.getByTestId("weighin-save").click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId("weighin-card")).toContainText("골격근량 33.1kg");
  await expect(page.getByTestId("weighin-card")).not.toContainText("체지방률");
  rows = await 이력_행(page);
  expect(rows.map((r) => [r.weight_kg, r.skeletal_muscle_kg, r.body_fat_pct ?? null])).toEqual([
    [70.2, 33.1, null],
  ]);
});

test("운동 카드 — 「기록 ⌄」 누르면 카드 안 펼침(시트 없음) · 저장하면 접히고 값 · 다시 누르면 접힘 · 휴식 막대와 안 겹침 · 360×560 · 다크", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 560 });
  await 준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "풀업");
  await 세트_기록(page, 0, 0, 0, 10); // 휴식 막대가 뜬다
  await expect(page.getByTestId("rest-bar")).toBeVisible({ timeout: 10_000 });

  await page.evaluate(() => window.scrollTo(0, 0));
  const row = page.getByTestId("weighin-row");
  const editor = page.getByTestId("weighin-card-editor");
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await row.click();
  await expect(editor).toBeVisible();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("weighin-sheet")).toHaveCount(0);
  await expect(page.getByTestId("weighin-scrim")).toHaveCount(0);
  // 카드 안(카드 테두리 안쪽) · 「운동 추가」·첫 종목보다 위
  const cb = await page.getByTestId("weighin-card").boundingBox();
  const eb = await editor.boundingBox();
  expect(cb && eb && eb.y >= cb.y && eb.y + eb.height <= cb.y + cb.height + 0.5).toBe(true);
  const add = await page.getByTestId("btn-add-exercise").boundingBox();
  expect(eb && add && eb.y + eb.height <= add.y).toBe(true);
  await 넘침_없음(page, editor);

  // 입력칸·저장 버튼을 화면으로 올리면 휴식 막대·바닥 막대에 가리지 않는다(그 자리를 누르면 그 요소)
  for (const id of ["weighin-smm", "weighin-pbf", "weighin-save"]) {
    const el = editor.getByTestId(id);
    // 화면 가운데로 올렸을 때(브라우저가 키보드 위로 포커스 칸을 올리는 자리) 그 자리를 누르면 그 요소 — 휴식 막대·바닥 막대가 덮지 않는다
    await el.evaluate((node) => node.scrollIntoView({ block: "center" }));
    const hit2 = await el.evaluate((node) => {
      const r = node.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top === node || node.contains(top);
    });
    expect(hit2, `${id} 가 가리지 않는다`).toBe(true);
  }

  // 체지방률만 적고 저장 → 접히고 값·✓·인바디 한 줄
  await editor.getByTestId("weighin-pbf").fill("21.3");
  await editor.getByTestId("weighin-save").click();
  await expect(editor).toHaveCount(0);
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("weighin-card")).toHaveAttribute("data-done", "1");
  await expect(page.getByTestId("weighin-card-value")).toHaveText("70.0kg");
  await expect(page.getByTestId("weighin-card")).toContainText("체지방률 21.3%");
  // 다시 누르면 펼침(고치기 · 값 채워짐) → 또 누르면 접힘
  await row.click();
  await expect(editor.getByTestId("weighin-pbf")).toHaveValue("21.3");
  await row.click();
  await expect(editor).toHaveCount(0);

  // 다크 — 입력칸 바탕이 어둡고 글자는 밝다 · 넘침 없음
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await row.click();
  await expect(editor).toBeVisible();
  const lum = (c: string) => {
    const m = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
    return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
  };
  const colors = await editor.getByTestId("weighin-smm").evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, fg: s.color };
  });
  expect(lum(colors.bg)).toBeLessThan(80);
  expect(lum(colors.fg)).toBeGreaterThan(160);
  await 넘침_없음(page, editor);
  await page.screenshot({ path: test.info().outputPath("dark.png") });
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));

  const rows = await 이력_행(page);
  expect(rows.map((r) => [r.weight_kg, r.source, r.skeletal_muscle_kg ?? null, r.body_fat_pct])).toEqual([
    [70, "checkin", null, 21.3],
  ]);
});

/** 패널의 구역 testid(보이는 것만 · 문서 순서) */
async function 패널_구역(panel: Locator): Promise<string[]> {
  return panel.evaluate((root) =>
    [
      "bodyweight-entry",
      "weighin-smm",
      "weighin-pbf",
      "bodyweight-goal",
      "bodyweight-goal-value",
      "btn-bodyweight-goal",
      "bodyweight-history-heading",
      "bodyweight-history-list",
      "bodyweight-history-edit",
      "bodyweight-history-delete",
    ].filter((id) => {
      const el = root.querySelector(`[data-testid="${id}"]`);
      return !!el && el.getBoundingClientRect().height > 0;
    }),
  );
}

test("체중 패널 하나 — 운동 카드·프로필·통계가 같은 구역·testid · 운동 카드는 「목표 · 지난 기록 ⌄」 아래 · 360px 넘침 없음", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await 준비(page);

  // 프로필 — 한 줄 기록해 두고 구역을 센다
  await page.goto("/profile");
  await page.getByTestId("bodyweight").click({ timeout: 20_000 });
  const n = await 목록_줄수(page);
  await page.getByTestId("bodyweight-entry").getByTestId("weighin-save").click();
  await expect(page.getByTestId("bodyweight-history-row")).toHaveCount(n + 1);
  const profile = await 패널_구역(page.getByTestId("bodyweight-sheet").getByTestId("bodyweight-panel"));
  expect(profile).toEqual([
    "bodyweight-entry",
    "weighin-smm",
    "weighin-pbf",
    "bodyweight-goal",
    "bodyweight-goal-value",
    "btn-bodyweight-goal",
    "bodyweight-history-heading",
    "bodyweight-history-list",
    "bodyweight-history-edit",
    "bodyweight-history-delete",
  ]);
  await expect(page.getByTestId("bodyweight-panel")).toHaveAttribute("data-compact", "0");
  await 넘침_없음(page, page.getByTestId("bodyweight-sheet"));
  await page.getByTestId("bodyweight-history-close").click();

  // 통계 「기록 ›」 — 같은 시트·같은 구역
  await page.goto("/stats");
  await page.getByTestId("btn-bodyweight-card-record").click({ timeout: 20_000 });
  await expect(page.getByTestId("bodyweight-sheet")).toBeVisible();
  expect(await 패널_구역(page.getByTestId("bodyweight-sheet").getByTestId("bodyweight-panel"))).toEqual(
    profile,
  );
  await page.getByTestId("bodyweight-history-close").click();

  // 운동 카드 — 맨 위 입력, 나머지는 「목표 · 지난 기록 ⌄」 아래(접힌 채 시작) → 펼치면 같은 구역
  await 빠른_운동_시작(page);
  await page.getByTestId("weighin-row").click({ timeout: 20_000 });
  const panel = page.getByTestId("weighin-card-editor").getByTestId("bodyweight-panel");
  await expect(panel).toHaveAttribute("data-compact", "1");
  expect(await 패널_구역(panel)).toEqual(["bodyweight-entry", "weighin-smm", "weighin-pbf"]);
  const more = panel.getByTestId("bodyweight-panel-more");
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(more).toHaveText("목표 · 지난 기록");
  const mb = await more.boundingBox();
  expect(mb && mb.height >= 44).toBe(true);
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  expect(await 패널_구역(panel)).toEqual(profile);
  await 넘침_없음(page, panel);
  // 운동 화면엔 바닥 시트가 없다
  await expect(page.getByTestId("bodyweight-sheet")).toHaveCount(0);
  await expect(page.getByTestId("weighin-sheet")).toHaveCount(0);
});

test("목표 체중 — 패널 안에서 정하기 2번 · 바꾸기 2번 · 지우기 1번 · 운동 카드에서 정해도 통계 목표선 · 새로고침 유지", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await 준비(page);
  await page.goto("/profile");
  await page.getByTestId("bodyweight").click({ timeout: 20_000 });
  const n = await 목록_줄수(page);
  await page.getByTestId("bodyweight-entry").getByTestId("weighin-save").click(); // 70.0kg
  await expect(page.getByTestId("bodyweight-history-row")).toHaveCount(n + 1);

  // 정하기 — 「정하기」 → 「저장」(출발값 = 최근 기록 70.0)
  const value = page.getByTestId("bodyweight-goal-value");
  await expect(value).toHaveText("없음");
  await expect(page.getByTestId("btn-bodyweight-goal-clear")).toHaveCount(0);
  const setBtn = page.getByTestId("btn-bodyweight-goal");
  await expect(setBtn).toHaveText("정하기");
  await expect(setBtn).toHaveAccessibleName("목표 정하기");
  await setBtn.click();
  const goal = page.getByTestId("bodyweight-goal-sheet");
  await expect(goal.getByTestId("weighin-value")).toContainText("70.0");
  await expect(goal.getByTestId("weighin-inbody")).toHaveCount(0); // 목표엔 인바디 칸이 없다
  await goal.getByTestId("weighin-save").click();
  await expect(goal).toHaveCount(0);
  await expect(value).toHaveText("70.0kg");
  // 저장 뒤 포커스는 「바꾸기」(사라진 저장 버튼에서 body 로 빠지지 않게)
  await expect(setBtn).toHaveText("바꾸기");
  await expect(setBtn).toBeFocused();

  // 바꾸기 — 「바꾸기」 → −1 → 「저장」 · 취소·Esc 는 바꾸지 않고 시트도 닫지 않는다
  await setBtn.click();
  await goal.getByTestId("weighin-step-m1").click();
  await goal.getByTestId("weighin-secondary").click();
  await expect(goal).toHaveCount(0);
  await expect(value).toHaveText("70.0kg");
  await setBtn.click();
  await goal.getByTestId("weighin-step-m1").click();
  await page.keyboard.press("Escape");
  await expect(goal).toHaveCount(0);
  await expect(page.getByTestId("bodyweight-sheet")).toBeVisible();
  await expect(value).toHaveText("70.0kg");
  await setBtn.click();
  await goal.getByTestId("weighin-step-m1").click();
  await goal.getByTestId("weighin-save").click();
  await expect(value).toHaveText("69.0kg");
  await page.getByTestId("bodyweight-history-close").click();

  // 통계 — 목표선 · 남은 차이
  await page.goto("/stats");
  await expect(page.getByTestId("bodyweight-goal-gap")).toHaveText("목표까지 1.0kg · 목표 69.0kg", {
    timeout: 20_000,
  });
  // 지우기 — 통계 「기록 ›」 → 「지우기」 한 번 → 확인
  await page.getByTestId("btn-bodyweight-card-record").click();
  const clear = page.getByTestId("btn-bodyweight-goal-clear");
  await expect(clear).toHaveAccessibleName("목표 지우기");
  await clear.click();
  await expect(value).toHaveText("없음");
  await page.getByTestId("bodyweight-history-close").click();
  await expect(page.getByTestId("bodyweight-goal-gap")).toHaveCount(0);
  await expect(page.getByTestId("bodyweight-chart-goal")).toHaveCount(0);

  // 운동 카드 패널에서 정하기 → 통계에 반영 · 새로고침 유지
  await 빠른_운동_시작(page);
  await page.getByTestId("weighin-row").click({ timeout: 20_000 });
  const panel = page.getByTestId("weighin-card-editor").getByTestId("bodyweight-panel");
  await panel.getByTestId("bodyweight-panel-more").click();
  await panel.getByTestId("btn-bodyweight-goal").click();
  await panel.getByTestId("bodyweight-goal-sheet").getByTestId("weighin-step-p1").click();
  await panel.getByTestId("bodyweight-goal-sheet").getByTestId("weighin-save").click();
  await expect(panel.getByTestId("bodyweight-goal-value")).toHaveText("71.0kg");
  // 목표 입력을 닫아도 오늘 입력·카드 펼침은 그대로
  await expect(page.getByTestId("weighin-card-editor")).toBeVisible();
  await page.goto("/stats");
  await page.reload();
  await expect(page.getByTestId("bodyweight-goal-gap")).toHaveText("목표까지 1.0kg · 목표 71.0kg", {
    timeout: 20_000,
  });
});

test("통계 체중 카드 머리 「기록 ›」 — 다른 카드 머리처럼 회색 글자 · 강조색 채움·테두리·글자·아이콘 없음 · ⋯ 없음 · 44px · 다크도", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await 준비(page);
  await page.goto("/stats");
  const btn = page.getByTestId("btn-bodyweight-card-record");
  await expect(btn).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("bodyweight-more")).toHaveCount(0);
  await expect(btn).toHaveText("기록");
  await expect(btn).toHaveAccessibleName(/기록/);
  for (const dark of [false, true]) {
    if (dark) {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    }
    const r = await btn.evaluate((el) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-brand)";
      document.body.appendChild(probe);
      const brand = getComputedStyle(probe).color;
      probe.remove();
      const s = getComputedStyle(el);
      const svgColors = [...el.querySelectorAll("svg, svg *")].flatMap((n) => {
        const c = getComputedStyle(n);
        return [c.color, c.fill, c.stroke];
      });
      const box = el.getBoundingClientRect();
      return {
        brand,
        color: s.color,
        bg: s.backgroundColor,
        borders: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth],
        borderColors: [s.borderTopColor],
        svgBrand: svgColors.some((c) => c === brand),
        height: box.height,
        right: box.right,
      };
    });
    expect(r.color, "글자가 강조색이 아니다").not.toBe(r.brand);
    expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(r.bg); // 채움 없음
    expect(
      r.borders.every((w) => w === "0px"),
      "테두리 없음",
    ).toBe(true);
    expect(r.svgBrand, "› 아이콘도 강조색이 아니다").toBe(false);
    expect(r.height).toBeGreaterThanOrEqual(44);
    expect(r.right).toBeLessThanOrEqual(360);
  }
  // 「기록 ›」 → 체중 패널 시트
  await btn.click();
  await expect(page.getByTestId("bodyweight-sheet").getByTestId("bodyweight-panel")).toBeVisible();
});

test("겹친 편집 — 운동 카드 맨 위 「고치기」를 연 채 아래 「지난 기록」에서 같은 줄을 고치면 맨 위 저장이 덮지 않음 · 그 줄을 지우면 맨 위 저장은 보이던 인바디로 새 줄 · 시트 안 고치기 Esc 는 고치기만 닫음", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await 준비(page);
  await page.goto("/profile");
  await page.getByTestId("bodyweight").click({ timeout: 20_000 });
  const n = await 목록_줄수(page);
  await page.getByTestId("bodyweight-entry").getByTestId("weighin-pbf").fill("20");
  await page.getByTestId("bodyweight-entry").getByTestId("weighin-save").click(); // 70.0kg · 체지방률 20
  await expect(page.getByTestId("bodyweight-history-row")).toHaveCount(n + 1);
  // 시트 안 고치기 — Esc 는 고치기만 닫고 시트는 남는다(리뷰 H-1) · 열면 포커스가 입력 안으로(리뷰 M-2)
  await page.getByTestId("bodyweight-history-edit").first().click();
  const ed = page.getByTestId("bodyweight-edit-sheet");
  await expect(ed.getByTestId("weighin-value")).toBeFocused();
  await expect(ed.getByTestId("bodyweight-edit-sheet-title")).toContainText("70.0kg");
  await page.keyboard.press("Escape");
  await expect(ed).toHaveCount(0);
  await expect(page.getByTestId("bodyweight-sheet")).toBeVisible();
  await expect(page.getByTestId("bodyweight-history-edit").first()).toBeFocused();
  await page.getByTestId("bodyweight-history-close").click();

  // ① 맨 위 「고치기」 열기 → 아래 목록에서 같은 줄을 71.0kg · 체지방률 25 로 → 맨 위 그대로 저장 → 71.0 · 25 유지
  await 빠른_운동_시작(page);
  const row = page.getByTestId("weighin-row");
  await expect(row).toHaveText("고치기", { timeout: 20_000 });
  await row.click();
  const editor = page.getByTestId("weighin-card-editor");
  const top = editor.getByTestId("bodyweight-entry");
  await expect(top.getByTestId("weighin-pbf")).toHaveValue("20");
  await editor.getByTestId("bodyweight-panel-more").click();
  await editor.getByTestId("bodyweight-history-edit").first().click();
  const low = editor.getByTestId("bodyweight-edit-sheet");
  await low.getByTestId("weighin-step-p1").click();
  await low.getByTestId("weighin-pbf").fill("25");
  await low.getByTestId("weighin-save").click();
  await expect(low).toHaveCount(0);
  await expect(editor.getByTestId("bodyweight-history-value").first()).toContainText("71.0kg");
  await top.getByTestId("weighin-save").click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId("weighin-card-value")).toHaveText("71.0kg");
  await expect(page.getByTestId("weighin-card")).toContainText("체지방률 25.0%");

  // ② 맨 위 「고치기」 열기 → 아래 목록에서 그 줄을 지움 → 맨 위 저장 = 보이던 체지방률 25 로 새 줄
  await row.click();
  await expect(top.getByTestId("weighin-pbf")).toHaveValue("25");
  await editor.getByTestId("bodyweight-panel-more").click();
  await editor.getByTestId("bodyweight-history-delete").first().click();
  await page.getByTestId("dialog-confirm").click();
  await expect(editor.getByTestId("bodyweight-history-empty")).toBeVisible();
  await top.getByTestId("weighin-save").click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId("weighin-card")).toContainText("체지방률 25.0%");

  const rows = await 이력_행(page);
  expect(rows.map((r) => [r.weight_kg, r.source, r.skeletal_muscle_kg ?? null, r.body_fat_pct])).toEqual([
    [71, "checkin", null, 25],
  ]);
});
