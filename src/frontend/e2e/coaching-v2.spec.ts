// 코칭 v2 연결 화면 e2e(SPEC-050 P1b) — 두 계정 이상이 한 흐름을 같이 탄다
//
//   · 코치가 초대 코드를 만들고 회원이 코드로 연결한다(범위 기본값 = 체중·지난 기록 꺼짐 · 서버에 저장된 값으로 다시 확인)
//   · 범위 바꾸기 · 이력 · 새 코드를 만들면 옛 코드는 못 쓴다
//   · 회원 요청 + 한 줄 메시지 → 코치 수락 · 알림 문구·갈 곳 · 대화방 「코칭 중」 · 둘째 코치 거절 문구 · 해지 확인창
//   · 프로필 코치 배지·소개·태그 · 「코칭 요청」/「코칭 초대」 · 「코칭 중」 · 로그인 전 초대 링크 → 로그인 뒤 이어서
//   · 360px 에서 초대 카드·GrantRow 넘침 없음 · 누르는 자리 44px · 빨강 채움은 상황별 하나
//
// 시작 값은 기본값과 다르게 둔다(범위 바꾸기는 꺼진 칸을 켠 뒤 다시 열어 본다) — 같은 값이면 저장이 안 돼도 통과한다.
import { expect, test } from "@playwright/test";
import { 가입, 새_기기, 새_메일 } from "./helpers/opengym";

type Page = import("@playwright/test").Page;

const RPC = "/api/coaching.v1.CoachingService";

async function 내_id(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const raw = localStorage.getItem("liftgram.me");
    return raw ? ((JSON.parse(raw) as { id?: string }).id ?? "") : "";
  });
  expect(id).not.toBe("");
  return id;
}

