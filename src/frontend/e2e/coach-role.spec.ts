// 코치 역할 없애기 e2e(SPEC-052) — 「트레이너」는 직업이 아니라 연결에서 생기는 자리다
//
//   · 코치 찾기 노출을 끈 사람(기본값)도 초대 코드를 만든다 → 다른 기기의 사람이 코드로 연결한다 →
//     그때부터 사람 찾기·프로필·연결 줄에 「코치」 배지(연결 전에는 없다) · 해지하면 다시 없다
//   · 코치가 홈에 머문 채(새로고침 없이) 회원이 연결돼도, 앱이 다시 보이면 홈 「담당 회원 1명」 카드가 나타난다
//   · 코칭을 안 하는 사용자가 홈을 열면 연결 목록·점검 요청이 0
//   · 코치 찾기 검색에는 노출을 켠 사람만
//   · 첫 실행 안내에 트레이너·코치 질문이 없고, 경력만 보낸다(켜 둔 노출 값은 그대로)
import { expect, test } from "@playwright/test";
import { 가입, 새_기기, 새_메일 } from "./helpers/opengym";

type Page = import("@playwright/test").Page;

const RPC = "/api/coaching.v1.CoachingService";

/** 앱이 백그라운드에 갔다가 다시 보인다(탭 전환·다른 앱 다녀오기). */
async function 다시_보이기(page: Page) {
  await page.evaluate(() => {
    const set = (v: string) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    set("hidden");
    set("visible");
  });
}

async function 노출_켜기(page: Page) {
  await page.goto("/profile");
  await page.getByTestId("btn-edit-experience").click();
  await expect(page.getByTestId("trainer-intent")).toHaveAttribute("aria-pressed", "false", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("trainer-intent")).toHaveText("코치 찾기에 나를 보여 주기");
  await page.getByTestId("trainer-intent").click();
  await expect(page.getByTestId("trainer-intent")).toHaveAttribute("aria-pressed", "true", {
    timeout: 20_000,
  });
  await page.keyboard.press("Escape");
}

