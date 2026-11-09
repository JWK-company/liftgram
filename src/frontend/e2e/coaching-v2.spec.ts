// 코칭 v2 연결 화면 e2e(SPEC-050 P1b) — 두 계정 이상이 한 흐름을 같이 탄다
//
//   · 코치가 초대 코드를 만들고 회원이 코드로 연결한다(범위 기본값 = 체중·지난 기록 꺼짐 · 서버에 저장된 값으로 다시 확인)
//   · 범위 바꾸기 · 이력 · 새 코드를 만들면 옛 코드는 못 쓴다
//   · 회원 요청 + 한 줄 메시지 → 코치 수락 · 알림 문구·갈 곳 · 대화방 「코칭 중」 · 둘째 코치 거절 문구 · 해지 확인창
//   · 프로필 코치 배지·소개·태그 · 「코칭 요청」/「코칭 초대」 · 「코칭 중」 · 로그인 전 초대 링크 → 로그인 뒤 이어서
//   · 360px 에서 초대 카드·GrantRow 넘침 없음 · 누르는 자리 44px · 빨강 채움은 상황별 하나
//   · (P2) 회원 화면 /coaching/m/[id] — 띠·탭·기록 펼침·분석 기간·연결 전 기록 컷 안내·체중 카드는 bodyView 때만 ·
//     코치 로컬 DB 행 수 그대로 · 홈 「담당 회원」 카드 · 대화방 배지 → 회원 화면 · 기록 꺼짐 · 해지 뒤 · 360px·44px·다크
//   · (P3a) 서버의 코치 루틴(origin coach)이 동기로 오면 — 청록 띠·「코치 ○○」 칩·새로 받음 점(열면 사라짐) · 미리보기 「내 루틴으로 복사」 ·
//     ⋯ 「보기」 화면 잠금(이름·메모·종목 못 고침 · 폴더는 고침) · 복사본은 표시 없이 고칠 수 있음 · 운동 뒤 「루틴에 반영」 안 물음 ·
//     코칭 끝남(coach_ended)·가져옴(import)은 회색 칩·편집 가능 · 360px 넘침 없음
//
// 시작 값은 기본값과 다르게 둔다(범위 바꾸기는 꺼진 칸을 켠 뒤 다시 열어 본다) — 같은 값이면 저장이 안 돼도 통과한다.
import { expect, test } from "@playwright/test";
import {
  가입,
  내려쓰기_대기,
  동기,
  마치기,
  빈_문서,
  빠른_운동_시작,
  새_기기,
  새_메일,
  세트_기록,
  준비,
  종목_추가,
  idb_행_수,
  idb_행_고치기,
  로그인,
} from "./helpers/opengym";

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

// ── P2 회원 화면(SPEC-050 Phase 3) ─────────────────────────────────────────

/** 빠른 운동 하나 — 종목 하나·세트 하나를 끝내고 홈으로 */
async function 운동_하나(page: Page, 종목: string, kg: number, reps: number) {
  await 빠른_운동_시작(page);
  await 종목_추가(page, 종목);
  await 세트_기록(page, 0, 0, kg, reps);
  await 마치기(page);
}

/** 프로필 「기록」 → 직접 입력 → 저장(체중) */
async function 체중_입력(page: Page, value: string) {
  await page.goto("/profile");
  await page.getByTestId("btn-bodyweight-record").click({ timeout: 20_000 });
  const sheet = page.getByTestId("bodyweight-record-sheet");
  await sheet.getByTestId("weighin-type").click();
  await sheet.getByTestId("weighin-input").fill(value);
  await sheet.getByTestId("weighin-input").press("Enter");
  await sheet.getByTestId("weighin-save").click();
  await expect(sheet).toHaveCount(0);
}

/** 회원이 범위 스위치 하나를 뒤집고 저장 */
async function 범위_뒤집기(page: Page, 코치: string, key: string) {
  await page.goto("/coaching");
  await 줄_메뉴(page, "coaching-coaches", 코치);
  await page.getByTestId("coaching-scope").click();
  await page.getByTestId(`scope-${key}`).click();
  const upd = page.waitForResponse(`**${RPC}/UpdateScope`);
  await page.getByTestId("scope-confirm").click();
  expect((await upd).ok()).toBe(true);
  await expect(page.getByTestId("coaching-scope-sheet")).toHaveCount(0);
}

const 로컬_표 = ["workouts", "workout_exercises", "set_logs", "bodyweight_logs"];