/** 코칭 의향을 켜고(서버 프로필에도) 소개·태그를 적는다. */
async function 코치되기(page: Page, opts: { bio?: string; tags?: string[] } = {}) {
  await page.goto("/profile");
  await page.getByTestId("btn-edit-experience").click();
  await expect(page.getByTestId("trainer-intent")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("trainer-intent").click();
  await expect(page.getByTestId("trainer-intent")).toHaveAttribute("aria-pressed", "true", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("coach-profile-fields")).toBeVisible({ timeout: 20_000 });
  if (opts.bio) {
    const saved = page.waitForResponse("**/auth.v1.AuthService/UpdateProfile");
    await page.getByTestId("coach-bio").fill(opts.bio);
    await page.getByTestId("coach-bio").press("Enter");
    expect((await saved).ok()).toBe(true);
  }
  for (const tag of opts.tags ?? []) {
    const saved = page.waitForResponse("**/auth.v1.AuthService/UpdateProfile");
    await page.getByTestId(`coach-tag-${tag}`).click();
    expect((await saved).ok()).toBe(true);
    await expect(page.getByTestId(`coach-tag-${tag}`)).toHaveAttribute("aria-pressed", "true");
  }
  await page.keyboard.press("Escape");
}

/** 코치의 /coaching 에서 코드를 만들고 8자 코드를 돌려준다. */
async function 코드_만들기(page: Page): Promise<string> {
  await page.goto("/coaching");
  await expect(page.getByTestId("invite-card")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("invite-create").click();
  const codeEl = page.getByTestId("invite-code");
  await expect(codeEl).toBeVisible({ timeout: 20_000 });
  const code = (await codeEl.getAttribute("data-code")) ?? "";
  expect(code).toMatch(/^[0-9A-Z]{8}$/);
  await expect(codeEl).toHaveText(`${code.slice(0, 4)}-${code.slice(4)}`);
  return code;
}

/** 스위치 넷의 켜짐 상태 */
async function 범위(page: Page): Promise<Record<string, string | null>> {
  const sheet = page.getByTestId("coaching-scope-sheet");
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  const out: Record<string, string | null> = {};
  for (const k of ["logView", "routineEdit", "bodyView", "pastRecords"]) {
    out[k] = await sheet.getByTestId(`scope-${k}`).getAttribute("aria-checked");
  }
  return out;
}

const 기본범위 = { logView: "true", routineEdit: "true", bodyView: "false", pastRecords: "false" };

async function 줄_메뉴(page: Page, section: "coaching-coaches" | "coaching-members", name: string) {
  await page
    .getByTestId(section)
    .getByTestId("coaching-grant")
    .filter({ hasText: name })
    .getByTestId("coaching-grant-more")
    .click();
  await expect(page.getByTestId("coaching-grant-sheet")).toBeVisible();
}

test("코치가 코드를 만들고 회원이 코드로 연결한다 — 범위 기본값·범위 바꾸기·이력·새 코드", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const tag = Date.now().toString(36);
  const 코치 = `코치v${tag}`;
  const 회원 = `회원v${tag}`;

  const [ctxT, pageT] = await 새_기기(browser);
  const [ctxM2, pageM2] = await 새_기기(browser);
  try {
    await 가입(pageT, 새_메일("cv2-t"), 코치);
    await 코치되기(pageT, { bio: "초보 근력 5년 · 주 3회 루틴", tags: ["strength", "beginner"] });
    const code = await 코드_만들기(pageT);
    await expect(pageT.getByTestId("invite-link")).toContainText(`/coaching/join?code=${code}`);
    await expect(pageT.getByTestId("invite-expires")).toContainText("까지");

    // 회원 — 소문자·하이픈으로 넣어도 서버가 정리한다
    await 가입(page, 새_메일("cv2-m"), 회원);
    await page.goto("/coaching");
    // 회원(코치 아님)에게는 초대 카드가 없다
    await expect(page.getByTestId("coaching-code-input")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("invite-card")).toHaveCount(0);
    await page
      .getByTestId("coaching-code-input")
      .fill(`${code.slice(0, 4).toLowerCase()}-${code.slice(4).toLowerCase()}`);
    await page.getByTestId("coaching-code-check").click();
    const card = page.getByTestId("scope-coach-card");
    await expect(card).toContainText(코치, { timeout: 20_000 });
    await expect(card.getByTestId("coach-card-badge")).toHaveText("코치");
    await expect(card.getByTestId("coach-card-bio")).toHaveText("초보 근력 5년 · 주 3회 루틴");
    await expect(card.getByTestId("coach-card-tags")).toContainText("근력");
    await expect(card.getByTestId("coach-card-tags")).toContainText("입문");
    expect(await 범위(page)).toEqual(기본범위);
    await expect(page.getByTestId("scope-note")).toHaveCount(0); // 메시지 칸은 요청 때만
    await page.getByTestId("scope-confirm").click();
    const row = page.getByTestId("coaching-coaches").getByTestId("coaching-grant");
    await expect(row).toContainText("코칭 중", { timeout: 20_000 });
    await expect(row.getByTestId("coaching-coach-badge")).toHaveText("코치");

    // 서버에 저장된 범위 = 기본값(다시 열면 저장값으로 시작한다)
    await 줄_메뉴(page, "coaching-coaches", 코치);
    await page.getByTestId("coaching-scope").click();
    expect(await 범위(page)).toEqual(기본범위);
    // 범위 바꾸기 — 체중·인바디 켬 · 루틴 끔(기본값과 다른 값으로)
    await page.getByTestId("scope-bodyView").click();
    await page.getByTestId("scope-routineEdit").click();
    const upd = page.waitForResponse(`**${RPC}/UpdateScope`);
    await page.getByTestId("scope-confirm").click();
    expect((await upd).ok()).toBe(true);
    await expect(page.getByTestId("coaching-scope-sheet")).toHaveCount(0);
    await page.reload();
    await 줄_메뉴(page, "coaching-coaches", 코치);
    await page.getByTestId("coaching-scope").click();
    expect(await 범위(page)).toEqual({ ...기본범위, bodyView: "true", routineEdit: "false" });
    await page.getByTestId("scope-cancel").click();

    // 이력 — 코드 연결·범위 바꿈이 남는다
    await 줄_메뉴(page, "coaching-coaches", 코치);
    await page.getByTestId("coaching-history-link").click();
    await expect(page.getByTestId("coaching-history")).toContainText("초대 코드로 연결", { timeout: 20_000 });
    await expect(page.getByTestId("coaching-history")).toContainText("범위 바꿈");
    await page.keyboard.press("Escape");

    // 코치 쪽 — 담당 회원 줄(활성 글자 청록) · 코드 카드는 그대로
    await pageT.goto("/coaching");
    const mrow = pageT
      .getByTestId("coaching-members")
      .getByTestId("coaching-grant")
      .filter({ hasText: 회원 });
    await expect(mrow).toContainText("코칭 중", { timeout: 20_000 });
    const statusColor = await mrow
      .getByTestId("coaching-status")
      .evaluate((el) => getComputedStyle(el).color);
    expect(statusColor).toBe("rgb(11, 107, 116)"); // --color-coaching-ink(라이트)

    // 새로 만들기(확인) → 옛 코드는 못 쓴다
    await pageT.getByTestId("invite-renew").click();
    await expect(pageT.getByTestId("invite-renew-confirm")).toContainText(
      "지금 코드와 링크는 더 쓸 수 없어요",
    );
    await pageT.getByTestId("invite-renew-confirm").getByTestId("dialog-confirm").click();
    await expect(pageT.getByTestId("invite-code")).not.toHaveAttribute("data-code", code, {
      timeout: 20_000,
    });

    await 가입(pageM2, 새_메일("cv2-m2"), `둘째${tag}`);
    await pageM2.goto("/coaching");
    await pageM2.getByTestId("coaching-code-input").fill(code);
    await pageM2.getByTestId("coaching-code-check").click();
    await expect(pageM2.getByTestId("coaching-code-error")).toHaveText(
      "초대 코드를 찾을 수 없어요. 코치에게 새 코드를 받아 주세요",
      { timeout: 20_000 },
    );
    await expect(pageM2.getByTestId("coaching-scope-sheet")).toHaveCount(0);
  } finally {
    await ctxT.close();
    await ctxM2.close();
  }
});

test("회원 요청 + 메시지 → 코치 수락 · 알림 · 대화방 배지 · 둘째 코치 거절 · 해지 확인창", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const tag = Date.now().toString(36);
  const 코치A = `코치A${tag}`;
  const 코치B = `코치B${tag}`;
  const 회원 = `회원r${tag}`;

  const [ctxA, pageA] = await 새_기기(browser);
  const [ctxB, pageB] = await 새_기기(browser);
  try {
    await 가입(pageA, 새_메일("cv2-a"), 코치A);
    await 코치되기(pageA);
    await 가입(pageB, 새_메일("cv2-b"), 코치B);
    await 코치되기(pageB);
    const codeB = await 코드_만들기(pageB);

    // 회원 — 트레이너 찾기 → 범위 시트(+한 줄) → 요청
    await 가입(page, 새_메일("cv2-r"), 회원);
    await page.goto("/coaching");
    await page.getByTestId("coaching-query").fill(코치A);
    await page.getByTestId("coaching-search").click();
    await expect(page.getByTestId("coaching-results")).toContainText(코치A, { timeout: 20_000 });
    await page.getByTestId("coaching-request").first().click();
    expect(await 범위(page)).toEqual(기본범위);
    await page.getByTestId("scope-pastRecords").click(); // 지난 기록도 보여 주기 켬
    await page.getByTestId("scope-note").fill("주 3회 · 벤치 100kg 목표");
    await page.getByTestId("scope-confirm").click();
    await expect(page.getByTestId("coaching-coaches")).toContainText("수락 대기", { timeout: 20_000 });
    await expect(page.getByTestId("coaching-accept")).toHaveCount(0); // 내가 보낸 요청은 내가 수락하지 않는다

    // 코치 A — 알림 문구·갈 곳 → 줄의 메시지 → 수락(코치는 범위를 묻지 않는다)
    await pageA.goto("/notifications");
    const req = pageA.getByTestId("notif-row").filter({ hasText: `${회원}님이 코칭을 요청했어요` });
    await expect(req).toBeVisible({ timeout: 20_000 });
    await expect(req).toHaveAttribute("href", "/coaching");
    await req.click();
    await expect(pageA).toHaveURL(/\/coaching$/, { timeout: 20_000 });
    const mrow = pageA
      .getByTestId("coaching-members")
      .getByTestId("coaching-grant")
      .filter({ hasText: 회원 });
    await expect(mrow.getByTestId("coaching-note")).toHaveText("「주 3회 · 벤치 100kg 목표」", {
      timeout: 20_000,
    });
    await mrow.getByTestId("coaching-accept").click();
    await expect(pageA.getByTestId("coaching-scope-sheet")).toHaveCount(0);
    await expect(mrow).toContainText("코칭 중", { timeout: 20_000 });

    // 회원 — 수락 알림 · 저장된 범위(지난 기록 켬 그대로)
    await page.goto("/notifications");
    const acc = page.getByTestId("notif-row").filter({ hasText: `${코치A}님과 코칭이 연결됐어요` });
    await expect(acc).toBeVisible({ timeout: 20_000 });
    await expect(acc).toHaveAttribute("href", "/coaching");
    await page.goto("/coaching");
    await 줄_메뉴(page, "coaching-coaches", 코치A);
    await page.getByTestId("coaching-scope").click();
    expect(await 범위(page)).toEqual({ ...기본범위, pastRecords: "true" });
    await page.getByTestId("scope-cancel").click();

    // 대화방 — 수락 뒤 1:1 이 생기고 머리에 「코칭 중」
    await page.goto("/messages");
    await page.getByTestId("dm-row").filter({ hasText: 코치A }).click({ timeout: 20_000 });
    await expect(page.getByTestId("conv-coaching-badge")).toHaveText("코칭 중", { timeout: 20_000 });

    // 둘째 코치 — 코드 입력도, 초대 링크도 범위 시트 전에 거절
    await page.goto("/coaching");
    await page.getByTestId("coaching-code-input").fill(codeB);
    await page.getByTestId("coaching-code-check").click();
    await expect(page.getByTestId("coaching-code-error")).toHaveText(
      "이미 코치가 있어요. 지금 연결을 끊은 뒤 다시 해 주세요",
      { timeout: 20_000 },
    );
    await expect(page.getByTestId("coaching-scope-sheet")).toHaveCount(0);
    await page.goto(`/coaching/join?code=${codeB}`);
    await expect(page.getByTestId("join-error")).toContainText("이미 코치가 있어요", { timeout: 20_000 });

    // 해지 — 확인창(취소하면 그대로) → 끊기
    await page.goto("/coaching");
    await 줄_메뉴(page, "coaching-coaches", 코치A);
    await page.getByTestId("coaching-revoke").click();
    const dlg = page.getByTestId("coaching-revoke-confirm");
    await expect(dlg).toContainText("연결을 끊을까요?");
    await expect(dlg).toContainText("코치가 더는 기록을 볼 수 없어요");
    await dlg.getByTestId("dialog-cancel").click();
    await expect(page.getByTestId("coaching-coaches")).toContainText("코칭 중");
    await 줄_메뉴(page, "coaching-coaches", 코치A);
    await page.getByTestId("coaching-revoke").click();
    await page.getByTestId("coaching-revoke-confirm").getByTestId("dialog-confirm").click();
    await expect(page.getByTestId("coaching-coaches")).toHaveCount(0, { timeout: 20_000 });

    await pageA.goto("/notifications");
    await expect(
      pageA.getByTestId("notif-row").filter({ hasText: `${회원}님이 코칭 연결을 끊었어요` }),
    ).toHaveAttribute("href", "/coaching", { timeout: 20_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});

test("프로필 — 코치 배지·소개·태그 · 코칭 요청·초대 · 로그인 전 초대 링크", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const tag = Date.now().toString(36);
  const 코치 = `코치p${tag}`;
  const 회원 = `회원p${tag}`;
  const 초대받는이 = `초대p${tag}`;

  const [ctxT, pageT] = await 새_기기(browser);
  const [ctxI, pageI] = await 새_기기(browser);
  const [ctxL, pageL] = await 새_기기(browser);
  try {
    await 가입(pageT, 새_메일("cv2-pt"), 코치);
    await 코치되기(pageT, { bio: "재활·입문 전문", tags: ["rehab", "beginner", "strength"] });
    // 태그는 3개까지 — 넷째는 고를 수 없다
    await pageT.goto("/profile");
    await pageT.getByTestId("btn-edit-experience").click();
    await expect(pageT.getByTestId("coach-tag-hypertrophy")).toBeDisabled({ timeout: 20_000 });
    await expect(pageT.getByTestId("coach-bio")).toHaveValue("재활·입문 전문");
    await pageT.keyboard.press("Escape");
    const 코치id = await 내_id(pageT);

    // 회원 — 코치 프로필: 배지·소개·태그 · 「코칭 요청」(보조 버튼) → 범위 시트 → 대기
    await 가입(page, 새_메일("cv2-pm"), 회원);
    await page.goto(`/u/${코치id}`);
    await expect(page.getByTestId("profile-coach-badge")).toHaveText("코치", { timeout: 20_000 });
    await expect(page.getByTestId("profile-coach-bio")).toHaveText("재활·입문 전문");
    await expect(page.getByTestId("profile-coach-tags")).toContainText("재활");
    await expect(page.getByTestId("profile-coach-tags")).toContainText("근력");
    const reqBtn = page.getByTestId("profile-coaching-request");
    await expect(reqBtn).toBeVisible();
    expect(await reqBtn.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgb(200, 56, 28)");
    await expect(page.getByTestId("profile-coaching-invite")).toHaveCount(0); // 나는 코치가 아니다
    await reqBtn.click();
    expect(await 범위(page)).toEqual(기본범위);
    await page.getByTestId("scope-confirm").click();
    await expect(page.getByTestId("profile-coaching-state")).toContainText("코칭 수락 대기", {
      timeout: 20_000,
    });

    // 코치 — 코치가 아닌 사람 프로필에 「코칭 초대」 → 받는 쪽이 범위를 골라 수락
    await 가입(pageI, 새_메일("cv2-pi"), 초대받는이);
    const 초대id = await 내_id(pageI);
    await pageT.goto(`/u/${초대id}`);
    await expect(pageT.getByTestId("profile-coach-badge")).toHaveCount(0);
    await pageT.getByTestId("profile-coaching-invite").click({ timeout: 20_000 });
    // 확인창 한 번 — 취소하면 아무것도 안 간다
    await pageT.getByTestId("profile-invite-confirm").getByTestId("dialog-cancel").click();
    await expect(pageT.getByTestId("profile-coaching-invite")).toBeVisible();
    await pageT.getByTestId("profile-coaching-invite").click();
    await pageT.getByTestId("profile-invite-confirm").getByTestId("dialog-confirm").click();
    await expect(pageT.getByTestId("profile-coaching-state")).toContainText("코칭 수락 대기", {
      timeout: 20_000,
    });

    await pageI.goto("/coaching");
    const crow = pageI
      .getByTestId("coaching-coaches")
      .getByTestId("coaching-grant")
      .filter({ hasText: 코치 });
    await crow.getByTestId("coaching-accept").click({ timeout: 20_000 });
    expect(await 범위(pageI)).toEqual(기본범위);
    await expect(pageI.getByTestId("scope-confirm")).toHaveText("수락하기");
    await pageI.getByTestId("scope-confirm").click();
    await expect(crow).toContainText("코칭 중", { timeout: 20_000 });
    await pageI.goto(`/u/${코치id}`);
    await expect(pageI.getByTestId("profile-coaching-active")).toHaveText("코칭 중", { timeout: 20_000 });

    // 로그인 전 초대 링크 → 로그인 화면 → 가입 뒤 같은 화면으로 이어서 연결
    const code = await 코드_만들기(pageT);
    await pageL.goto(`/coaching/join?code=${code}`);
    await pageL.getByTestId("join-login").click({ timeout: 20_000 });
    await expect(pageL).toHaveURL(/\/account\?next=/, { timeout: 20_000 });
    expect(await pageL.evaluate(() => sessionStorage.getItem("liftgram.coachingJoin"))).toBe(code);
    await pageL.getByTestId("mode-signup").click();
    await pageL.getByTestId("auth-email-input").fill(새_메일("cv2-pl"));
    await pageL.getByTestId("auth-password-input").fill("hunter22!");
    await pageL.getByTestId("auth-name-input").fill(`링크${tag}`);
    await pageL.getByTestId("age-confirm").check();
    await pageL.getByTestId("btn-auth-submit").click();
    await expect(pageL).toHaveURL(new RegExp(`/coaching/join\\?code=${code}$`), { timeout: 20_000 });
    await expect(pageL.getByTestId("scope-coach-card")).toContainText(코치, { timeout: 20_000 });
    await pageL.getByTestId("scope-confirm").click();
    await expect(pageL).toHaveURL(/\/coaching$/, { timeout: 20_000 });
    await expect(pageL.getByTestId("coaching-coaches")).toContainText("코칭 중", { timeout: 20_000 });
    expect(await pageL.evaluate(() => sessionStorage.getItem("liftgram.coachingJoin"))).toBeNull();
  } finally {
    await ctxT.close();
    await ctxI.close();
    await ctxL.close();
  }
});

test("360px — 초대 카드·GrantRow 넘침 없음 · 누르는 자리 44px · 빨강 채움은 하나", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const tag = Date.now().toString(36);
  // 긴 이름 — 줄이 밀리는지 본다
  const 코치 = `아주긴이름의코치님입니다${tag}`;
  const 회원 = `아주긴이름의회원님입니다${tag}`;

  const [ctxM, pageM] = await 새_기기(browser);
  try {
    await 가입(page, 새_메일("cv2-wt"), 코치);
    await 코치되기(page);
    await 코드_만들기(page);
    const 코치id = await 내_id(page);

    await 가입(pageM, 새_메일("cv2-wm"), 회원);
    await pageM.goto(`/u/${코치id}`);
    await pageM.getByTestId("profile-coaching-request").click({ timeout: 20_000 });
    await pageM.getByTestId("scope-note").fill("가".repeat(100));
    await pageM.getByTestId("scope-confirm").click();
    await expect(pageM.getByTestId("profile-coaching-state")).toBeVisible({ timeout: 20_000 });

    for (const p of [page, pageM]) await p.setViewportSize({ width: 360, height: 780 });

    // 코치 화면 — 초대 카드 + 대기 중 회원 줄(수락 버튼 + ⋯ + 100자 메시지)
    await page.goto("/coaching");
    const mrow = page.getByTestId("coaching-members").getByTestId("coaching-grant").first();
    await expect(mrow.getByTestId("coaching-accept")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("invite-code")).toBeVisible();
    await 넘침_없음(page);
    for (const id of ["invite-copy", "invite-renew"])
      await 크기_44(page.getByTestId("invite-card").getByTestId(id));
    await 크기_44(mrow.getByTestId("coaching-accept"));
    await 크기_44(mrow.getByTestId("coaching-grant-more"));
    for (const id of ["invite-card", "coaching-grant"]) {
      const box = await page.getByTestId(id).first().boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= 360).toBe(true);
    }
    // 빨강 채움(--color-brand 바탕)은 화면에 하나 이하 — 수락은 옅은 판(tonal)
    expect(await 빨강_채움(page)).toBeLessThanOrEqual(1);

    // 범위 시트 — 주 버튼 하나만 빨강 · 켜진 스위치는 청록 · 넘침 없음
    await mrow.getByTestId("coaching-accept").click();
    await expect(mrow).toContainText("코칭 중", { timeout: 20_000 });
    await pageM.goto("/coaching");
    await 줄_메뉴(pageM, "coaching-coaches", 코치);
    await pageM.getByTestId("coaching-scope").click();
    const sheet = pageM.getByTestId("coaching-scope-sheet");
    await expect(sheet).toBeVisible();
    await 넘침_없음(pageM);
    for (const k of ["logView", "routineEdit", "bodyView", "pastRecords"])
      await 크기_44(sheet.getByTestId(`scope-${k}`));
    await 크기_44(sheet.getByTestId("scope-confirm"));
    expect(await 빨강_채움(pageM, '[data-testid="coaching-scope-sheet"]')).toBe(1);
    const onTrack = await sheet
      .getByTestId("scope-logView")
      .locator("span[aria-hidden] > span")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(onTrack).toBe("rgb(14, 124, 134)"); // --color-coaching(라이트)
    await pageM.getByTestId("scope-cancel").click();
    // 회원 줄도 넘치지 않는다
    await 넘침_없음(pageM);
    await 크기_44(pageM.getByTestId("coaching-grant-more").first());
  } finally {
    await ctxM.close();
  }
});

test("엉터리·긴 코드는 「코드 없음」(서버에 묻지 않음) · 로그인 뒤 next 는 허용 목록만", async ({ page }) => {
  test.setTimeout(120_000);
  await 가입(page, 새_메일("cv2-bad"), `코드${Date.now().toString(36)}`);
  const asked: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes(`${RPC}/GetInvite`)) asked.push(r.url());
  });
  for (const bad of ["abc", "A".repeat(40), "ABCD-EFG!", "%20%20"]) {
    await page.goto(`/coaching/join?code=${bad}`);
    await expect(page.getByTestId("join-no-code")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("join-error")).toHaveCount(0);
  }
  expect(asked).toEqual([]);
  // 모양은 맞는 코드(소문자·하이픈·공백 정리) — 서버가 「없는 코드」로 거절한다
  await page.goto("/coaching/join?code=zz%20zz-zzzz");
  await expect(page.getByTestId("join-error")).toBeVisible({ timeout: 20_000 });
  expect(asked.length).toBe(1);
  // 「코칭 화면으로」는 버튼 하나(링크 속 버튼 아님)
  await expect(page.locator('a [data-testid="join-to-coaching"]')).toHaveCount(0);
  await page.getByTestId("join-to-coaching").click();
  await expect(page).toHaveURL(/\/coaching$/, { timeout: 20_000 });

  // 로그인된 채로 /account?next=… — 허용 목록 밖이면 그 자리에 머문다
  for (const next of [
    "//evil.example/x",
    "https://evil.example",
    "/coaching/join?code=ABCDEFGH//evil.example",
    "/coaching/join?code=ABCDEFGH&next=//evil.example",
    "/\\evil.example",
  ]) {
    await page.goto(`/account?next=${encodeURIComponent(next)}`);
    await page.waitForTimeout(1500);
    const u = new URL(page.url());
    expect(u.host).toBe(new URL(process.env.BASE ?? "http://127.0.0.1:3210").host);
    expect(u.pathname).toBe("/account");
  }
  // 대조군 — 허용된 join 주소는 따라간다(위 머무름이 「리다이렉트가 아예 안 됨」이 아님을 보인다)
  await page.goto(`/account?next=${encodeURIComponent("/coaching/join?code=ABCDEFGH")}`);
  await expect(page).toHaveURL(/\/coaching\/join\?code=ABCDEFGH$/, { timeout: 20_000 });
});

