// 세트 휴지통(할일/세트-휴지통) — 루틴 편집 세트 표의 줄 끝 🗑 · 번호 시트에서 「삭제」를 뺌 · 첫 안내 문구
//
// 확인하는 것(360px):
//   · 줄마다 🗑(aria-label 「n세트 삭제」 · 44px) · 누르면 그 세트만 빠지고 나머지 값은 그대로 · 한 줄 남으면 🗑 없음(빈 칸)
//   · 숫자 칸 폭이 그대로 쓸 만하고(무게 78px · 횟수 칸 48px 이상(코칭 처방 표의 ⋯ 칸과 같은 배치)) 가로 넘침 없음
//   · 🗑 은 강조색(빨강) 없음 — 라이트·다크 모두 흐린 회색
//   · 번호 시트에 「삭제」 없음(종류 여섯은 그대로)
//   · 첫 안내 문구에 「복사」·「삭제」 없음 · 말풍선이 첫 줄 🗑 을 덮지 않음
//   · 운동 중 세트 번호 시트는 그대로(여섯 종류 · 삭제 없음 — 운동 중 삭제는 펼친 세트 안)
import { expect, type Page, test } from "@playwright/test";

const base = process.env.BASE ?? "http://127.0.0.1:3100";
test.use({
  viewport: { width: 360, height: 740 },
  storageState: {
    cookies: [],
    origins: [
      {
        origin: base,
        localStorage: [
          { name: "onboarding_seen_v1", value: "yes" },
          { name: "liftgram.nudge.suppressed", value: "e2e" },
          { name: "liftgram.hint.ms", value: "60000" },
        ],
      },
    ],
  },
});

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
}
async function 새_루틴_종목(page: Page, 안내끔 = false) {
  await page.goto("/");
  // 첫 안내 말풍선과 섞이지 않게(리뷰 #15) — 안내를 보는 시험만 켠다
  if (안내끔) await page.evaluate(() => localStorage.setItem("liftgram.hint.rxType", "seen"));
  await expect(page.getByTestId("btn-new-routine")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("routine-name").fill(`휴지통${Date.now().toString(36)}`);
  await page.getByTestId("routine-name").blur();
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  await expect(page.getByTestId("set-table").first()).toBeVisible({ timeout: 15_000 });
}
const 줄 = (page: Page) => page.getByTestId("set-table").first().getByTestId("set-table-row");
async function 무게(page: Page, i: number, kg: number) {
  await 줄(page).nth(i).getByTestId("rx-weight").fill(String(kg));
  await 줄(page).nth(i).getByTestId("rx-weight").blur();
}
async function 칸들(page: Page, id: string): Promise<string[]> {
  return 줄(page)
    .getByTestId(id)
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
}
async function 무게들(page: Page): Promise<string[]> {
  return 줄(page)
    .getByTestId("rx-weight")
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
}

/** 강조색(브랜드·경고 빨강)이 글자·바탕·테두리·SVG 어디에라도 쓰였나 — declutter-p4 의 accentUse 와 같은 잣대 */
async function 강조색(page: Page, testId: string): Promise<string[]> {
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
      for (const n of [el, ...el.querySelectorAll("*")] as Element[]) {
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

test("줄마다 🗑 — 그 세트만 빠짐 · 한 줄이면 없음 · 44px · 360px 넘침 없음 · 빨강 없음(라이트·다크) · 시트에 삭제 없음", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await 새_루틴_종목(page, true);
  await page.getByTestId("rx-add-set").click();
  await expect(줄(page)).toHaveCount(4);

  // 줄마다 하나 · 이름 · 크기
  const 휴지통 = 줄(page).getByTestId("rx-remove");
  await expect(휴지통).toHaveCount(4);
  for (const i of [0, 1, 2, 3]) {
    await expect(휴지통.nth(i)).toHaveAttribute("aria-label", `${i + 1}세트 삭제`);
    const b = await 휴지통.nth(i).boundingBox();
    expect(b?.width ?? 0, `🗑${i + 1} 폭`).toBeGreaterThanOrEqual(44);
    expect(b?.height ?? 0, `🗑${i + 1} 높이`).toBeGreaterThanOrEqual(44);
  }
  // 숫자 칸 — 무게 78px 그대로 · 횟수 칸도 두 자리가 넉넉히 들어감 · 🗑 이 표 안에 있고 가로 넘침 없음
  const 첫줄 = 줄(page).first();
  expect((await 첫줄.getByTestId("rx-weight").boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(76);
  for (const id of ["rx-rep-min", "rx-rep-max"])
    expect((await 첫줄.getByTestId(id).boundingBox())?.width ?? 0, id).toBeGreaterThanOrEqual(48);
  const 표 = await page.getByTestId("set-table").first().boundingBox();
  const 끝 = await 휴지통.first().boundingBox();
  expect((끝?.x ?? 0) + (끝?.width ?? 0)).toBeLessThanOrEqual((표?.x ?? 0) + (표?.width ?? 0) + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // 빨강 없음 — 라이트·다크
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await 강조색(page, "rx-remove"), `${scheme} 🗑 강조색`).toEqual([]);
    // 흐린 회색(ink3) · 바탕과 다른 색
    const c = await 휴지통.first().evaluate((el) => {
      const s = document.createElement("span");
      s.style.color = "var(--color-ink3)";
      document.body.appendChild(s);
      const ink3 = getComputedStyle(s).color;
      s.remove();
      const svg = el.querySelector("svg") as SVGElement;
      // 실제로 깔린 바탕 — 가장 가까운 불투명 조상(카드)
      let bg = "";
      for (let n: Element | null = el.parentElement; n && !bg; n = n.parentElement) {
        const b = getComputedStyle(n).backgroundColor;
        if (b !== "rgba(0, 0, 0, 0)" && b !== "transparent") bg = b;
      }
      return { icon: getComputedStyle(svg).color, ink3, bg };
    });
    expect(c.icon, `${scheme} 🗑 색`).toBe(c.ink3);
    expect(c.icon).not.toBe(c.bg);
  }
  await page.emulateMedia({ colorScheme: "light" });

  // 값·종류를 줄마다 다르게 넣고 둘째 줄을 지우면 그 줄만 빠진다(종류·무게·횟수 모두 · 리뷰 #12)
  await 무게(page, 0, 60);
  await 무게(page, 1, 70);
  await 무게(page, 2, 80);
  await 무게(page, 3, 90);
  for (const [i, n] of [
    [0, "6"],
    [1, "7"],
    [2, "8"],
    [3, "9"],
  ] as const) {
    await 줄(page).nth(i).getByTestId("rx-rep-min").fill(n);
    await 줄(page).nth(i).getByTestId("rx-rep-min").blur();
  }
  await 줄(page).nth(2).getByTestId("rx-type").click();
  await page.getByTestId("rx-type-top").click();
  await expect(줄(page).nth(2)).toHaveAttribute("data-type", "top");
  await expect.poll(() => 무게들(page)).toEqual(["60", "70", "80", "90"]);
  await 휴지통.nth(1).click();
  await expect(줄(page)).toHaveCount(3);
  await expect.poll(() => 무게들(page)).toEqual(["60", "80", "90"]);
  expect(await 칸들(page, "rx-rep-min")).toEqual(["6", "8", "9"]);
  expect(await 줄(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-type")))).toEqual([
    "normal",
    "top",
    "normal",
  ]);
  await expect(휴지통.nth(1)).toHaveAttribute("aria-label", "2세트 삭제");
  // 지운 뒤 포커스는 같은 자리 줄의 🗑(리뷰 #4)
  await expect(휴지통.nth(1)).toBeFocused();

  // 입력 중인 칸이 있는 채(blur 없이) 다른 줄을 지워도 — 입력은 남고 지운 줄은 되살아나지 않는다(리뷰 #1 · iOS 는 버튼을 눌러도 칸이 blur 되지 않는다)
  await 줄(page).nth(0).getByTestId("rx-rep-max").fill("12");
  await 휴지통.nth(2).evaluate((el) => (el as HTMLButtonElement).click());
  await expect(줄(page)).toHaveCount(2);
  await page.waitForTimeout(300);
  await expect(줄(page)).toHaveCount(2);
  await expect.poll(() => 무게들(page)).toEqual(["60", "80"]);
  expect(await 칸들(page, "rx-rep-max")).toEqual(["12", expect.any(String)]);
  await expect(휴지통.nth(1)).toBeFocused(); // 맨 끝 줄을 지우면 위 줄의 🗑
  // 다시 3줄로(아래 흐름 그대로)
  await page.getByTestId("rx-add-set").click();
  await expect(줄(page)).toHaveCount(3);

  // 번호 시트 — 종류 여섯은 그대로 · 「삭제」 없음
  await 줄(page).nth(0).getByTestId("rx-type").click();
  const sheet = page.getByTestId("rx-type-sheet");
  await expect(sheet).toBeVisible();
  for (const type of ["normal", "warmup", "feeder", "top", "backoff", "drop"])
    await expect(sheet.getByTestId(`rx-type-${type}`)).toBeVisible();
  await expect(page.getByTestId("rx-delete")).toHaveCount(0);
  await expect(sheet.getByText("삭제", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  // 한 줄 남으면 🗑 없음 — 머리 칸·줄 칸 폭은 그대로(빈 칸)
  await 휴지통.nth(2).click();
  await expect(줄(page)).toHaveCount(2);
  await 휴지통.nth(1).click();
  await expect(줄(page)).toHaveCount(1);
  await expect(휴지통).toHaveCount(0);
  await expect.poll(() => 무게들(page)).toEqual(["60"]);
  // 한 줄만 남으면 포커스는 그 줄 번호
  await expect(줄(page).first().getByTestId("rx-type")).toBeFocused();
  expect((await 첫줄.getByTestId("rx-rep-max").boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(48);
  // 남은 줄 번호 시트에도 삭제 없음
  await 줄(page).nth(0).getByTestId("rx-type").click();
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId("rx-delete")).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("첫 안내 — 「복사」·「삭제」를 말하지 않음 · 말풍선이 🗑 을 덮지 않음(다크)", async ({ page }) => {
  test.setTimeout(150_000);
  await page.emulateMedia({ colorScheme: "dark" });
  await 카탈로그_준비(page);
  await 새_루틴_종목(page);
  await page
    .getByTestId("rx-type")
    .first()
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  const hint = page.getByTestId("hint-rx-type");
  await expect(hint).toBeVisible({ timeout: 15_000 });
  await expect(hint).toContainText("세트 번호를 누르면 세트 종류를 바꿀 수 있어요");
  await expect(hint).not.toContainText("복사");
  await expect(hint).not.toContainText("삭제");
  // 말풍선(꼬리 칸 포함)이 가리키는 첫 줄의 🗑 과 겹치지 않는다
  const h = await hint.boundingBox();
  const t = await 줄(page).first().getByTestId("rx-remove").boundingBox();
  expect(h && t).toBeTruthy();
  if (h && t) {
    const overlapX = Math.min(h.x + h.width, t.x + t.width) - Math.max(h.x, t.x);
    const overlapY = Math.min(h.y + h.height, t.y + t.height) - Math.max(h.y, t.y);
    expect(overlapX > 0 && overlapY > 0, JSON.stringify({ h, t })).toBe(false);
  }
  // 말풍선은 누름을 받지 않는다 — 덮인 자리라도 🗑 은 그대로 눌린다(누르면 안내도 사라짐)
  await 줄(page).nth(1).getByTestId("rx-remove").click();
  await expect(줄(page)).toHaveCount(2);
  await expect(hint).toHaveCount(0);
});

test("운동 중 세트 번호 시트는 그대로 — 여섯 종류 · 삭제 없음", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await 새_루틴_종목(page);
  await page.getByTestId("btn-routine-start").click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });
  const sets = page.getByTestId("set-list").first().locator("> div");
  await expect(sets).toHaveCount(3, { timeout: 15_000 });
  await expect(page.getByTestId("rx-remove")).toHaveCount(0);
  await sets.nth(0).getByTestId("set-type").click();
  const sheet = page.getByTestId("set-type-sheet");
  await expect(sheet).toBeVisible();
  for (const 있음 of ["일반 세트", "워밍업 (W)", "피더 (P)", "드롭세트 (D)", "탑세트 (T)", "백오프 (B)"])
    await expect(sheet.getByText(있음)).toBeVisible();
  await expect(sheet.getByText("삭제", { exact: true })).toHaveCount(0);
});
