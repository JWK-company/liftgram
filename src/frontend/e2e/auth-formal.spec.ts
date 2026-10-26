// 정식 계정 e2e — 메일이 **실제로** 오가고, 소셜 로그인 왕복이 **실제 흐름**으로 도는가 (SRS-052)
//
// 메일: compose.dev.yaml 의 Mailpit(SMTP 1026 · API 8026)으로 실제 발송된 메일을 꺼내 링크를 연다.
// 소셜: backend 를 `-tags=oauthfake` 로 띄우면 가짜 제공자가 켜진다(프로덕션 바이너리에는 코드가 없다).
//       state 쿠키·PKCE·콜백·일회용 로그인 코드는 **진짜로** 돌고, 제공자와의 교환만 가짜다.
//       교환이 돌려줄 프로필은 OAUTH_FAKE_PROFILE_FILE 파일이다 — 테스트가 판정마다 바꿔 쓴다.
//
//   GOFLAGS=-tags=oauthfake OAUTH_FAKE_PROVIDERS=google,kakao OAUTH_FAKE_PROFILE_FILE=/tmp/p.json make dev
//   OAUTH_FAKE_PROFILE_FILE=/tmp/p.json bunx playwright test -c frontend/playwright.config.ts auth-formal
//
// 둘 중 하나가 없으면 그 테스트만 건너뛴다.
import { writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8026";
const FAKE_FILE = process.env.OAUTH_FAKE_PROFILE_FILE ?? "";
const PW = "hunter22!";

function freshEmail(tag: string): string {
  return `e2e-auth-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function mailpitUp(): Promise<boolean> {
  return fetch(`${MAILPIT}/api/v1/info`)
    .then((r) => r.ok)
    .catch(() => false);
}

/** 그 주소로 온 메일 중 제목에 subject 가 든 가장 최근 것의 링크(token= 포함)를 꺼낸다. */
async function 메일_링크(to: string, subject: string): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const list = (await res.json()) as { messages?: { ID: string; Subject: string }[] };
    const hit = list.messages?.find((m) => m.Subject.includes(subject));
    if (hit) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)).json()) as { Text: string };
      const m = /https?:\/\/\S+token=\S+/.exec(msg.Text);
      if (m) return m[0];
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${to} 에 "${subject}" 메일이 오지 않았다`);
}

/** 메일 링크의 경로만 이 테스트 서버로 연다(APP_URL 이 다를 수 있다). */
function 경로(link: string): string {
  const u = new URL(link);
  return u.pathname + u.search;
}

async function 가입(page: Page, email: string) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill(PW);
  await page.getByTestId("auth-name-input").fill("정식테스트");
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

async function 로그인_시도(page: Page, email: string, password: string) {
  await page.goto("/account");
  await page.getByTestId("mode-login").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill(password);
  await page.getByTestId("btn-auth-submit").click();
}

function 가짜_프로필(p: { id: string; email?: string; verified?: boolean; name?: string }) {
  writeFileSync(
    FAKE_FILE,
    JSON.stringify({
      ProviderUserID: p.id,
      Email: p.email ?? "",
      EmailVerified: p.verified ?? false,
      DisplayName: p.name ?? "",
    }),
  );
}

