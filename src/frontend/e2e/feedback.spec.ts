// 개발 피드백 탭 e2e
//
// 확인하는 것:
//   · **문이 세 갈래로 갈린다** — 확인 중 / 로그인 필요 / 권한 없음. 뭉뚱그리면 로그인만 하면 될
//     사람이 포기한다
//   · 평범한 사용자에게는 탭 자체가 안 보인다(숨기는 것은 안내일 뿐, 막는 것은 서버다)
//   · 내부 사람은 적어서 올리면 목록에 그대로 나온다
//
// 마지막 흐름은 **역할이 필요**하다. 역할은 화면에서 줄 수 없어(관리자·DB가 준다)
// `FEEDBACK_EMAIL`이 있을 때만 돈다. 없으면 건너뛴다 — 못 도는 검사를 실패로 남기면 진짜 실패가 묻힌다.
//   FEEDBACK_EMAIL=<coworker 계정> bunx playwright test e2e/feedback.spec.ts
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

function freshEmail(tag: string): string {
  return `e2e-fb-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function 가입(page: Page, email: string, name: string) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill(name);
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

test("로그인하지 않았으면 로그인하라고 한다", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("liftgram.session"));

  await page.goto("/feedback");
  await expect(page.getByTestId("feedback-gate")).toBeVisible({ timeout: 20_000 });
  // "권한 없음"이 아니라 **로그인** 안내여야 한다.
  await expect(page.getByTestId("feedback-gate")).toContainText("로그인이 필요해요");
  await expect(page.getByTestId("feedback-body")).toHaveCount(0);
});

test("평범한 사용자에게는 권한이 없다고 하고 탭도 감춘다", async ({ page }) => {
  await 가입(page, freshEmail("plain"), "평범한사람");

  // 탭 바에 피드백이 없다.
  await page.goto("/");
  await expect(page.getByTestId("nav-feedback")).toHaveCount(0);

  // 주소를 직접 쳐도 들어가지 못한다.
  await page.goto("/feedback");
  await expect(page.getByTestId("feedback-gate")).toContainText("접근 권한이 없어요", { timeout: 20_000 });
  await expect(page.getByTestId("feedback-body")).toHaveCount(0);
});

test("내부 사람은 적어 올리고 목록에서 확인한다", async ({ page }) => {
  const 메일 = process.env.FEEDBACK_EMAIL ?? "";
  test.skip(!메일, "FEEDBACK_EMAIL이 없다 — coworker/admin 역할이 있는 계정이 필요하다");
  test.setTimeout(120_000);

  await page.goto("/account");
  await page.getByTestId("mode-login").click();
  await page.getByTestId("auth-email-input").fill(메일);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });

  // 내부 사람에게는 탭이 보인다.
  await page.goto("/");
  await expect(page.getByTestId("nav-feedback")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("nav-feedback").click();
  await expect(page.getByTestId("feedback-body")).toBeVisible({ timeout: 20_000 });

  // 제목이 짧으면 올릴 수 없다.
  const 제목 = `버튼이 안 눌려요 ${Date.now()}`;
  await page.getByTestId("feedback-title").fill("가");
  await page.getByTestId("feedback-detail").fill("자세한 내용을 적었습니다.");
  await expect(page.getByTestId("feedback-submit")).toBeDisabled();

  await page.getByTestId("feedback-title").fill(제목);
  await expect(page.getByTestId("feedback-submit")).toBeEnabled();
  await page.getByTestId("feedback-submit").click();

  // 목록에 그대로 나온다 — 분류·상태 배지와 "내 제출" 표시까지.
  const 카드 = page.getByTestId("feedback-list").locator("..").getByText(제목);
  await expect(카드).toBeVisible({ timeout: 20_000 });
  const 목록 = page.getByTestId("feedback-list");
  await expect(목록).toContainText("버그·문제");
  await expect(목록).toContainText("내 제출");
  // 폼은 비워져 있다(같은 글을 두 번 올리지 않게).
  await expect(page.getByTestId("feedback-title")).toHaveValue("");

  // 분류를 개선으로 바꿔 올리면 그 표시로 뜬다.
  const 제목2 = `이런 기능이 있으면 좋겠어요 ${Date.now()}`;
  await page.getByTestId("feedback-cat-improvement").click();
  await expect(page.getByTestId("feedback-cat-improvement")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("feedback-title").fill(제목2);
  await page.getByTestId("feedback-detail").fill("이런 화면이 있으면 좋겠습니다.");
  await page.getByTestId("feedback-submit").click();
  await expect(목록).toContainText("개선 제안", { timeout: 20_000 });

  // 새로고침해도 남아 있다(우리 쪽이 아니라 보드에 저장됐다는 뜻).
  await page.reload();
  await expect(page.getByTestId("feedback-list")).toContainText(제목, { timeout: 20_000 });
});