test("노출을 끈 사람이 초대 코드 → 다른 기기에서 연결 → 그때 코치 배지 · 홈 카드는 새로고침 없이 · 해지하면 배지 없음", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  // 같은 순간에 도는 다른 시험(반복 실행)과 이름이 겹치지 않게 난수도 붙인다
  const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const 코치 = `연결코치${tag}`;
  const 회원 = `연결회원${tag}`;
  const 노출 = `노출코치${tag}`;
  const [ctxM, pageM] = await 새_기기(browser);
  const [ctxS, pageS] = await 새_기기(browser);
  try {
    // A — 아무것도 켜지 않은 보통 사용자(코치 찾기 노출 기본 꺼짐)
    await 가입(page, 새_메일("role-a"), 코치);
    await page.goto("/profile");
    await page.getByTestId("btn-edit-experience").click();
    await expect(page.getByTestId("trainer-intent")).toHaveAttribute("aria-pressed", "false", {
      timeout: 20_000,
    });
    await expect(page.getByTestId("coach-profile-fields")).toHaveCount(0); // 소개·태그는 켰을 때만
    await page.keyboard.press("Escape");
    const aId = await page.evaluate(() => {
      const raw = localStorage.getItem("liftgram.me");
      return raw ? ((JSON.parse(raw) as { id?: string }).id ?? "") : "";
    });
    expect(aId).not.toBe("");

    // A 의 /coaching — 노출을 꺼도 초대 코드를 만든다(코치가 아니라 보조 버튼)
    await page.goto("/coaching");
    const create = page.getByTestId("invite-create");
    await expect(create).toBeVisible({ timeout: 20_000 });
    // 빨강 채움 아님 — 강조색은 고정값이 아니라 토큰(--color-brand)을 계산해 비교한다(다크에서도 같은 판정)
    expect(
      await create.evaluate((el) => {
        const probe = document.createElement("div");
        probe.style.backgroundColor = "var(--color-brand)";
        document.body.appendChild(probe);
        const brand = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return getComputedStyle(el).backgroundColor === brand;
      }),
    ).toBe(false);
    await create.click();
    const codeEl = page.getByTestId("invite-code");
    await expect(codeEl).toBeVisible({ timeout: 20_000 });
    const code = (await codeEl.getAttribute("data-code")) ?? "";
    expect(code).toMatch(/^[0-9A-Z]{8}$/);

    // S — 코치 찾기 노출만 켠 사람(회원은 없다)
    await 가입(pageS, 새_메일("role-s"), 노출);
    await 노출_켜기(pageS);

    // B — 코치 찾기: 노출 켠 S 는 나오고 노출 끈 A 는 안 나온다 · 사람 찾기에는 A 가 나오지만 배지 없음
    await 가입(pageM, 새_메일("role-m"), 회원);
    await pageM.goto("/coaching");
    await pageM.getByTestId("coaching-query").fill(tag);
    await pageM.getByTestId("coaching-search").click();
    await expect(pageM.getByTestId("coaching-results")).toContainText(노출, { timeout: 20_000 });
    await expect(pageM.getByTestId("coaching-results")).not.toContainText(코치);
    await expect(pageM.getByTestId("coaching-result-coach-badge")).toHaveCount(0); // S 도 회원이 없다
    await pageM.goto("/people");
    await pageM.getByTestId("people-query").fill(코치);
    const 찾은줄 = pageM.getByTestId("people-row").filter({ hasText: 코치 });
    await expect(찾은줄).toHaveCount(1, { timeout: 20_000 });
    await expect(찾은줄.getByTestId("people-coach-badge")).toHaveCount(0);
    await pageM.goto(`/u/${aId}`);
    await expect(pageM.getByTestId("profile-coaching-invite")).toBeVisible({ timeout: 20_000 });
    await expect(pageM.getByTestId("profile-coach-badge")).toHaveCount(0);

    // A 는 홈에 머문다 — 코칭을 안 하는 동안 연결 목록·점검을 묻지 않는다
    let asked = 0;
    page.on("request", (r) => {
      if (r.url().includes(`${RPC}/ListGrants`) || r.url().includes(`${RPC}/ListMemberDigest`)) asked++;
    });
    await page.goto("/");
    await expect(page.getByTestId("btn-quick-start")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2_000);
    expect(asked).toBe(0);
    await expect(page.getByTestId("home-members-card")).toHaveCount(0);

    // B 가 코드로 연결 — 연결 전 코드 카드에도 배지 없음
    await pageM.goto("/coaching");
    await pageM.getByTestId("coaching-code-input").fill(code);
    await pageM.getByTestId("coaching-code-check").click();
    const card = pageM.getByTestId("scope-coach-card");
    await expect(card).toContainText(코치, { timeout: 20_000 });
    await expect(card.getByTestId("coach-card-badge")).toHaveCount(0);
    await pageM.getByTestId("scope-confirm").click();
    const row = pageM.getByTestId("coaching-coaches").getByTestId("coaching-grant").filter({ hasText: 코치 });
    await expect(row).toContainText("코칭 중", { timeout: 20_000 });
    // 연결 뒤 — 연결 줄·사람 찾기·프로필에 「코치」
    await expect(row.getByTestId("coaching-coach-badge")).toHaveText("코치");
    await pageM.goto("/people");
    await pageM.getByTestId("people-query").fill(코치);
    await expect(
      pageM.getByTestId("people-row").filter({ hasText: 코치 }).getByTestId("people-coach-badge"),
    ).toHaveText("코치", { timeout: 20_000 });
    await pageM.goto(`/u/${aId}`);
    await expect(pageM.getByTestId("profile-coach-badge")).toHaveText("코치", { timeout: 20_000 });

    // A — 새로고침 없이: 앱이 다시 보이면(계정을 30초에 한 번 다시 받는다) 홈 「담당 회원 1명」
    // 30초 안에 다시 보이면 Me 를 묻지 않는다(쓸데없는 요청 없음 · REV-106 U5)
    let me = 0;
    page.on("request", (r) => {
      if (r.url().includes("/auth.v1.AuthService/Me")) me++;
    });
    await 다시_보이기(page);
    await 다시_보이기(page);
    await page.waitForTimeout(1_000);
    expect(me).toBe(0);
    await expect(page.getByTestId("home-members-card")).toHaveCount(0);
    await page.waitForTimeout(30_000);
    await 다시_보이기(page);
    await expect(page.getByTestId("home-members-count")).toHaveText("담당 회원 1명", { timeout: 20_000 });
    expect(me).toBe(1);

    // B 가 끊으면 배지가 사라진다
    await pageM.goto("/coaching");
    await pageM
      .getByTestId("coaching-coaches")
      .getByTestId("coaching-grant")
      .filter({ hasText: 코치 })
      .getByTestId("coaching-grant-more")
      .click();
    await pageM.getByTestId("coaching-revoke").click();
    await pageM.getByTestId("coaching-revoke-confirm").getByTestId("dialog-confirm").click();
    await expect(
      pageM.getByTestId("coaching-coaches").getByTestId("coaching-grant").filter({ hasText: "코칭 중" }),
    ).toHaveCount(0, { timeout: 20_000 });
    await pageM.goto(`/u/${aId}`);
    await expect(pageM.getByTestId("profile-coaching-invite")).toBeVisible({ timeout: 20_000 });
    await expect(pageM.getByTestId("profile-coach-badge")).toHaveCount(0);
  } finally {
    await ctxM.close();
    await ctxS.close();
  }
});

