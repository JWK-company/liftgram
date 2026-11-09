// 화면 지도 보고서 캡처 — 4단계: 눌러야 나오는 시트. 실행: SHOTS=<폴더> BASE=… npx playwright test e2e/zz-screen-map4.spec.ts
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
test("마지막", async ({ page, browser }) => {
  test.setTimeout(900_000);
  page.setDefaultTimeout(8000);
  const save = () => fs.writeFileSync(`${OUT}/manifest4.json`, JSON.stringify(log,null,1));
  await 로그인(page, seed.a); await 준비(page); await 동기(page);
  await page.goto("/staff"); await page.getByText(/광고 자리/).first().click().catch(()=>{}); await page.waitForTimeout(600); await page.screenshot({path:`${OUT}/_staff_ad_after.jpg`,type:"jpeg",quality:50});
  const rurl = "/routines/"+(process.env.RID||""); 
  await page.goto("/"); await page.waitForTimeout(1000); await page.getByTestId("btn-routine-actions").first().click(); await page.waitForTimeout(400); await page.getByRole("button",{name:"편집",exact:true}).last().click(); await page.waitForTimeout(1500);
  const R = page.url();
  await s(page,"s.rrm",R,"btn-routine-menu",(p)=>p.getByRole("button",{name:"루틴 삭제"}).click());
  const re=(p:Page)=>p.locator('[data-testid^="re-"]').filter({has:p.getByTestId("rx-type")}).first().getByRole("button",{name:/더보기|메뉴|옵션/}).first().click();
  await s(page,"s.remenu",R,re);
  await s(page,"s.rss",null,/슈퍼세트/);
  await s(page,"s.rrmex",R,re,/삭제/);
  await s(page,"s.archive","/exercise/seed-walking","btn-archive-exercise");
  await s(page,"s.schedrm","/",/스케줄/,/삭제/);
  await 빠른_운동_시작(page); await 종목_추가(page,"벤치프레스"); await 종목_추가(page,"스쿼트");
  await s(page,"s.superset","/workout","btn-we-menu",/슈퍼세트/);
  await page.goto("/workout"); const r=page.getByTestId("set-list").first().locator("> div").first(); await r.getByTestId("set-weight").fill("90"); await r.getByTestId("set-reps").fill("10"); await r.getByTestId("set-reps").blur(); await r.getByTestId("set-done").click(); await page.waitForTimeout(500);
  await page.getByTestId("btn-complete").click(); await page.waitForTimeout(400); await page.getByTestId("dialog-confirm").click(); await page.waitForTimeout(1500);
  await page.getByTestId("btn-finish-dont-save").click().catch(()=>{}); await page.waitForTimeout(500);
  await s(page,"s.summary",null);
  await s(page,"s.share",null,"btn-summary-share"); await page.keyboard.press("Escape"); await page.waitForTimeout(300);
  await page.getByTestId("btn-summary-close").click().catch(()=>{}); await page.waitForTimeout(1200);
  save();
  await page.goto("/"); await page.waitForTimeout(800); await page.getByTestId("btn-start-routine").first().click(); await page.waitForTimeout(1500);
  await s(page,"s.swapscope","/workout","btn-we-menu",/대체/,(p)=>p.getByTestId("picker-list").locator("button").nth(3).click(),(p)=>p.getByTestId("picker-confirm").click().catch(()=>{}));
  await page.goto("/workout"); await page.waitForTimeout(800);
  await page.getByTestId("btn-add-set").first().click().catch(()=>{}); await page.waitForTimeout(400);
  const r1 = page.getByTestId("set-list").first().locator("> div").first();
  await r1.getByTestId("set-weight").fill("60").catch(()=>{}); await r1.getByTestId("set-reps").fill("10").catch(()=>{}); await r1.getByTestId("set-reps").blur().catch(()=>{}); await r1.getByTestId("set-done").click().catch(()=>{});
  await page.waitForTimeout(500); await page.getByTestId("btn-complete").click(); await page.waitForTimeout(400); await page.getByTestId("dialog-confirm").click(); await page.waitForTimeout(1500);
  await s(page,"s.finroutine",null);
  await s(page,"s.finpick",null,"btn-finish-apply");
  save();
  const [cb,pb] = await 새_기기(browser); pb.setDefaultTimeout(8000);
  await 로그인(pb,seed.b); await 준비(pb);
  await s(pb,"s.mrx","/coaching","coaching-routines");
  await s(pb,"s.rxed",null,(p)=>p.getByTestId("member-routines").getByRole("button").first().click());
  await cb.close(); save();
  const big = 큰_Strong_파일({workouts:3,exercisesPer:2,setsPer:2});
  await page.goto("/account/import"); await 가져오기_파일(page, "strong.csv", big.text);
  await page.getByTestId("import-unit-kg").click(); await page.getByTestId("btn-import-to-match").click(); await page.waitForTimeout(1000);
  await s(page,"/account/import",null);
  await s(page,"s.impun",null,"btn-import-start"); await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  await s(page,"s.imppick",null,(p)=>p.getByTestId("import-match-head").locator("xpath=following::button[1]").click());
  await page.keyboard.press("Escape"); await page.waitForTimeout(400);
  await s(page,"s.impleave",null,"btn-back");
  save();
});
