// 화면 정리 전후 캡처(사람이 보는 비교용) — 평소 e2e 에서는 건너뛴다.
// 실행: DECLUTTER_SHOTS=<저장 폴더> BASE=… npx playwright test e2e/declutter-shots.spec.ts
import { test } from "@playwright/test";
import {
  붐비는_운동_화면,
  안내_띠_닫기,
  요약_재료,
  지난_기록_채우기,
  카탈로그_준비,
} from "./fixtures/declutter-seed";

const OUT = process.env.DECLUTTER_SHOTS;

test.use({ deviceScaleFactor: 2 });

test("운동 블록 캡처 — 390 라이트·다크 · 360×640", async ({ page }) => {
  test.skip(!OUT, "DECLUTTER_SHOTS 가 없으면 건너뛴다");
  test.setTimeout(300_000);
  const shots: { name: string; w: number; h: number; scheme: "light" | "dark" }[] = [
    { name: "block-390-light", w: 390, h: 844, scheme: "light" },
    { name: "block-390-dark", w: 390, h: 844, scheme: "dark" },
    { name: "block-360x640", w: 360, h: 640, scheme: "light" },
  ];
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await 지난_기록_채우기(page);
  await 붐비는_운동_화면(page);
  for (const s of shots) {
    await page.setViewportSize({ width: s.w, height: s.h });
    await page.emulateMedia({ colorScheme: s.scheme });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${s.name}.png` });
  }
});

// P2 — 요약·기록 상세·분석. 화면 전체 길이로 찍는다(요약은 「끝까지」 가 얼마나 긴지가 비교 대상이다).
test("요약·기록 상세·분석 캡처 — 390 라이트·다크 · 360×640", async ({ page }) => {
  test.skip(!OUT, "DECLUTTER_SHOTS 가 없으면 건너뛴다");
  test.setTimeout(300_000);
  const shots: { w: number; h: number; scheme: "light" | "dark"; tag: string }[] = [
    { w: 390, h: 844, scheme: "light", tag: "390-light" },
    { w: 390, h: 844, scheme: "dark", tag: "390-dark" },
    { w: 360, h: 640, scheme: "light", tag: "360x640" },
  ];
  const snap = async (name: string) => {
    await 안내_띠_닫기(page); // 로그인 안 한 기기에만 뜨는 띠 — 실제 사용자는 보지 않는다
    for (const s of shots) {
      await page.setViewportSize({ width: s.w, height: s.h });
      await page.emulateMedia({ colorScheme: s.scheme });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${name}-${s.tag}.png`, fullPage: true });
    }
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await 요약_재료(page);
  await page.waitForTimeout(800);
  await snap("summary");
  // 화면 단위 캡처 — 전체 길이 캡처는 sticky 「완료」 바가 부가 행동 줄을 덮는다(P2 /qa code L-7).
  // 첫 종목의 「PR n」 을 펼친 채 끝까지 내린 실제 뷰포트를 남긴다.
  await page.getByTestId("summary-row-pr").first().click();
  for (const s of shots) {
    await page.setViewportSize({ width: s.w, height: s.h });
    await page.emulateMedia({ colorScheme: s.scheme });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/summary-end-${s.tag}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("btn-summary-close").click();
  await page.goto("/history");
  await page.getByTestId("history-list").locator("a").first().click();
  await page.getByTestId("detail-exercises").waitFor({ timeout: 20_000 });
  await snap("detail");
  await page.goto("/stats");
  await page.getByTestId("stat-volume").waitFor({ timeout: 20_000 });
  await snap("stats");
});

