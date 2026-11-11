// 코칭 e2e — **누가 무엇을 볼 수 있는가**
//
// 이 화면은 남의 운동 기록을 여는 문이라, 여기서 확인하는 것은 대부분 "열리지 않는다"이다:
//   · 코칭 의향을 켠 사람만 검색에 나온다(SPEC-052 — 뜻만 「코치 찾기 노출」 · 요청·초대는 누구나)
//   · **요청한 사람은 자기 요청을 수락할 수 없다**(동의 ≠ 통보)
//   · 수락 전에는 리포트·루틴 버튼이 없고, 서버도 거절한다
//   · 해지하면 그 순간 닫힌다
//   · 본 것은 이력에 남고 **회원도 그것을 읽는다**
//
// 리포트는 회원이 **동기해 둔** 기록에서 나온다 — 그래서 회원 쪽에서 운동을 마치고 올린 뒤에 본다.
import { expect, test } from "@playwright/test";
import { 검색_없음, 끊기, 이름으로_id, 이름으로_요청, 코치_시트, 회원_화면 } from "./helpers/coaching";

type Page = import("@playwright/test").Page;
type BrowserContext = import("@playwright/test").BrowserContext;

function freshEmail(tag: string): string {
  return `e2e-coach-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

async function 준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
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

/** 코칭 의향을 켠다 — 이걸 켜야 남의 검색에 나온다(로컬만이 아니라 **서버 프로필에도** 적힌다). */
async function 코칭의향_켜기(page: Page) {
  await page.goto("/profile");
  // 경력·코칭 의향은 프로필의 「편집」 시트 안에 있다(SRS-054 시안 09).
  await page.getByTestId("btn-edit-experience").click();
  await expect(page.getByTestId("trainer-intent")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("trainer-intent").click();
  await expect(page.getByTestId("trainer-intent")).toHaveAttribute("aria-pressed", "true", {
    timeout: 20_000,
  });
}

async function 동기(page: Page) {
  await page.goto("/account");
  await expect(page.getByTestId("btn-sync-now")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-sync-now").click();
  await expect(page.getByTestId("sync-status")).toHaveText("최신 상태예요", { timeout: 30_000 });
}

async function 새_기기(browser: import("@playwright/test").Browser): Promise<[BrowserContext, Page]> {
  const ctx = await browser.newContext();
  return [ctx, await ctx.newPage()];
}

/** 회원이 트레이너에게 요청을 건다. */
async function 코칭요청(page: Page, 트레이너이름: string) {
  // [원본] /coaching 「코치 찾기」 검색(coaching-query → coaching-search → coaching-request) → 범위 시트(지난 기록 켬) → 확인
  // [개선 SPEC-059] 검색이 없어졌다 — 사람 찾기에서 이름 → 프로필 「코치로 요청」 → 같은 범위 시트
  await 이름으로_요청(page, 트레이너이름, { pastRecords: true });
}

test("로그인하지 않으면 코칭을 쓸 수 없다", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("liftgram.session"));

  await page.goto("/coaching");
  await expect(page.getByTestId("coaching-login-required")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("coaching-body")).toHaveCount(0);
});

// [원본 이름] 코칭 의향을 켠 사람만 검색에 나온다
test("코칭 요청 받기를 켠 사람 프로필에만 「코치로 요청」이 있다", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const 평범한사람 = `평범이${Date.now().toString(36)}`;
  const 트레이너 = `코치${Date.now().toString(36)}`;

  // 의향을 켜지 않은 사람.
  await 가입(page, freshEmail("plain"), 평범한사람);

  // 의향을 켠 사람.
  const [ctxT, pageT] = await 새_기기(browser);
  try {
    await 가입(pageT, freshEmail("trainer"), 트레이너);
    await 코칭의향_켜기(pageT);

    // [원본] 찾는 사람 시점 — 「코치 찾기」 검색에 켠 사람만 나온다(coaching-query → coaching-search → coaching-results)
    // [개선 SPEC-059] 검색은 없어졌다 — 켠 사람 프로필에만 「코치로 요청」, 끈 사람 프로필엔 코드 안내.
    // 같은 사람 시점이 필요해 셋째 사람(page 는 평범한사람 자신)으로 본다.
    const [ctxV, pageV] = await 새_기기(browser);
    try {
      await 가입(pageV, freshEmail("viewer"), `보는이${Date.now().toString(36)}`);
      await 검색_없음(pageV);
      await pageV.goto(`/u/${await 이름으로_id(pageV, 트레이너)}`);
      await expect(pageV.getByTestId("profile-coaching-request")).toBeVisible({ timeout: 20_000 });
      await pageV.goto(`/u/${await 이름으로_id(pageV, 평범한사람)}`);
      await expect(pageV.getByTestId("profile-coaching-invite")).toBeVisible({ timeout: 20_000 });
      await expect(pageV.getByTestId("profile-coaching-request")).toHaveCount(0);
      await expect(pageV.getByTestId("profile-coaching-code-hint")).toBeVisible();
    } finally {
      await ctxV.close();
    }
  } finally {
    await ctxT.close();
  }
});

test("요청한 사람은 자기 요청을 수락할 수 없다", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const 트레이너 = `코치${Date.now().toString(36)}`;

  const [ctxT, pageT] = await 새_기기(browser);
  try {
    await 가입(pageT, freshEmail("t-self"), 트레이너);
    await 코칭의향_켜기(pageT);

    await 가입(page, freshEmail("m-self"), "회원");
    await 코칭요청(page, 트레이너);

    // 요청한 회원 화면에는 수락 버튼이 없다 — 눌러도 서버가 막을 문을 그리지 않는다.
    await expect(page.getByTestId("coaching-accept")).toHaveCount(0);

    // 반대편(트레이너)에게는 있다.
    await pageT.goto("/coaching");
    await expect(pageT.getByTestId("coaching-members")).toContainText("수락 대기", { timeout: 20_000 });
    await expect(pageT.getByTestId("coaching-accept")).toBeVisible();
  } finally {
    await ctxT.close();
  }
});

test("수락해야 리포트가 열리고, 해지하면 그 순간 닫힌다", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const 트레이너 = `코치${Date.now().toString(36)}`;
  const 회원 = `회원${Date.now().toString(36)}`;

  // 회원 — 운동을 하나 마치고 서버에 올린다(리포트는 동기된 기록에서 나온다).
  await 준비(page);
  await 가입(page, freshEmail("m-report"), 회원);
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click(); // 전체 화면 피커 — 골라서 「N개 추가」(SRS-093)
  await page.getByTestId("set-weight").first().fill("60");
  await page.getByTestId("set-reps").first().fill("10");
  await page.getByTestId("set-done").first().click();
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 20_000 });
  // 완료 직후 루틴 저장·반영 질문(SRS-059·060)이 요약 위에 뜨면 「저장 안 함 / 오늘만」으로 닫는다.
  for (const id of ["btn-finish-dont-save", "btn-finish-today"]) {
    const b = page.getByTestId(id);
    if (await b.isVisible()) await b.click();
  }
  await page.getByTestId("btn-summary-close").click();
  // 요약을 닫으면 운동 탭으로 옮겨 간다(#61) — 그 이동이 끝난 뒤 다음 주소로 간다.
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await 동기(page);

  const [ctxT, pageT] = await 새_기기(browser);
  try {
    await 가입(pageT, freshEmail("t-report"), 트레이너);
    await 코칭의향_켜기(pageT);

    // 회원이 요청 → 아직 수락 전이다.
    await 코칭요청(page, 트레이너);

    // 수락 전에는 리포트 버튼 자체가 없다.
    await pageT.goto("/coaching");
    await expect(pageT.getByTestId("coaching-members")).toContainText("수락 대기", { timeout: 20_000 });
    // [원본] await expect(pageT.getByTestId("coaching-report")).toHaveCount(0);
    // [개선 SPEC-059] 수락 전 줄은 회원 화면으로 들어가지 않는다
    await expect(pageT.getByTestId("coaching-members").getByTestId("coaching-member-open")).toHaveCount(0);

    // 트레이너가 수락하면 열린다.
    await pageT.getByTestId("coaching-accept").click();
    await expect(pageT.getByTestId("coaching-members")).toContainText("코칭 중", { timeout: 20_000 });
    // [개선 SPEC-050] 기록 요약·루틴은 회원 줄 ⋯ 시트 안
    // [원본] await pageT.getByTestId("coaching-grant-more").first().click();
    // [원본] await pageT.getByTestId("coaching-report").click();
    // [개선 SPEC-059] 기록 요약은 회원 줄을 눌러 들어간 회원 화면 「분석」 탭
    await 회원_화면(pageT, "stats");

    // **사실만** 보인다 — 세션 1회, 총 볼륨 600kg, 가슴 1세트(SRS-079: 원본 레코드 → 이 기기 core 계산 · 부위별은 세트 단위).
    // [원본] report-sessions "1" · report-muscles "600kg" · "사실 집계만"(옛 GetMemberReport Go 집계 화면)
    await expect(pageT.getByTestId("ps-workouts")).toHaveText("1회", { timeout: 20_000 });
    await expect(pageT.getByTestId("ps-volume")).toHaveText("600kg");
    await expect(pageT.getByTestId("ps-muscle-chest")).toHaveAttribute("data-sets", "1");
    // [원본] 판단은 코치가 한다는 고지가 함께 있다.
    // await expect(pageT.getByTestId("coaching-report-view")).toContainText("다음 처방 판단은 코치가 합니다");
    // [개선] 보는 사람이 코치면 사실 문장만(P4U-16) — 문구 전체가 아니라 testid 로 고지가 있는지 본다(P4U-17)
    // [원본] coaching-report-view(⋯ 시트의 창) 안에서 찾았다 — 이제 회원 화면 분석 탭(SPEC-059)
    await expect(pageT.getByTestId("member-panel-stats").getByTestId("ps-factonly")).toBeVisible();
    await expect(pageT.getByTestId("member-panel-stats").getByTestId("ps-factonly")).not.toContainText(
      "다음 처방 판단은 코치가 합니다",
    );
    // [원본] await pageT.getByTestId("coaching-report-view").getByRole("button", { name: "확인" }).click(); — 창이 아니라 화면(SPEC-059)

    // 회원이 해지하면 트레이너 쪽에서 즉시 닫힌다.
    await page.goto("/coaching");
    // [개선 SPEC-050] 연결 끊기는 ⋯ 시트 → 확인창
    // [원본] await page.getByTestId("coaching-grant-more").first().click();
    // [원본] await page.getByTestId("coaching-revoke").click();
    // [원본] await page.getByTestId("coaching-revoke-confirm").getByTestId("dialog-confirm").click();
    // [개선 SPEC-059] 줄 오른쪽 🗑 → 확인창(도우미가 RevokeGrant 성공·줄 빠짐까지 — REV-144 B8)
    await 끊기(page, "coaching-coaches", 트레이너);
    await expect(page.getByTestId("coaching-coaches")).toHaveCount(0, { timeout: 20_000 });

    await pageT.reload();
    await expect(pageT.getByTestId("coaching-members")).toHaveCount(0, { timeout: 20_000 });
  } finally {
    await ctxT.close();
  }
});

test("트레이너가 처방을 쓰면 회원 앱에 내려오고, 이력에 남는다", async ({ page, browser }) => {
  test.setTimeout(240_000);
  const 트레이너 = `코치${Date.now().toString(36)}`;
  const 루틴 = `처방루틴${Date.now().toString(36)}`;

  // 회원 — 루틴을 하나 만들고 올린다.
  await 준비(page);
  await 가입(page, freshEmail("m-rx"), "처방받는회원");
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("routine-name").fill(루틴);
  await page.getByTestId("routine-name").blur();
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click(); // 전체 화면 피커 — 골라서 「N개 추가」(SRS-093)
  await expect(page.getByTestId("routine-exercises").locator("> div")).toHaveCount(1, { timeout: 20_000 });
  await page.getByTestId("btn-routine-done").click();
  await expect(page.getByTestId("routine-list")).toContainText(루틴, { timeout: 20_000 });
  await 동기(page);

  const [ctxT, pageT] = await 새_기기(browser);
  try {
    await 가입(pageT, freshEmail("t-rx"), 트레이너);
    await 코칭의향_켜기(pageT);
    await 코칭요청(page, 트레이너);

    await pageT.goto("/coaching");
    await pageT.getByTestId("coaching-accept").click();
    await expect(pageT.getByTestId("coaching-members")).toContainText("코칭 중", { timeout: 20_000 });

    // 회원의 루틴을 열어 처방을 쓴다.
    // [개선 SPEC-050] 기록 요약·루틴은 회원 줄 ⋯ 시트 안
    // [원본] await pageT.getByTestId("coaching-grant-more").first().click();
    // [원본] await pageT.getByTestId("coaching-routines").click();
    // [개선 SPEC-059] 루틴은 회원 화면 「루틴」 탭
    await 회원_화면(pageT, "routines");
    await expect(pageT.getByTestId("member-routines")).toContainText(루틴, { timeout: 20_000 });
    await pageT.getByTestId("member-exercise").first().click();
    await expect(pageT.getByTestId("rx-editor")).toBeVisible({ timeout: 20_000 });
    // 첫 줄을 '탑 세트'로 바꾼다 · 드롭 줄도 서버를 왕복하는지 본다(SPEC-023)
    await pageT.getByTestId("rx-type").first().click();
    await pageT.getByTestId("rx-type-sheet").getByText("탑세트 (T)").click();
    await pageT.getByTestId("rx-add-set").click();
    await pageT.getByTestId("rx-type").last().click();
    await pageT.getByTestId("rx-type-sheet").getByText("드롭세트 (D)").click();
    await pageT.getByTestId("rx-weight").first().fill("100");
    await pageT.getByTestId("rx-weight").first().blur();
    await pageT.getByTestId("rx-save").click();

    // 목록으로 돌아오면 처방 표시가 붙어 있다.
    await expect(pageT.getByTestId("member-routines")).not.toContainText("처방 없음", { timeout: 20_000 });

    // 회원이 동기하면 그 처방이 회원 기기로 내려온다.
    await 동기(page);

    // 이력 — **회원도 읽는다**. 트레이너가 무엇을 했는지 보인다.
    await page.goto("/coaching");
    // [개선 SPEC-050] 이력은 ⋯ 시트 안
    // [원본] await page.getByTestId("coaching-grant-more").first().click();
    // [원본] await page.getByTestId("coaching-history-link").click();
    // [개선 SPEC-059] 회원 쪽은 코치 이름 → 시트 「연결 이력」
    await 코치_시트(page, "coaching-coaches", 트레이너);
    await page.getByTestId("coaching-coach-sheet").getByTestId("coaching-history-link").click();
    const 이력 = page.getByTestId("coaching-history");
    await expect(이력).toBeVisible({ timeout: 20_000 });
    await expect(이력).toContainText("처방 수정");
    await expect(이력).toContainText("루틴 열람");
  } finally {
    await ctxT.close();
  }
});
