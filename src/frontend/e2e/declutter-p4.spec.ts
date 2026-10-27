// 화면 정리 P4(SRS-072) — 나머지 화면이 공용 규칙(색 의미 2개 · 점선 밑줄 금지 · 빨강 채움 화면당 1개 · 글자 꺾임 없음)을
// 따르는지 잰다. 생김새가 아니라 계산된 스타일로 본다 — 사람이 캡처를 보고 찾은 위반을 다시 생기지 않게 막는 가드.
import { expect, test } from "@playwright/test";
import { 지난_기록_채우기, 카탈로그_준비 } from "./fixtures/declutter-seed";

type Page = import("@playwright/test").Page;

/** 브랜드(빨강) 계열인가 — 토큰 값을 화면에서 읽어 비교한다(라이트·다크 어느 쪽이든). */
async function brandRgb(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.createElement("span");
    el.style.color = "var(--color-brand)";
    document.body.appendChild(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  });
}

/** 화면에 보이는 「배경이 브랜드색으로 채워진」 버튼 수(하단 탭바·진행 막대 제외 — 그건 셸이다). */
async function filledBrandButtons(page: Page): Promise<number> {
  const brand = await brandRgb(page);
  return page.evaluate((brand) => {
    const shell = (el: Element) =>
      el.closest('[data-testid="shell-nav"]') || el.closest('[data-testid="global-workout-bar"]');
    return [...document.querySelectorAll("main button, main a")].filter((el) => {
      if (shell(el)) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      return getComputedStyle(el).backgroundColor === brand;
    }).length;
  }, brand);
}

/** 강조색(브랜드 빨강·경고 빨강)이 이 요소의 글자·바탕·보이는 테두리 어디에라도 쓰였나(/qa P4 M-4).
 *  속성 하나만 재면 다른 형태(분홍 바탕·빨강 테두리)로 되돌아가는 회귀를 놓친다. */
async function accentUse(page: Page, testId: string): Promise<string[]> {
  return page
    .getByTestId(testId)
    .first()
    .evaluate((el) => {
      const probe = (v: string) => {
        const s = document.createElement("span");
        s.style.color = v;
        document.body.appendChild(s);
        const c = getComputedStyle(s).color;
        s.remove();
        return c;
      };
      const accents = new Set([probe("var(--color-brand)"), probe("var(--color-bad)")]);
      const muted = probe("var(--color-brand-muted)");
      const hits: string[] = [];
      const nodes = [el, ...el.querySelectorAll("*")] as Element[];
      for (const n of nodes) {
        const cs = getComputedStyle(n);
        if (accents.has(cs.color)) hits.push(`color:${n.tagName}`);
        if (accents.has(cs.backgroundColor) || cs.backgroundColor === muted) hits.push(`bg:${n.tagName}`);
        if (Number.parseFloat(cs.borderTopWidth) > 0 && accents.has(cs.borderTopColor))
          hits.push(`border:${n.tagName}`);
        if (n instanceof SVGElement && (accents.has(cs.stroke) || accents.has(cs.fill)))
          hits.push(`svg:${n.tagName}`);
      }
      return hits;
    });
}

async function 가입(page: Page) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(`e2e-dcp4m-${Date.now()}@example.com`);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill("정리측정");
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

test.use({ viewport: { width: 390, height: 844 } });

test("기록 목록·달력의 PR 은 칩이 아니라 금색 글자다", async ({ page }) => {
  test.setTimeout(240_000);
  await 카탈로그_준비(page);
  await 지난_기록_채우기(page);
  for (const path of ["/history", "/calendar"]) {
    await page.goto(path);
    const pr = page.getByText(/^PR \d+$/).first();
    await expect(pr).toBeVisible({ timeout: 20_000 });
    const bg = await pr.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg, `${path} PR 배경`).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  }
});

test("숫자 스테퍼 값에 점선 밑줄이 없다(루틴 편집·프로필)", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await page.getByTestId("routine-name").fill("측정 루틴");
  await page.getByTestId("routine-name").blur();
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("routine-exercises").locator("> div")).toHaveCount(1, { timeout: 20_000 });
  // 슈퍼셋 버튼은 종목이 둘 이상일 때만 보인다 — 하나 더 담아 셋 다 잰다(/qa P4 M-4)
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("케이블 푸시다운");
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("routine-exercises").locator("> div")).toHaveCount(2, { timeout: 20_000 });
  const value = page.getByTestId("re-sets-value").first();
  await expect(value).toBeVisible();
  expect(await value.evaluate((el) => getComputedStyle(el).borderBottomStyle)).not.toBe("dashed");

  // 종목 줄의 부가 행동(슈퍼셋·대체·삭제)은 빨강이 아니다 — 빨강은 이 화면의 주 행동 하나에만.
  // [원본] 대체 글자색 하나만 쟀다 — 슈퍼셋·삭제가 빨강으로 돌아가도 통과했다(/qa P4 M-4)
  for (const id of ["btn-re-swap", "btn-re-superset", "btn-re-remove"]) {
    expect(await accentUse(page, id), `${id} 강조색`).toEqual([]);
  }

  await page.goto("/profile");
  const bw = page.getByTestId("bodyweight-value");
  await expect(bw).toBeVisible({ timeout: 20_000 });
  expect(await bw.evaluate((el) => getComputedStyle(el).borderBottomStyle)).not.toBe("dashed");
});

