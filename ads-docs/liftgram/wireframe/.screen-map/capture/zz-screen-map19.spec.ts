// 화면 지도 보고서 캡처 — 19단계(11-10): v0.93.1 — s.weighin 「오늘 체중」 카드 「기록/고치기」 버튼 없앰 · 머리 ⌄ 하나로 펼치면 입력
//   (18단계 파일을 그대로 두고 s.weighin 찍는 곳만 바꿨다 — 다른 사진은 18단계와 같다)
// 실행: SHOTS=<폴더> BASE=… npx playwright test e2e/zz-screen-map19.spec.ts
import { expect, test, type Browser, type Page } from "@playwright/test";
import { 빈곳 } from "./helpers/blankSpot";
import { 준비 } from "./helpers/opengym";

const OUT = process.env.SHOTS as string;
const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, locale: "ko-KR" });
async function shot(page: Page, name: string, full = false) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name.replace(/[^\w.-]/g, "_")}.jpg`, type: "jpeg", quality: 72, fullPage: full });
}
/** 같은 크기(390×844 · 1.5배)의 다른 기기 · hints=true 면 첫 안내가 뜬다(60초 동안 그대로) */
async function 기기(browser: Browser, hints = false): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1.5,
    locale: "ko-KR",
    storageState: {
      cookies: [],
      origins: [
        {
          origin: BASE,
          localStorage: hints
            ? [
                { name: "onboarding_seen_v1", value: "yes" },
                { name: "liftgram.nudge.suppressed", value: "e2e" },
                { name: "liftgram.hint.ms", value: "60000" },
              ]
            : [
                { name: "onboarding_seen_v1", value: "yes" },
                { name: "liftgram.hint.suppressed", value: "e2e" },
              ],
        },
      ],
    },
  });
  return ctx.newPage();
}
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 「체중」 시트 바로 입력 → 저장(목록 줄이 하나 늘면 끝 · 시트는 열린 채) · 인바디 칸은 늘 보인다 */
async function 바로_저장(page: Page, kg: string, inbody?: [string, string]) {
  await expect(
    page.locator('[data-testid="bodyweight-history-list"][data-loaded="1"], [data-testid="bodyweight-history-empty"]'),
  ).toHaveCount(1);
  const n = await page.getByTestId("bodyweight-history-row").count();
  const entry = page.getByTestId("bodyweight-entry");
  await entry.getByTestId("weighin-type").click();
  await entry.getByTestId("weighin-input").fill(kg);
  await entry.getByTestId("weighin-input").press("Enter");
  if (inbody) {
    await entry.getByTestId("weighin-smm").fill(inbody[0]);
    await entry.getByTestId("weighin-pbf").fill(inbody[1]);
  }
  await entry.getByTestId("weighin-save").click();
  await expect(page.getByTestId("bodyweight-history-row")).toHaveCount(n + 1, { timeout: 15_000 });
  await page.waitForTimeout(2200); // 같은 값 두 번 누름 막이(2초) 뒤
}
const 가운데로 = (page: Page, testId: string) =>
  page.getByTestId(testId).first().evaluate((el) => el.scrollIntoView({ block: "center" }));

test("18단계 — 체중 패널", async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await 기기(browser);
  await 준비(page);

  // ── 기록 셋(날짜를 벌려 둔다 · 둘은 인바디와 함께) — 「체중」 시트 바로 입력
  await page.goto("/profile");
  await page.getByTestId("bodyweight").click({ timeout: 20_000 });
  const sheet = page.getByTestId("bodyweight-sheet");
  await expect(sheet).toBeVisible();
  await 바로_저장(page, "73.4");
  await 바로_저장(page, "72.9", ["33.4", "18.6"]);
  await 바로_저장(page, "72.6", ["33.8", "17.9"]);
  for (const [v, days] of [["73.4kg", 24], ["72.9kg", 11]] as const) {
    await page.getByTestId("bodyweight-history-row").filter({ hasText: v }).getByTestId("bodyweight-history-edit").click();
    const ed = page.getByTestId("bodyweight-edit-sheet");
    await ed.getByTestId("bodyweight-edit-date").fill(ymd(new Date(Date.now() - days * 86_400_000)));
    await ed.getByTestId("weighin-save").click();
    await expect(ed).toHaveCount(0);
  }
  await expect(sheet.getByTestId("bodyweight-history-value")).toHaveText([/^72\.6kg/, /^72\.9kg/, /^73\.4kg/]);

  // ── s.p.bwall 「체중」 시트 — 인바디 칸 늘 보임 · 목표 「정하기」를 그 자리에 펼친 모습
  await sheet.getByTestId("btn-bodyweight-goal").click();
  const goal = page.getByTestId("bodyweight-goal-sheet");
  await expect(goal).toBeVisible();
  await goal.getByTestId("weighin-step-m1").click();
  await 가운데로(page, "bodyweight-goal");
  await shot(page, "s.p.bwall");
  await goal.getByTestId("weighin-save").click();
  await expect(sheet.getByTestId("bodyweight-goal-value")).toHaveText("71.6kg");

  // ── s.p.bwedit 그 줄 자리 고치기(인바디 미리 채움)
  await page.getByTestId("bodyweight-history-row").filter({ hasText: "72.9kg" }).getByTestId("bodyweight-history-edit").click();
  const ed = page.getByTestId("bodyweight-edit-sheet");
  await expect(ed).toBeVisible();
  await expect(ed.getByTestId("weighin-smm")).toHaveValue("33.4");
  await 가운데로(page, "bodyweight-edit-sheet");
  await shot(page, "s.p.bwedit");
  await ed.getByTestId("weighin-secondary").click();
  await expect(ed).toHaveCount(0);

  // ── s.p.bwrm 이 기록을 지울까요?
  await page.getByTestId("bodyweight-history-row").filter({ hasText: "73.4kg" }).getByTestId("bodyweight-history-delete").click();
  await expect(page.getByTestId("bodyweight-delete-confirm")).toBeVisible();
  await shot(page, "s.p.bwrm");
  await page.getByTestId("dialog-cancel").click();

  // ── s.p.bwnone 미설정 확인 창
  await sheet.getByTestId("btn-bodyweight-unset").click();
  await expect(page.getByTestId("bodyweight-unset-confirm")).toContainText("기록은 남아요");
  await shot(page, "s.p.bwnone");
  await page.getByTestId("dialog-cancel").click();
  await page.getByTestId("bodyweight-history-close").click();
  await expect(sheet).toHaveCount(0);

  // ── /stats — 체중 카드 머리 회색 「기록 ›」 하나(⋯ 없음)
  await page.goto("/stats");
  await expect(page.getByTestId("btn-bodyweight-card-record")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("bodyweight-more")).toHaveCount(0);
  await expect(page.getByTestId("bodyweight-goal-gap")).toContainText("목표 71.6kg", { timeout: 20_000 });
  await shot(page, "/stats");

  // ── s.bw 「기록 ›」 → 같은 「체중」 시트(다크로 찍는다)
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await page.getByTestId("btn-bodyweight-card-record").click();
  await expect(page.getByTestId("bodyweight-sheet")).toBeVisible();
  await expect(page.getByTestId("bodyweight-entry").getByTestId("weighin-smm")).toBeVisible();
  await shot(page, "s.bw");
  await page.getByTestId("bodyweight-history-close").click();
  await page.emulateMedia({ colorScheme: "light" });
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));

  // ── s.weighin 운동 화면 「오늘 체중」 카드 — 「고치기 ⌄」로 카드 안 펼침 → 「목표 · 지난 기록 ⌄」 펼침
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  // [원본] weighin-row 「고치기 ⌄」 — 버튼을 없앴다(v0.93.1) · 머리 ⌄ 를 누르면 펼치며 입력이 열린다
  const row = page.getByTestId("weighin-card-toggle");
  await expect(page.getByTestId("weighin-card")).toHaveAttribute("data-done", "1", { timeout: 20_000 });
  await row.click();
  const editor = page.getByTestId("weighin-card-editor");
  await expect(editor).toBeVisible();
  await expect(page.getByTestId("weighin-sheet")).toHaveCount(0);
  await expect(editor.getByTestId("weighin-smm")).toHaveValue("33.8");
  await editor.getByTestId("bodyweight-panel-more").click();
  await expect(editor.getByTestId("bodyweight-goal")).toBeVisible();
  await page.getByTestId("weighin-card").evaluate((el) => el.scrollIntoView({ block: "start" }));
  await shot(page, "s.weighin");
});

test("18단계 — 루틴 세트 휴지통 · 세트 번호 시트 · 첫 안내", async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await 기기(browser, true);
  await 준비(page);
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("routine-name").fill("하체 A");
  await page.getByTestId("routine-name").blur();
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 백 스쿼트");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();

  // ── h.rxtype 첫 안내 — 새 문구
  const rx = page.getByTestId("hint-rx-type");
  await expect(rx).toBeVisible({ timeout: 15_000 });
  await expect(rx).toContainText("세트 번호를 누르면 세트 종류를 바꿀 수 있어요");
  await shot(page, "h.rxtype");
  const p = await 빈곳(page);
  await page.mouse.click(p.x, p.y);
  await expect(rx).toHaveCount(0);

  // ── s.rxtype 세트 번호 시트 — 「삭제」 없음 · 첫 줄만 무게를 적어 「다른 세트도 똑같이」가 보이게
  const 줄 = page.getByTestId("set-table").first().getByTestId("set-table-row");
  await expect(줄).toHaveCount(3);
  await expect(page.getByTestId("rx-remove")).toHaveCount(3);
  await 줄.nth(0).getByTestId("rx-weight").fill("100");
  await 줄.nth(0).getByTestId("rx-weight").blur();
  await 줄.nth(0).getByTestId("rx-type").click();
  const ts = page.getByTestId("rx-type-sheet");
  await expect(ts).toBeVisible();
  await expect(ts.getByTestId("rx-delete")).toHaveCount(0);
  await expect(ts.getByTestId("rx-copy")).toBeVisible();
  await shot(page, "s.rxtype");
  await page.keyboard.press("Escape");
  await expect(ts).toHaveCount(0);

  // ── /routines/[id] 저장한 루틴 편집 — 세트 표 줄 끝 🗑
  await page.getByTestId("btn-routine-done").click();
  await expect(page.getByTestId("routine-list")).toContainText("하체 A", { timeout: 20_000 });
  await page.getByTestId("open-routine-preview").first().click();
  await page.getByTestId("routine-preview").getByTestId("routine-preview-edit").click();
  await expect(page).toHaveURL(/\/routines\/[^/]+$/, { timeout: 20_000 });
  await expect(page.getByTestId("routine-name")).toHaveValue("하체 A", { timeout: 20_000 });
  await expect(page.getByTestId("rx-remove")).toHaveCount(3);
  await 가운데로(page, "set-table");
  await shot(page, "/routines/[id]");
});
