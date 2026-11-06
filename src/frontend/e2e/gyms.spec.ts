// 주변 헬스장 e2e
//
// 위치와 POI 제공자는 **가짜로 세운다** — 진짜 Overpass에 의존하면 이 테스트는
// 남의 서버 상태를 검사하는 것이 되고, 브라우저는 실제 위치 권한을 물을 수 없다.
// 여기서 확인하는 것은 우리 쪽 규칙이다: 가까운 순 · 첫 칸 추천 · 반경 확장 · 실패 문구 구분.
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

const OVERPASS = "**/api/interpreter";
const SERVER = "**/api/gyms/nearby";

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
  await stubServer(page, 503); // 키 유무와 상관없이 Overpass 규칙을 시험한다
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

/** 우리 서버(카카오) 응답을 가로챈다. 호출 수를 돌려준다. */
async function stubServer(page: Page, status: number, body?: unknown) {
  const calls = { n: 0 };
  await page.unroute(SERVER);
  await page.route(SERVER, async (route) => {
    calls.n += 1;
    await route.fulfill({
      status,
      contentType: "application/json",
      body: body === undefined ? "" : JSON.stringify(body),
    });
  });
  return calls;
}

async function allowLocation(page: Page) {
  await page.context().grantPermissions(["geolocation"], { origin: ORIGIN });
  await page.context().setGeolocation({ latitude: ME.lat, longitude: ME.lon });
}

test("프록시를 거쳐 실제 서버 경로에 닿는다", async ({ page }) => {
  await allowLocation(page);
  await page.route(OVERPASS, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ elements: [element(90, "실경로 헬스장", ME.lat + 0.001, ME.lon)] }),
    });
  });
  const response = page.waitForResponse("**/api/gyms/nearby");
  await page.goto("/gyms");
  // 키가 없는 시험 환경에서는 503 — 404·405면 등록이나 POST 전달이 깨진 것이다.
  expect((await response).status()).toBe(503);
  await expect(page.getByTestId("gym-recommended")).toContainText("실경로 헬스장", { timeout: 20_000 });
});

test("서버 결과가 오면 Overpass를 부르지 않고 카카오맵 길찾기를 연다", async ({ page }) => {
  await allowLocation(page);
  await stubServer(page, 200, {
    gyms: [
      { id: "22", name: "먼 카카오 헬스장", lat: ME.lat + 0.01, lon: ME.lon },
      { id: "11", name: "가까운 카카오 헬스장", lat: ME.lat + 0.001, lon: ME.lon, address: "중구 1" },
    ],
    truncated: false,
  });
  let overpass = 0;
  await page.route(OVERPASS, async (route) => {
    overpass += 1;
    await route.abort();
  });

  await page.goto("/gyms");
  const rec = page.getByTestId("gym-recommended");
  await expect(rec).toContainText("가까운 카카오 헬스장", { timeout: 20_000 });
  await expect(rec.getByTestId("gym-directions")).toHaveAttribute("href", "https://map.kakao.com/link/to/11");
  expect(overpass).toBe(0);
});

test("서버가 빈 목록을 주면 없다고 말하고 Overpass로 넘어가지 않는다", async ({ page }) => {
  await allowLocation(page);
  await stubServer(page, 200, { gyms: [], truncated: false });
  let overpass = 0;
  await page.route(OVERPASS, async (route) => {
    overpass += 1;
    await route.abort();
  });
  await page.goto("/gyms");
  await expect(page.getByTestId("gyms-empty")).toBeVisible({ timeout: 20_000 });
  expect(overpass).toBe(0);
});

test("서버 응답이 200이 아니거나 형식이 틀리면 Overpass 결과를 보여 준다", async ({ page }) => {
  await allowLocation(page);
  const fallback = [element(50, "대체 헬스장", ME.lat + 0.001, ME.lon)];
  for (const [status, body] of [
    [503, undefined],
    [429, undefined],
    [200, { gyms: "not-a-list" }],
    [200, { gyms: [{ id: "../x", name: "나쁜 id", lat: 1, lon: 2 }] }],
  ] as const) {
    await stubProvider(page, fallback);
    await stubServer(page, status, body);
    await page.goto("/gyms");
    await expect(page.getByTestId("gym-recommended")).toContainText("대체 헬스장", { timeout: 20_000 });
  }
});

