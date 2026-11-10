// 화면 지도 보고서 캡처 — 14단계(11-10): 코칭 v2(v0.87.0~0.90.0)·세트별 휴식(v0.88.0)
//   S-27 /coaching(초대 카드·코드로 연결·담당 회원 점검) · ⋯ 시트 · 끊기 확인 · 이력·기록 요약·루틴 처방 판 ·
//   /coaching/join · 범위 시트(요청) · 사람 프로필 「코칭 초대」 확인 · 초대 코드 새로 만들기 확인 ·
//   /coaching/m/[회원](기록 탭) · 처방 대 실제·코멘트 · 보낸 루틴 · 코치 루틴 초안 편집기 · 홈 「담당 회원」 카드 ·
//   회원 쪽 코치 루틴 보기 화면 · 기록 상세 코치 코멘트 · ⏱ 휴식 시트(세트 방식별 줄)
// 실행: SHOTS=<폴더> BASE=… npx playwright test e2e/zz-screen-map14.spec.ts
import { expect, test, type Browser, type Page } from "@playwright/test";
import { 가입, 동기, 마치기, 새_메일, 세트_기록, 종목_추가, 준비, 빠른_운동_시작 } from "./helpers/opengym";

const OUT = process.env.SHOTS as string;
const RPC = "/api/coaching.v1.CoachingService";
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, locale: "ko-KR" });
async function shot(page: Page, name: string, full = false) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name.replace(/[^\w.-]/g, "_")}.jpg`, type: "jpeg", quality: 72, fullPage: full });
}
/** 같은 크기(390×844 · 1.5배)의 다른 기기 */
async function 기기(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1.5,
    locale: "ko-KR",
    storageState: {
      cookies: [],
      origins: [
        {
          origin: process.env.BASE ?? "http://127.0.0.1:3100",
          localStorage: [
            { name: "onboarding_seen_v1", value: "yes" },
            { name: "liftgram.hint.suppressed", value: "e2e" },
          ],
        },
      ],
    },
  });
  return ctx.newPage();
}
async function 내_id(page: Page): Promise<string> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("liftgram.me");
    return raw ? ((JSON.parse(raw) as { id?: string }).id ?? "") : "";
  });
}
async function 코치되기(page: Page, bio: string, tags: string[]) {
  await page.goto("/profile");
  await page.getByTestId("btn-edit-experience").click();
  await expect(page.getByTestId("trainer-intent")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("trainer-intent").click();
  await expect(page.getByTestId("trainer-intent")).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
  await expect(page.getByTestId("coach-profile-fields")).toBeVisible({ timeout: 20_000 });
  const saved = page.waitForResponse("**/auth.v1.AuthService/UpdateProfile");
  await page.getByTestId("coach-bio").fill(bio);
  await page.getByTestId("coach-bio").press("Enter");
  await saved;
  for (const tag of tags) {
    const s = page.getByTestId(`coach-tag-${tag}`);
    const w = page.waitForResponse("**/auth.v1.AuthService/UpdateProfile");
    await s.click();
    await w;
  }
  await page.keyboard.press("Escape");
}
async function 줄_메뉴(page: Page, name: string) {
  await page.goto("/coaching");
  await page
    .getByTestId("coaching-members")
    .getByTestId("coaching-grant")
    .filter({ hasText: name })
    .getByTestId("coaching-grant-more")
    .click({ timeout: 20_000 });
  await expect(page.getByTestId("coaching-grant-sheet")).toBeVisible();
}

test("14단계", async ({ page, browser }) => {
  test.setTimeout(900_000);
  const tag = Date.now().toString(36).slice(-4);
  const tn = `박코치${tag}`, mn = `지은${tag}`, cn = `민수${tag}`;
  const T = page; // 코치
  const M = await 기기(browser); // 회원
  const C = await 기기(browser); // 아직 코치 없는 사람

  await 가입(T, 새_메일("sm14-t"), tn);
  await 코치되기(T, "생활체육지도사 · 초보 근력 운동 5년", ["strength", "beginner"]);
  await 준비(T);
  const tId = await 내_id(T);
  await 가입(M, 새_메일("sm14-m"), mn);
  await 준비(M);
  const mId = await 내_id(M);
  await 가입(C, 새_메일("sm14-c"), cn);
  await 준비(C);
  const cId = await 내_id(C);

  // ── 코치 — 초대 코드 만들기 · 새로 만들기 확인
  await T.goto("/coaching");
  await expect(T.getByTestId("invite-card")).toBeVisible({ timeout: 20_000 });
  await T.getByTestId("invite-create").click();
  const codeEl = T.getByTestId("invite-code");
  await expect(codeEl).toBeVisible({ timeout: 20_000 });
  const code = (await codeEl.getAttribute("data-code")) ?? "";
  await T.getByTestId("invite-renew").click();
  await expect(T.getByTestId("invite-renew-confirm")).toBeVisible();
  await shot(T, "s.invrenew");
  await T.getByTestId("invite-renew-confirm").getByTestId("dialog-cancel").click();

  // ── 회원 — 초대 링크로 연결
  await M.goto(`/coaching/join?code=${code}`);
  await expect(M.getByTestId("join-ready")).toBeVisible({ timeout: 20_000 });
  const sheet = M.getByTestId("coaching-scope-sheet");
  await expect(sheet).toBeVisible({ timeout: 20_000 }); // 처음 한 번은 저절로 열린다
  await M.getByTestId("scope-cancel").click();
  await expect(sheet).toHaveCount(0);
  await shot(M, "/coaching/join");
  await M.getByTestId("join-open").click();
  await M.getByTestId("scope-confirm").click();
  await expect(M).toHaveURL(/\/coaching$/, { timeout: 20_000 });

  // ── 사람 프로필 — 코칭 요청(범위 시트 · 요청 모드) · 코칭 초대 확인
  await C.goto(`/u/${tId}`);
  await C.getByTestId("profile-coaching-request").click({ timeout: 20_000 });
  await expect(C.getByTestId("coaching-scope-sheet")).toBeVisible();
  await C.getByTestId("scope-note").fill("주 3회 · 벤치 100kg 목표");
  await shot(C, "s.cscope");
  await C.getByTestId("scope-cancel").click();
  await T.goto(`/u/${cId}`);
  await T.getByTestId("profile-coaching-invite").click({ timeout: 20_000 });
  await expect(T.getByTestId("profile-invite-confirm")).toBeVisible();
  await shot(T, "s.cinvite");
  await T.getByTestId("profile-invite-confirm").getByTestId("dialog-cancel").click();

  // ── 코치 — 회원 화면 루틴 탭 → 새 루틴 짜 주기(초안 편집기) → 보내기
  const 이름 = `상체 기본 ${tag}`;
  await T.goto(`/coaching/m/${mId}?tab=routines`);
  await expect(T.getByTestId("sent-routines")).toBeVisible({ timeout: 20_000 });
  await T.getByTestId("btn-new-coach-routine").click();
  await expect(T.getByTestId("coach-draft-band")).toBeVisible({ timeout: 20_000 });
  await T.getByTestId("routine-name").fill(이름);
  await T.getByTestId("routine-name").blur();
  await T.getByTestId("routine-notes").fill("내릴 때 3초 · 마지막 세트는 한계 1~2회 전");
  await T.getByTestId("routine-notes").blur();
  const rows = T.getByTestId("routine-exercises").locator("> div");
  for (const [i, 종목] of ["바벨 벤치프레스", "바벨 로우"].entries()) {
    await T.getByTestId("btn-add-routine-exercise").click();
    await T.getByTestId("picker-search").fill(종목);
    await T.getByTestId("picker-list").locator("button").first().click();
    await T.getByTestId("picker-confirm").click();
    await expect(rows).toHaveCount(i + 1, { timeout: 10_000 });
  }
  await T.evaluate(() => window.scrollTo(0, 0));
  await shot(T, "s.cdraft");
  const sent = T.waitForResponse(`**${RPC}/SendRoutine`);
  await T.getByTestId("btn-draft-send").click();
  expect((await sent).ok()).toBe(true);
  await expect(T).toHaveURL(new RegExp(`/coaching/m/${mId}\\?tab=routines$`), { timeout: 20_000 });
  await expect(T.getByTestId("sent-row").first()).toBeVisible({ timeout: 20_000 });
  await T.evaluate(() => window.scrollTo(0, 0));
  await shot(T, "s.sent");

  // ── 회원 — 받은 코치 루틴 보기 화면 · 내 루틴으로 복사 · 그 루틴으로 운동
  await 동기(M);
  await M.goto("/");
  let rid = "";
  await expect
    .poll(
      async () => {
        const tids = await M.getByTestId("routine-list")
          .locator("[data-testid^=routine-coach-]")
          .filter({ hasText: 이름 })
          .evaluateAll((els) => els.map((e) => e.getAttribute("data-testid") ?? ""));
        rid = (tids[0] ?? "").replace("routine-", "");
        return rid;
      },
      { timeout: 30_000 },
    )
    .not.toBe("");
  const row = M.getByTestId(`routine-${rid}`);
  await row.getByTestId("btn-routine-actions").click();
  await M.getByTestId("routine-actions").getByText("보기", { exact: true }).click();
  await expect(M.getByTestId("coach-routine-view")).toBeVisible({ timeout: 20_000 });
  await shot(M, "s.coachroutine");
  await M.goto("/");
  await M.getByTestId(`routine-${rid}`).getByTestId("btn-routine-actions").click();
  await M.getByTestId("btn-routine-copy-mine").click();
  await M.waitForTimeout(1500);
  await M.goto("/");
  await M.getByTestId(`routine-${rid}`).getByTestId("btn-start-routine").click();
  await expect(M).toHaveURL(/\/workout/, { timeout: 20_000 });
  await expect(M.getByTestId("set-list").first()).toBeVisible({ timeout: 20_000 });
  await 세트_기록(M, 0, 0, 60, 8);
  await 세트_기록(M, 0, 1, 60, 7);
  await 마치기(M);
  await 동기(M);

  // ── 코치 — /coaching(점검 숫자) · ⋯ 시트 · 끊기 확인 · 이력 · 기록 요약 · 루틴 처방
  await T.goto("/coaching");
  const mrow = T.getByTestId("coaching-members").getByTestId("coaching-grant").filter({ hasText: mn });
  await expect(mrow.getByTestId("coaching-digest")).toHaveAttribute("data-week", "1", { timeout: 30_000 });
  await shot(T, "/coaching");
  await 줄_메뉴(T, mn);
  await shot(T, "s.cgrant");
  await T.getByTestId("coaching-revoke").click();
  await expect(T.getByTestId("coaching-revoke-confirm")).toBeVisible();
  await shot(T, "s.crevoke");
  await T.getByTestId("coaching-revoke-confirm").getByTestId("dialog-cancel").click();
  await 줄_메뉴(T, mn);
  await T.getByTestId("coaching-history-link").click();
  await expect(T.getByTestId("coaching-history")).toBeVisible({ timeout: 20_000 });
  await shot(T, "s.chist");
  await 줄_메뉴(T, mn);
  await T.getByTestId("coaching-report").click();
  await expect(T.getByTestId("coaching-report-view")).toBeVisible({ timeout: 20_000 });
  await T.waitForTimeout(1500);
  await shot(T, "s.mreport");
  await 줄_메뉴(T, mn);
  await T.getByTestId("coaching-routines").click();
  await expect(T.getByTestId("coaching-routines-view")).toBeVisible({ timeout: 20_000 });
  await T.waitForTimeout(1500);
  await shot(T, "s.mrx");
  const ex = T.getByTestId("coaching-routines-view").getByTestId("member-exercise").first();
  if (await ex.isVisible().catch(() => false)) {
    await ex.click();
    await expect(T.getByTestId("rx-editor")).toBeVisible({ timeout: 20_000 });
    await shot(T, "s.rxed");
  }

  // ── 코치 — 홈 「담당 회원」 카드
  await T.goto("/");
  const card = T.getByTestId("home-members-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.scrollIntoViewIfNeeded();
  await T.evaluate(() => window.scrollBy(0, 200));
  await shot(T, "s.homemembers");

  // ── 코치 — 회원 화면 기록 탭 · 펼쳐서 처방 대 실제 · 코멘트 남기기
  await T.goto(`/coaching/m/${mId}`);
  const w = T.getByTestId("member-workout").first();
  await expect(w).toBeVisible({ timeout: 20_000 });
  await shot(T, "/coaching/m/[memberId]");
  const workoutId = (await w.getAttribute("data-id")) ?? "";
  await w.getByTestId("member-workout-toggle").click();
  await expect(w.getByTestId("plan-actual")).toBeVisible({ timeout: 20_000 });
  const box = w.getByTestId("coach-comments");
  await box.getByTestId("coach-comment-input").fill("벤치 두 세트 좋아요. 다음엔 세 세트 다 해 봐요");
  const added = T.waitForResponse(`**${RPC}/AddCoachComment`);
  await box.getByTestId("coach-comment-send").click();
  expect((await added).ok()).toBe(true);
  await expect(box.getByTestId("coach-comment")).toHaveCount(1);
  await w.getByTestId("plan-actual").scrollIntoViewIfNeeded();
  await T.evaluate(() => window.scrollBy(0, -120));
  await shot(T, "s.planactual");

  // ── 회원 — 기록 상세 코치 코멘트(알림이 여는 주소)
  await M.goto(`/history/${encodeURIComponent(workoutId)}?comments=1`);
  const mine = M.getByTestId("member-coach-comments");
  await expect(mine.getByTestId("coach-comment-body")).toBeVisible({ timeout: 20_000 });
  await mine.scrollIntoViewIfNeeded();
  await shot(M, "s.ccomment");

  // ── ⏱ 휴식 시트 — 탑·백오프 블록(세트 방식별 줄)
  await 빠른_운동_시작(C);
  await 종목_추가(C, "바벨 벤치프레스");
  const blk = C.getByTestId("workout-exercises").locator("> div").first();
  await blk.getByTestId("btn-we-menu").click();
  await C.getByTestId("btn-change-scheme").click();
  await C.getByTestId("we-scheme-topBackoff").click();
  const ask = C.getByTestId("confirm-change-scheme").getByTestId("dialog-confirm");
  const done = blk.locator('[data-testid="we-scheme"][data-scheme="topBackoff"]');
  await expect(ask.or(done)).toBeVisible({ timeout: 15_000 });
  if (await ask.isVisible().catch(() => false)) await ask.click();
  await expect(done).toBeVisible({ timeout: 15_000 });
  await blk.getByTestId("btn-rest-setting").click();
  const rs = C.getByTestId("rest-sheet");
  await expect(rs.getByTestId("rest-kinds")).toBeVisible();
  await rs.getByTestId("rest-kind-beforeTop-plus").click();
  await rs.getByTestId("rest-kind-beforeTop-plus").click();
  await expect(rs.getByTestId("rest-kind-reset")).toBeVisible();
  await shot(C, "s.resttime");
});
