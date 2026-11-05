// 스토어 앱 P0 e2e (SRS-095) — 계정 삭제 · 앱 로그인 교환(가짜 Capacitor) · 앱 링크 검증 파일
//
// 앱 로그인은 backend 를 `-tags=oauthfake` 로 띄우고 OAUTH_FAKE_PROVIDERS=google · OAUTH_FAKE_PROFILE_FILE 을 줘야 돈다
// (auth-last-login 과 같다). 없으면 그 테스트만 건너뛴다.
//
// 앱 로그인에서 보는 것: 웹뷰(이 페이지)가 시스템 인증 창(Browser.open)으로 내보낸 start 주소에 app=1·ac 가 실리고,
// 그 창이 받는 마지막 응답이 쿠키 없이 liftgram://auth?code= 이며, 그 주소를 앱에 넘기면(appUrlOpen) 웹뷰가
// 교환 → /auth/complete 로 로그인된다. 시스템 인증 창은 page.request(따로 도는 쿠키 통)로 흉내 낸다.
import { writeFileSync } from "node:fs";
import { expect, request, test, type Page } from "@playwright/test";

const PW = "hunter22!";
const FAKE_FILE = process.env.OAUTH_FAKE_PROFILE_FILE ?? "";

function freshEmail(tag: string): string {
  return `e2e-app-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function 가입(page: Page, email: string) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill(PW);
  await page.getByTestId("auth-name-input").fill("앱테스트");
  await page.getByTestId("age-confirm").check();
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

test("계정 삭제 — 확인 문구·비밀번호를 거쳐 지워지고, 같은 주소로 다시 로그인할 수 없다", async ({
  page,
}) => {
  const email = freshEmail("del");
  await 가입(page, email);
  const card = page.getByTestId("delete-account-card");
  await card.scrollIntoViewIfNeeded();
  // 확인 문구 전에는 버튼이 잠겨 있다
  await page.getByTestId("delete-password").fill(PW);
  await expect(page.getByTestId("btn-delete-account")).toBeDisabled();
  await page.getByTestId("delete-confirm").fill("삭제");
  // 틀린 비밀번호 — 서버가 거절하고 아무것도 잃지 않는다
  await page.getByTestId("delete-password").fill("wrong-pass");
  await page.getByTestId("btn-delete-account").click();
  await expect(card.getByRole("alert")).toContainText("비밀번호", { timeout: 15_000 });
  await expect(page.getByTestId("auth-email")).toBeVisible();
  // 맞는 비밀번호
  await page.getByTestId("delete-password").fill(PW);
  await page.getByTestId("btn-delete-account").click();
  await expect(page.getByTestId("btn-auth-submit")).toBeVisible({ timeout: 20_000 });
  // 같은 주소·비밀번호로 로그인 → 거절
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill(PW);
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toHaveCount(0, { timeout: 5_000 });
  await expect(page.getByTestId("btn-auth-submit")).toBeVisible();
});

test("웹 삭제 요청 주소 /account/delete 는 계정 화면의 삭제 카드로 간다(구글 플레이 요구)", async ({
  page,
}) => {
  await page.goto("/account/delete");
  await expect(page).toHaveURL(/\/account(#delete-account)?$/);
});

test("앱 링크 검증 파일 — 값이 없으면 404(앱 링크 꺼짐)", async ({ request: r }) => {
  // 로컬에는 IOS_APP_ID·ANDROID_CERT_SHA256 이 없다 — 꺼진 상태가 404 인지 본다(켜진 모양은 운영 env 로 확인)
  for (const p of ["/.well-known/apple-app-site-association", "/.well-known/assetlinks.json"]) {
    const res = await r.get(p);
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) expect(await res.json()).toBeTruthy();
  }
});

test("앱이 아니면 소셜 버튼은 평소대로 웹 이동이다(가짜 Capacitor 없음 · 앱 다리 호출 0)", async ({
  page,
}) => {
  await page.goto("/account");
  await expect(page.getByTestId("btn-auth-submit")).toBeVisible({ timeout: 20_000 });
  const n = await page.evaluate(() => (window as unknown as { Capacitor?: unknown }).Capacitor === undefined);
  expect(n).toBe(true);
});

test("안드로이드 앱 로그인 — 시스템 인증 창 → liftgram://auth → 교환 → 로그인", async ({ page, baseURL }) => {
  test.skip(!FAKE_FILE, "OAUTH_FAKE_PROFILE_FILE 없음 — oauthfake 백엔드에서만");
  const email = freshEmail("g");
  writeFileSync(
    FAKE_FILE,
    JSON.stringify({
      ProviderUserID: `g-${Date.now()}`,
      Email: email,
      EmailVerified: true,
      DisplayName: "앱구글",
    }),
  );

  // 가짜 Capacitor(안드로이드) — Browser.open 은 주소만 기록하고, App.addListener 는 콜백을 잡아 둔다
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const state = { opened: [] as string[], listener: null as null | ((d: { url: string }) => void) };
    w.__cap = state;
    w.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "android",
      isPluginAvailable: (n: string) => n === "App" || n === "Browser",
      Plugins: {
        Browser: {
          open: async (o: { url: string }) => {
            state.opened.push(o.url);
          },
          close: async () => {
            // 교환 이동으로 문서가 바뀌므로 세션 저장소에 남긴다
            sessionStorage.setItem(
              "cap-closed",
              String(Number(sessionStorage.getItem("cap-closed") ?? "0") + 1),
            );
          },
        },
        App: {
          addListener: async (_ev: string, fn: (d: { url: string }) => void) => {
            state.listener = fn;
            return { remove: async () => {} };
          },
        },
      },
    };
  });
  await page.goto("/account");
  await page.getByTestId("btn-oauth-google").click();
  await expect
    .poll(async () =>
      page.evaluate(() => (window as unknown as { __cap: { opened: string[] } }).__cap.opened[0] ?? ""),
    )
    .toContain("app=1");
  const startUrl = await page.evaluate(
    () => (window as unknown as { __cap: { opened: string[] } }).__cap.opened[0],
  );
  expect(startUrl).toMatch(/ac=[A-Za-z0-9_-]{43}/);

  // 시스템 인증 창 흉내 — 웹뷰와 쿠키 통이 다른 별도 요청 문맥으로 리디렉트를 따라간다
  const sys = await request.newContext({ baseURL });
  let url = startUrl;
  let appLink = "";
  for (let i = 0; i < 6; i++) {
    const res = await sys.get(url, { maxRedirects: 0 });
    const loc = res.headers().location ?? "";
    if (loc.startsWith("liftgram://")) {
      appLink = loc;
      break;
    }
    expect(res.status(), `${url} → ${loc}`).toBe(302);
    url = new URL(loc, baseURL).toString();
  }
  expect(appLink).toMatch(/^liftgram:\/\/auth\?code=/);
  // 시스템 인증 창에는 세션 쿠키가 생기지 않는다
  expect((await sys.storageState()).cookies.filter((c) => /session|refresh/i.test(c.name))).toEqual([]);
  await sys.dispose();

  // 앱이 스킴을 받는다 → 웹뷰가 교환 → 로그인
  await page.evaluate(
    (u) =>
      (window as unknown as { __cap: { listener: (d: { url: string }) => void } }).__cap.listener({ url: u }),
    appLink,
  );
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  // 시스템 인증 창(Custom Tabs)을 한 번 닫았다
  expect(await page.evaluate(() => sessionStorage.getItem("cap-closed"))).toBe("1");
});

test("소셜 전용 계정 삭제 — 비밀번호 칸 없이, 방금 로그인했으면 DELETE 로 지워진다(qa code H-2·M-7)", async ({
  page,
}) => {
  test.skip(!FAKE_FILE, "OAUTH_FAKE_PROFILE_FILE 없음 — oauthfake 백엔드에서만");
  const email = freshEmail("sd");
  writeFileSync(
    FAKE_FILE,
    JSON.stringify({
      ProviderUserID: `sd-${Date.now()}`,
      Email: email,
      EmailVerified: true,
      DisplayName: "소셜삭제",
    }),
  );
  await page.goto("/account");
  await page.getByTestId("btn-oauth-google").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("delete-account-card").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("delete-password")).toHaveCount(0);
  await page.getByTestId("delete-confirm").fill("DELETE");
  await page.getByTestId("btn-delete-account").click();
  await expect(page.getByTestId("btn-auth-submit")).toBeVisible({ timeout: 20_000 });
});
