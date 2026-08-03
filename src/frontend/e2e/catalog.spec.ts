// e2e — 사람이 브라우저에서 하던 확인을 기계가 대신한다
//
// 이 화면의 데이터는 **로컬 저장소**에서 온다(ADR-002 · ADR-032). 서버는 그 저장소를 세우는
// 배포 채널이다. 그래서 여기서 볼 것은 "서버가 목록을 잘 주는가"가 아니라
// **"로컬이 정본으로 서는가 · 네트워크가 없어도 동작하는가"** 다.
// (서버 계약 자체는 make smoke가 본다 — 겹치지 않게 둔다)
import { expect, test } from "@playwright/test";

/** 첫 방문은 서버에서 카탈로그를 받아 로컬에 세운다. 그 과정이 끝나기를 기다린다. */
async function 카탈로그_준비(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });
  await expect(page.getByTestId("exercise-list").locator("li").first()).toBeVisible();
}

test("첫 방문에 서버 카탈로그가 로컬로 내려오고 목록이 뜬다", async ({ page }) => {
  await page.goto("/exercises");
  await 카탈로그_준비(page);

  // 336종 전체가 로컬에 선다 — app이 들고 있는 카탈로그와 같은 규모다.
  const count = Number(await page.getByTestId("catalog-count").innerText());
  expect(count).toBeGreaterThanOrEqual(336);
  expect(await page.getByTestId("exercise-list").locator("li").count()).toBe(count);
});

test("네트워크가 끊겨도 목록이 그대로 보인다", async ({ page, context }) => {
  // 로컬 저장소가 열리지 못하면 원인이 콘솔에만 남는다 — 실패 메시지에 함께 실어 보낸다.
  const logs: string[] = [];
  page.on("console", (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));

  // ① 먼저 한 번 열어 로컬 저장소를 채운다
  await page.goto("/exercises");
  await 카탈로그_준비(page);
  const before = await page.getByTestId("exercise-list").locator("li").count();

  // ② 서버로 가는 길을 막는다 — 헬스장 지하와 같은 상황
  await context.route("**/api/**", (route) => route.abort());

  // ③ 다시 열어도 목록은 로컬에서 나온다
  await page.reload();
  await expect(page.getByTestId("sync-state")).toHaveText("오프라인", { timeout: 20_000 });
  await expect(page.getByTestId("exercise-list").locator("li"), `콘솔:\n${logs.join("\n")}`).toHaveCount(
    before,
  );

  // ④ 검색·필터도 로컬에서 돈다(서버 왕복이 없다)
  await page.getByTestId("search-input").fill("벤치");
  await expect(async () => {
    const names = await page.getByTestId("exercise-list").locator("li").allInnerTexts();
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n.toLowerCase()).toMatch(/벤치|bench/);
  }).toPass();
});

test("검색이 목록을 좁힌다 — 한글로", async ({ page }) => {
  await page.goto("/exercises");
  await 카탈로그_준비(page);

  await page.getByTestId("search-input").fill("벤치");
  await expect(async () => {
    const names = await page.getByTestId("exercise-list").locator("li").allInnerTexts();
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) expect(n.toLowerCase()).toMatch(/벤치|bench/);
  }).toPass();
});

test("기구 필터가 결과를 전건 바꾼다", async ({ page }) => {
  await page.goto("/exercises");
  await 카탈로그_준비(page);

  // 밴드 — 카탈로그 확장에서 뒤늦게 추가된 축이라 회귀가 잘 나는 자리다.
  // 필터는 app과 같은 **칩**이다(드롭다운이 아니다) — 누르면 켜지고 다시 누르면 꺼진다.
  await page.getByTestId("chip-equipment-band").click();
  await expect(async () => {
    const rows = await page.getByTestId("exercise-list").locator("li").allInnerTexts();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r).toContain("밴드");
  }).toPass();
});

test("부위 필터가 결과를 전건 바꾼다", async ({ page }) => {
  await page.goto("/exercises");
  await 카탈로그_준비(page);

  await page.getByTestId("chip-muscle-chest").click();
  await expect(async () => {
    const rows = await page.getByTestId("exercise-list").locator("li").allInnerTexts();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r).toContain("가슴");
  }).toPass();
});

test("결정적 딥링크로 상세가 열리고 대체운동이 이어진다", async ({ page }) => {
  // 상세는 **서버 렌더**다 — 밖으로 공유되는 URL이라 SEO와 즉시 열림이 필요하다.
  // 경로 규칙은 app/(Expo Web)과 같아서 공유된 링크가 어느 구현에서도 열린다.
  await page.goto("/exercise/seed-barbell-bench-press");
  // 표시 이름은 도메인 규칙을 따른다 — 이름에 든 기구 토큰을 뒤로 뺀다('바벨 벤치프레스' → '벤치프레스 (바벨)').
  await expect(page.getByTestId("exercise-name")).toHaveText("벤치프레스 (바벨)");

  const subs = page.getByTestId("substitutes").locator("li");
  expect(await subs.count()).toBeGreaterThan(0);

  const first = subs.first();
  // 줄에는 이름과 기구가 함께 있으므로 **이름만** 읽는다.
  const label = (await first.getByTestId("sub-name").innerText()).trim();
  await first.click();
  await expect(page.getByTestId("exercise-name")).toHaveText(label);
});

test("없는 종목은 404다 — 오류 화면이 아니라", async ({ page }) => {
  const res = await page.goto("/exercise/seed-does-not-exist");
  expect(res?.status()).toBe(404);
});