test("45곳에서 잘렸으면 그렇게 말하고 넓히기를 숨긴다", async ({ page }) => {
  await allowLocation(page);
  await stubServer(page, 200, {
    gyms: [{ id: "1", name: "한 곳", lat: ME.lat + 0.001, lon: ME.lon }],
    truncated: true,
  });
  await page.goto("/gyms");
  await expect(page.getByTestId("gyms-list")).toContainText("가까운 1곳까지 보여요", { timeout: 20_000 });
  await expect(page.getByTestId("gyms-expand")).toHaveCount(0);
});

test("첫 Overpass 서버가 멈추면 다음 서버의 답을 쓴다", async ({ page }) => {
  await allowLocation(page);
  await stubServer(page, 503);
  await page.route("**overpass-api.de/**", () => {}); // 답하지 않는다
  await page.route("**overpass.kumi.systems/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ elements: [element(60, "미러 헬스장", ME.lat + 0.001, ME.lon)] }),
    });
  });
  await page.goto("/gyms");
  await expect(page.getByTestId("gym-recommended")).toContainText("미러 헬스장", { timeout: 15_000 });
});

test("200에 빈 목록과 remark면 시간 초과로 보고 실패로 말한다", async ({ page }) => {
  await allowLocation(page);
  await stubServer(page, 503);
  await page.route(OVERPASS, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ elements: [], remark: "runtime error: Query timed out" }),
    });
  });
  await page.goto("/gyms");
  await expect(page.getByTestId("gyms-error")).toContainText("헬스장을 찾지 못했어요", { timeout: 20_000 });
});

test("검색 실패 뒤 다시 시도하면 위치를 다시 묻지 않고 찾는다", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __geoCalls: number };
    w.__geoCalls = 0;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(ok: PositionCallback) {
          w.__geoCalls += 1;
          ok({ coords: { latitude: 37.5665, longitude: 126.978 } } as GeolocationPosition);
        },
      },
    });
  });
  await stubProvider(page, null);
  await page.goto("/gyms");
  await expect(page.getByTestId("gyms-error")).toBeVisible({ timeout: 20_000 });
  // dev 는 StrictMode 로 처음에 두 번 물을 수 있어 재시도 전 값과 비교한다.
  const before = await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls);
  await stubProvider(page, [element(70, "복구 헬스장", ME.lat + 0.001, ME.lon)]);
  await page.getByTestId("gyms-retry").click();
  await expect(page.getByTestId("gym-recommended")).toContainText("복구 헬스장", { timeout: 20_000 });
  expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(before);
});

test("위치 응답이 없으면 15초 뒤 허용 창을 안내하고 다시 시도할 수 있다", async ({ page }) => {
  test.setTimeout(45_000);
  await page.addInitScript(() => {
    const w = window as unknown as { __geoCalls: number };
    w.__geoCalls = 0;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition() {
          w.__geoCalls += 1;
        },
      },
    });
  });
  await page.goto("/gyms");
  await expect(page.getByTestId("gyms-slow-locate")).toContainText("위치 허용 창", { timeout: 20_000 });
  const before = await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls);
  await page.getByTestId("gyms-retry").click();
  await expect(page.getByTestId("gyms-slow-locate")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __geoCalls: number }).__geoCalls)).toBe(
    before + 1,
  );
});