async function 가짜_제공자_있나(page: Page): Promise<boolean> {
  if (!FAKE_FILE) return false;
  await page.goto("/account");
  return page
    .getByTestId("btn-oauth-google")
    .waitFor({ timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
}

test("가입하면 확인 메일이 오고, 링크를 열면 확인된다(한 번만)", async ({ page }) => {
  test.skip(!(await mailpitUp()), "Mailpit 없음 — make infra-up");
  const email = freshEmail("verify");
  await 가입(page, email);
  await expect(page.getByTestId("verify-banner")).toBeVisible({ timeout: 20_000 });

  const link = await 메일_링크(email, "이메일 주소를 확인");
  await page.goto(경로(link));
  await expect(page.getByTestId("verify-done")).toBeVisible({ timeout: 20_000 });

  await page.goto("/account");
  await expect(page.getByTestId("email-verified")).toBeVisible({ timeout: 20_000 });

  // 같은 링크는 두 번 통하지 않는다.
  await page.goto(경로(link));
  await expect(page.getByTestId("verify-bad")).toBeVisible({ timeout: 20_000 });
});

test("비밀번호를 잊으면 메일로 재설정하고, 옛 비밀번호는 더 안 통한다", async ({ page }) => {
  test.skip(!(await mailpitUp()), "Mailpit 없음 — make infra-up");
  const email = freshEmail("reset");
  await 가입(page, email);
  await page.getByTestId("btn-logout").click();

  await page.goto("/forgot");
  await page.getByTestId("forgot-email").fill(email);
  await page.getByTestId("btn-forgot-submit").click();
  await expect(page.getByTestId("forgot-status")).toContainText("메일을 보냈어요", { timeout: 20_000 });

  const link = await 메일_링크(email, "비밀번호 재설정");
  await page.goto(경로(link));
  await page.getByTestId("reset-password").fill("brand-new-pw9");
  await page.getByTestId("btn-reset-submit").click();
  await expect(page.getByTestId("reset-done")).toBeVisible({ timeout: 20_000 });

  await 로그인_시도(page, email, PW);
  await expect(page.getByTestId("auth-error")).toBeVisible({ timeout: 20_000 });
  await 로그인_시도(page, email, "brand-new-pw9");
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
});

test("없는 주소로 비밀번호를 찾아도 같은 답을 한다", async ({ page }) => {
  await page.goto("/forgot");
  await page.getByTestId("forgot-email").fill(freshEmail("nobody"));
  await page.getByTestId("btn-forgot-submit").click();
  await expect(page.getByTestId("forgot-status")).toContainText("메일을 보냈어요", { timeout: 20_000 });
});

test("로그인한 상태에서 비밀번호를 바꾼다", async ({ page }) => {
  const email = freshEmail("change");
  await 가입(page, email);
  await page.getByTestId("pw-current").fill(PW);
  await page.getByTestId("pw-new").fill("changed-pw-77");
  await page.getByTestId("btn-pw-save").click();
  await expect(page.getByTestId("security-status")).toContainText("저장했어요", { timeout: 20_000 });

  await page.getByTestId("btn-logout").click();
  await 로그인_시도(page, email, "changed-pw-77");
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
});

test("구글로 처음 로그인하면 계정이 생기고, 다시 하면 같은 계정이다", async ({ page }) => {
  test.skip(!(await 가짜_제공자_있나(page)), "가짜 제공자 없음 — backend 를 -tags=oauthfake 로");
  const email = freshEmail("google");
  const id = `g-${Date.now()}`;
  가짜_프로필({ id, email, verified: true, name: "구글사람" });

  await page.getByTestId("btn-oauth-google").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/complete"), { timeout: 30_000 });
  await page.goto("/account");
  // 계정 카드는 표시 이름과 이메일을 함께 보여 준다(auth-email 칸은 이름이다).
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("main")).toContainText(email, { timeout: 20_000 });
  // 제공자가 보증한 주소라 이미 확인된 상태다 · 소셜 전용이라 "비밀번호 설정"이 보인다.
  await expect(page.getByTestId("email-verified")).toBeVisible();
  await expect(page.getByTestId("pw-current")).toHaveCount(0);
  await expect(page.getByTestId("identity-google")).toBeVisible();

  // 로그아웃 뒤 같은 구글 계정 — 제공자 쪽 주소가 바뀌어도 같은 계정이다(앵커 = 제공자 ID).
  await page.getByTestId("btn-logout").click();
  가짜_프로필({ id, email: freshEmail("changed"), verified: true });
  await page.getByTestId("btn-oauth-google").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/complete"), { timeout: 30_000 });
  await page.goto("/account");
  // 계정 카드는 표시 이름과 이메일을 함께 보여 준다(auth-email 칸은 이름이다).
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("main")).toContainText(email, { timeout: 20_000 });
});

test("이미 이메일로 가입한 주소의 구글 계정은 자동으로 합치지 않는다", async ({ page }) => {
  test.skip(!(await 가짜_제공자_있나(page)), "가짜 제공자 없음 — backend 를 -tags=oauthfake 로");
  const email = freshEmail("taken");
  await 가입(page, email);
  await page.getByTestId("btn-logout").click();

  가짜_프로필({ id: `g-${Date.now()}`, email, verified: true });
  await page.getByTestId("btn-oauth-google").click();
  await expect(page.getByTestId("oauth-error")).toContainText("이미 이 이메일로 가입된", { timeout: 30_000 });
});

test("로그인한 계정에 카카오를 연결하고, 그 카카오로 다시 들어온다", async ({ page }) => {
  test.skip(!(await 가짜_제공자_있나(page)), "가짜 제공자 없음 — backend 를 -tags=oauthfake 로");
  const email = freshEmail("link");
  await 가입(page, email);
  const kid = `k-${Date.now()}`;
  가짜_프로필({ id: kid, email: "", verified: false, name: "카카오사람" });

  await page.getByTestId("btn-link-kakao").click();
  await page.waitForURL((u) => u.pathname.startsWith("/account"), { timeout: 30_000 });
  await expect(page.getByTestId("identity-kakao")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("btn-logout").click();
  await page.getByTestId("btn-oauth-kakao").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth/complete"), { timeout: 30_000 });
  await page.goto("/account");
  // 계정 카드는 표시 이름과 이메일을 함께 보여 준다(auth-email 칸은 이름이다).
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("main")).toContainText(email, { timeout: 20_000 });
});
