// 화면 지도 보고서 캡처 — 4단계: 눌러야 나오는 시트. 실행: SHOTS=<폴더> BASE=… npx playwright test e2e/zz-screen-map5.spec.ts
import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { 로그인, 동기, 준비, 종목_추가, 세트_기록, 안내_띠_닫기, 빠른_운동_시작, 새_기기, 힘든정도_설정, 가입, 새_메일, 큰_Strong_파일, 가져오기_파일, 마치기 } from "./helpers/opengym";
const OUT = process.env.SHOTS as string;
const seed = JSON.parse(fs.readFileSync(`${OUT}/seed.json`, "utf8"));
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, locale: "ko-KR" });
const log: Record<string, string> = {};
const f = (id: string) => id.replace(/[^\w.-]/g, "_");
async function dump(page: Page, id: string) {
  const rows = await page.evaluate(() => [...document.querySelectorAll("button,a,[role=button],[role=switch],input,textarea")].filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => [e.tagName, e.getAttribute("data-testid"), e.getAttribute("aria-label"), (e.textContent || "").trim().slice(0, 30)].filter(Boolean).join(" | ")).filter((r) => !/nav-/.test(r)));
  fs.writeFileSync(`${OUT}/buttons/${f(id)}.txt`, rows.join("\n"));
}
type A = string | RegExp | ((p: Page) => Promise<unknown>);
async function act(page: Page, a: A) {
  if (typeof a === "function") return a(page);
  const l = typeof a === "string" ? page.getByTestId(a).first() : page.getByRole("button", { name: a }).first().or(page.getByText(a).first()).first();
  await l.click({ timeout: 5000 });
  await page.waitForTimeout(450);
}
async function s(page: Page, id: string, url: string | null, ...as: A[]) {
  try {
    if (url) { await page.goto(url); await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {}); await 안내_띠_닫기(page).catch(() => {}); }
    for (const a of as) await act(page, a);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${f(id)}.jpg`, type: "jpeg", quality: 72 });
    await dump(page, id);
    log[id] = "ok";
  } catch (e) { log[id] = "실패: " + String(e).split("\n")[0].slice(0, 110); }
}
test("보충", async ({ page }) => {
  test.setTimeout(300_000); page.setDefaultTimeout(8000);
  await 로그인(page, seed.a); await 준비(page); await 동기(page);
  await page.goto("/"); await page.waitForTimeout(1000); await page.getByTestId("btn-routine-actions").first().click(); await page.waitForTimeout(400); await page.getByRole("button",{name:"편집",exact:true}).last().click(); await page.waitForTimeout(1500);
  const R=page.url();
  await s(page,"s.rss",R,"btn-re-superset");
  await s(page,"s.rrmex",R,"btn-re-remove");
  const big = 큰_Strong_파일({workouts:3,exercisesPer:2,setsPer:2});
  await page.goto("/account/import"); await 가져오기_파일(page,"strong.csv",big.text);
  await page.getByTestId("import-unit-kg").click(); await page.getByTestId("btn-import-to-match").click(); await page.waitForTimeout(1000);
  await s(page,"s.imppick",null,(p)=>p.getByRole("button",{name:/바꾸기|고르기|선택|변경/}).first().click());
  fs.writeFileSync(`${OUT}/manifest5.json`, JSON.stringify(log,null,1));
});