test("위치가 45초 안에 안 오면 실패로 말하고, 늦게 오면 이어서 찾는다", async ({ page }) => {
  test.setTimeout(75_000);
  await page.addInitScript(() => {
    const w = window as unknown as { __late?: PositionCallback };
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(ok: PositionCallback) {
          w.__late = ok;
        },
      },
    });
  });
  await stubProvider(page, [element(95, "늦은 허용 헬스장", ME.lat + 0.001, ME.lon)]);
  await page.goto("/gyms");
  await expect(page.getByTestId("gyms-error")).toContainText("위치", { timeout: 55_000 });
  await page.evaluate(() => {
    const w = window as unknown as { __late: PositionCallback };
    w.__late({ coords: { latitude: 37.5665, longitude: 126.978 } } as GeolocationPosition);
  });
  await expect(page.getByTestId("gym-recommended")).toContainText("늦은 허용 헬스장", { timeout: 20_000 });
});

test("서버와 미러가 모두 멈춰도 30초 안에 실패 화면이 나온다", async ({ page }) => {
  test.setTimeout(45_000);
  await allowLocation(page);
  await page.route(SERVER, () => {}); // 답하지 않는다
  await page.route(OVERPASS, () => {});
  await page.goto("/gyms");
  await expect(page.getByTestId("gyms-slow-search")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("gyms-error")).toContainText("헬스장을 찾지 못했어요", { timeout: 30_000 });
});

test("넓히기가 실패하면 받아 둔 목록과 반경을 그대로 둔다", async ({ page }) => {
  await allowLocation(page);
  await stubServer(page, 503);
  await page.route(OVERPASS, async (route) => {
    if ((route.request().postData() ?? "").includes("5000")) {
      await route.fulfill({ status: 502, body: "down" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ elements: [element(96, "받아 둔 헬스장", ME.lat + 0.001, ME.lon)] }),
    });
  });
  await page.goto("/gyms");
  await expect(page.getByTestId("gym-recommended")).toContainText("받아 둔 헬스장", { timeout: 20_000 });
  await page.getByTestId("gyms-expand").click();
  await expect(page.getByTestId("gyms-expand-failed")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("gym-recommended")).toContainText("받아 둔 헬스장");
  await expect(page.getByTestId("gyms-list")).toContainText("2km");
  await expect(page.getByTestId("gyms-expand")).toContainText("5km");
});

test("Overpass는 넉넉히 받아 가까운 60곳만 보이고 잘림을 말한다", async ({ page }) => {
  await allowLocation(page);
  const many = Array.from({ length: 70 }, (_, i) =>
    element(
      1000 + i,
      i === 69 ? "가장 가까운 곳" : `먼 곳 ${i}`,
      ME.lat + (i === 69 ? 0.0001 : 0.01 + i * 0.0001),
      ME.lon,
    ),
  );
  await stubProvider(page, many);
  await page.goto("/gyms");
  await expect(page.getByTestId("gym-recommended")).toContainText("가장 가까운 곳", { timeout: 20_000 });
  await expect(page.getByTestId("gym-row")).toHaveCount(59);
  await expect(page.getByTestId("gyms-list")).toContainText("가까운 60곳까지");
  await expect(page.getByTestId("gyms-expand")).toHaveCount(0);
});

test("거부된 뒤 설정에서 켜고 돌아오면 저절로 다시 찾는다", async ({ page }) => {
  await page.addInitScript(() => {
    const perm = { state: "denied", onchange: null as null | (() => void) };
    (window as unknown as { __perm: typeof perm }).__perm = perm;
    Object.defineProperty(navigator, "permissions", { value: { query: async () => perm } });
    let visibility = "visible";
    Object.defineProperty(document, "visibilityState", { get: () => visibility });
    (window as unknown as { __setVisibility: (v: string) => void }).__setVisibility = (v) => {
      visibility = v;
      document.dispatchEvent(new Event("visibilitychange"));
    };
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(ok: PositionCallback, err: PositionErrorCallback) {
          if (perm.state === "granted") {
            ok({ coords: { latitude: 37.5665, longitude: 126.978 } } as GeolocationPosition);
          } else {
            err({ code: 1 } as GeolocationPositionError);
          }
        },
      },
    });
  });
  await stubProvider(page, [element(97, "복귀 뒤 헬스장", ME.lat + 0.001, ME.lon)]);
  await page.goto("/gyms");
  await expect(page.getByTestId("gyms-error")).toContainText("위치 권한", { timeout: 20_000 });
  type W = { __perm: { state: string }; __setVisibility: (v: string) => void };
  await page.evaluate(() => (window as unknown as W).__setVisibility("hidden"));
  await page.waitForTimeout(2_100);
  await page.evaluate(() => {
    const w = window as unknown as W;
    w.__perm.state = "granted"; // onchange 없이 값만 바뀌는 iOS 처럼
    w.__setVisibility("visible");
  });
  await expect(page.getByTestId("gym-recommended")).toContainText("복귀 뒤 헬스장", { timeout: 20_000 });
});

