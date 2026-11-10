// 화면 지도 보고서 캡처 — 16단계(11-10): 「트레이너」 역할 없애기(v0.91.0 · SPEC-052)
//   S-117 프로필 「운동 경력·코치 찾기 노출」 시트(기본 꺼짐) · S-54 온보딩 둘째 장(경력만) ·
//   S-186 /coaching/join(배지는 활성 회원이 있을 때) · S-20 사람 프로필 코칭 줄 두 버튼 · S-188 범위 시트 「코치로 요청」 ·
//   S-185 /people 코치 배지 · S-192 「○○님을 내 회원으로 초대할까요?」 · S-27 /coaching(코치가 아닌 계정 · 초대 카드 보조 버튼 · 코치 찾기) ·
//   S-193 홈 「담당 회원」 카드
// 실행: SHOTS=<폴더> BASE=… npx playwright test e2e/zz-screen-map16.spec.ts
import { expect, test, type Browser, type Page } from "@playwright/test";
import { 가입, 새_메일, 준비 } from "./helpers/opengym";

const OUT = process.env.SHOTS as string;
const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, locale: "ko-KR" });
async function shot(page: Page, name: string, full = false) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name.replace(/[^\w.-]/g, "_")}.jpg`, type: "jpeg", quality: 72, fullPage: full });
}
/** 같은 크기(390×844 · 1.5배)의 다른 기기 · seen=false 면 첫 실행 안내가 뜬다 */
async function 기기(browser: Browser, seen = true): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1.5,
    locale: "ko-KR",
    storageState: {
      cookies: [],
      origins: [
        {
          origin: BASE,
          localStorage: seen
            ? [
                { name: "onboarding_seen_v1", value: "yes" },
                { name: "liftgram.hint.suppressed", value: "e2e" },
              ]
            : [{ name: "liftgram.hint.suppressed", value: "e2e" }],
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
/** 코치 찾기 노출 켜기 + 소개·태그 */
async function 노출_켜기(page: Page, bio: string, tags: string[]) {
  await page.goto("/profile");
  await page.getByTestId("btn-edit-experience").click();
  await expect(page.getByTestId("trainer-intent")).toHaveAttribute("aria-pressed", "false", { timeout: 20_000 });
  await page.getByTestId("trainer-intent").click();
  await expect(page.getByTestId("trainer-intent")).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
  await expect(page.getByTestId("coach-profile-fields")).toBeVisible({ timeout: 20_000 });
  const saved = page.waitForResponse("**/auth.v1.AuthService/UpdateProfile");
  await page.getByTestId("coach-bio").fill(bio);
  await page.getByTestId("coach-bio").press("Enter");
  await saved;
  for (const tag of tags) {
    const w = page.waitForResponse("**/auth.v1.AuthService/UpdateProfile");
    await page.getByTestId(`coach-tag-${tag}`).click();
    await w;
  }
  await page.keyboard.press("Escape");
}

test("16단계", async ({ page, browser }) => {
  test.setTimeout(600_000);
  const tag = Date.now().toString(36).slice(-4);
  const tn = `박코치${tag}`, mn = `지은${tag}`, cn = `민수${tag}`;
  const T = page; // 코치가 될 사람(노출 켬)
  const M = await 기기(browser); // 초대 코드로 연결하는 회원
  const C = await 기기(browser); // 코칭을 안 하는 보통 사용자

  await 가입(T, 새_메일("sm16-t"), tn);
  await 노출_켜기(T, "생활체육지도사 · 초보 근력 운동 5년", ["strength", "beginner"]);
  await 준비(T);
  const tId = await 내_id(T);
  await 가입(M, 새_메일("sm16-m"), mn);
  await 준비(M);
  await 가입(C, 새_메일("sm16-c"), cn);
  await 준비(C);
  const cId = await 내_id(C);

  // ── S-117 프로필 「운동 경력·코치 찾기 노출」 — 보통 사용자(기본 꺼짐)
  await C.goto("/profile");
  await C.getByTestId("btn-edit-experience").click();
  await expect(C.getByTestId("trainer-intent")).toHaveAttribute("aria-pressed", "false", { timeout: 20_000 });
  await expect(C.getByTestId("trainer-intent-hint")).toBeVisible();
  await shot(C, "s.p.exp");
  await C.keyboard.press("Escape");

  // ── 코치 — 초대 코드 → 회원이 링크로 연결(이때부터 「코치」)
  await T.goto("/coaching");
  await expect(T.getByTestId("invite-card")).toBeVisible({ timeout: 20_000 });
  await T.getByTestId("invite-create").click();
  const codeEl = T.getByTestId("invite-code");
  await expect(codeEl).toBeVisible({ timeout: 20_000 });
  const code = (await codeEl.getAttribute("data-code")) ?? "";
  await M.goto(`/coaching/join?code=${code}`);
  await expect(M.getByTestId("join-ready")).toBeVisible({ timeout: 20_000 });
  await expect(M.getByTestId("coaching-scope-sheet")).toBeVisible({ timeout: 20_000 });
  await M.getByTestId("scope-confirm").click();
  await expect(M).toHaveURL(/\/coaching$/, { timeout: 20_000 });

  // ── S-186 초대 링크 — 이제 활성 회원이 있어 배지 · 노출을 켜 소개·태그(연결은 하지 않는다)
  await C.goto(`/coaching/join?code=${code}`);
  await expect(C.getByTestId("join-ready")).toBeVisible({ timeout: 20_000 });
  const sheet = C.getByTestId("coaching-scope-sheet");
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await C.getByTestId("scope-cancel").click();
  await expect(sheet).toHaveCount(0);
  await shot(C, "/coaching/join");

  // ── S-20 사람 프로필 — 코칭 줄 두 버튼 · S-188 「코치로 요청」 범위 시트
  await C.goto(`/u/${tId}`);
  await expect(C.getByTestId("profile-coaching-line")).toBeVisible({ timeout: 20_000 });
  await expect(C.getByTestId("profile-coach-badge")).toBeVisible();
  await shot(C, "/u/[userId]");
  await C.getByTestId("profile-coaching-request").click();
  await expect(C.getByTestId("coaching-scope-sheet")).toBeVisible();
  await C.getByTestId("scope-note").fill("주 3회 · 벤치 100kg 목표");
  await shot(C, "s.cscope");
  await C.getByTestId("scope-cancel").click();

  // ── S-185 사람 — 팔로우한 코치 줄에 배지
  await C.getByTestId("profile-follow").click();
  await C.waitForTimeout(1000);
  await C.goto("/people");
  const prow = C.getByTestId("people-row").filter({ hasText: tn }).first();
  await expect(prow.getByTestId("people-coach-badge")).toBeVisible({ timeout: 20_000 });
  await shot(C, "/people");

  // ── S-192 「○○님을 내 회원으로 초대할까요?」 — 코치가 보통 사용자에게
  await T.goto(`/u/${cId}`);
  await T.getByTestId("profile-coaching-invite").click({ timeout: 20_000 });
  await expect(T.getByTestId("profile-invite-confirm")).toBeVisible();
  await shot(T, "s.cinvite");
  await T.getByTestId("profile-invite-confirm").getByTestId("dialog-cancel").click();

  // ── S-27 /coaching — 코치가 아닌 계정 · 초대 카드(보조 버튼) · 코치 찾기 결과(배지 · 「코치로 요청」)
  await C.goto("/coaching");
  await expect(C.getByTestId("invite-card")).toBeVisible({ timeout: 20_000 });
  await C.getByTestId("coaching-query").fill(tn);
  await C.getByTestId("coaching-search").click();
  const res = C.getByTestId("coaching-results");
  await expect(res.getByTestId("coaching-result-coach-badge")).toBeVisible({ timeout: 20_000 });
  await res.scrollIntoViewIfNeeded();
  await C.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await shot(C, "/coaching");

  // ── S-193 홈 「담당 회원」 카드 — 코치로서 활성 연결이 있는 사람
  await T.goto("/");
  const card = T.getByTestId("home-members-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.scrollIntoViewIfNeeded();
  await T.evaluate(() => window.scrollBy(0, 200));
  await shot(T, "s.homemembers");

  // ── S-54 온보딩 둘째 장 — 운동 경력만(트레이너 질문 없음)
  const O = await 기기(browser, false);
  await O.goto("/");
  await expect(O.getByTestId("onboarding")).toBeVisible({ timeout: 20_000 });
  await O.getByTestId("onboarding-next").click();
  await expect(O.getByTestId("onboarding")).toContainText("운동 경력을 알려주세요");
  await expect(O.getByTestId("onboarding-intent")).toHaveCount(0);
  await shot(O, "s.onboard");
});
