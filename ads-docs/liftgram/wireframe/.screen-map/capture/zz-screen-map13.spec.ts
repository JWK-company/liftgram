// 화면 지도 보고서 캡처 — 13단계(11-09): v0.85.0·0.86.0 바뀐 화면 — S-18 피드 머리 👤 · /people · /messages ✎ · /messages/new(새 메시지) ·
// S-4 운동 화면 「오늘 체중」 줄 · 오늘 체중 시트(인바디 펼침) · 분석 체중 카드(요약 아래 · 수치 고르기) · 체중 기록·목표 시트 · 프로필(체크인 스위치 없음).
// 실행: SHOTS=<폴더> BASE=… npx playwright test e2e/zz-screen-map13.spec.ts
import { expect, test, type Page } from "@playwright/test";
import { 가입, 마치기, 새_기기, 새_메일, 세트_기록, 종목_추가, 준비, 빠른_운동_시작 } from "./helpers/opengym";

const OUT = process.env.SHOTS as string;
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, locale: "ko-KR" });
async function shot(page: Page, name: string, full = false) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name.replace(/[^\w.-]/g, "_")}.jpg`, type: "jpeg", quality: 72, fullPage: full });
}
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

test("13단계", async ({ page, browser }) => {
  test.setTimeout(600_000);
  const a = 새_메일("a"), b = 새_메일("b"), c = 새_메일("c");
  const tag = Date.now().toString(36).slice(-4);
  const an = `지은${tag}`, bn = `민수${tag}`, cn = `서연${tag}`;
  for (const [m, nm] of [[b, bn], [c, cn]] as const) {
    const [, p] = await 새_기기(browser);
    await 가입(p, m, nm); await 준비(p);
  }
  await 가입(page, a, an); await 준비(page);

  // ── S-18 사람 화면 — 두 사람을 팔로우
  await page.goto("/feed");
  await expect(page.getByTestId("feed-people")).toBeVisible({ timeout: 20_000 });
  await shot(page, "/feed");
  await page.getByTestId("feed-people").click();
  await expect(page).toHaveURL(/\/people/);
  for (const nm of [bn, cn]) {
    await page.getByTestId("people-query").fill(nm);
    const row = page.getByTestId("people-row").filter({ hasText: nm }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByTestId("people-follow").click();
    await page.waitForTimeout(800);
  }
  await page.getByTestId("people-query").fill("");
  await page.goto("/people");
  await expect(page.getByTestId("people-row").first()).toBeVisible({ timeout: 20_000 });
  await shot(page, "/people");

  // 새 메시지 — 두 사람 골라 단체 대화
  await page.goto("/messages");
  await expect(page.getByTestId("dm-new")).toBeVisible({ timeout: 20_000 });
  await shot(page, "/messages");
  await page.getByTestId("dm-new").click();
  await expect(page).toHaveURL(/\/messages\/new/);
  for (const nm of [bn, cn]) {
    await page.getByTestId("group-user").filter({ hasText: nm }).first().click();
    await page.waitForTimeout(300);
  }
  await shot(page, "/messages/new");

  // ── S-4 운동 화면 「오늘 체중」 줄 · 시트(인바디 펼침)
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 세트_기록(page, 0, 0, 80, 8);
  const row = page.getByTestId("weighin-row");
  await expect(row).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "/workout");
  await row.click();
  const sheet = page.getByTestId("weighin-sheet");
  await sheet.getByTestId("weighin-step-p1").click();
  await sheet.getByTestId("weighin-step-p1").click();
  await sheet.getByTestId("weighin-step-p0_5").click();
  await sheet.getByTestId("weighin-inbody-toggle").click();
  await sheet.getByTestId("weighin-smm").fill("33.8");
  await sheet.getByTestId("weighin-pbf").fill("17.9");
  await shot(page, "s.weighin");
  await sheet.getByTestId("weighin-save").click();
  await expect(sheet).toHaveCount(0);
  await 마치기(page);

  // 지난 기록 둘 — 프로필 「기록」 → 날짜를 앞으로
  for (const [v, smm, pbf] of [["73.4", "33.1", "19.2"], ["72.9", "33.4", "18.6"]] as const) {
    await page.goto("/profile");
    await page.getByTestId("btn-bodyweight-record").click();
    const rec = page.getByTestId("bodyweight-record-sheet");
    await rec.getByTestId("weighin-type").click();
    await rec.getByTestId("weighin-input").fill(v);
    await rec.getByTestId("weighin-input").press("Enter");
    await rec.getByTestId("weighin-inbody-toggle").click();
    await rec.getByTestId("weighin-smm").fill(smm);
    await rec.getByTestId("weighin-pbf").fill(pbf);
    await rec.getByTestId("weighin-save").click();
    await expect(rec).toHaveCount(0);
  }
  await page.goto("/profile");
  await page.getByTestId("row-bodyweight-history").click();
  for (const [v, days] of [["73.4kg", 24], ["72.9kg", 11]] as const) {
    const r = page.getByTestId("bodyweight-history-row").filter({ hasText: v });
    await r.getByTestId("bodyweight-history-edit").click();
    const ed = page.getByTestId("bodyweight-edit-sheet");
    await ed.getByTestId("bodyweight-edit-date").fill(ymd(new Date(Date.now() - days * 86_400_000)));
    await ed.getByTestId("weighin-save").click();
    await expect(ed).toHaveCount(0);
  }
  await page.getByTestId("bodyweight-history-close").click();
  await page.goto("/profile");
  await expect(page.getByTestId("bodyweight-value")).toBeVisible({ timeout: 20_000 });
  await shot(page, "/profile");

  // 분석 — 요약 아래 체중 카드
  await page.goto("/stats");
  await expect(page.getByTestId("bodyweight-metric")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("bodyweight-card-title").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -260));
  await shot(page, "/stats");
  await page.getByTestId("btn-bodyweight-card-record").click();
  await page.getByTestId("bodyweight-record-sheet").getByTestId("weighin-inbody-toggle").click();
  await shot(page, "s.bw");
  await page.keyboard.press("Escape");
  await page.getByTestId("bodyweight-more").click();
  await page.getByTestId("btn-bodyweight-goal").click();
  await expect(page.getByTestId("bodyweight-goal-sheet")).toBeVisible();
  await shot(page, "s.bwgoal");
});
