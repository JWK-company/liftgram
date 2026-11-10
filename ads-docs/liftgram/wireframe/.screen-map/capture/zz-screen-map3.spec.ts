// 화면 지도 보고서 캡처 — 3단계: 눌러야 나오는 시트. 실행: SHOTS=<폴더> BASE=… npx playwright test e2e/zz-screen-map3.spec.ts
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
test("남은 시트", async ({ page, browser, context }) => {
  test.setTimeout(1500_000);
  page.setDefaultTimeout(8000);
  const save = () => fs.writeFileSync(`${OUT}/manifest3.json`, JSON.stringify(log,null,1));
  await 로그인(page, seed.a); await 준비(page); await 동기(page);
  // 루틴
  await page.goto("/routines/new"); await page.getByTestId("routine-name").fill("가슴 루틴");
  for (const ex of ["벤치프레스","스쿼트"]) { await page.getByTestId("btn-add-routine-exercise").click(); await page.getByTestId("picker-search").fill(ex); await page.getByTestId("picker-list").locator("button").first().click(); await page.getByTestId("picker-confirm").click(); await page.waitForTimeout(600); }
  await page.getByTestId("btn-routine-done").click(); await page.waitForTimeout(1500);
  await s(page,"s.routine-actions","/","btn-routine-actions");
  await s(page,"s.rmroutine",null,/삭제/);
  await page.goto("/"); await page.waitForTimeout(800); await page.getByTestId("btn-routine-actions").first().click(); await page.waitForTimeout(500); await page.getByRole("button",{name:/편집/}).last().click().catch(()=>{}); await page.waitForTimeout(1500);
  const rurl = page.url(); log["rurl"]=rurl;
  const re = (p:Page)=>p.getByRole("button",{name:"더보기"}).nth(1).click();
  await s(page,"/routines/[id]",rurl);
  await s(page,"s.rmenu",rurl,"btn-routine-menu");
  await s(page,"s.rrm",null,/삭제/);
  await s(page,"s.rss",rurl,re,/슈퍼/);
  await s(page,"s.rrmex",rurl,re,/삭제/);
  // 크리에이터 중복
  await page.goto("/"); await page.getByTestId("concept-topic-pro-shoulders").click(); await page.waitForTimeout(400); await page.locator('[data-testid^="creator-version-"]').first().click(); await page.waitForTimeout(400); await page.getByRole("button",{name:/내 루틴에 저장/}).click().catch(()=>{}); await page.waitForTimeout(1200);
  await s(page,"s.cdupe","/","concept-topic-pro-shoulders",(p)=>p.locator('[data-testid^="creator-version-"]').first().click(),/내 루틴에 저장/);
  // 스케줄 삭제
  await page.goto("/"); await page.getByTestId("entry-schedule").click().catch(()=>{}); await page.waitForTimeout(400); await page.locator('[data-testid^="schedule-day-"]').first().click().catch(()=>{}); await page.waitForTimeout(400); await page.getByRole("button",{name:"가슴 루틴"}).first().click().catch(()=>{}); await page.waitForTimeout(400); await page.getByRole("button",{name:"저장"}).first().click().catch(()=>{}); await page.waitForTimeout(1000);
  await s(page,"/_home_sched","/");
  await s(page,"s.schedrm","/",/스케줄/,/삭제/);
  // 프로필·종목
  // [원본] await page.goto("/profile"); await page.getByTestId("btn-bodyweight-record").click(); await page.waitForTimeout(400); await page.getByRole("button",{name:"저장"}).first().click().catch(()=>{}); await page.waitForTimeout(800);
  // [개선] 0.97.0 프로필은 「체중 ›」 한 줄 → 패널 · 실패해도 다음 화면은 찍는다
  await (async () => { await page.goto("/profile"); await page.getByTestId("bodyweight").first().click({timeout:5000}); await page.waitForTimeout(400); await page.getByRole("button",{name:"저장"}).first().click().catch(()=>{}); await page.waitForTimeout(800); })().catch(() => {});
  await s(page,"s.p.bwnone","/profile","bodyweight",/미설정/);
  await page.goto("/exercises/new"); await page.locator("input").first().fill("내 케이블 푸시다운2"); await page.getByRole("button",{name:/저장|만들기|추가/}).last().click().catch(()=>{}); await page.waitForTimeout(800);
  await page.goto("/exercises"); await page.getByTestId("search-input").fill("내 케이블");await page.waitForTimeout(800);
  const eh = await page.locator('a[data-testid^="edit-"]').first().getAttribute("href").catch(()=>null);
  if (eh) await s(page,"s.archive",eh.replace("/exercises/","/exercise/").replace("/edit",""),"btn-archive-exercise");
  // 광고 미리 보기
  await s(page,"s.ad","/staff",/광고 자리/); log["s.ad.url"]=page.url();
  // 운동 — 메뉴
  await 빠른_운동_시작(page); await 종목_추가(page,"벤치프레스");
  await s(page,"s.superset","/workout","btn-we-menu",/슈퍼/);
  await page.goto("/workout"); await page.waitForTimeout(600);
  const r0 = page.getByTestId("set-list").first().locator("> div").first();
  await r0.getByTestId("set-weight").fill("200"); await r0.getByTestId("set-reps").fill("10"); await r0.getByTestId("set-reps").blur();
  await s(page,"s.pr",null,(p)=>r0.getByTestId("set-done").click());
  await page.waitForTimeout(3000);
  await 힘든정도_설정(page,true); await page.goto("/workout"); await page.waitForTimeout(800);
  await s(page,"s.rir","/workout",(p)=>p.locator('[data-testid^="set-rir-"]').first().click());
  await 힘든정도_설정(page,false);
  // 요약 → 공유 → 글 → 가져오기
  await page.goto("/workout"); await page.getByTestId("btn-complete").click(); await page.waitForTimeout(400); await page.getByTestId("dialog-confirm").click(); await page.waitForTimeout(1500);
  await page.getByTestId("btn-finish-dont-save").click().catch(()=>{}); await page.waitForTimeout(500);
  await s(page,"s.summary",null);
  await s(page,"s.share",null,"btn-summary-share");
  await page.getByTestId("feed-post").click().catch(()=>{}); await page.getByRole("button",{name:/올리기|공유|게시/}).last().click().catch(()=>{}); await page.waitForTimeout(1500);
  await page.getByTestId("btn-summary-close").click().catch(()=>{}); await page.waitForTimeout(800);
  await s(page,"s.importroutine","/feed",(p)=>p.getByTestId("post-routine-toggle").first().click().catch(()=>{}),"post-routine-import");
  save();
  // 루틴 운동 → 달라짐·교체 범위
  await page.goto("/"); await page.waitForTimeout(800); await page.getByTestId("btn-start-routine").first().click(); await page.waitForTimeout(1500);
  await s(page,"s.swapscope","/workout","btn-we-menu",/대체|교체/,(p)=>p.getByTestId("picker-list").locator("button").nth(2).click(),"picker-confirm");
  await page.keyboard.press("Escape"); await page.goto("/workout"); await page.waitForTimeout(600);
  await page.getByTestId("btn-add-set").first().click().catch(()=>{}); await page.waitForTimeout(400);
  const r1 = page.getByTestId("set-list").first().locator("> div").first();
  await r1.getByTestId("set-weight").fill("60").catch(()=>{}); await r1.getByTestId("set-reps").fill("10").catch(()=>{}); await r1.getByTestId("set-reps").blur().catch(()=>{}); await r1.getByTestId("set-done").click().catch(()=>{});
  await page.waitForTimeout(500); await page.getByTestId("btn-complete").click(); await page.waitForTimeout(400); await page.getByTestId("dialog-confirm").click(); await page.waitForTimeout(1500);
  await s(page,"s.finroutine",null);
  await s(page,"s.finpick",null,/골라|고르/);
  // 그룹
  await page.goto("/messages/new"); await page.getByTestId("group-title").fill("운동 모임"); await page.getByTestId("group-search").fill(seed.bn); await page.waitForTimeout(1000); await page.getByTestId("group-user").first().click().catch(()=>{}); await page.getByTestId("group-create").click().catch(()=>{}); await page.waitForTimeout(1500);
  await s(page,"s.leave",null,"conv-leave");
  save();
  // 코칭
  await page.goto("/coaching"); await page.getByTestId("coaching-query").fill(seed.bn); await page.getByTestId("coaching-search").click(); await page.waitForTimeout(1200); await page.getByTestId("coaching-request").first().click().catch(()=>{}); await page.waitForTimeout(1000);
  await 동기(page);
  const [cb,pb] = await 새_기기(browser); pb.setDefaultTimeout(8000);
  await 로그인(pb,seed.b); await 준비(pb);
  await pb.goto("/coaching"); await pb.getByTestId("coaching-accept").first().click().catch(()=>{}); await pb.waitForTimeout(1500);
  await s(pb,"/coaching","/coaching");
  await s(pb,"s.chist","/coaching","coaching-history-link");
  await s(pb,"s.mreport","/coaching",/리포트/);
  await s(pb,"s.mrx","/coaching",/처방/);
  await s(pb,"s.rxed",null,(p)=>p.getByTestId("member-exercise").first().click());
  await cb.close();
  save();
  // 가져오기
  const big = 큰_Strong_파일({workouts:3,exercisesPer:2,setsPer:2}) as any;
  try { await page.goto("/account/import"); await 가져오기_파일(page, big.name ?? "strong.csv", big.text ?? big.csv); await s(page,"/account/import#summary",null);
    await page.getByTestId("btn-import-to-match").click(); await page.waitForTimeout(800);
    await s(page,"/account/import#match",null);
    await s(page,"s.impun",null,"btn-import-start"); await page.keyboard.press("Escape"); await page.waitForTimeout(400);
    await s(page,"s.imppick",null,(p)=>p.locator('[data-testid^="import-match-row"],[data-testid^="import-row"],[data-testid^="btn-import-pick-"]').first().click());
    await page.keyboard.press("Escape"); await page.waitForTimeout(400);
    await s(page,"s.impleave",null,"btn-back");
  } catch(e){ log["import"]=String(e).slice(0,120); }
  save();
  // 앱 첫 실행·권유·탭·404
  const c2 = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1.5,locale:"ko-KR",baseURL:process.env.BASE}); const p2 = await c2.newPage(); p2.setDefaultTimeout(8000);
  await p2.addInitScript(()=>{localStorage.removeItem("onboarding_seen_v1");localStorage.removeItem("liftgram.nudge.suppressed");});
  await s(p2,"s.onboard","/");
  await p2.waitForTimeout(500);
  await s(p2,"s.onboard2",null,"onboarding-next");
  await p2.getByTestId("onboarding-skip").click().catch(()=>{});
  await p2.evaluate(()=>localStorage.setItem("onboarding_seen_v1","yes"));
  await p2.addInitScript(()=>localStorage.setItem("onboarding_seen_v1","yes"));
  await 준비(p2); await 빠른_운동_시작(p2); await 종목_추가(p2,"벤치프레스"); await 세트_기록(p2,0,0,60,10);
  await p2.getByTestId("btn-complete").click(); await p2.waitForTimeout(400); await p2.getByTestId("dialog-confirm").click(); await p2.waitForTimeout(1500);
  await p2.getByTestId("btn-finish-dont-save").click().catch(()=>{}); await p2.waitForTimeout(500); await p2.getByTestId("btn-summary-close").click().catch(()=>{}); await p2.waitForTimeout(1500);
  await s(p2,"s.nudge",null);
  await s(p2,"g.sync","/profile");
  await s(p2,"g.tabbar","/history");
  await s(p2,"y.apk404","/downloads/no-such.apk");
  await c2.close();
  // 다른 탭
  try { const t2 = await context.newPage(); await t2.goto("/"); await t2.waitForTimeout(2500); await s(page,"s.tabseal","/profile"); await t2.close(); } catch(e){}
  save();
});