// [원본] 첫 실행 안내(온보딩)로 경력을 보냈다 — SPEC-055 Phase 2 에서 온보딩을 없앴다
// test("첫 실행 안내에 트레이너 질문이 없고, 경력만 보낸다 — 켜 둔 코치 찾기 노출은 그대로", async ({
//   page,
// }) => {
//   test.setTimeout(120_000);
//   await 가입(page, 새_메일("role-onb"), `안내${Date.now().toString(36)}`);
//   await 노출_켜기(page);
//
//   await page.evaluate(() => localStorage.removeItem("onboarding_seen_v1"));
//   await page.reload();
//   await expect(page.getByTestId("onboarding")).toBeVisible({ timeout: 20_000 });
//   await page.getByTestId("onboarding-next").click();
//   await expect(page.getByTestId("onboarding")).toContainText("운동 경력을 알려주세요");
//   await expect(page.getByTestId("onboarding-intent")).toHaveCount(0);
//   await expect(page.getByTestId("onboarding")).not.toContainText("트레이너");
//   await expect(page.getByTestId("onboarding")).not.toContainText("회원을 구하고");
//   await page.getByTestId("onboarding-level-intermediate").click();
//   const sent = page.waitForRequest("**/auth.v1.AuthService/UpdateProfile");
//   await page.getByTestId("onboarding-done").click();
//   const body = (await sent).postData() ?? "";
//   expect(body).toContain("setExperienceLevel");
//   expect(body).not.toContain("TrainerIntent");
//   expect(body).not.toContain("trainerIntent");
//   await expect(page.getByTestId("onboarding")).toHaveCount(0);
//
//   await page.goto("/profile");
//   await page.getByTestId("btn-edit-experience").click();
//   await expect(page.getByTestId("level-intermediate")).toHaveAttribute("aria-pressed", "true", {
//     timeout: 20_000,
//   });
//   await expect(page.getByTestId("trainer-intent")).toHaveAttribute("aria-pressed", "true");
// });
// [개선] 온보딩이 뜨지 않는다 — 켜 둔 코치 찾기 노출은 그대로(경력은 프로필에서 고른다 · SPEC-055)
test("첫 실행 안내(온보딩)가 뜨지 않는다 — 켜 둔 코치 찾기 노출은 그대로", async ({ page }) => {
  test.setTimeout(120_000);
  await 가입(page, 새_메일("role-onb"), `안내${Date.now().toString(36)}`);
  await 노출_켜기(page);

  await page.evaluate(() => localStorage.removeItem("onboarding_seen_v1"));
  await page.reload();
  await page.waitForTimeout(1_500);
  await expect(page.getByTestId("onboarding")).toHaveCount(0);

  await page.goto("/profile");
  await page.getByTestId("btn-edit-experience").click();
  await expect(page.getByTestId("trainer-intent")).toHaveAttribute("aria-pressed", "true", {
    timeout: 20_000,
  });
});