test("사람 화면 코치 배지 · 360px join·긴 이름 코치 프로필 넘침 없음 · 시트는 한 번만 저절로 · 이미 코치가 있으면 요청 막음", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const tag = Date.now().toString(36);
  const 코치 = `아주아주긴이름의코치선생님입니다${tag}`;
  const 둘째 = `둘째코치${tag}`;
  const [ctxT, pageT] = await 새_기기(browser);
  const [ctxS, pageS] = await 새_기기(browser);
  try {
    await 가입(pageT, 새_메일("cv2-bt"), 코치);
    await 코치되기(pageT, { tags: ["strength"] });
    const code = await 코드_만들기(pageT);
    const 코치id = await 내_id(pageT);
    await 가입(pageS, 새_메일("cv2-bs"), 둘째);
    await 코치되기(pageS);
    const 둘째id = await 내_id(pageS);

    await 가입(page, 새_메일("cv2-bm"), `회원b${tag}`);
    await page.setViewportSize({ width: 360, height: 780 });

    // 사람 화면 — 찾아서 팔로우 → 팔로잉 탭 줄에 코치 배지
    await page.goto("/people");
    await page.getByTestId("people-query").fill(코치);
    const 찾은줄 = page.getByTestId("people-row").filter({ hasText: 코치 });
    await expect(찾은줄.getByTestId("people-coach-badge")).toHaveText("코치", { timeout: 20_000 });
    await 찾은줄.getByTestId("people-follow").click();
    await expect(찾은줄.getByTestId("people-follow")).toHaveCount(0, { timeout: 20_000 });
    await page.getByTestId("people-query").fill("");
    await expect(page.getByTestId("people-tab-following")).toHaveAttribute("aria-selected", "true");
    const 줄 = page.getByTestId("people-row").filter({ hasText: 코치 });
    await expect(줄.getByTestId("people-coach-badge")).toBeVisible({ timeout: 20_000 });
    await 넘침_없음(page);
    {
      const b = await 줄.getByTestId("people-coach-badge").boundingBox();
      expect(b && b.x >= 0 && b.x + b.width <= 360).toBe(true);
    }

    // 긴 이름 + 코치 배지 프로필 줄
    await page.goto(`/u/${코치id}`);
    const badge = page.getByTestId("profile-coach-badge");
    await expect(badge).toBeVisible({ timeout: 20_000 });
    await 넘침_없음(page);
    {
      const b = await badge.boundingBox();
      expect(b && b.x >= 0 && b.x + b.width <= 360).toBe(true);
    }

    // join 화면 360px — 시트가 저절로 한 번 열린다 · 닫으면 다시 저절로 안 열린다
    await page.goto(`/coaching/join?code=${code.toLowerCase().slice(0, 4)}-${code.toLowerCase().slice(4)}`);
    await expect(page.getByTestId("coaching-scope-sheet")).toBeVisible({ timeout: 20_000 });
    await 넘침_없음(page);
    // 포커스는 시트 안으로(공용 Overlay) · 닫으면 밖으로
    expect(
      await page.evaluate(() => !!document.activeElement?.closest('[data-testid="coaching-scope-sheet"]')),
    ).toBe(true);
    await page.getByTestId("scope-cancel").click();
    await expect(page.getByTestId("join-ready")).toBeVisible();
    await 넘침_없음(page);
    await page.waitForTimeout(2000);
    await expect(page.getByTestId("coaching-scope-sheet")).toHaveCount(0);
    await page.getByTestId("join-open").click();
    await page.getByTestId("scope-confirm").click();
    await expect(page).toHaveURL(/\/coaching$/, { timeout: 20_000 });
    await expect(page.getByTestId("coaching-coaches")).toContainText("코칭 중", { timeout: 20_000 });

    // 이미 코치가 있다 — 둘째 코치 프로필에서는 「코칭 요청」 대신 안내(시트를 열지 않는다)
    await page.goto(`/u/${둘째id}`);
    await expect(page.getByTestId("profile-coaching-has-coach")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("profile-coaching-request")).toHaveCount(0);
    await 넘침_없음(page);
    // 지금 코치 프로필은 「코칭 중」
    await page.goto(`/u/${코치id}`);
    await expect(page.getByTestId("profile-coaching-active")).toBeVisible({ timeout: 20_000 });
    // 연결 목록 읽기 실패면 코칭 줄을 그리지 않는다
    await page.route(`**${RPC}/ListGrants`, (r) => r.fulfill({ status: 503, body: "" }));
    await page.goto(`/u/${둘째id}`);
    await expect(page.getByTestId("profile-coach-badge")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    for (const id of ["profile-coaching-request", "profile-coaching-has-coach", "profile-coaching-state"])
      await expect(page.getByTestId(id)).toHaveCount(0);
    await page.unroute(`**${RPC}/ListGrants`);
  } finally {
    await ctxT.close();
    await ctxS.close();
  }
});

