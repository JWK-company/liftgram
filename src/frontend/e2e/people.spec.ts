// 사람 화면(SPEC-048 · S-18) — 피드 머리 👤 · 이름 찾기 · 팔로잉/팔로워 · 줄마다 「메시지」
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

function freshEmail(tag: string): string {
  return `e2e-people-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}
async function 가입(page: Page, email: string, name: string) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill(name);
  await page.getByTestId("age-confirm").check();
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}
async function 로그인(page: Page, email: string) {
  await page.goto("/account");
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}
async function 나가기(page: Page) {
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.removeItem("liftgram.session"));
}

test("로그인 전 /people — 로그인 안내", async ({ page }) => {
  await page.goto("/people");
  await expect(page.getByTestId("people-login")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("people-list")).toHaveCount(0);
});

test("360px 피드 머리 — 🔍·👤·💬·🔔 네 개가 제목과 한 줄 · 각 44px · 겹치지 않는다", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await 가입(page, freshEmail("head"), "머리");
  await page.goto("/feed");
  const ids = ["feed-explore", "feed-people", "feed-messages", "feed-notifications"];
  await expect(page.getByTestId("feed-people")).toBeVisible({ timeout: 20_000 });
  const title = await page.getByTestId("screen-title").boundingBox();
  const boxes = await Promise.all(ids.map((id) => page.getByTestId(id).boundingBox()));
  expect(title).toBeTruthy();
  let prevRight = (title?.x ?? 0) + (title?.width ?? 0);
  for (const b of boxes) {
    expect(b).toBeTruthy();
    if (!b || !title) continue;
    expect(Math.round(b.width)).toBe(44);
    expect(Math.round(b.height)).toBe(44);
    // 같은 줄(세로 가운데가 제목과 같은 높이) · 앞 요소와 겹치지 않음 · 화면 안
    expect(Math.abs(b.y + b.height / 2 - (title.y + title.height / 2))).toBeLessThanOrEqual(4);
    expect(b.x).toBeGreaterThanOrEqual(prevRight - 0.5);
    expect(b.x + b.width).toBeLessThanOrEqual(360);
    prevRight = b.x + b.width;
  }
  await page.getByTestId("feed-people").click();
  await expect(page).toHaveURL(/\/people$/);
  await expect(page.getByTestId("people-tab-following")).toHaveAttribute("aria-selected", "true");
});

test("찾기 → 팔로우 → 팔로잉 탭 · 「메시지」는 연타해도 같은 1:1 방 · 상대의 팔로워 탭에서 맞팔(주소에 탭 유지)", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 360, height: 740 });
  const 스타 = `스타${Date.now().toString(36)}`;
  const 스타메일 = freshEmail("star");
  await 가입(page, 스타메일, 스타);
  await 나가기(page);
  const 팬 = `팬${Date.now().toString(36)}`;
  await 가입(page, freshEmail("fan"), 팬);

  await page.goto("/people");
  // 아직 아무도 팔로우하지 않았다
  await expect(page.getByTestId("people-list")).toContainText("아직 팔로우한 사람이 없어요", {
    timeout: 20_000,
  });

  // 이름 찾기 — 탭은 숨고 결과 줄에 팔로우·메시지
  await page.getByTestId("people-query").fill(스타);
  await expect(page.getByTestId("people-tabs")).toHaveCount(0);
  const 줄 = page.getByTestId("people-row").filter({ hasText: 스타 });
  await expect(줄).toBeVisible({ timeout: 20_000 });
  // 360px — 팔로우·메시지가 함께 있어도 이름 칸이 남고(≥ 96px) 누르는 자리 44px
  {
    const [name, follow, msg] = await Promise.all(
      ["people-user", "people-follow", "people-message"].map((id) => 줄.getByTestId(id).boundingBox()),
    );
    expect(name && name.width >= 96).toBe(true);
    expect(follow && Math.round(follow.height) >= 44 && Math.round(follow.width) >= 44).toBe(true);
    expect(msg && Math.round(msg.height) >= 44).toBe(true);
    expect(msg && msg.x + msg.width <= 360).toBe(true);
  }
  await 줄.getByTestId("people-follow").click();
  await expect(줄.getByTestId("people-follow")).toHaveCount(0, { timeout: 20_000 });

  // 검색을 지우면 팔로잉 탭에 있다
  await page.getByTestId("people-query").fill("");
  await expect(page.getByTestId("people-row").filter({ hasText: 스타 })).toBeVisible({ timeout: 20_000 });

  // 「메시지」 연타 → 방 하나
  const 메시지 = page.getByTestId("people-row").filter({ hasText: 스타 }).getByTestId("people-message");
  await 메시지.dblclick();
  await expect(page.getByTestId("conv-input")).toBeVisible({ timeout: 20_000 });
  const 방 = page.url();
  await page.goto("/people");
  await page.getByTestId("people-row").filter({ hasText: 스타 }).getByTestId("people-message").click();
  await expect(page.getByTestId("conv-input")).toBeVisible({ timeout: 20_000 });
  expect(page.url()).toBe(방);
  await page.goto("/messages");
  await expect(page.getByTestId("dm-row")).toHaveCount(1, { timeout: 20_000 });

  // 스타로 — 팔로워 탭에 팬 · 맞팔하면 「팔로우」가 사라진다 · 새로고침해도 팔로워 탭
  await 나가기(page);
  await 로그인(page, 스타메일);
  await page.goto("/people");
  await page.getByTestId("people-tab-followers").click();
  await expect(page).toHaveURL(/\/people\?tab=followers$/);
  const 팬줄 = page.getByTestId("people-row").filter({ hasText: 팬 });
  await expect(팬줄).toBeVisible({ timeout: 20_000 });
  await 팬줄.getByTestId("people-follow").click();
  await expect(팬줄.getByTestId("people-follow")).toHaveCount(0, { timeout: 20_000 });
  await page.reload();
  await expect(page.getByTestId("people-tab-followers")).toHaveAttribute("aria-selected", "true", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("people-row").filter({ hasText: 팬 })).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByTestId("people-row").filter({ hasText: 팬 }).getByTestId("people-follow"),
  ).toHaveCount(0);
});
