// 누를 수 있는 값 = 옅은 칩 e2e(SPEC-046 · SRS-111)
//
// Phase 2 — 다른 화면: 달력 「오늘」 칩(라이트·다크 · 들썩임 없음) · kg│lb 둘로 나뉜 토글(다크) · 기록 상세 ✎ 칩
//   (최근 PR 줄 → 기록은 declutter-summary · 잠금 스위치는 lock-bridge · 체중 그래프 안내는 opengym-bodyweight
//    · 「단계 보기」 칩은 pictogram · 루틴 번호 ▾ 는 set-table 에)
// Phase 1 — 운동 중 세트 줄:
//   · 「이전」 칩은 옅은 바탕(surface-alt) · 누르는 자리 44px · 이름에 기호(↙ ×)가 아닌 말 · 누르면 채움 · 마친 세트는 바탕 없음
//   · 기록이 없는 「이전」은 바탕 없음(눌리지 않으면 바탕 없음)
//   · PR 은 금색 옅은 바탕(pr-soft) · 세트 번호는 테두리 없는 ▾(글자는 그대로)
//   · 휴식·메모는 칩 바탕 · 세트 방식 이름(빨강)을 누르면 세트 방식 시트
//   · 다크 모드에서도 같은 토큰을 쓴다
import { expect, test, type Page } from "@playwright/test";

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
}

async function 빠른_운동(page: Page, 검색: string) {
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill(검색);
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  await expect(page.getByTestId("exercise-picker")).toHaveCount(0);
}

const 세트 = (page: Page, i: number) =>
  page
    .getByTestId("workout-exercises")
    .locator("> div")
    .first()
    .getByTestId("set-list")
    .locator("> div")
    .nth(i);

async function 세트_기록(page: Page, i: number, kg: number, reps: number) {
  const row = 세트(page, i);
  await row.getByTestId("set-weight").fill(String(kg));
  await row.getByTestId("set-reps").fill(String(reps));
  await row.getByTestId("set-reps").blur();
  await row.getByTestId("set-done").click();
  await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
}

async function 마치기(page: Page) {
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 15_000 });
  for (const id of ["btn-finish-dont-save", "btn-finish-today"]) {
    const b = page.getByTestId(id);
    if (await b.isVisible()) await b.click();
  }
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

/** 토큰 계산값 */
async function 토큰(page: Page, v: string): Promise<string> {
  return page.evaluate((v) => {
    const s = document.createElement("span");
    s.style.backgroundColor = v;
    document.body.appendChild(s);
    const c = getComputedStyle(s).backgroundColor;
    s.remove();
    return c;
  }, v);
}

/** 그 요소 안 칩 바탕(data-chip-face) 색 */
async function 칩바탕(page: Page, testId: string, scope = page.locator("body")): Promise<string> {
  return scope
    .getByTestId(testId)
    .first()
    .evaluate((el) => {
      // 칩 바탕이 없어지면(구조 회귀) 바깥 버튼의 투명을 재서 거짓 통과하지 않게 — 없으면 실패(P1 코드 리뷰 접근성 1)
      const face = el.querySelector("[data-chip-face]");
      if (!face) throw new Error("칩 바탕(data-chip-face) 없음");
      return getComputedStyle(face).backgroundColor;
    });
}

const 투명 = "rgba(0, 0, 0, 0)";

