// 화면 지도 보고서 캡처 — 17단계(11-10): v0.91.1(커밋 85a9cc2)
//   체중 한 줄 — /profile 「체중 ‹최근 값› ›」 · s.p.bwall 「체중」 시트(바로 입력 + 지난 기록 + 미설정으로 두기 + 확인) ·
//   s.p.bwedit 기록 고치기 · s.p.bwrm 이 기록을 지울까요? · s.p.bwnone 미설정 확인 창(설명은 여기에만)
//   친절한 404 — y.404 「죄송해요. 찾는 화면이 없어요」 · y.apk404 「죄송해요. 이 설치 파일을 찾을 수 없어요」
//   첫 안내 말풍선(#T18) — h.prev 「이전」 칩 바로 위 · h.rxtype 세트 번호 옆(찍을 때만 liftgram.hint.ms=60000)
// 실행: SHOTS=<폴더> BASE=… npx playwright test e2e/zz-screen-map17.spec.ts
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

/** 「체중」 시트 바로 입력 → 저장(목록 줄이 하나 늘면 끝 · 시트는 열린 채) */
async function 바로_저장(page: Page, kg: string) {
  await expect(
    page.locator('[data-testid="bodyweight-history-list"][data-loaded="1"], [data-testid="bodyweight-history-empty"]'),
  ).toHaveCount(1);
  const n = await page.getByTestId("bodyweight-history-row").count();
  const entry = page.getByTestId("bodyweight-entry");
  await entry.getByTestId("weighin-type").click();
  await entry.getByTestId("weighin-input").fill(kg);
  await entry.getByTestId("weighin-input").press("Enter");
  await entry.getByTestId("weighin-save").click();
  await expect(page.getByTestId("bodyweight-history-row")).toHaveCount(n + 1, { timeout: 15_000 });
  await page.waitForTimeout(2200); // 같은 값 두 번 누름 막이(2초) 뒤
}

test("17단계 — 체중 한 줄 · 친절한 404", async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await 기기(browser);
  await 준비(page);

  // ── 기록 셋(날짜를 벌려 둔다) — 「체중」 시트 바로 입력
  await page.goto("/profile");
  await page.getByTestId("bodyweight").click({ timeout: 20_000 });
  const sheet = page.getByTestId("bodyweight-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("bodyweight-history-empty")).toHaveText("아직 기록이 없어요");
  for (const kg of ["73.4", "72.9", "72.6"]) await 바로_저장(page, kg);
  for (const [v, days] of [["73.4kg", 24], ["72.9kg", 11]] as const) {
    const r = page.getByTestId("bodyweight-history-row").filter({ hasText: v });
    await r.getByTestId("bodyweight-history-edit").click();
    const ed = page.getByTestId("bodyweight-edit-sheet");
    await ed.getByTestId("bodyweight-edit-date").fill(ymd(new Date(Date.now() - days * 86_400_000)));
    await ed.getByTestId("weighin-save").click();
    await expect(ed).toHaveCount(0);
  }
  await expect(sheet.getByTestId("bodyweight-history-value")).toHaveText(["72.6kg", "72.9kg", "73.4kg"]);

  // ── S-? s.p.bwall 「체중」 시트
  await shot(page, "s.p.bwall");

  // ── s.p.bwedit 기록 고치기
  await page.getByTestId("bodyweight-history-row").filter({ hasText: "72.9kg" }).getByTestId("bodyweight-history-edit").click();
  const ed = page.getByTestId("bodyweight-edit-sheet");
  await expect(ed).toBeVisible();
  await shot(page, "s.p.bwedit");
  await ed.getByTestId("weighin-secondary").click();
  await expect(ed).toHaveCount(0);

  // ── s.p.bwrm 이 기록을 지울까요?
  await page.getByTestId("bodyweight-history-row").filter({ hasText: "73.4kg" }).getByTestId("bodyweight-history-delete").click();
  await expect(page.getByTestId("bodyweight-delete-confirm")).toBeVisible();
  await shot(page, "s.p.bwrm");
  await page.getByTestId("dialog-cancel").click();

  // ── s.p.bwnone 미설정 확인 창(설명은 여기에만)
  await sheet.getByTestId("btn-bodyweight-unset").click();
  await expect(page.getByTestId("bodyweight-unset-confirm")).toContainText("기록은 남아요");
  await shot(page, "s.p.bwnone");
  await page.getByTestId("dialog-cancel").click();
  await page.getByTestId("bodyweight-history-close").click();
  await expect(sheet).toHaveCount(0);

  // ── /profile — 설정 묶음의 「체중 72.6kg ›」 한 줄이 보이게 내려 찍는다
  await page.goto("/profile");
  await expect(page.getByTestId("bodyweight-value")).toHaveText("72.6kg", { timeout: 20_000 });
  await page.getByTestId("bodyweight").evaluate((el) => el.scrollIntoView({ block: "center" }));
  await shot(page, "/profile");

  // ── y.404 없는 화면(자연어)
  const r404 = await page.goto("/no-such-page");
  expect(r404?.status()).toBe(404);
  await expect(page.getByTestId("not-found")).toContainText("죄송해요. 찾는 화면이 없어요");
  await shot(page, "y.404");

  // ── y.apk404 설치 파일 없음(자연어) — 저장이 아니라 화면으로 열린다
  const rapk = await page.goto("/downloads/x.apk");
  expect(rapk?.status()).toBe(404);
  await expect(page.getByTestId("download-missing")).toContainText("죄송해요. 이 설치 파일을 찾을 수 없어요");
  await shot(page, "y.apk404");
});

test("17단계 — 첫 안내 말풍선", async ({ browser }) => {
  test.setTimeout(300_000);
  const page = await 기기(browser, true);
  await 준비(page);

  const 빠른_운동 = async () => {
    await page.goto("/");
    await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
    await page.getByTestId("btn-quick-start").click();
    await page.getByTestId("btn-add-exercise").click();
    await page.getByTestId("picker-search").fill("바벨 벤치프레스");
    await page.getByTestId("picker-list").locator("button").first().click();
    await page.getByTestId("picker-confirm").click();
    await expect(page.getByTestId("exercise-picker")).toHaveCount(0);
  };
  const 첫세트 = () => page.getByTestId("set-list").first().locator("> div").first();

  // 벤치 1세트 기록 → 마치기
  await 빠른_운동();
  const row = 첫세트();
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

  // ── h.prev — 빠른 운동에 같은 종목 → 「이전」 칩 바로 위 말풍선
  await 빠른_운동();
  const hint = page.getByTestId("hint-prev");
  await expect(hint).toBeVisible({ timeout: 15_000 });
  await expect(hint.locator("button")).toHaveCount(0);
  await shot(page, "h.prev");

  // 빈 곳을 누르면 사라진다(말풍선은 누름을 받지 않는다)
  const p = await 빈곳(page);
  await page.mouse.click(p.x, p.y);
  await expect(hint).toHaveCount(0);
});

test("17단계 — 루틴 세트 번호 안내", async ({ browser }) => {
  test.setTimeout(180_000);
  const page = await 기기(browser, true);
  await 준비(page);
  await page.goto("/");
  // ── h.rxtype — 새 루틴에 종목 → 세트 번호 옆 말풍선
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  const rx = page.getByTestId("hint-rx-type");
  await expect(rx).toBeVisible({ timeout: 15_000 });
  await shot(page, "h.rxtype");
});
