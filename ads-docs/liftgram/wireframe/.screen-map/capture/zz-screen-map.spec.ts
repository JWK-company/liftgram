// 화면 지도 보고서 캡처 — 1단계: 시드 + 주소 있는 화면. 실행: SHOTS=<폴더> BASE=… npx playwright test e2e/zz-screen-map.spec.ts
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { 가입, 동기, 마치기, 빠른_운동_시작, 세트_기록, 새_기기, 새_메일, 준비, 종목_추가, 안내_띠_닫기 } from "./helpers/opengym";

const OUT = process.env.SHOTS as string;
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, locale: "ko-KR" });
const log: Record<string, string> = {};
function role(email: string, r: string) {
  // E2E_PG = 시험 API 가 쓰는 DB 주소(postgres://…) — 저장소에 적지 않는다
  execFileSync("psql", [process.env.E2E_PG as string, "-c", `update users set role='${r}' where email='${email}'`]);
}
async function dump(page: Page, id: string) {
  const rows = await page.evaluate(() => [...document.querySelectorAll("button,a,[role=button],[role=tab],[role=switch],input,select,textarea")].filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => [e.tagName, e.getAttribute("data-testid"), e.getAttribute("aria-label"), (e.textContent || "").trim().slice(0, 30), e.getAttribute("href")].filter(Boolean).join(" | ")));
  fs.writeFileSync(`${OUT}/buttons/${id.replace(/[^\w.-]/g, "_")}.txt`, rows.join("\n"));
}
async function shot(page: Page, id: string, full = true) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${id.replace(/[^\w.-]/g, "_")}.jpg`, type: "jpeg", quality: 72, fullPage: full });
  log[id] = page.url();
  await dump(page, id);
}
async function at(page: Page, id: string, url: string) {
  try {
    await page.goto(url);
    await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
    await 안내_띠_닫기(page).catch(() => {});
    await shot(page, id);
  } catch (e) { log[id] = "실패: " + String(e).slice(0, 120); }
}
test("페이지 캡처", async ({ page, browser }) => {
  test.setTimeout(900_000);
  const a = 새_메일("a"), b = 새_메일("b"), bn = `민수${Date.now().toString(36).slice(-4)}`;
  // 로그인 전 화면
  const [c0, p0] = await 새_기기(browser);
  for (const [id, u] of [["/signin","/signin"],["/signup","/signup"],["/forgot","/forgot"],["/reset","/reset?token=x"],["/verify-email","/verify-email?token=x"],["/auth/complete","/auth/complete?code=x"],["/app","/app"],["/app/continue","/app/continue"],["/terms","/terms"],["/privacy","/privacy"],["/licenses","/licenses"],["/offline","/offline"],["/diag/db","/diag/db"],["y.404","/no-such-page"]] as const) await at(p0, id, u);
  await c0.close();
  // 두 번째 사람
  const [cb, pb] = await 새_기기(browser);
  await 가입(pb, b, bn); await 준비(pb);
  await pb.goto("/feed"); await pb.getByTestId("feed-compose").click();
  await pb.getByTestId("feed-caption").fill("오늘 등 운동 끝 #등운동"); await pb.getByTestId("feed-post").click();
  await expect(pb.getByTestId("feed-list")).toContainText("등 운동", { timeout: 20000 });
  await pb.goto("/profile"); await pb.getByTestId("btn-edit-experience").click(); await pb.getByTestId("trainer-intent").click(); await pb.waitForTimeout(800); await 동기(pb);
  // 주 사용자
  await 가입(page, a, "시연 사용자"); role(a, "admin"); await 준비(page);
  for (const [ex, kg] of [["벤치프레스",80],["스쿼트",100]] as const) {
    await 빠른_운동_시작(page); await 종목_추가(page, ex); await 세트_기록(page,0,0,kg,8); await 마치기(page);
  }
  await 동기(page);
  await page.goto("/discover"); await page.getByTestId("discover-query").fill(bn); await expect(page.getByTestId("discover-list")).toContainText(bn,{timeout:20000}); await page.getByTestId("discover-user").first().click();
  await expect(page.getByTestId("profile-name")).toHaveText(bn,{timeout:20000});
  const uurl = page.url();
  await page.getByRole("button",{name:/팔로우/}).first().click().catch(()=>{}); await page.waitForTimeout(800);
  await page.getByTestId("profile-message").click(); await page.getByTestId("conv-input").fill("안녕하세요"); await page.getByTestId("conv-send").click(); await page.waitForTimeout(800);
  const conv = page.url();
  await page.goto("/feed"); await page.getByTestId("feed-compose").click(); await page.getByTestId("feed-caption").fill("벤치 80 성공 #가슴운동"); await page.getByTestId("feed-post").click(); await page.waitForTimeout(1500);
  await page.goto("/history"); const h = await page.locator('[data-testid^="history-"] a, a[href^="/history/"]').first().getAttribute("href").catch(()=>null);
  await page.goto("/exercises"); await expect(page.getByTestId("sync-state")).toHaveText("최신",{timeout:30000}); const exId=(await page.locator('[data-testid^="exercise-"]').nth(1).getAttribute("data-testid")||"").replace("exercise-","");
  await page.goto("/explore"); await page.waitForTimeout(1500);
  const post = await page.locator('a[href^="/feed/"]').first().getAttribute("href").catch(()=>null);
  fs.writeFileSync(`${OUT}/seed.json`, JSON.stringify({a,b,bn,uurl,conv,h,exId,post}));
  for (const [id,u] of [["/","/"],["/history","/history"],["/feed","/feed"],["/stats","/stats"],["/profile","/profile"],["/calendar","/calendar"],["/history/[id]",h||"/history"],["/exercises","/exercises"],["/exercise/[id]",`/exercise/${exId}`],["/exercises/new","/exercises/new"],["/routines/new","/routines/new"],["/program","/program"],["/gyms","/gyms"],["/feed/[postId]",post||"/feed"],["/explore","/explore"],["/discover","/discover"],["/hashtag/[tag]","/hashtag/등운동"],["/u/[userId]",uurl],["/u/[userId]/follows",uurl+"/follows"],["/messages","/messages"],["/messages/[id]",conv],["/messages/new","/messages/new"],["/notifications","/notifications"],["/bookmarks","/bookmarks"],["/coaching","/coaching"],["/gear","/gear"],["/blocked","/blocked"],["/account","/account"],["/account/import","/account/import"],["/staff","/staff"],["/feedback","/feedback"],["/moderation","/moderation"],["/ops","/ops"]] as const) await at(page,id,u);
  // 내 종목 수정·루틴 편집
  await 빠른_운동_시작(page); await 종목_추가(page,"벤치프레스"); await 세트_기록(page,0,0,80,8); await 종목_추가(page,"스쿼트");
  await shot(page,"/workout",false);
  fs.writeFileSync(`${OUT}/manifest1.json`, JSON.stringify(log,null,1));
});