for (const scheme of ["light", "dark"] as const)
  test(`「이전」·PR·세트 번호·휴식·메모 — 칩 모양 · 이름 · 누르면 채움 · 마친 세트는 바탕 없음(${scheme})`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ colorScheme: scheme });
    await 카탈로그_준비(page);

    // 지난 기록이 없을 때 — 「이전」은 바탕 없음
    await 빠른_운동(page, "데드리프트");
    const none = 세트(page, 0).getByTestId("set-prev");
    expect(await 칩바탕(page, "set-prev", 세트(page, 0))).toBe(투명);
    await expect(none).toHaveAttribute("aria-label", "이전 기록 없음");
    await 세트_기록(page, 0, 140, 3);
    await 마치기(page);

    // 다시 시작하면 지난 기록이 칩으로
    await 빠른_운동(page, "데드리프트");
    const row = 세트(page, 0);
    const prev = row.getByTestId("set-prev");
    await expect(prev).toContainText("140×3", { timeout: 15_000 });
    const alt = await 토큰(page, "var(--color-surface-alt)");
    expect(await 칩바탕(page, "set-prev", row)).toBe(alt);
    // 이름은 말로 — 기호(×·↙)를 읽지 않는다
    const name = (await prev.getAttribute("aria-label")) ?? "";
    expect(name).toMatch(/^이전 .*채우기$/);
    expect(name).not.toMatch(/[×↙]/);
    // [원본] 누르는 자리 44px · 칸 너비 그대로(66px)
    // [개선] 칸 너비 52px — 여유 칸 자리를 이전 칸에서 냈다(SPEC-055 Phase 3)
    const box = await prev.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    // [원본] expect(Math.round(box?.width ?? 0)).toBe(66);
    // [원본] expect(Math.round(box?.width ?? 0)).toBe(52);
    // [개선] 64px — 「102.5×12」 가 한 줄에 들어가게 ✓·⌄ 겉보기와 칸 사이를 줄여 냈다(REV H-1)
    expect(Math.round(box?.width ?? 0)).toBe(64);

    // PR 칩 — 금색 옅은 바탕 · 테두리 없음
    const pr = page.getByTestId("pr-chip-both");
    await expect(pr).toContainText("PR");
    expect(await 칩바탕(page, "pr-chip-both")).toBe(await 토큰(page, "var(--color-pr-soft)"));
    expect(
      await pr.evaluate(
        (el) => getComputedStyle(el.querySelector("[data-chip-face]") as Element).borderTopWidth,
      ),
    ).toBe("0px");

    // 세트 번호 — 테두리 없음 · ▾(그림) · 글자는 번호 그대로 · 이름
    const type = row.getByTestId("set-type");
    await expect(type).toHaveText("1");
    await expect(type.locator("svg")).toHaveCount(1);
    await expect(type).toHaveAttribute("aria-haspopup", "dialog");
    expect(
      await type.evaluate((el) => getComputedStyle(el.firstElementChild as Element).borderTopWidth),
    ).toBe("0px");

    // 휴식·메모 — 칩 바탕 · 바깥 44px 그대로
    expect(await 칩바탕(page, "btn-rest-setting")).toBe(alt);
    expect(await 칩바탕(page, "btn-note-open")).toBe(alt);
    for (const id of ["btn-rest-setting", "btn-note-open"])
      expect((await page.getByTestId(id).first().boundingBox())?.height ?? 0, id).toBeGreaterThanOrEqual(44);
    expect((await type.boundingBox())?.height ?? 0, "set-type").toBeGreaterThanOrEqual(44);
    await expect(type).toHaveAttribute("aria-label", "1세트 종류 바꾸기");

    // 누르면 채움 → 마친 세트는 바탕 없음
    await prev.click();
    await expect(row.getByTestId("set-weight")).toHaveValue("140");
    await expect(row.getByTestId("set-reps")).toHaveValue("3");
    await row.getByTestId("set-done").click();
    await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => 칩바탕(page, "set-prev", row)).toBe(투명);
    // 마친 세트 이름엔 「채우기」가 없다
    await expect(prev).toHaveAttribute("aria-label", /^이전 140kg 3회$/);
    // 채울 세트가 없으면 PR 은 바탕 없음 · 누르면 「세트를 추가하세요」 안내(이름도 그렇게)
    await expect.poll(() => 칩바탕(page, "pr-chip-both")).toBe(투명);
    await expect(pr).toHaveAttribute("aria-disabled", "true");
    await expect(pr).toHaveAttribute("aria-label", /채울 세트가 없어요/);
    await pr.click({ force: true }); // aria-disabled 라 Playwright 는 눌리지 않는 것으로 본다 — 실제로는 안내를 띄운다
    await expect(page.getByTestId("toast-root")).toContainText("채울 세트가 없어요");
  });

