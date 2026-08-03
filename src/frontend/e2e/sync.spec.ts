// 서버 동기 e2e — **기기 두 대**로 확인한다
//
// 여기서 확인하는 것은 하나다: 한쪽에서 한 일이 다른 쪽에 **그대로** 나타나는가.
// 브라우저 컨텍스트를 둘 만들어 기기 두 대를 흉내 낸다(로컬 저장소가 따로 논다).
//
// 확인 목록:
//   · 완료한 운동이 다른 기기의 기록에 뜬다
//   · **하는 중인 운동은 건너가지 않는다**(유령 세션 방지)
//   · 지운 것은 지워진 채로 간다(되살아나지 않는다)
//   · 로그인하지 않으면 아무것도 올라가지 않는다
//   · **다른 계정으로 로그인하면 이 기기의 예전 기록을 지운다**(남의 기록이 섞이지 않게)
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;
type BrowserContext = import("@playwright/test").BrowserContext;

function freshEmail(tag: string): string {
  return `e2e-sync-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** 카탈로그가 로컬에 심어질 때까지 기다린다 — 종목이 없으면 운동을 시작할 수 없다. */
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

async function 로그인(page: Page, email: string) {
  await page.goto("/account");
  await page.getByTestId("mode-login").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

/** 종목 하나에 세트 하나를 채워 운동을 마친다. 완료한 운동 이름을 돌려준다. */
async function 운동하고_마치기(page: Page, 종목 = "바벨 벤치프레스") {
  await page.goto("/workout");
  await expect(page.getByTestId("btn-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill(종목);
  await page.getByTestId("picker-list").locator("button").first().click();
  // 카드에는 이름과 기구가 붙어 나온다 — 이름만 확인한다.
  await expect(page.getByTestId("workout-exercises")).toContainText("벤치프레스", { timeout: 20_000 });

  // 첫 세트를 채우고 완료 표시.
  await page.getByTestId("set-weight").first().fill("60");
  await page.getByTestId("set-reps").first().fill("10");
  await page.getByTestId("set-done").first().click();

  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-summary-close").click();
}

/** '지금 동기'를 눌러 **끝날 때까지** 기다린다. 배경 동기를 기다리는 것보다 확정적이다. */
async function 동기(page: Page) {
  await page.goto("/account");
  await expect(page.getByTestId("btn-sync-now")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-sync-now").click();
  await expect(page.getByTestId("sync-status")).toHaveText("동기 완료", { timeout: 30_000 });
}

/**
 * 서버에 완료된 운동이 올라와 있는가 — **서버에게 직접 묻는다**.
 *
 * 브라우저가 보낸 요청을 엿보는 방법도 있지만, 큰 본문은 Playwright가 돌려주지 않는 경우가 있고
 * 무엇보다 확인하려는 것은 "요청이 나갔다"가 아니라 **"서버에 남았다"**이다.
 */
async function 서버에_완료된_운동이_있나(
  request: import("@playwright/test").APIRequestContext,
  email: string,
): Promise<boolean> {
  const login = await request.post("/api/auth.v1.AuthService/LogIn", {
    data: { email, password: "hunter22!" },
  });
  if (!login.ok()) return false;
  const token = (await login.json()).tokens?.accessToken;
  if (!token) return false;

  const pull = await request.post("/api/sync.v1.SyncService/Pull", {
    headers: { authorization: `Bearer ${token}` },
    data: {},
  });
  if (!pull.ok()) return false;
  const changes = (await pull.json()).changes ?? {};
  const workouts: string[] = changes.workouts?.updated ?? [];
  return workouts.some((raw) => {
    try {
      return (JSON.parse(raw) as { state?: string }).state === "completed";
    } catch {
      return false;
    }
  });
}

/** 두 번째 기기 — 저장소가 완전히 따로인 새 컨텍스트. */
async function 새_기기(browser: import("@playwright/test").Browser): Promise<[BrowserContext, Page]> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  return [ctx, page];
}

test("한 기기에서 마친 운동이 다른 기기의 기록에 나타난다", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const 메일 = freshEmail("two-devices");

  // 기기 A — 가입하고 운동을 마친다.
  await 준비(page);
  await 가입(page, 메일, "동기하는사람");
  await 운동하고_마치기(page);
  await page.goto("/history");
  // 기록 목록은 세션 이름과 요약을 보여 준다 — 볼륨이 이 운동의 지문이다(60kg × 10회).
  await expect(page.getByTestId("history-list")).toContainText("600kg", { timeout: 20_000 });
  await 동기(page);

  // 기기 B — 같은 계정으로 로그인하면 그 기록이 있다.
  const [ctxB, pageB] = await 새_기기(browser);
  try {
    await 준비(pageB);
    await pageB.goto("/history");
    // 로그인 전에는 이 기기에 아무것도 없다.
    await expect(pageB.getByTestId("history-list")).toHaveCount(0);

    await 로그인(pageB, 메일);
    await 동기(pageB);

    await pageB.goto("/history");
    await expect(pageB.getByTestId("history-list")).toContainText("600kg", { timeout: 30_000 });
  } finally {
    await ctxB.close();
  }
});

test("하는 중인 운동은 다른 기기로 건너가지 않는다", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const 메일 = freshEmail("in-progress");

  // 기기 A — 운동을 **시작만** 하고 마치지 않는다.
  await 준비(page);
  await 가입(page, 메일, "진행중인사람");
  await page.goto("/workout");
  await expect(page.getByTestId("btn-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("workout-exercises")).toContainText("벤치프레스", { timeout: 20_000 });
  await 동기(page);

  // 기기 B — 유령 세션이 뜨면 안 된다. 뜨면 폐기해도 서버가 계속 되밀어 되살아난다.
  const [ctxB, pageB] = await 새_기기(browser);
  try {
    await 준비(pageB);
    await 로그인(pageB, 메일);
    await 동기(pageB);

    await pageB.goto("/");
    // '이어서 하기'가 보이면 남의 기기 세션이 건너온 것이다.
    await expect(pageB.getByTestId("btn-resume")).toHaveCount(0);
  } finally {
    await ctxB.close();
  }
});

test("지운 루틴은 다른 기기에서 되살아나지 않는다", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const 메일 = freshEmail("delete");
  const 루틴 = `지울루틴${Date.now().toString(36)}`;

  // 기기 A — 루틴을 만들고 동기.
  await 준비(page);
  await 가입(page, 메일, "지우는사람");
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

  // 기기 B — 받는다.
  const [ctxB, pageB] = await 새_기기(browser);
  try {
    await 준비(pageB);
    await 로그인(pageB, 메일);
    await 동기(pageB);
    await pageB.goto("/");
    await expect(pageB.locator("main")).toContainText(루틴, { timeout: 30_000 });

    // 기기 A에서 지우고 동기 — 행의 '⋯'에서 삭제한다(이름을 누르면 운동이 시작된다).
    await page.goto("/");
    await expect(page.getByTestId("routine-list")).toContainText(루틴, { timeout: 20_000 });
    await page.getByTestId("btn-routine-actions").first().click();
    await page.getByTestId("routine-actions").getByText("삭제", { exact: true }).click();
    await page.getByTestId("confirm-delete-routine").getByTestId("dialog-confirm").click();
    await expect(page.locator("main")).not.toContainText(루틴, { timeout: 20_000 });
    await 동기(page);

    // 기기 B에서도 사라진다 — **되살아나지 않는다**.
    await 동기(pageB);
    await pageB.goto("/");
    await expect(pageB.locator("main")).not.toContainText(루틴, { timeout: 30_000 });
  } finally {
    await ctxB.close();
  }
});

test("다른 계정으로 로그인하면 이 기기의 예전 기록을 지운다", async ({ page }) => {
  test.setTimeout(180_000);
  const 첫사람 = freshEmail("owner-a");
  const 둘째사람 = freshEmail("owner-b");

  // 한 기기를 두 사람이 쓴다. 먼저 첫 사람이 운동을 하고 간다.
  await 준비(page);
  await 가입(page, 첫사람, "먼저쓴사람");
  await 운동하고_마치기(page);
  await 동기(page);
  await page.goto("/history");
  // 기록 목록은 세션 이름과 요약을 보여 준다 — 볼륨이 이 운동의 지문이다(60kg × 10회).
  await expect(page.getByTestId("history-list")).toContainText("600kg", { timeout: 20_000 });

  // 로그아웃하고 둘째 사람이 로그인한다.
  await page.goto("/account");
  await page.getByTestId("btn-logout").click();
  await expect(page.getByTestId("btn-auth-submit")).toBeVisible({ timeout: 20_000 });
  await 가입(page, 둘째사람, "나중쓴사람");

  // 첫 사람의 기록은 이 기기에서 사라져야 한다 — 남았다면 둘째 사람 계정으로 올라간다.
  await page.goto("/history");
  await expect(page.getByTestId("history-list")).toHaveCount(0, { timeout: 30_000 });

  // 카탈로그는 사용자 데이터가 아니라 앱의 재료다 — 다시 심어져 있어야 한다.
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
});

test("버튼을 누르지 않아도 동기된다 — 운동을 마치면 저절로", async ({ page, browser, request }) => {
  test.setTimeout(180_000);
  const 메일 = freshEmail("auto");

  // 기기 A — 로그인하고 운동을 마친다. **'지금 동기'를 누르지 않는다.**
  //
  // 올라간 것을 시간으로 재지 않고 **요청 수로** 센다. 가입 직후에도 한 번 올라가므로
  // "Push가 한 번 있었다"로는 부족하다 — 운동 **뒤에** 또 한 번 있어야 한다.
  await 준비(page);
  await 가입(page, 메일, "자동동기");
  await 운동하고_마치기(page);

  // **서버에 직접 물어본다.** 브라우저가 무엇을 보냈는지 훔쳐보는 것보다 이게 정확하다 —
  // 확인하려는 것은 "요청이 나갔다"가 아니라 "서버에 남았다"이기 때문이다.
  await expect
    .poll(async () => await 서버에_완료된_운동이_있나(request, 메일), {
      timeout: 60_000,
      message: "운동을 마치면 버튼 없이도 서버에 올라가야 한다",
    })
    .toBe(true);

  // 기기 B — 로그인만 한다. 여기서도 버튼을 누르지 않는다.
  const [ctxB, pageB] = await 새_기기(browser);
  try {
    await 준비(pageB);
    await 로그인(pageB, 메일);

    // 저장소가 예약한 동기(운동 완료 뒤)와 로그인 직후 동기가 알아서 만나야 한다.
    await pageB.goto("/history");
    await expect(pageB.getByTestId("history-list")).toContainText("600kg", { timeout: 60_000 });
  } finally {
    await ctxB.close();
  }
});

test("로그인하지 않으면 아무것도 올라가지 않는다", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const 메일 = freshEmail("anon");

  // 로그인 없이 운동을 마친다 — 기기에는 남는다.
  await 준비(page);
  await 운동하고_마치기(page);
  await page.goto("/history");
  // 기록 목록은 세션 이름과 요약을 보여 준다 — 볼륨이 이 운동의 지문이다(60kg × 10회).
  await expect(page.getByTestId("history-list")).toContainText("600kg", { timeout: 20_000 });

  // 새 기기에서 **새 계정**으로 로그인해도 그 기록은 없다(서버로 간 적이 없다).
  const [ctxB, pageB] = await 새_기기(browser);
  try {
    await 준비(pageB);
    await 가입(pageB, 메일, "다른사람");
    await 동기(pageB);
    await pageB.goto("/history");
    await expect(pageB.getByTestId("history-list")).toHaveCount(0);
  } finally {
    await ctxB.close();
  }
});