// P3 — 홈(진행 중)·피드 운동 카드·칸 시트. 피드는 내 글도 팔로잉 목록에 보인다(로그인 필요).
test("홈·피드·칸 시트 캡처 — 390 라이트·다크 · 360×640", async ({ page }) => {
  test.skip(!OUT, "DECLUTTER_SHOTS 가 없으면 건너뛴다");
  test.setTimeout(360_000);
  const shots: { w: number; h: number; scheme: "light" | "dark"; tag: string }[] = [
    { w: 390, h: 844, scheme: "light", tag: "390-light" },
    { w: 390, h: 844, scheme: "dark", tag: "390-dark" },
    { w: 360, h: 640, scheme: "light", tag: "360x640" },
  ];
  const snap = async (name: string, top = true) => {
    for (const s of shots) {
      await page.setViewportSize({ width: s.w, height: s.h });
      await page.emulateMedia({ colorScheme: s.scheme });
      if (top) await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${name}-${s.tag}.png` });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "light" });
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(`e2e-dcshots-${Date.now()}@example.com`);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill("정리캡처");
  await page.getByTestId("btn-auth-submit").click();
  await page.getByTestId("auth-email").waitFor({ timeout: 20_000 });
  await 카탈로그_준비(page);
  // 지난 기록 — 머신 체스트 프레스(테크노짐) + 벤치 → 공유
  await page.goto("/");
  await page.getByTestId("btn-quick-start").click();
  for (const [name, kg, reps] of [
    ["머신 체스트 프레스", 40, 10],
    ["바벨 벤치프레스", 60, 10],
  ] as const) {
    await page.getByTestId("btn-add-exercise").click();
    await page.getByTestId("picker-search").fill(name);
    await page.getByTestId("picker-list").locator("button").first().click();
    await page.getByTestId("exercise-picker").waitFor({ state: "detached" });
    const i = (await page.getByTestId("set-list").count()) - 1;
    const row = page.getByTestId("set-list").nth(i).locator("> div").first();
    if (name === "머신 체스트 프레스") {
      await page.getByTestId("variant-trigger").nth(i).click();
      await page.getByTestId("slot-brand-technogym").click();
      await page
        .getByTestId("variant-sheet")
        .locator("xpath=..")
        .locator('button[aria-label="닫기"]')
        .click({ position: { x: 5, y: 5 } });
    }
    await row.getByTestId("set-weight").fill(String(kg));
    await row.getByTestId("set-reps").fill(String(reps));
    await row.getByTestId("set-reps").blur();
    await row.getByTestId("set-done").click();
  }
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await page.getByTestId("summary-volume").waitFor({ timeout: 15_000 });
  const skip = page.getByTestId("btn-finish-dont-save");
  if (await skip.isVisible()) await skip.click();
  await page.getByTestId("btn-summary-share").click();
  await page.getByTestId("btn-share-workout").click();
  await page.waitForTimeout(1500);
  await page.getByTestId("btn-summary-close").click();
  await page.goto("/feed");
  await page.getByTestId("post-workout").first().waitFor({ timeout: 20_000 });
  await snap("feed");
  // 홈 — 진행 중 운동이 있는 상태
  await page.goto("/");
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("머신 체스트 프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("exercise-picker").waitFor({ state: "detached" });
  // 칸 시트
  await page.getByTestId("variant-trigger").first().click();
  await page.getByTestId("variant-sheet").waitFor();
  await snap("sheet", false);
  await page
    .getByTestId("variant-sheet")
    .locator("xpath=..")
    .locator('button[aria-label="닫기"]')
    .click({ position: { x: 5, y: 5 } });
  await page.goto("/");
  await page.getByTestId("global-workout-bar").waitFor({ timeout: 20_000 });
  await snap("home");
});

// P4 — P1~P3 에서 다루지 않은 나머지 화면 전부(SRS-072). 한 화면이 실패해도 나머지는 찍는다(실패는 목록으로 남김).
test("나머지 화면 캡처 — 390 라이트·다크 · 360×640", async ({ page, browser }) => {
  test.skip(!OUT, "DECLUTTER_SHOTS 가 없으면 건너뛴다");
  test.setTimeout(900_000);
  const shots: { w: number; h: number; scheme: "light" | "dark"; tag: string }[] = [
    { w: 390, h: 844, scheme: "light", tag: "390-light" },
    { w: 390, h: 844, scheme: "dark", tag: "390-dark" },
    { w: 360, h: 640, scheme: "light", tag: "360x640" },
  ];
  const failed: string[] = [];
  const snapOf = async (p: typeof page, name: string, opts: { full?: boolean; top?: boolean } = {}) => {
    for (const s of shots) {
      await p.setViewportSize({ width: s.w, height: s.h });
      await p.emulateMedia({ colorScheme: s.scheme });
      if (opts.top !== false) await p.evaluate(() => window.scrollTo(0, 0));
      await p.waitForTimeout(500);
      await p.screenshot({ path: `${OUT}/${name}-${s.tag}.png`, fullPage: opts.full ?? true });
    }
    await p.setViewportSize({ width: 390, height: 844 });
    await p.emulateMedia({ colorScheme: "light" });
  };
  const shot = async (
    name: string,
    go: () => Promise<void>,
    opts: { full?: boolean; top?: boolean } = {},
  ) => {
    try {
      await go();
      await snapOf(page, name, opts);
    } catch (e) {
      failed.push(`${name}: ${String(e).split("\n")[0]}`);
    }
  };

  // 로그인 전 화면(새 컨텍스트)
  const anon = await browser.newPage();
  for (const [name, path, wait] of [
    ["signin", "/signin", "btn-auth-submit"],
    ["signup", "/signup", "btn-auth-submit"],
    ["offline", "/offline", "offline-page"],
  ] as const) {
    try {
      await anon.goto(path);
      await anon.getByTestId(wait).first().waitFor({ timeout: 20_000 });
      await snapOf(anon, name, { full: false });
    } catch (e) {
      failed.push(`${name}: ${String(e).split("\n")[0]}`);
    }
  }
  await anon.close();

  // 가입 + 재료
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(`e2e-dcp4-${Date.now()}@example.com`);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill("정리점검");
  await page.getByTestId("btn-auth-submit").click();
  await page.getByTestId("auth-email").waitFor({ timeout: 20_000 });
  await 카탈로그_준비(page);
  await 지난_기록_채우기(page);

  // 루틴 하나(폴더 포함)
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await page.getByTestId("routine-name").waitFor({ timeout: 20_000 });
  await page.getByTestId("routine-name").fill("가슴·삼두 A");
  await page.getByTestId("routine-name").blur();
  for (const n of ["바벨 벤치프레스", "케이블 푸시다운", "덤벨 플라이"]) {
    await page.getByTestId("btn-add-routine-exercise").click();
    await page.getByTestId("picker-search").fill(n);
    await page.getByTestId("picker-list").locator("button").first().click();
    await page.getByTestId("exercise-picker").waitFor({ state: "detached" });
  }
  await page.waitForTimeout(600);
  await shot("routine-editor", async () => {}, { full: true });
  await page.getByTestId("btn-routine-done").click();
  await page.getByTestId("routine-list").waitFor({ timeout: 20_000 });
  await shot("routines-home", async () => {
    await page.goto("/");
    await page.getByTestId("routine-list").waitFor({ timeout: 20_000 });
  });

  // 종목 탭·검색·상세
  await shot(
    "exercises",
    async () => {
      await page.goto("/exercises");
      await page.getByTestId("sync-state").waitFor();
    },
    { full: false },
  );
  await shot(
    "exercises-search",
    async () => {
      await page.getByTestId("search-input").fill("랫풀");
      await page.waitForTimeout(600);
    },
    { full: false },
  );
  await shot("exercise-detail", async () => {
    await page.goto("/exercises");
    await page.getByTestId("search-input").fill("바벨 벤치프레스");
    await page.waitForTimeout(600);
    await page.locator('[data-testid^="exercise-seed-"]').first().click();
    await page.waitForURL(/\/exercise\//, { timeout: 20_000 });
    await page.waitForTimeout(1200);
  });

  // 프로그램 생성
  await shot("program", async () => {
    await page.goto("/program");
    await page.waitForTimeout(1500);
  });

  // 기록·캘린더·분석
  await shot("history", async () => {
    await page.goto("/history");
    await page.getByTestId("history-list").waitFor({ timeout: 20_000 });
  });
  await shot("calendar", async () => {
    await page.goto("/calendar");
    await page.getByTestId("month-label").waitFor({ timeout: 20_000 });
  });
  await shot("stats-full", async () => {
    await page.goto("/stats");
    await page.getByTestId("stat-volume").waitFor({ timeout: 20_000 });
  });

  // 공유 글 하나 → 작성기·게시물·댓글
  await page.goto("/");
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("exercise-picker").waitFor({ state: "detached" });
  {
    const row = page.getByTestId("set-list").first().locator("> div").first();
    await row.getByTestId("set-weight").fill("70");
    await row.getByTestId("set-reps").fill("8");
    await row.getByTestId("set-reps").blur();
    await row.getByTestId("set-done").click();
  }
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await page.getByTestId("summary-volume").waitFor({ timeout: 15_000 });
  for (const id of ["btn-finish-dont-save", "btn-finish-today"]) {
    const b = page.getByTestId(id);
    if (await b.isVisible()) await b.click();
  }
  await page.getByTestId("btn-summary-share").click();
  await page.getByTestId("btn-share-workout").click();
  await page.waitForTimeout(1500);
  await page.getByTestId("btn-summary-close").click();
  await shot(
    "composer",
    async () => {
      await page.goto("/feed");
      await page.getByTestId("feed-compose").click();
      await page.getByTestId("feed-composer").waitFor({ timeout: 10_000 });
    },
    { full: false },
  );
  await page.goto("/feed");
  await shot("post-detail", async () => {
    await page.goto("/feed");
    await page.getByTestId("post-comments").first().click({ timeout: 20_000 });
    await page.waitForURL(/\/feed\/.+/, { timeout: 20_000 });
    await page.getByTestId("comment-input").fill("자세 좋네요");
    await page.getByTestId("comment-post").click();
    await page.waitForTimeout(1200);
  });

  // DM·알림·남의 프로필
  await shot("messages", async () => {
    await page.goto("/messages");
    await page.waitForTimeout(1500);
  });
  await shot("notifications", async () => {
    await page.goto("/notifications");
    await page.waitForTimeout(1500);
  });

  // 프로필·계정·장비함·헬스장·코칭·피드백
  for (const [name, path] of [
    ["profile", "/profile"],
    ["account", "/account"],
    ["gear", "/gear"],
    ["gyms", "/gyms"],
    ["coaching", "/coaching"],
    ["feedback", "/feedback"],
    ["discover", "/discover"],
    ["bookmarks", "/bookmarks"],
  ] as const) {
    await shot(name, async () => {
      await page.goto(path);
      await page.waitForTimeout(1800);
    });
  }
  await shot("other-profile", async () => {
    await page.goto("/profile");
    const me = page.locator('a[href^="/u/"]').first();
    if (await me.count()) await me.click();
    else throw new Error("프로필 링크 없음");
    await page.waitForURL(/\/u\//, { timeout: 20_000 });
    await page.waitForTimeout(1500);
  });

  // 피커(운동 중)
  await shot(
    "picker",
    async () => {
      await page.goto("/");
      await page.getByTestId("btn-quick-start").click();
      await page.getByTestId("btn-add-exercise").click();
      await page.getByTestId("picker-search").fill("랫 풀");
      await page.waitForTimeout(800);
    },
    { full: false },
  );

  console.log(`P4 캡처 실패 ${failed.length}건\n${failed.join("\n")}`);
});

// P4 — 로그인해야 보이는 화면만(가입 직후 바로). 공유 글 → 게시물·댓글 · 알림 · DM · 남의(내) 프로필 · 코칭 · 계정.
test("나머지 화면 캡처(로그인) — 390 라이트·다크 · 360×640", async ({ page }) => {
  test.skip(!OUT, "DECLUTTER_SHOTS 가 없으면 건너뛴다");
  test.setTimeout(600_000);
  const shots: { w: number; h: number; scheme: "light" | "dark"; tag: string }[] = [
    { w: 390, h: 844, scheme: "light", tag: "390-light" },
    { w: 390, h: 844, scheme: "dark", tag: "390-dark" },
    { w: 360, h: 640, scheme: "light", tag: "360x640" },
  ];
  const failed: string[] = [];
  const shot = async (name: string, go: () => Promise<void>, full = true) => {
    try {
      await go();
      for (const s of shots) {
        await page.setViewportSize({ width: s.w, height: s.h });
        await page.emulateMedia({ colorScheme: s.scheme });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT}/${name}-${s.tag}.png`, fullPage: full });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: "light" });
    } catch (e) {
      failed.push(`${name}: ${String(e).split("\n")[0]}`);
    }
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(`e2e-dcp4b-${Date.now()}@example.com`);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill("정리점검");
  await page.getByTestId("btn-auth-submit").click();
  await page.getByTestId("auth-email").waitFor({ timeout: 20_000 });
  await shot("account", async () => {
    await page.waitForTimeout(800);
  });
  await 카탈로그_준비(page);
  // 공유 글
  await page.goto("/");
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("exercise-picker").waitFor({ state: "detached" });
  {
    const row = page.getByTestId("set-list").first().locator("> div").first();
    await row.getByTestId("set-weight").fill("70");
    await row.getByTestId("set-reps").fill("8");
    await row.getByTestId("set-reps").blur();
    await row.getByTestId("set-done").click();
  }
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await page.getByTestId("summary-volume").waitFor({ timeout: 15_000 });
  for (const id of ["btn-finish-dont-save", "btn-finish-today"]) {
    const b = page.getByTestId(id);
    if (await b.isVisible()) await b.click();
  }
  await page.getByTestId("btn-summary-share").click();
  await page.getByTestId("btn-share-workout").click();
  await page.waitForTimeout(1500);
  await page.getByTestId("btn-summary-close").click();
  await shot("post-detail", async () => {
    await page.goto("/feed");
    await page.getByTestId("post-comments").first().click({ timeout: 20_000 });
    await page.waitForURL(/\/feed\/.+/, { timeout: 20_000 });
    await page.getByTestId("comment-input").fill("자세 좋네요");
    await page.getByTestId("comment-post").click();
    await page.waitForTimeout(1200);
  });
  for (const [name, path] of [
    ["notifications", "/notifications"],
    ["messages", "/messages"],
    ["coaching", "/coaching"],
    ["gyms", "/gyms"],
    ["bookmarks", "/bookmarks"],
    ["discover", "/discover"],
    ["feedback", "/feedback"],
  ] as const) {
    await shot(name, async () => {
      await page.goto(path);
      await page.waitForTimeout(1800);
    });
  }
  await shot("other-profile", async () => {
    await page.goto("/feed");
    await page.getByTestId("post-author").first().click({ timeout: 20_000 });
    await page.waitForURL(/\/u\//, { timeout: 20_000 });
    await page.waitForTimeout(1500);
  });
  console.log(`P4(로그인) 캡처 실패 ${failed.length}건\n${failed.join("\n")}`);
});