test("유산소 「이전」 — 근력과 같은 칩 · 마친 세트는 바탕 없음", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await 빠른_운동(page, "러닝머신");
  const row = page.getByTestId("cardio-row").first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  expect(await 칩바탕(page, "cardio-prev", row)).toBe(투명);
  await expect(row.getByTestId("cardio-prev")).toHaveAttribute("aria-label", "이전 기록 없음");
  await row.getByTestId("cardio-duration").fill("20");
  await row.getByTestId("cardio-distance").fill("3");
  await row.getByTestId("cardio-distance").blur();
  await row.getByTestId("cardio-done").click();
  await 마치기(page);

  await 빠른_운동(page, "러닝머신");
  const row2 = page.getByTestId("cardio-row").first();
  const prev = row2.getByTestId("cardio-prev");
  await expect(prev).not.toHaveText("–", { timeout: 15_000 });
  expect(await 칩바탕(page, "cardio-prev", row2)).toBe(await 토큰(page, "var(--color-surface-alt)"));
  await expect(prev).toHaveAttribute("aria-label", /^이전 .*채우기$/);
  // 빨강·분홍 상자가 아니다(예전 모양)
  expect(
    await prev.evaluate((el) => getComputedStyle(el.querySelector("[data-chip-face] *") as Element).color),
  ).not.toBe(
    await page.evaluate(() => {
      const s = document.createElement("span");
      s.style.color = "var(--color-brand)";
      document.body.appendChild(s);
      const c = getComputedStyle(s).color;
      s.remove();
      return c;
    }),
  );
});

test("빨간 세트 방식 이름을 누르면 세트 방식 시트 — ⋯ 메뉴와 같은 시트", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await page.goto("/");
  await expect(page.getByTestId("btn-new-routine")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-new-routine").click();
  await page.getByTestId("routine-name").fill("칩 5x5");
  await page.getByTestId("routine-name").blur();
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 스쿼트");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  const 표 = page.getByTestId("set-table").first();
  await expect(표).toBeVisible({ timeout: 15_000 });
  await 표.getByTestId("scheme-chip").click();
  await page.getByTestId("scheme-fiveByFive").click();
  await expect(표.getByTestId("scheme-chip")).toHaveAttribute("data-scheme", "fiveByFive");
  await page.getByTestId("btn-routine-done").click();
  const 행 = page
    .getByTestId("routine-list")
    .locator("[data-testid^=routine-]")
    .filter({ hasText: "칩 5x5" })
    .first();
  await expect(행).toBeVisible({ timeout: 20_000 });
  await 행.getByTestId("btn-start-routine").click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });

  const 블록 = page.getByTestId("workout-exercises").locator("> div").first();
  await expect(블록.getByTestId("we-scheme")).toHaveAttribute("data-scheme", "fiveByFive", {
    timeout: 20_000,
  });
  const btn = 블록.getByTestId("btn-scheme-name");
  await expect(btn).toHaveAttribute("aria-haspopup", "dialog");
  // 블록 머리의 빨강은 세트 방식 이름 글자뿐(꺾쇠는 회색 · 전 채널) — 다른 머리 요소가 빨강으로 돌아가면 잡는다
  const reds = await 블록.evaluate((card) => {
    const p = document.createElement("span");
    p.style.color = "var(--color-brand)";
    document.body.appendChild(p);
    const brand = getComputedStyle(p).color;
    p.remove();
    const setList = card.querySelector('[data-testid="set-list"]');
    const out: string[] = [];
    for (const el of Array.from(card.querySelectorAll("*"))) {
      if (setList?.contains(el) || el.closest('[data-testid="we-picto"]')) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const hit =
        cs.color === brand ||
        cs.backgroundColor === brand ||
        (Number.parseFloat(cs.borderTopWidth) > 0 && cs.borderTopColor === brand) ||
        (el instanceof SVGElement && (cs.fill === brand || cs.stroke === brand));
      if (!hit) continue;
      const inName = !!el.closest('[data-testid="btn-scheme-name"]');
      if (!inName || el instanceof SVGElement || el.closest("svg")) out.push(el.tagName);
    }
    return out;
  });
  expect(reds).toEqual([]);

  await btn.click();
  await expect(page.getByTestId("we-scheme-sheet")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("we-scheme-topBackoff")).toBeVisible();
  // ⋯ 메뉴로 연 시트와 같은 시트(같은 testid · 같은 선택지 수)
  const n = await page.locator('[data-testid^="we-scheme-"]').count();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("we-scheme-sheet")).toHaveCount(0);
  await 블록.getByTestId("btn-we-menu").click();
  await page.getByTestId("btn-change-scheme").click();
  await expect(page.getByTestId("we-scheme-sheet")).toBeVisible({ timeout: 10_000 });
  expect(await page.locator('[data-testid^="we-scheme-"]').count()).toBe(n);
});