test("거부된 뒤 위치를 켜면 저절로 다시 찾는다", async ({ page }) => {
  await page.addInitScript(() => {
    const perm = { state: "denied", onchange: null as null | (() => void) };
    (window as unknown as { __perm: typeof perm }).__perm = perm;
    Object.defineProperty(navigator, "permissions", { value: { query: async () => perm } });
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition(ok: PositionCallback, err: PositionErrorCallback) {
          if (perm.state === "granted") {
            ok({ coords: { latitude: 37.5665, longitude: 126.978 } } as GeolocationPosition);
          } else {
            err({ code: 1 } as GeolocationPositionError);
          }
        },
      },
    });
  });
  await stubProvider(page, [element(80, "권한 뒤 헬스장", ME.lat + 0.001, ME.lon)]);
  await page.goto("/gyms");
  await expect(page.getByTestId("gyms-error")).toContainText("위치 권한", { timeout: 20_000 });
  await page.waitForFunction(() => {
    const w = window as unknown as { __perm: { onchange: unknown } };
    return w.__perm.onchange !== null;
  });
  await page.evaluate(() => {
    const p = (window as unknown as { __perm: { state: string; onchange: () => void } }).__perm;
    p.state = "granted";
    p.onchange();
  });
  await expect(page.getByTestId("gym-recommended")).toContainText("권한 뒤 헬스장", { timeout: 20_000 });
});

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

  await stubServer(page, 503);
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

test("피드 탭에서 주변 헬스장으로 들어가고 돌아온다", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"], { origin: ORIGIN });
  await context.setGeolocation({ latitude: ME.lat, longitude: ME.lon });
  await stubProvider(page, [element(40, "진입 확인 헬스장", ME.lat + 0.001, ME.lon)]);

  await page.goto("/feed?tab=following");
  await page.getByTestId("btn-gyms").click();
  await expect(page).toHaveURL(/\/gyms$/, { timeout: 20_000 });
  await expect(page.getByTestId("gym-recommended")).toContainText("진입 확인 헬스장", { timeout: 20_000 });
  await expect(page.getByTestId("nav-feed")).toHaveAttribute("aria-current", "page");
  await page.getByTestId("gyms-back").click();
  await expect(page).toHaveURL(/\/feed$/, { timeout: 20_000 });
});

test("방침 변경 공지는 정해진 날까지 피드에 뜨고 닫으면 다시 뜨지 않는다", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-06T12:00:00+09:00"));
  await page.goto("/feed?tab=following");
  const notice = page.getByTestId("policy-notice");
  await expect(notice).toContainText("11월 5일", { timeout: 20_000 });
  await expect(page.getByTestId("policy-notice-link")).toHaveAttribute("href", "/privacy");
  await page.getByTestId("policy-notice-close").click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "피드" })).toBeVisible({ timeout: 20_000 });
  await expect(notice).toHaveCount(0);
});

test("정해진 날이 지나면 방침 공지가 뜨지 않는다", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-13T00:00:01+09:00"));
  await page.goto("/feed?tab=following");
  await expect(page.getByRole("heading", { name: "피드" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("policy-notice")).toHaveCount(0);
});