async function 로컬_행(page: Page): Promise<Record<string, number>> {
  await 내려쓰기_대기(page);
  await 빈_문서(page);
  return idb_행_수(page, 로컬_표);
}

test.describe("P2 회원 화면", () => {
  test("띠·탭·기록 펼침·분석 기간·연결 전 기록 컷 · 체중은 bodyView 때만 · 로컬 DB 그대로 · 홈 카드 · 대화방 배지 · 기록 꺼짐 · 해지 뒤", async ({
    page,
    browser,
  }) => {
    test.setTimeout(600_000);
    const tag = Date.now().toString(36);
    const 코치 = `코치m${tag}`;
    const 회원 = `회원m${tag}`;
    const [ctxT, pageT] = await 새_기기(browser);
    try {
      // 회원 — 연결 **전** 운동(벤치) · 서버에 올린다
      await 준비(page);
      await 가입(page, 새_메일("cv2-p2m"), 회원);
      await 운동_하나(page, "바벨 벤치프레스", 60, 10);
      await 동기(page);
      const 회원id = await 내_id(page);

      // 코치 — 카탈로그·코드 · 코치 자신의 운동 하나(로컬 행 수가 0 에서 시작하지 않게)
      await 준비(pageT);
      const 코치메일 = 새_메일("cv2-p2t");
      await 가입(pageT, 코치메일, 코치);
      await 코치되기(pageT);
      const code = await 코드_만들기(pageT);
      await 운동_하나(pageT, "바벨 데드리프트", 100, 3);

      // 연결(기본 범위 — 체중·지난 기록 꺼짐)
      await page.goto("/coaching");
      await page.getByTestId("coaching-code-input").fill(code);
      await page.getByTestId("coaching-code-check").click();
      await page.getByTestId("scope-confirm").click({ timeout: 20_000 });
      await expect(page.getByTestId("coaching-coaches")).toContainText("코칭 중", { timeout: 20_000 });

      // 연결 **뒤** 운동(스쿼트) + 체중 · 올린다
      await 운동_하나(page, "바벨 스쿼트", 80, 5);
      await 체중_입력(page, "72.4");
      await 동기(page);

      // 코치 로컬 DB — 회원 화면 전
      const before = await 로컬_행(pageT);
      expect(before.workouts).toBeGreaterThanOrEqual(1);

      // 담당 회원 줄 → 회원 화면
      await pageT.setViewportSize({ width: 360, height: 780 });
      await pageT.goto("/coaching");
      const mrow = pageT
        .getByTestId("coaching-members")
        .getByTestId("coaching-grant")
        .filter({ hasText: 회원 });
      await expect(mrow).toContainText("코칭 중", { timeout: 20_000 });
      await 크기_44(mrow.getByTestId("coaching-member-open"));
      await mrow.getByTestId("coaching-member-open").click();
      await expect(pageT).toHaveURL(new RegExp(`/coaching/m/${회원id}$`), { timeout: 20_000 });
      await expect(pageT.getByTestId("member-band-title")).toHaveText(`${회원}님 기록 · 코칭 중`, {
        timeout: 20_000,
      });
      expect(
        await pageT.getByTestId("member-band").evaluate((el) => getComputedStyle(el).backgroundColor),
      ).toBe("rgb(227, 244, 245)"); // --color-coaching-soft(라이트)
      await expect(pageT.getByTestId("member-tab-records")).toHaveAttribute("aria-selected", "true");

      // 기록 탭 — 연결 뒤 스쿼트만 · 벤치는 컷 · 안내 문구 · 더 보기 없음
      const rows = pageT.getByTestId("member-workout");
      await expect(rows).toHaveCount(1, { timeout: 20_000 });
      await expect(rows.first().getByTestId("member-workout-title")).toContainText("스쿼트");
      await expect(pageT.getByTestId("member-records")).not.toContainText("벤치");
      await expect(rows.first().getByTestId("member-workout-meta")).toContainText("1세트");
      await expect(pageT.getByTestId("member-since")).toHaveText(
        /^연결한 날\(\d+월 \d+일\) 뒤 기록만 보여요$/,
      );
      await expect(pageT.getByTestId("member-more")).toHaveCount(0);
      const toggle = rows.first().getByTestId("member-workout-toggle");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(rows.first().getByTestId("member-set")).toHaveText(["1. 80kg × 5"]);
      await 넘침_없음(pageT);
      for (const id of ["member-exit", "member-tab-records", "member-tab-stats", "member-tab-routines"])
        await 크기_44(pageT.getByTestId(id));
      await 크기_44(toggle);
      expect(await 빨강_채움(pageT)).toBeLessThanOrEqual(1);

      // 탭 목록 — 고른 탭만 Tab 순서(roving) · ←/→ 로 옮긴다 · 패널은 고른 탭이 이름표(L-5)
      const tabRec = pageT.getByTestId("member-tab-records");
      const tabStats = pageT.getByTestId("member-tab-stats");
      await expect(tabRec).toHaveAttribute("tabindex", "0");
      await expect(tabStats).toHaveAttribute("tabindex", "-1");
      const panelId = await tabRec.getAttribute("aria-controls");
      expect(panelId).toBeTruthy();
      await expect(pageT.getByRole("tabpanel")).toHaveAttribute("id", panelId as string);
      await expect(pageT.getByRole("tabpanel")).toHaveAttribute(
        "aria-labelledby",
        (await tabRec.getAttribute("id")) as string,
      );
      await tabRec.focus();
      await pageT.keyboard.press("ArrowRight");
      await expect(tabStats).toHaveAttribute("aria-selected", "true");
      await expect(tabStats).toBeFocused();
      await pageT.keyboard.press("ArrowLeft");
      await expect(tabRec).toHaveAttribute("aria-selected", "true");
      await expect(tabRec).toBeFocused();
      await expect(rows).toHaveCount(1, { timeout: 20_000 });

      // 분석 탭 — 기본 4주 → 7일로 바꿈(다시 읽는다) · 체중 카드 없음(bodyView 꺼짐)
      await pageT.getByTestId("member-tab-stats").click();
      await expect(pageT).toHaveURL(/\?tab=stats$/);
      await expect(pageT.getByTestId("report-ready")).toBeVisible({ timeout: 20_000 });
      await expect(pageT.getByTestId("report-period-4w")).toHaveAttribute("aria-selected", "true");
      await expect(pageT.getByTestId("ps-workouts")).toHaveText("1회"); // 벤치(연결 전)는 세지 않는다
      const again = pageT.waitForResponse(`**${RPC}/GetMemberRecords`);
      await pageT.getByTestId("report-period-7d").click();
      expect((await again).ok()).toBe(true);
      await expect(pageT.getByTestId("report-period-7d")).toHaveAttribute("aria-selected", "true");
      await expect(pageT.getByTestId("report-ready")).toBeVisible({ timeout: 20_000 });
      await expect(pageT.getByTestId("ps-workouts")).toHaveText("1회");
      await expect(pageT.getByTestId("member-body-card")).toHaveCount(0);
      await 크기_44(pageT.getByTestId("report-period-3m"));
      await 넘침_없음(pageT);

      // 루틴 탭 — 회원 루틴 처방(빠른 운동만 했으니 빈 목록)
      await pageT.getByTestId("member-tab-routines").click();
      await expect(pageT).toHaveURL(/\?tab=routines$/);
      await expect(pageT.getByTestId("member-routines-empty")).toBeVisible({ timeout: 20_000 });
      await 넘침_없음(pageT);

      // 코치 로컬 DB — 회원 화면을 다녀와도 그대로
      expect(await 로컬_행(pageT)).toEqual(before);

      // 회원이 체중·인바디를 켠다 → 분석 탭에 체중 카드(주소 ?tab=stats 로 바로)
      await 범위_뒤집기(page, 코치, "bodyView");
      // 연결을 읽는 동안 판단 문구가 비치지 않는다(rAF 로 상태를 적는다 · 늦은 ListGrants)
      await pageT.addInitScript(() => {
        const w = window as unknown as { __member: string[] };
        w.__member = [];
        const loop = () => {
          const el = document.querySelector('[data-testid="member-screen"]');
          const st = el?.getAttribute("data-state");
          if (st && w.__member[w.__member.length - 1] !== st) w.__member.push(st);
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
      await pageT.route(`**${RPC}/ListGrants`, async (r) => {
        await new Promise((res) => setTimeout(res, 800));
        await r.continue();
      });
      await pageT.goto(`/coaching/m/${회원id}?tab=stats`);
      await expect(pageT.getByTestId("member-tab-stats")).toHaveAttribute("aria-selected", "true", {
        timeout: 20_000,
      });
      await expect(pageT.getByTestId("member-body-card")).toBeVisible({ timeout: 20_000 });
      await expect(pageT.getByTestId("member-body-latest")).toHaveText("72.4kg");
      await expect(pageT.getByTestId("member-body-row")).toHaveCount(1);
      const seen = await pageT.evaluate(() => (window as unknown as { __member: string[] }).__member);
      expect(seen).toEqual(["loading", "ok"]);
      await pageT.unroute(`**${RPC}/ListGrants`);
      await 넘침_없음(pageT);

      // E-3 — 체중 카드를 본 뒤에도 코치 로컬 DB 그대로 · localStorage 에 회원 id 없음(메모리만 · S-20)
      const 저장소 = await pageT.evaluate(() => {
        const out: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i) ?? "";
          out.push(k, localStorage.getItem(k) ?? "");
        }
        return out.join("\n");
      });
      expect(저장소).not.toContain(회원id);
      expect(await 로컬_행(pageT)).toEqual(before);

      // 홈 「담당 회원 1명」 카드 → /coaching
      await pageT.goto("/");
      const card = pageT.getByTestId("home-members-card");
      await expect(card.getByTestId("home-members-count")).toHaveText("담당 회원 1명", { timeout: 20_000 });
      await 크기_44(card);
      const cardBar = await card.evaluate((el) => getComputedStyle(el).borderLeftColor);
      expect(cardBar).toBe("rgb(14, 124, 134)"); // --color-coaching(라이트)
      await 넘침_없음(pageT);
      await card.click();
      await expect(pageT).toHaveURL(/\/coaching$/, { timeout: 20_000 });
      // 회원(코치 아님)에게는 카드가 없다
      await page.goto("/");
      await expect(page.getByTestId("btn-quick-start")).toBeVisible({ timeout: 20_000 });
      await page.waitForTimeout(1500);
      await expect(page.getByTestId("home-members-card")).toHaveCount(0);

      // 대화방 — 코치 쪽 「코칭 중」 배지를 누르면 회원 화면 · 회원 쪽 배지는 표시만
      await pageT.goto("/messages");
      await pageT.getByTestId("dm-row").filter({ hasText: 회원 }).click({ timeout: 20_000 });
      const link = pageT.getByTestId("conv-member-link");
      await expect(link.getByTestId("conv-coaching-badge")).toHaveText("코칭 중", { timeout: 20_000 });
      await 크기_44(link);
      await link.click();
      await expect(pageT).toHaveURL(new RegExp(`/coaching/m/${회원id}$`), { timeout: 20_000 });
      await expect(pageT.getByTestId("member-band-title")).toContainText(회원, { timeout: 20_000 });
      await page.goto("/messages");
      await page.getByTestId("dm-row").filter({ hasText: 코치 }).click({ timeout: 20_000 });
      await expect(page.getByTestId("conv-coaching-badge")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("conv-member-link")).toHaveCount(0);

      // 다크 — 띠가 다크 청록 토큰
      await pageT.emulateMedia({ colorScheme: "dark" });
      await pageT.goto(`/coaching/m/${회원id}`);
      await expect(pageT.getByTestId("member-workout")).toHaveCount(1, { timeout: 20_000 });
      const dark = await pageT.evaluate(() => {
        const band = document.querySelector('[data-testid="member-band"]') as HTMLElement;
        const title = document.querySelector('[data-testid="member-band-title"]') as HTMLElement;
        return {
          bg: getComputedStyle(band).backgroundColor,
          bar: getComputedStyle(band).borderLeftColor,
          ink: getComputedStyle(title).color,
        };
      });
      expect(dark).toEqual({ bg: "rgb(23, 51, 53)", bar: "rgb(76, 195, 204)", ink: "rgb(127, 217, 223)" });
      await pageT.emulateMedia({ colorScheme: "light" });

      // E-1 — 화면을 연 채 회원이 기록 보기**만** 끈다 → 다음 읽기가 막혀도 「코칭이 끝났어요」가 아니라 범위 꺼짐 문구(M-2)
      //   pageT: 기록 탭 → 분석 탭(MemberReportBody 막힘) · pageT2: 루틴 탭 → 기록 탭(RecordsTab 막힘)
      // 같은 기기의 두 번째 탭은 「다른 탭에서 열려 있어요」로 막힌다 → 코치가 **다른 기기**에서도 로그인해 둔다
      const [ctxT2, pageT2] = await 새_기기(browser);
      await 준비(pageT2);
      await 로그인(pageT2, 코치메일);
      await pageT.goto(`/coaching/m/${회원id}`);
      await expect(pageT.getByTestId("member-workout")).toHaveCount(1, { timeout: 20_000 });
      await pageT2.goto(`/coaching/m/${회원id}?tab=routines`);
      await expect(pageT2.getByTestId("member-routines-empty")).toBeVisible({ timeout: 20_000 });
      await 범위_뒤집기(page, 코치, "logView");
      await pageT.getByTestId("member-tab-stats").click();
      await expect(pageT.getByTestId("member-log-off")).toHaveText("회원이 기록 보기를 꺼 두었어요", {
        timeout: 20_000,
      });
      await expect(pageT.getByTestId("member-ended")).toHaveCount(0);
      await expect(pageT.getByTestId("member-tabs")).toBeVisible();
      await pageT2.getByTestId("member-tab-records").click();
      await expect(pageT2.getByTestId("member-log-off")).toHaveText("회원이 기록 보기를 꺼 두었어요", {
        timeout: 20_000,
      });
      await expect(pageT2.getByTestId("member-ended")).toHaveCount(0);
      await expect(pageT2.getByTestId("member-workout")).toHaveCount(0);

      // 새로 열어도 기록·분석 탭은 안내 문구
      await pageT.goto(`/coaching/m/${회원id}`);
      await expect(pageT.getByTestId("member-log-off")).toHaveText("회원이 기록 보기를 꺼 두었어요", {
        timeout: 20_000,
      });
      await expect(pageT.getByTestId("member-workout")).toHaveCount(0);
      await pageT.getByTestId("member-tab-stats").click();
      await expect(pageT.getByTestId("member-log-off")).toBeVisible();

      // E-1 — 기록 보기를 다시 켠 뒤 화면을 연 채 회원이 해지 → 루틴 탭·기록 탭이 「코칭이 끝났어요」(빈 목록으로 덮지 않는다 · M-1)
      await 범위_뒤집기(page, 코치, "logView");
      await pageT.goto(`/coaching/m/${회원id}?tab=stats`);
      await expect(pageT.getByTestId("report-ready")).toBeVisible({ timeout: 20_000 });
      await pageT2.goto(`/coaching/m/${회원id}?tab=stats`);
      await expect(pageT2.getByTestId("report-ready")).toBeVisible({ timeout: 20_000 });

      // 해지 → 「코칭이 끝났어요」 · 홈 카드 사라짐
      await page.goto("/coaching");
      await 줄_메뉴(page, "coaching-coaches", 코치);
      await page.getByTestId("coaching-revoke").click();
      await page.getByTestId("coaching-revoke-confirm").getByTestId("dialog-confirm").click();
      await expect(page.getByTestId("coaching-coaches")).toHaveCount(0, { timeout: 20_000 });
      await pageT.getByTestId("member-tab-routines").click();
      await expect(pageT.getByTestId("member-ended")).toContainText("코칭이 끝났어요", { timeout: 20_000 });
      await expect(pageT.getByTestId("member-routines-empty")).toHaveCount(0);
      await pageT2.getByTestId("member-tab-records").click();
      await expect(pageT2.getByTestId("member-ended")).toContainText("코칭이 끝났어요", { timeout: 20_000 });
      await ctxT2.close();
      await pageT.goto(`/coaching/m/${회원id}`);
      await expect(pageT.getByTestId("member-ended")).toContainText("코칭이 끝났어요", { timeout: 20_000 });
      await expect(pageT.getByTestId("member-tabs")).toHaveCount(0);
      await 크기_44(pageT.getByTestId("member-to-coaching"));
      await 넘침_없음(pageT);
      await pageT.goto("/");
      await expect(pageT.getByTestId("btn-quick-start")).toBeVisible({ timeout: 20_000 });
      await pageT.waitForTimeout(1500);
      await expect(pageT.getByTestId("home-members-card")).toHaveCount(0);
    } finally {
      await ctxT.close();
    }
  });

  test("연결 읽기 실패 — 오류 + 다시 시도 · 연결 없는 사람은 「코칭이 끝났어요」", async ({ page }) => {
    test.setTimeout(120_000);
    await 가입(page, 새_메일("cv2-p2e"), `오류${Date.now().toString(36)}`);
    let fail = true;
    await page.route(`**${RPC}/ListGrants`, (r) =>
      fail ? r.fulfill({ status: 503, body: "" }) : r.continue(),
    );
    await page.goto("/coaching/m/nobody");
    await expect(page.getByTestId("member-error")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("member-ended")).toHaveCount(0);
    fail = false;
    await page.getByTestId("member-error-retry").click();
    // 연결이 없는 사람 — 「코칭이 끝났어요」
    await expect(page.getByTestId("member-ended")).toContainText("코칭이 끝났어요", { timeout: 20_000 });
    await page.unroute(`**${RPC}/ListGrants`);
  });
});

// ── P3a 출처 표시·회원 잠금(SPEC-050 Phase 4) ────────────────────────────────────────────────────────────
// 서버에 코치 루틴을 심는 길: 회원 기기에서 만든 루틴 행을 P3b SendRoutine 이 쓸 모양(origin coach·coach_id·coach_name)으로 고쳐
// 올린다(서버는 jsonb 를 해석하지 않는다). 그 뒤 **새 기기**로 로그인해 동기로 받은 행을 본다 — 표시·잠금은 받은 칸만 보고 정해진다.
test.describe("P3a 출처 표시·회원 잠금", () => {
  async function 루틴_만들기(page: Page, 이름: string, 종목들: string[]): Promise<string> {
    await page.goto("/");
    await page.getByTestId("btn-new-routine").click();
    await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("routine-name").fill(이름);
    await page.getByTestId("routine-name").blur();
    await page.getByTestId("routine-notes").fill("코치 메모 — 천천히 내리기");
    await page.getByTestId("routine-notes").blur();
    const rows = page.getByTestId("routine-exercises").locator("> div");
    for (const [i, 종목] of 종목들.entries()) {
      await page.getByTestId("btn-add-routine-exercise").click();
      await page.getByTestId("picker-search").fill(종목);
      await page.getByTestId("picker-list").locator("button").first().click();
      await page.getByTestId("picker-confirm").click();
      await expect(rows).toHaveCount(i + 1, { timeout: 10_000 });
    }
    await page.getByTestId("btn-routine-done").click();
    await expect(page.getByTestId("routine-list")).toContainText(이름, { timeout: 10_000 });
    const tid = await page
      .getByTestId("routine-list")
      .locator("[data-testid^=routine-]")
      .filter({ hasText: 이름 })
      .first()
      .getAttribute("data-testid");
    return (tid ?? "").replace("routine-", "");
  }

  /** 이 기기 행을 출처 칸으로 고쳐 다음 동기에 올라가게 한다(앱 밖 빈 문서에서) */
  async function 출처_심기(page: Page, id: string, set: Record<string, unknown>) {
    await 빈_문서(page);
    const n = await idb_행_고치기(page, "routines", [
      { id, set: { ...set, _status: "updated", _changed: Object.keys(set).join(",") }, shiftUpdatedAt: 1000 },
    ]);
    expect(n).toBe(1);
  }

  async function 넘침_없음(page: Page) {
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over).toBeLessThanOrEqual(0);
  }

  test("코치 루틴 — 띠·칩·점 · 미리보기·⋯ 「내 루틴으로 복사」 · 보기 화면 잠금·폴더 · 복사본은 내 것 · 운동 뒤 반영 안 물음 · 끝남·가져옴 회색", async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    const tag = Date.now().toString(36);
    const email = 새_메일("cv2-p3a");
    const 이름 = `코치 상체 ${tag}`;
    await 가입(page, email, `회원p3a${tag}`);
    await 준비(page);
    const id = await 루틴_만들기(page, 이름, ["바벨 벤치프레스"]);
    await 동기(page);
    await 출처_심기(page, id, { origin: "coach", coach_id: "u-coach-e2e", coach_name: "김코치" });
    await page.goto("/");
    await 동기(page); // 고친 행이 서버로 — 서버에 코치 루틴이 있다

    // 새 기기 — 동기로 받은 코치 루틴
    const [ctxB, pageB] = await 새_기기(browser);
    try {
      await 로그인(pageB, email);
      await 준비(pageB);
      await 동기(pageB);
      await pageB.goto("/");
      const row = pageB.getByTestId(`routine-${id}`);
      await expect(row).toBeVisible({ timeout: 20_000 });
      const chip = row.getByTestId("origin-chip");
      await expect(chip).toHaveText(/코치 김코치/);
      await expect(chip).toHaveAttribute("data-origin", "coach");
      await expect(row.getByTestId("coach-new-dot")).toHaveCount(1);
      // 왼쪽 청록 띠 — 줄 판(안쪽 그림자) · 칩 글자는 청록 잉크(#0B6B74)
      const stripe = await row.evaluate((el) => getComputedStyle(el.parentElement as HTMLElement).boxShadow);
      expect(stripe).toContain("inset");
      expect(await chip.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(11, 107, 116)");
      // 다크 — 칩 글자·띠가 다크 청록 토큰(coaching-ink #7FD9DF · coaching #4CC3CC)으로 바뀐다(REV P3a)
      await pageB.emulateMedia({ colorScheme: "dark" });
      expect(await chip.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(127, 217, 223)");
      expect(
        await row.evaluate((el) => getComputedStyle(el.parentElement as HTMLElement).boxShadow),
      ).toContain("rgb(76, 195, 204)");
      await pageB.emulateMedia({ colorScheme: "light" });

      // 미리보기 — 띠 · 「편집」 대신 「내 루틴으로 복사」 · 열면 점이 사라진다
      await row.getByTestId("open-routine-preview").click();
      const preview = pageB.getByTestId("routine-preview");
      await expect(preview.getByTestId("coach-routine-banner")).toContainText(
        "코치 김코치님이 짠 루틴이에요",
      );
      await expect(preview.getByTestId("routine-preview-edit")).toHaveCount(0);
      await expect(preview.getByTestId("routine-preview-copy")).toHaveText("내 루틴으로 복사");
      await pageB.keyboard.press("Escape");
      await expect(preview).toHaveCount(0);
      await expect(row.getByTestId("coach-new-dot")).toHaveCount(0);

      // ⋯ — 맨 위 「내 루틴으로 복사」 · 「편집」 → 「보기」 · 「복제」는 합쳐져 없다
      await row.getByTestId("btn-routine-actions").click();
      const sheet = pageB.getByTestId("routine-actions");
      await expect(sheet).toBeVisible();
      const labels = (await sheet.locator("ul button").allInnerTexts()).map((x) => x.trim());
      expect(labels[0]).toBe("내 루틴으로 복사");
      expect(labels).toContain("보기");
      expect(labels).not.toContain("편집");
      expect(labels).not.toContain("복제");
      await sheet.getByText("보기", { exact: true }).click();

      // 보기 화면 — 안내·읽기 목록 · 이름·메모·종목 칸 없음 · 폴더는 고친다
      await expect(pageB).toHaveURL(new RegExp(`/routines/${id}$`), { timeout: 20_000 });
      const view = pageB.getByTestId("coach-routine-view");
      await expect(view).toBeVisible({ timeout: 20_000 });
      await expect(view.getByTestId("coach-routine-banner")).toContainText("코치 김코치님이 짠 루틴이에요");
      await expect(view.getByTestId("coach-routine-name")).toHaveText(이름);
      await expect(view.getByTestId("coach-routine-notes")).toHaveText("코치 메모 — 천천히 내리기");
      await expect(view.getByTestId("coach-routine-line")).toHaveCount(1);
      await expect(view.getByTestId("coach-routine-line")).toContainText("3세트");
      for (const t of [
        "routine-name",
        "routine-notes",
        "btn-add-routine-exercise",
        "set-table-hint",
        "btn-routine-done",
      ])
        await expect(pageB.getByTestId(t)).toHaveCount(0);
      await expect(view.getByTestId("btn-delete-routine")).toBeVisible();

      // 360px — 보기 화면 넘침 없음
      await pageB.setViewportSize({ width: 360, height: 780 });
      await 넘침_없음(pageB);

      // 「내 루틴으로 복사」 → 복사본 편집기(고칠 수 있다)
      await view.getByTestId("btn-routine-copy-mine").click();
      await expect(pageB.getByTestId("routine-name")).toHaveValue(`${이름} (복사본)`, { timeout: 20_000 });
      await expect(pageB.getByTestId("coach-routine-view")).toHaveCount(0);
      const copyId = pageB.url().split("/routines/")[1] ?? "";
      expect(copyId).not.toBe(id);
      await pageB.getByTestId("btn-routine-done").click();
      await expect(pageB).toHaveURL(/\/$/, { timeout: 15_000 });

      // 홈 — 복사본은 칩·띠 없음 · 코치 루틴은 그대로 · 360px 넘침 없음
      const copyRow = pageB.getByTestId(`routine-${copyId}`);
      await expect(copyRow).toBeVisible({ timeout: 20_000 });
      await expect(copyRow.getByTestId("origin-chip")).toHaveCount(0);
      expect(
        await copyRow.evaluate((el) => getComputedStyle(el.parentElement as HTMLElement).boxShadow),
      ).toBe("none");
      await expect(row.getByTestId("origin-chip")).toHaveText(/코치 김코치/);
      await 넘침_없음(pageB);
      await pageB.setViewportSize({ width: 1280, height: 800 });

      // 폴더는 회원 것 — 보기 화면에서 새 폴더로 옮긴다
      await pageB.goto(`/routines/${id}`);
      await expect(view).toBeVisible({ timeout: 20_000 });
      await view.getByTestId("coach-routine-folders").getByText("새 폴더").click();
      await pageB.getByTestId("routine-folder-new").fill("받은 루틴");
      await pageB.getByTestId("routine-folder-new").blur();
      await 내려쓰기_대기(pageB);
      await pageB.goto("/");
      const folder = pageB.getByTestId("folder-toggle").filter({ hasText: "받은 루틴" });
      await expect(folder).toBeVisible({ timeout: 20_000 });
      await folder.click();
      const inFolder = pageB.getByTestId("folder-group").filter({ hasText: "받은 루틴" });
      await expect(inFolder.getByTestId("origin-chip")).toHaveText(/코치 김코치/);

      // 코치 루틴으로 운동 — 한 세트 더 해도 끝날 때 「루틴에 반영」을 묻지 않는다 · 루틴은 3세트 그대로
      await pageB.getByTestId("btn-start-folder-routine").first().click();
      await expect(pageB).toHaveURL(/\/workout/, { timeout: 20_000 });
      await expect(pageB.getByTestId("set-list").first()).toBeVisible({ timeout: 20_000 });
      await pageB.getByTestId("btn-add-set").first().click();
      await expect(pageB.getByTestId("set-list").first().locator("> div")).toHaveCount(4);
      for (let i = 0; i < 4; i++) await 세트_기록(pageB, 0, i, 40, 8);
      await pageB.getByTestId("btn-complete").click();
      await pageB.getByTestId("dialog-confirm").click();
      await expect(pageB.getByTestId("summary-volume")).toBeVisible({ timeout: 15_000 });
      await pageB.waitForTimeout(800);
      await expect(pageB.getByTestId("finish-routine")).toHaveCount(0);
      await expect(pageB.getByTestId("finish-name")).toHaveCount(0);
      await pageB.getByTestId("btn-summary-close").click();
      await expect(pageB).toHaveURL(/\/$/, { timeout: 15_000 });
      await pageB.goto(`/routines/${id}`);
      await expect(pageB.getByTestId("coach-routine-line")).toContainText("3세트", { timeout: 20_000 });

      // 코칭 끝남(coach_ended) — 회색 「코칭 끝남」 · 다시 편집기·복제
      await 출처_심기(pageB, id, { origin: "coach_ended" });
      await pageB.goto("/");
      await pageB.getByTestId("folder-toggle").filter({ hasText: "받은 루틴" }).click();
      const ended = pageB
        .getByTestId("folder-group")
        .filter({ hasText: "받은 루틴" })
        .getByTestId("origin-chip");
      await expect(ended).toHaveText("코칭 끝남", { timeout: 20_000 });
      await expect(ended).toHaveAttribute("data-origin", "coach_ended");
      await pageB.goto(`/routines/${id}`);
      await expect(pageB.getByTestId("routine-name")).toHaveValue(이름, { timeout: 20_000 });
      await expect(pageB.getByTestId("coach-routine-view")).toHaveCount(0);
    } finally {
      await ctxB.close();
    }
  });

  test("가져온 루틴(크리에이터) = 회색 「가져옴」 · 편집 그대로", async ({ page }) => {
    test.setTimeout(120_000);
    await 준비(page);
    await page.goto("/");
    await page.getByTestId("concept-topic-pro-shoulders").click();
    const first = page
      .getByTestId("creator-topic-sheet")
      .locator('[data-testid^="creator-version-"]')
      .first();
    await first.click();
    await expect(page.getByTestId("creator-save")).toBeEnabled({ timeout: 10_000 });
    await page.getByTestId("creator-save").click();
    const chip = page.getByTestId("routine-list").getByTestId("origin-chip");
    await expect(chip).toHaveText("가져옴", { timeout: 20_000 });
    await expect(chip).toHaveAttribute("data-origin", "import");
    await page.getByTestId("routine-list").getByTestId("btn-routine-actions").first().click();
    const labels = (await page.getByTestId("routine-actions").locator("ul button").allInnerTexts()).map((x) =>
      x.trim(),
    );
    expect(labels).toContain("편집");
    expect(labels).toContain("복제");
    expect(labels).not.toContain("내 루틴으로 복사");
  });
});