for (const scheme of ["light", "dark"] as const)
  test(`달력 — 다른 달이면 「오늘」 칩 · 누르면 이번 달로 · 달력이 들썩이지 않음(${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/calendar");
    const label = page.getByTestId("month-label");
    await expect(label).toBeVisible({ timeout: 20_000 });
    const thisMonth = (await label.locator("> *").first().textContent()) ?? "";
    await expect(page.getByTestId("btn-calendar-today")).toHaveCount(0);
    const gridY = async () => (await page.getByTestId("calendar-grid").boundingBox())?.y ?? -1;
    const y0 = await gridY();
    await page.getByRole("button", { name: "이전 달" }).click();
    await expect(label.locator("> *").first()).not.toHaveText(thisMonth);
    const chip = page.getByTestId("btn-calendar-today");
    await expect(chip).toBeVisible();
    // 칩 자리를 늘 잡아 둔다 — 칩이 생겨도 격자 위치 그대로(P2 리뷰)
    expect(await gridY()).toBe(y0);
    await expect(chip).toHaveAccessibleName("오늘로 이동");
    expect(await 칩바탕(page, "btn-calendar-today")).toBe(await 토큰(page, "var(--color-surface-alt)"));
    expect((await chip.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await chip.click();
    await expect(label.locator("> *").first()).toHaveText(thisMonth);
    await expect(chip).toHaveCount(0);
    expect(await gridY()).toBe(y0);
  });

for (const scheme of ["light", "dark"] as const)
  test(`kg│lb — 옅은 트랙 + 고른 쪽 알약(${scheme}) · 누르는 자리 그대로`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme });
    await 카탈로그_준비(page);
    await 빠른_운동(page, "바벨 벤치프레스");
    const tg = page.getByTestId("unit-toggle").first();
    await expect(tg).toBeVisible({ timeout: 15_000 });
    expect(await tg.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      await 토큰(page, "var(--color-surface-alt)"),
    );
    const kg = page.getByTestId("unit-toggle-kg").first();
    await expect(kg).toHaveAttribute("aria-pressed", "true");
    // 고른 쪽은 구간 선택기와 같은 --seg-on — 다크에서도 트랙보다 밝다(P2 리뷰)
    expect(await kg.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      await 토큰(page, "var(--seg-on)"),
    );
    const lum = (c: string) => {
      const [r, g, b] = (c.match(/\d+/g) ?? []).map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect(lum(await 토큰(page, "var(--seg-on)"))).toBeGreaterThan(
      lum(await 토큰(page, "var(--color-surface-alt)")),
    );
    expect(
      await page
        .getByTestId("unit-toggle-lb")
        .first()
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe(투명);
  });

test("기록 상세 — 세트 줄 끝 ✎ 칩(장식형) · 줄은 그대로 버튼", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await 빠른_운동(page, "데드리프트");
  await 세트_기록(page, 0, 100, 5);
  await 마치기(page);
  await page.goto("/history");
  await page.locator('a[href^="/history/"]').first().click();
  const set = page.getByTestId("detail-set").first();
  await expect(set).toBeVisible({ timeout: 20_000 });
  const chip = set.getByTestId("detail-set-edit-chip");
  await expect(chip).toHaveAttribute("aria-hidden", "true");
  expect(await 칩바탕(page, "detail-set-edit-chip", set)).toBe(await 토큰(page, "var(--color-surface-alt)"));
  await expect(chip.locator("button")).toHaveCount(0);
});
