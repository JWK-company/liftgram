// 주변 헬스장 e2e
//
// 위치와 POI 제공자는 **가짜로 세운다** — 진짜 Overpass에 의존하면 이 테스트는
// 남의 서버 상태를 검사하는 것이 되고, 브라우저는 실제 위치 권한을 물을 수 없다.
// 여기서 확인하는 것은 우리 쪽 규칙이다: 가까운 순 · 첫 칸 추천 · 반경 확장 · 실패 문구 구분.
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

const OVERPASS = "**/api/interpreter";

/**
 * 위치 권한은 **출처(origin)에 붙는다.** 아직 아무 데도 가지 않은 상태에서 권한을 주면
 * `about:blank`에 주는 셈이라 실제 페이지에서는 거부로 나온다 — 그래서 출처를 명시한다.
 */
const ORIGIN = process.env.BASE ?? "http://127.0.0.1:3100";

/** 서울 시청 근처 — 좌표는 거리 계산이 눈으로 검산되는 값으로 골랐다. */
const ME = { lat: 37.5665, lon: 126.978 };

function element(id: number, name: string, lat: number, lon: number, extra: Record<string, string> = {}) {
  return { type: "node", id, lat, lon, tags: { name, leisure: "fitness_centre", ...extra } };
}

/** 제공자 응답을 가로챈다. `elements`를 주면 그대로, null이면 실패시킨다. */
async function stubProvider(page: Page, elements: unknown[] | null) {
  await page.route(OVERPASS, async (route) => {
    if (elements === null) {
      await route.fulfill({ status: 502, body: "upstream down" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ elements }),
    });
  });
}

test("가까운 순으로 줄 세우고 첫 칸을 추천으로 올린다", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"], { origin: ORIGIN });
  await context.setGeolocation({ latitude: ME.lat, longitude: ME.lon });
  // 먼 곳을 **먼저** 실어 보낸다 — 정렬이 우리 몫임을 증명하기 위해서다.
  await stubProvider(page, [
    element(1, "먼 헬스장", ME.lat + 0.02, ME.lon), // 약 2.2km
    element(2, "가까운 헬스장", ME.lat + 0.001, ME.lon, { "addr:full": "중구 세종대로 1" }), // 약 110m
    element(3, "중간 헬스장", ME.lat + 0.005, ME.lon), // 약 550m
  ]);

  await page.goto("/gyms");
  await expect(page.getByTestId("gyms-list")).toBeVisible({ timeout: 20_000 });

  // 첫 칸 = 가장 가까운 곳, 추천 배지가 붙는다.
  const rec = page.getByTestId("gym-recommended");
  await expect(rec).toContainText("가까운 헬스장");
  await expect(rec).toContainText("추천");
  await expect(rec).toContainText("중구 세종대로 1");

  // 나머지는 가까운 순.
  const rows = page.getByTestId("gym-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("중간 헬스장");
  await expect(rows.nth(1)).toContainText("먼 헬스장");
});

test("이름 없는 항목은 목록에 넣지 않는다", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"], { origin: ORIGIN });
  await context.setGeolocation({ latitude: ME.lat, longitude: ME.lon });
  await stubProvider(page, [
    { type: "node", id: 10, lat: ME.lat + 0.001, lon: ME.lon, tags: { leisure: "fitness_centre" } },
    element(11, "이름 있는 곳", ME.lat + 0.002, ME.lon),
  ]);

  await page.goto("/gyms");
  await expect(page.getByTestId("gyms-list")).toBeVisible({ timeout: 20_000 });
  // 이름 없는 한 곳은 빠지고 한 곳만 남는다 — 추천 카드 하나, 나머지 행 0개.
  await expect(page.getByTestId("gym-recommended")).toContainText("이름 있는 곳");
  await expect(page.getByTestId("gym-row")).toHaveCount(0);
});

test("아무것도 없으면 반경을 넓힐 수 있다", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"], { origin: ORIGIN });
  await context.setGeolocation({ latitude: ME.lat, longitude: ME.lon });

  // 2km에서는 빈손, 넓히면 한 곳 — 요청 본문의 반경으로 갈라 준다.
  await page.route(OVERPASS, async (route) => {
    const body = route.request().postData() ?? "";
    const wide = body.includes("5000");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ elements: wide ? [element(20, "넓혀서 찾은 곳", ME.lat + 0.03, ME.lon)] : [] }),
    });
  });

  await page.goto("/gyms");
  await expect(page.getByTestId("gyms-empty")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("gyms-empty")).toContainText("2km");

  await page.getByTestId("gyms-expand").click();
  await expect(page.getByTestId("gym-recommended")).toContainText("넓혀서 찾은 곳", { timeout: 20_000 });
  // 넓힌 반경이 요약 줄에 반영된다.
  await expect(page.getByTestId("gyms-list")).toContainText("5km");
});

test("위치 권한을 막으면 그 사정을 말한다", async ({ page, context }) => {
  await context.clearPermissions(); // 위치 권한 없음 → PERMISSION_DENIED
  await stubProvider(page, []);

  await page.goto("/gyms");
  await expect(page.getByTestId("gyms-error")).toBeVisible({ timeout: 20_000 });
  // "네트워크 실패"가 아니라 **권한** 문구여야 한다 — 사용자가 할 일이 다르다.
  await expect(page.getByTestId("gyms-error")).toContainText("위치 권한");
  await expect(page.getByTestId("gyms-retry")).toBeVisible();
});

test("제공자가 죽으면 검색 실패로 말하고 다시 시도할 수 있다", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"], { origin: ORIGIN });
  await context.setGeolocation({ latitude: ME.lat, longitude: ME.lon });
  await stubProvider(page, null); // 두 미러 모두 502

  await page.goto("/gyms");
  await expect(page.getByTestId("gyms-error")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("gyms-error")).toContainText("헬스장 정보를 불러오지 못했어요");

  // 다시 누르면 이번엔 성공한다.
  await stubProvider(page, [element(30, "복구된 헬스장", ME.lat + 0.001, ME.lon)]);
  await page.getByTestId("gyms-retry").click();
  await expect(page.getByTestId("gym-recommended")).toContainText("복구된 헬스장", { timeout: 20_000 });
});

test("운동 탭에서 주변 헬스장으로 들어간다", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"], { origin: ORIGIN });
  await context.setGeolocation({ latitude: ME.lat, longitude: ME.lon });
  await stubProvider(page, [element(40, "진입 확인 헬스장", ME.lat + 0.001, ME.lon)]);

  await page.goto("/");
  await page.getByTestId("btn-gyms").click();
  await expect(page).toHaveURL(/\/gyms$/, { timeout: 20_000 });
  await expect(page.getByTestId("gym-recommended")).toContainText("진입 확인 헬스장", { timeout: 20_000 });
});