test("루틴이 있는 홈 — 빨강 채움 버튼은 하나(오늘 할 루틴 시작 · M-2)", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await page.getByTestId("routine-name").fill("측정 루틴");
  await page.getByTestId("routine-name").blur();
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("routine-exercises").locator("> div")).toHaveCount(1, { timeout: 20_000 });
  await page.getByTestId("btn-routine-done").click();
  await expect(page.getByTestId("routine-list")).toContainText("측정 루틴", { timeout: 20_000 });
  await page.goto("/");
  await expect(page.getByTestId("btn-start-routine").first()).toBeVisible({ timeout: 20_000 });
  // [원본] 표시 직후 개수만 쟀다 — 판단 전 0개·빠른 시작이 빨강인 순간에 걸려 틀린 버튼으로도 통과했다(/qa M-2 M-6-4)
  // expect(await filledBrandButtons(page)).toBe(1);
  // [개선] 판단 표식을 기다린 뒤 개수를 잰다 — 어느 버튼인지는 home-primary.spec 이 고정한다
  await expect(page.getByTestId("home-ready")).toHaveCount(1, { timeout: 20_000 });
  await expect(page.getByTestId("btn-start-next")).toBeVisible();
  expect(await filledBrandButtons(page)).toBe(1);
});

test("종목 탭 「종목 찾기 도우미」·종목 상세 주동근은 빨강이 아니다", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  const brand = await brandRgb(page);
  const wizard = page.getByTestId("btn-wizard");
  await expect(wizard).toBeVisible();
  // [원본] 테두리 색만 쟀다(폭 0 이라 늘 currentColor) — 분홍 바탕·빨강 글자로 돌아가도 통과했다(/qa P4 M-4)
  expect(await accentUse(page, "btn-wizard"), "도우미 강조색").toEqual([]);

  await page.getByTestId("search-input").fill("바벨 벤치프레스");
  await page.locator('[data-testid^="exercise-seed-"]').first().click();
  await expect(page).toHaveURL(/\/exercise\//, { timeout: 20_000 });
  const chip = page.getByTestId("detail-primary-muscle").first();
  await expect(chip).toBeVisible({ timeout: 20_000 });
  expect(await chip.evaluate((el) => getComputedStyle(el).color)).not.toBe(brand);
});

test("계정 — 로그아웃은 빨강 테두리가 아니고, 백업 버튼 글자는 한 줄이다(360폭)", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 640 });
  await 가입(page);
  const out = page.getByTestId("btn-logout");
  await expect(out).toBeVisible();
  // [원본] 테두리 값을 모으고 단언하지 않았다(죽은 코드) — 글자·바탕·테두리 전부 본다(/qa P4 M-4)
  expect(await accentUse(page, "btn-logout"), "로그아웃 강조색").toEqual([]);
  await 백업_버튼_검사(page);
  // 420·440폭 — 예전 420px 분기에서 나란히 놓이며 카드 밖으로 넘쳤다(/qa P4 M-3)
  for (const width of [420, 440]) {
    await page.setViewportSize({ width, height: 800 });
    await 백업_버튼_검사(page, `${width}px`);
  }
});

async function 백업_버튼_검사(page: Page, tag = "360px") {
  const card = await page.getByTestId("backup-card").boundingBox();
  for (const id of ["btn-backup-export", "btn-backup-import"]) {
    const b = page.getByTestId(id);
    await b.scrollIntoViewIfNeeded();
    // 글자 노드의 줄 상자 수 — 꺾이면 줄마다 사각형이 하나씩 생긴다(버튼 높이로 재면 패딩이 섞인다).
    const lines = await b.evaluate((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && (node.textContent ?? "").trim().length < 2) node = walker.nextNode();
      if (!node) return 0;
      const range = document.createRange();
      range.selectNodeContents(node);
      const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
      return tops.size;
    });
    expect(lines, `${tag} ${id} 글자 줄 수`).toBe(1);
    const fits = await b.evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(fits, `${tag} ${id} 글자 넘침`).toBe(true);
    const r = await b.boundingBox();
    expect(card && r && r.x + r.width <= card.x + card.width + 0.5, `${tag} ${id} 카드 안`).toBe(true);
  }
}

test("폴더 안 루틴·오늘 카드가 있어도 홈의 빨강 채움은 하나", async ({ page }) => {
  // /qa P4 M-1 — 루틴을 폴더에 넣고(펼침) 오늘 요일에 배정하면 「시작」 버튼이 셋이 된다. 전부 회색이어야 한다.
  test.setTimeout(240_000);
  await 카탈로그_준비(page);
  const 이름 = `폴더루틴${Date.now().toString(36)}`;
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await page.getByTestId("routine-name").fill(이름);
  await page.getByTestId("routine-name").blur();
  await page.getByTestId("routine-folder").fill("상체");
  await page.getByTestId("routine-folder").blur();
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("routine-exercises").locator("> div")).toHaveCount(1, { timeout: 20_000 });
  await page.getByTestId("btn-routine-done").click();

  // 오늘 요일에 배정 — 오늘 카드(TodayCard)가 뜬다.
  await page.goto("/");
  await page.getByTestId("entry-schedule").click();
  await expect(page.getByTestId("schedule-editor")).toBeVisible({ timeout: 20_000 });
  const today = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];
  await page.getByTestId(`schedule-day-${today}`).click();
  await page.getByTestId("schedule-day-picker").getByText(이름).click();
  await page.getByTestId("schedule-save").click();
  await expect(page.getByTestId("schedule-editor")).toHaveCount(0, { timeout: 20_000 });

  await page.getByTestId("folder-toggle").first().click();
  await expect(page.getByTestId("btn-start-folder-routine").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("btn-start-today")).toBeVisible();
  expect(await filledBrandButtons(page)).toBe(1);
});
