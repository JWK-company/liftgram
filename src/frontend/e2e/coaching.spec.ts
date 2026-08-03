// 코칭 e2e — **누가 무엇을 볼 수 있는가**
//
// 이 화면은 남의 운동 기록을 여는 문이라, 여기서 확인하는 것은 대부분 "열리지 않는다"이다:
//   · 코칭 의향을 켠 사람만 검색에 나온다
//   · **요청한 사람은 자기 요청을 수락할 수 없다**(동의 ≠ 통보)
//   · 수락 전에는 리포트·루틴 버튼이 없고, 서버도 거절한다
//   · 해지하면 그 순간 닫힌다
//   · 본 것은 이력에 남고 **회원도 그것을 읽는다**
//
// 리포트는 회원이 **동기해 둔** 기록에서 나온다 — 그래서 회원 쪽에서 운동을 마치고 올린 뒤에 본다.
import { expect, test } from "@playwright/test";

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
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

/** 코칭 의향을 켠다 — 이걸 켜야 남의 검색에 나온다(로컬만이 아니라 **서버 프로필에도** 적힌다). */
async function 코칭의향_켜기(page: Page) {
  await page.goto("/profile");
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
  await expect(page.getByTestId("sync-status")).toHaveText("동기 완료", { timeout: 30_000 });
}

async function 새_기기(browser: import("@playwright/test").Browser): Promise<[BrowserContext, Page]> {
  const ctx = await browser.newContext();
  return [ctx, await ctx.newPage()];
}

/** 회원이 트레이너에게 요청을 건다. */
async function 코칭요청(page: Page, 트레이너이름: string) {
  await page.goto("/coaching");
  await page.getByTestId("coaching-query").fill(트레이너이름);
  await page.getByTestId("coaching-search").click();
  await expect(page.getByTestId("coaching-results")).toContainText(트레이너이름, { timeout: 20_000 });
  await page.getByTestId("coaching-request").first().click();
  await expect(page.getByTestId("coaching-coaches")).toContainText("수락 대기", { timeout: 20_000 });
}

test("로그인하지 않으면 코칭을 쓸 수 없다", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("liftgram.session"));

  await page.goto("/coaching");
  await expect(page.getByTestId("coaching-login-required")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("coaching-body")).toHaveCount(0);
});

test("코칭 의향을 켠 사람만 검색에 나온다", async ({ page, browser }) => {
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

    // 찾는 사람 시점 — 켠 사람만 보인다.
    await page.goto("/coaching");
    await page.getByTestId("coaching-query").fill(트레이너);
    await page.getByTestId("coaching-search").click();
    await expect(page.getByTestId("coaching-results")).toContainText(트레이너, { timeout: 20_000 });

    await page.getByTestId("coaching-query").fill(평범한사람);
    await page.getByTestId("coaching-search").click();
    await expect(page.getByTestId("coaching-results")).toHaveCount(0, { timeout: 20_000 });
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
  await page.goto("/workout");
  await expect(page.getByTestId("btn-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("set-weight").first().fill("60");
  await page.getByTestId("set-reps").first().fill("10");
  await page.getByTestId("set-done").first().click();
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-summary-close").click();
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
    await expect(pageT.getByTestId("coaching-report")).toHaveCount(0);

    // 트레이너가 수락하면 열린다.
    await pageT.getByTestId("coaching-accept").click();
    await expect(pageT.getByTestId("coaching-members")).toContainText("코칭 중", { timeout: 20_000 });
    await pageT.getByTestId("coaching-report").click();

    // **사실만** 보인다 — 세션 1회, 부위별 볼륨 600kg.
    await expect(pageT.getByTestId("report-sessions")).toHaveText("1", { timeout: 20_000 });
    await expect(pageT.getByTestId("report-muscles")).toContainText("600kg");
    // 판단은 코치가 한다는 고지가 함께 있다.
    await expect(pageT.getByTestId("coaching-report-view")).toContainText("사실 집계만");
    await pageT.getByTestId("coaching-report-view").getByRole("button", { name: "확인" }).click();

    // 회원이 해지하면 트레이너 쪽에서 즉시 닫힌다.
    await page.goto("/coaching");
    await page.getByTestId("coaching-revoke").first().click();
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
    await pageT.getByTestId("coaching-routines").click();
    await expect(pageT.getByTestId("member-routines")).toContainText(루틴, { timeout: 20_000 });
    await pageT.getByTestId("member-exercise").first().click();
    await expect(pageT.getByTestId("rx-editor")).toBeVisible({ timeout: 20_000 });
    // 첫 줄을 '탑 세트'로 바꾼다(타입 버튼이 순환한다: normal → warmup → top).
    await pageT.getByTestId("rx-type").first().click();
    await pageT.getByTestId("rx-type").first().click();
    await pageT.getByTestId("rx-save").click();

    // 목록으로 돌아오면 처방 표시가 붙어 있다.
    await expect(pageT.getByTestId("member-routines")).not.toContainText("처방 없음", { timeout: 20_000 });

    // 회원이 동기하면 그 처방이 회원 기기로 내려온다.
    await 동기(page);

    // 이력 — **회원도 읽는다**. 트레이너가 무엇을 했는지 보인다.
    await page.goto("/coaching");
    await page.getByTestId("coaching-history-link").first().click();
    const 이력 = page.getByTestId("coaching-history");
    await expect(이력).toBeVisible({ timeout: 20_000 });
    await expect(이력).toContainText("처방 수정");
    await expect(이력).toContainText("루틴 열람");
  } finally {
    await ctxT.close();
  }
});