test("초대 카드 — 읽는 동안 「코드 만들기」 깜빡임 없음(rAF) · 읽기 실패면 다시 불러오기 · 다크 청록 토큰", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await 가입(page, 새_메일("cv2-fl"), `깜빡${Date.now().toString(36)}`);
  await 코치되기(page);
  const code = await 코드_만들기(page);

  // 문서마다 프레임별로 초대 카드 상태를 적는다(바뀔 때만)
  await page.addInitScript(() => {
    const w = window as unknown as { __invite: string[] };
    w.__invite = [];
    const loop = () => {
      const card = document.querySelector('[data-testid="invite-card"]');
      if (card) {
        const st = card.querySelector('[data-testid="invite-code"]')
          ? "code"
          : card.querySelector('[data-testid="invite-create"]')
            ? "create"
            : card.querySelector('[data-testid="invite-error"]')
              ? "error"
              : card.querySelector('[data-testid="invite-loading"]')
                ? "loading"
                : "?";
        if (w.__invite[w.__invite.length - 1] !== st) w.__invite.push(st);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  // 늦은 응답 — 읽는 시간을 일부러 늘린다
  await page.route(`**${RPC}/GetMyInvite`, async (r) => {
    await new Promise((res) => setTimeout(res, 800));
    await r.continue();
  });
  await page.goto("/coaching");
  await expect(page.getByTestId("invite-code")).toHaveAttribute("data-code", code, { timeout: 20_000 });
  await page.waitForTimeout(800);
  const seen = await page.evaluate(() => (window as unknown as { __invite: string[] }).__invite);
  expect(seen).not.toContain("create");
  expect(seen).not.toContain("error");
  expect(seen[seen.length - 1]).toBe("code");
  await page.unroute(`**${RPC}/GetMyInvite`);

  // 읽기 실패 — 「코드 만들기」(옛 코드를 죽이는 길)가 아니라 다시 불러오기
  let fail = true;
  await page.route(`**${RPC}/GetMyInvite`, (r) =>
    fail ? r.fulfill({ status: 503, body: "" }) : r.continue(),
  );
  await page.goto("/coaching");
  await expect(page.getByTestId("invite-error")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("invite-create")).toHaveCount(0);
  await expect(page.getByTestId("invite-reload")).toHaveText(/다시 불러오기/);
  fail = false;
  await page.getByTestId("invite-reload").click();
  await expect(page.getByTestId("invite-code")).toHaveAttribute("data-code", code, { timeout: 20_000 });
  await page.unroute(`**${RPC}/GetMyInvite`);

  // 다크 — 청록 토큰이 다크 값으로 바뀐다(코드 글자 = coaching-ink)
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/coaching");
  await expect(page.getByTestId("invite-code")).toBeVisible({ timeout: 20_000 });
  const dark = await page.evaluate(() => {
    const probe = document.createElement("div");
    document.body.appendChild(probe);
    const read = (v: string) => {
      probe.style.backgroundColor = `var(${v})`;
      return getComputedStyle(probe).backgroundColor;
    };
    const out = {
      coaching: read("--color-coaching"),
      soft: read("--color-coaching-soft"),
      ink: read("--color-coaching-ink"),
      code: getComputedStyle(document.querySelector('[data-testid="invite-code"]') as HTMLElement).color,
    };
    probe.remove();
    return out;
  });
  expect(dark).toEqual({
    coaching: "rgb(76, 195, 204)",
    soft: "rgb(23, 51, 53)",
    ink: "rgb(127, 217, 223)",
    code: "rgb(127, 217, 223)",
  });
});

async function 넘침_없음(page: Page) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w).toBeLessThanOrEqual(360);
}

async function 크기_44(loc: import("@playwright/test").Locator) {
  const box = await loc.boundingBox();
  expect(box, "보이는 자리").not.toBeNull();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
}

/**
 * --color-brand 를 바탕(채움)으로 쓰는 보이는 **누르는 것**(버튼·링크) 수 — 글자색·테두리만 빨간 것은 세지 않는다(채움 규칙).
 * 아바타 이니셜 원(브랜드 판)은 누르는 것이 아니라 세지 않는다.
 */
async function 빨강_채움(page: Page, within = "body"): Promise<number> {
  const found = await 빨강_채움_목록(page, within);
  if (found.length > 1) console.log("빨강 채움:", found.join(" | "));
  return found.length;
}

async function 빨강_채움_목록(page: Page, within: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return ["(없음)", "(없음)"];
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--color-brand)";
    document.body.appendChild(probe);
    const brand = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const out: string[] = [];
    for (const el of Array.from(
      root.querySelectorAll<HTMLElement>("button, a, [role=button], [role=switch]"),
    )) {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue; // 점·작은 표식은 채움 버튼이 아니다
      if (getComputedStyle(el).backgroundColor === brand)
        out.push(`${el.tagName}#${el.dataset.testid ?? ""}.${el.className.toString().slice(0, 60)}`);
    }
    return out;
  }, within);
}
