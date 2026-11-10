// 화면 지도 보고서 캡처 — 2단계: 눌러야 나오는 시트. 실행: SHOTS=<폴더> BASE=… npx playwright test e2e/zz-screen-map2.spec.ts
import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { 로그인, 동기, 준비, 종목_추가, 세트_기록, 안내_띠_닫기, 빠른_운동_시작, 새_기기, 힘든정도_설정 } from "./helpers/opengym";
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
test("시트 캡처", async ({ page, browser }) => {
  test.setTimeout(1500_000);
  page.setDefaultTimeout(8000);
  await 로그인(page, seed.a); await 준비(page);
  await 동기(page);
  // 내 종목·루틴 만들기
  await page.goto("/exercises/new"); const inputs = page.locator("input"); await inputs.first().fill("내 케이블 푸시다운"); await page.getByRole("button",{name:/저장|만들기|추가/}).last().click().catch(()=>{}); await page.waitForTimeout(800);
  await page.goto("/exercises"); await page.getByTestId("search-input").fill("내 케이블");await page.waitForTimeout(800);
  const editHref = await page.locator('a[data-testid^="edit-"]').first().getAttribute("href").catch(()=>null);
  if (editHref) await s(page,"/exercises/[id]/edit",editHref);
  await page.goto("/routines/new"); await page.getByTestId("routine-name").fill("가슴 루틴");
  await page.getByTestId("btn-add-routine-exercise").click(); await page.getByTestId("picker-search").fill("벤치프레스"); await page.getByTestId("picker-list").locator("button").first().click(); await page.getByTestId("picker-confirm").click(); await page.waitForTimeout(600);
  await page.getByTestId("btn-add-routine-exercise").click(); await page.getByTestId("picker-search").fill("스쿼트"); await page.getByTestId("picker-list").locator("button").first().click(); await page.getByTestId("picker-confirm").click(); await page.waitForTimeout(600);
  await s(page,"s.rxtype",null,"rx-type"); await page.keyboard.press("Escape");await page.waitForTimeout(300);
  await s(page,"s.rxmenu",null,"rx-more"); await page.keyboard.press("Escape");await page.waitForTimeout(300);
  await s(page,"s.rexit",null,"btn-back"); await page.keyboard.press("Escape");await page.waitForTimeout(300);
  await page.getByTestId("btn-routine-done").click().catch(()=>{}); await page.waitForTimeout(1500);
  // 홈
  await s(page,"s.sched","/","entry-schedule");
  await s(page,"s.schedday",null,(p)=>p.locator('[data-testid^="schedule-day-"]').first().click());
  await s(page,"s.ctopic","/","concept-topic-pro-shoulders");
  await s(page,"s.cver",null,(p)=>p.locator('[data-testid^="creator-version-"]').first().click());
  const rm = (p:Page)=>p.locator('[data-testid^="routine-"]').first().getByRole("button",{name:/더보기|메뉴/}).first().click();
  await s(page,"s.routine-actions","/",rm);
  await s(page,"s.rmroutine",null,/삭제/);
  await page.goto("/"); await page.waitForTimeout(800); await rm(page).catch(()=>{}); await page.waitForTimeout(400);
  await page.getByRole("button",{name:/편집/}).first().click().catch(()=>{}); await page.waitForTimeout(1500);
  const rurl = page.url(); fs.writeFileSync(`${OUT}/rurl.txt`,rurl);
  if (/routines\//.test(rurl)) {
    await s(page,"/routines/[id]",rurl);
    await s(page,"s.rmenu",rurl,"btn-routine-menu");
    await s(page,"s.rrm",null,/삭제/);
    await s(page,"s.remenu",rurl,(p)=>p.locator('[data-testid^="re-"]').first().getByRole("button",{name:/더보기|메뉴/}).first().click());
    await s(page,"s.rss",null,/슈퍼셋/);
    await s(page,"s.rrmex",rurl,(p)=>p.locator('[data-testid^="re-"]').first().getByRole("button",{name:/더보기|메뉴/}).first().click(),/삭제/);
  }
  // 기록·분석
  await s(page,"s.goal","/calendar","goal-row");
  await s(page,"s.recmenu","/calendar","records-more");
  await s(page,"s.share",null,/자랑/);
  await s(page,"s.dmenu",seed.h,"btn-detail-menu");
  await s(page,"s.rmworkout",null,/삭제/);
  await s(page,"s.nameroutine",seed.h,"btn-detail-menu",/루틴/);
  await s(page,"s.editset",seed.h,"detail-set");
  await s(page,"s.rmset",null,/지우기|삭제/);
  await s(page,"s.bw","/stats","btn-bodyweight-card-record");
  await s(page,"s.bwgoal","/stats","btn-bodyweight-goal");
  // 프로필
  for (const [id,t] of [["s.p.exp","btn-edit-experience"],["s.p.theme","theme"],["s.p.lang","language"],["s.p.sound","row-rest-sound"],["s.p.equip","row-equipment"],["s.p.custom","row-machine-labels"],["s.p.bwall","bodyweight"]] as const) await s(page,id,"/profile",t);
  // [원본] await page.goto("/profile"); await page.getByTestId("btn-bodyweight-record").click(); …
  // [개선] 0.97.0 프로필은 「체중 ›」 한 줄 → 패널(btn-bodyweight-record 없음) · 실패해도 다음 화면은 찍는다
  await (async () => { await page.goto("/profile"); await page.getByTestId("bodyweight").first().click({timeout:5000}); await page.waitForTimeout(400); await page.locator('input').last().fill("75").catch(()=>{}); await page.getByRole("button",{name:/저장|기록/}).last().click().catch(()=>{}); await page.waitForTimeout(800); })().catch(() => {});
  await s(page,"s.p.bwedit","/profile","bodyweight","bodyweight-history-edit");
  await s(page,"s.p.bwrm","/profile","bodyweight","bodyweight-history-delete");
  await s(page,"s.p.bwnone","/profile","bodyweight","btn-bodyweight-unset");
  // 피드
  await s(page,"s.compose","/feed","feed-compose");
  await s(page,"s.geartag",null,"gear-open");
  await s(page,"s.story","/feed","story-mine");
  await s(page,"s.ownmenu","/feed","post-menu");
  await s(page,"s.caption",null,"post-edit");
  await s(page,"s.rmpost","/feed","post-menu","post-delete");
  await s(page,"s.report","/feed","post-report");
  await s(page,"s.pmenu",seed.uurl,"profile-menu");
  // 종목
  await s(page,"s.alias","/exercise/seed-barbell-bench-press","exercise-name");
  await s(page,"/exercise/[id]","/exercise/seed-barbell-bench-press");
  if (editHref) await s(page,"s.archive",editHref.replace("/exercises/","/exercise/").replace("/edit",""),"exercise-more","btn-archive-exercise");
  await s(page,"s.finder","/exercises","btn-wizard");
  await s(page,"s.ad","/staff",/광고/);
  // 운동 중
  await 빠른_운동_시작(page); await 종목_추가(page,"벤치프레스"); await 세트_기록(page,0,0,80,8); await 종목_추가(page,"스쿼트");
  const W="/workout";
  await s(page,"/workout",W);
  await s(page,"s.rest",W);
  await s(page,"s.finish",W,"btn-complete");
  await s(page,"s.wmenu",W,"btn-session-menu");
  await s(page,"s.discard",null,/취소/);
  await s(page,"s.rename",W,"workout-name");
  await s(page,"s.muscle",W,"btn-today-muscles");
  await s(page,"s.emenu",W,"btn-we-menu");
  await s(page,"s.superset",null,/슈퍼셋/);
  await s(page,"s.rmex",W,"btn-we-menu",/삭제/);
  await s(page,"s.picker",W,"btn-add-exercise");
  await s(page,"s.resttime",W,"btn-rest-setting");
  await s(page,"s.variant",W,"variant-trigger");
  await s(page,"s.settype",W,"set-type");
  await s(page,"s.setvar",W,"set-more","set-variant");
  await s(page,"s.slots",W,"block-more");
  await s(page,"g.bar","/");
  await s(page,"s.active","/",(p)=>p.locator('[data-testid^="routine-"]').first().click(),/시작/);
  // 요약
  await page.goto(W); await page.getByTestId("btn-complete").click(); await page.waitForTimeout(400);
  await s(page,"s.summary",null,"dialog-confirm");
  await page.screenshot({path:`${OUT}/s.finname_try.jpg`,type:"jpeg",quality:60});
  await dump(page,"s.summary_after");
  fs.writeFileSync(`${OUT}/manifest2.json`, JSON.stringify(log,null,1));
  // 온보딩
  const ctx = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1.5}); const p2 = await ctx.newPage();
  await s(p2,"s.onboard","/"); 
  await ctx.close();
  fs.writeFileSync(`${OUT}/manifest2.json`, JSON.stringify(log,null,1));
});
