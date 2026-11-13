// 피드 카드 「피드에 보이기」(사용자 지시 3294·3299) — 시험 DB 에서만 돈다.
//   E2E_PSQL_URL=postgres://app:app@127.0.0.1:55460/<e2e DB> BASE=http://127.0.0.1:3290 bunx playwright test e2e/feed-cards.spec.ts
//
// · 이달의 리프터·그룹 챌린지 카드의 X 가 같은 모양이다(아이콘·색·크기)
// · X → 카드가 숨고 「프로필 설정에서 다시 켤 수 있어요」+ 되돌리기 · 되돌리기 → 다시 보임
// · 다시 X → 새로고침해도 숨음 · 프로필 스위치로 다시 켬 → 피드에 다시 보임
// · 옛 「닫음」 표식(이 기능 전에 X 로 닫은 사람)은 처음 값 「꺼짐」으로 이어받는다
import { expect, type Page, test } from "@playwright/test";

const URL_ = process.env.E2E_PSQL_URL;
test.skip(!URL_, "E2E_PSQL_URL 이 없다 — 시험 DB 가 필요하다");
if (URL_) {
  const u = new URL(URL_);
  const base = process.env.BASE ?? "";
  if (
    !/^(127\.0\.0\.1|localhost)$/.test(u.hostname) ||
    u.port === "5434" ||
    !/e2e/.test(u.pathname) ||
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(base) ||
    /:3100\b/.test(base)
  ) {
    throw new Error("feed-cards e2e 는 로컬 시험 DB·시험 서버에서만 돈다(E2E_PSQL_URL · BASE 확인)");
  }
}
test.use({ viewport: { width: 390, height: 844 }, locale: "ko-KR" });

let seq = 0;
async function 가입(page: Page, tag: string) {
  seq += 1;
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(`e2e-fc-${tag}-${Date.now()}-${seq}@example.com`);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill("카드");
  await page.getByTestId("age-confirm").check();
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

async function 피드(page: Page) {
  await page.goto("/feed");
  await expect(page.getByTestId("nav-feed")).toBeVisible({ timeout: 20_000 });
}

/** X 버튼의 보이는 모양 — 버튼 크기 · 아이콘(svg) 크기·색·모양 */
async function x모양(page: Page, testId: string) {
  return page.getByTestId(testId).evaluate((el) => {
    const b = el.getBoundingClientRect();
    const svg = el.querySelector("svg");
    const s = svg?.getBoundingClientRect();
    const paths = svg
      ? [...svg.querySelectorAll("path,line,circle")].map((p) => p.outerHTML.replace(/\s+/g, " "))
      : [];
    const cs = svg ? getComputedStyle(svg) : null;
    return {
      w: Math.round(b.width),
      h: Math.round(b.height),
      iw: Math.round(s?.width ?? 0),
      ih: Math.round(s?.height ?? 0),
      color: cs?.color ?? "",
      fill: cs?.fill ?? "",
      stroke: cs?.stroke ?? "",
      shape: paths.join("|"),
    };
  });
}

test("두 카드 X 모양이 같다 · X → 숨김+되돌리기 · 새로고침해도 숨음 · 프로필 스위치로 다시 켬", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await 가입(page, "a");
  await 피드(page);
  const awards = page.getByTestId("awards-banner");
  const ch = page.getByTestId("challenge-feed-card");
  await expect(awards).toBeVisible({ timeout: 20_000 });
  await expect(ch).toBeVisible({ timeout: 20_000 });

  // 같은 X(사용자 지시 3299)
  const a = await x모양(page, "awards-banner-close");
  const c = await x모양(page, "challenge-feed-dismiss");
  expect(a.shape.length, "X 아이콘이 그려져 있다").toBeGreaterThan(0);
  expect(c).toEqual(a);

  // X → 숨고 안내 + 되돌리기
  await page.getByTestId("challenge-feed-dismiss").click();
  await expect(ch).toHaveCount(0);
  await expect(page.getByText("프로필 설정에서 다시 켤 수 있어요")).toBeVisible();
  // 초점이 사라지지 않고 되돌리기로 간다(리뷰 1)
  await expect(page.getByTestId("feed-card-undo-challenge")).toBeFocused();
  await page.getByTestId("feed-card-undo-challenge").click();
  await expect(ch).toBeVisible();

  // 다시 X → 새로고침해도 숨음(이달의 리프터는 그대로)
  await page.getByTestId("challenge-feed-dismiss").click();
  await expect(ch).toHaveCount(0);
  await page.getByTestId("awards-banner-close").click();
  await expect(awards).toHaveCount(0);
  await 피드(page);
  await page.waitForLoadState("networkidle");
  await expect(awards).toHaveCount(0);
  await expect(ch).toHaveCount(0);

  // 프로필 스위치 — 둘 다 꺼짐으로 보이고, 켜면 피드에 다시 나온다
  await page.goto("/profile");
  const swA = page.getByTestId("switch-feed-awards");
  const swC = page.getByTestId("switch-feed-challenge");
  await expect(swA).toHaveAttribute("aria-checked", "false", { timeout: 20_000 });
  await expect(swC).toHaveAttribute("aria-checked", "false");
  await swC.click();
  await expect(swC).toHaveAttribute("aria-checked", "true");
  await 피드(page);
  await expect(ch).toBeVisible({ timeout: 20_000 });
  await expect(awards).toHaveCount(0);
  await page.goto("/profile");
  await swA.click();
  await expect(swA).toHaveAttribute("aria-checked", "true");
  await 피드(page);
  await expect(awards).toBeVisible({ timeout: 20_000 });
});

test("옛 닫음 표식은 처음 값 「꺼짐」으로 이어받는다 · 다른 달 표식은 상관없다", async ({ page }) => {
  test.setTimeout(120_000);
  await 가입(page, "b");
  await page.evaluate(() => {
    const d = new Date(Date.now() + 9 * 3600_000);
    const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    localStorage.setItem("challenge-feed-intro-dismissed", "1");
    localStorage.setItem(`awards-banner-dismissed:${m}`, "1");
  });
  await 피드(page);
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("awards-banner")).toHaveCount(0);
  await expect(page.getByTestId("challenge-feed-card")).toHaveCount(0);
  await page.goto("/profile");
  await expect(page.getByTestId("switch-feed-awards")).toHaveAttribute("aria-checked", "false", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("switch-feed-challenge")).toHaveAttribute("aria-checked", "false");

  // 지난 달 표식만 있으면 켜짐(옛 규칙도 그 달만 숨겼다) — 「없음」이 그리기 전 거짓 통과가 아님을 함께 증명
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage))
      if (k.startsWith("awards-banner-dismissed:")) localStorage.removeItem(k);
    localStorage.setItem("awards-banner-dismissed:2000-01", "1");
  });
  await 피드(page);
  await expect(page.getByTestId("awards-banner")).toBeVisible({ timeout: 20_000 });
});
