// 시작 화면 e2e(SPEC-017 Phase 1 · SRS-054) — 스토어 앱 UA 에서만 부팅 덮개가 켜지고, 네이티브 스플래시를 한 번 내린 뒤 걷힌다.
//
// 앱 웹뷰는 흉내 낸다: UA 에 LiftgramApp/ 를 붙이고(capacitor.config.ts appendUserAgent 와 같은 표식),
// 가짜 window.Capacitor 의 SplashScreen.hide 가 불린 시각과 그때 덮개가 문서에 있었는지를 기록한다.
// 서비스 워커 캐시 셸 확인은 운영 빌드(BASE=로컬 운영 빌드)에서만 의미가 있다 — 개발 서버면 그 테스트는 건너뛴다.
import { expect, test, type Page } from "@playwright/test";

const APP_UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 LiftgramApp/1.0";

async function fakeCapacitor(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    const log: {
      at: number;
      coverInDom: boolean;
      bootAttr: string | null;
      readyState: string;
      coverShown: boolean;
    }[] = [];
    w.__splash = log;
    w.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "android",
      isPluginAvailable: (n: string) => n === "SplashScreen",
      Plugins: {
        SplashScreen: {
          hide: async () => {
            log.push({
              at: performance.now(),
              coverInDom: !!document.getElementById("app-boot-cover"),
              bootAttr: document.documentElement.getAttribute("data-app-boot"),
              // 인라인 스크립트에서 불렸으면 아직 문서를 읽는 중이다(하이드레이션 뒤 두 번째 호출과 구별 · REV-004 디자인 M4)
              readyState: document.readyState,
              coverShown: (() => {
                const c = document.getElementById("app-boot-cover");
                return (
                  !!c && getComputedStyle(c).display !== "none" && getComputedStyle(c).position === "fixed"
                );
              })(),
            });
          },
        },
      },
    };
  });
}

// 앱 번들(청크) 요청을 늦추거나 끊는다 — 실제로 걸렸는지 센다(정규식이 빗나가면 하이드레이션이 안 막혀 테스트가 헛돈다 · REV-004 디자인 M3).
async function holdChunks(page: Page, mode: { delayMs: number } | "abort") {
  const hit = { n: 0 };
  await page.route(/\/_next\/static\/chunks\/.*\.js$/, async (route) => {
    hit.n += 1;
    if (mode === "abort") return route.abort();
    await new Promise((r) => setTimeout(r, mode.delayMs));
    await route.continue();
  });
  return hit;
}

test.describe("앱 UA", () => {
  test.use({ userAgent: APP_UA });

  test("덮개가 첫 칠하기 전부터 켜지고, 덮개가 문서에 들어온 뒤 스플래시를 내리고, 하이드레이션 뒤 걷힌다", async ({
    page,
  }) => {
    await fakeCapacitor(page);
    // 첫 칠하기 전 상태를 잡는다 — DOMContentLoaded 시점에 표식·덮개가 이미 있어야 한다
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const cover = document.getElementById("app-boot-cover");
        (window as unknown as Record<string, unknown>).__atDcl = {
          attr: document.documentElement.getAttribute("data-app-boot"),
          // display 만 보면 CSS 가 안 먹어도 통과한다 → 덮개 규칙(fixed · 화면 전체)이 실제로 걸렸는지
          visible: cover
            ? getComputedStyle(cover).display !== "none" && getComputedStyle(cover).position === "fixed"
            : false,
        };
      });
    });
    await page.goto("/");
    const atDcl = await page.evaluate(() => (window as unknown as Record<string, unknown>).__atDcl);
    expect(atDcl).toEqual({ attr: "1", visible: true });

    // 스플래시 내리기 — 덮개가 문서에 있을 때 불렸다(인라인 스크립트 + 하이드레이션 뒤 한 번 더 · 멱등)
    const calls = await page.evaluate(
      () =>
        (
          window as unknown as {
            __splash: {
              coverInDom: boolean;
              bootAttr: string | null;
              readyState: string;
              coverShown: boolean;
            }[];
          }
        ).__splash,
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0]).toMatchObject({
      coverInDom: true,
      bootAttr: "1",
      readyState: "loading",
      coverShown: true,
    });

    // 하이드레이션 뒤 덮개가 걷힌다(페이드 200ms → 표식 제거)
    await expect(page.locator("html")).not.toHaveAttribute("data-app-boot", /.*/, { timeout: 10_000 });
    await expect(page.getByTestId("app-boot-cover")).toBeHidden();
  });

  test("덮개 첫 프레임은 빈 윤곽 · 불투명도 1 이고 화면 가운데 56px 다(네이티브 스플래시와 같은 자리·크기)", async ({
    page,
  }) => {
    await fakeCapacitor(page);
    // 하이드레이션을 막아 덮개를 붙잡아 둔다 — 앱 번들 요청을 늦춘다
    const hit = await holdChunks(page, { delayMs: 4_000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "commit" });
    const cover = page.getByTestId("app-boot-cover");
    await expect(cover).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-app-boot", "1");
    expect(hit.n).toBeGreaterThan(0);
    const box = await cover.getByTestId("logo-spinner").boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(Math.round(box.width)).toBe(56);
      expect(Math.round(box.x + box.width / 2)).toBe(195);
      expect(Math.round(box.y + box.height / 2)).toBe(422);
    }
    const look = await cover.evaluate((el) => {
      const sp = el.querySelector(".logo-spinner-breathe") as HTMLElement;
      const win = el.querySelector(".lf-win") as HTMLElement;
      return { opacity: getComputedStyle(sp).opacity, delay: getComputedStyle(win).animationDelay };
    });
    expect(look).toEqual({ opacity: "1", delay: "0s" });
  });

  test("하이드레이션이 실패해도 덮개는 8초 뒤 스스로 사라진다(CSS 안전망)", async ({ page }) => {
    test.setTimeout(30_000);
    await fakeCapacitor(page);
    const hit = await holdChunks(page, "abort");
    await page.goto("/", { waitUntil: "commit" });
    const cover = page.getByTestId("app-boot-cover");
    await expect(cover).toBeVisible();
    await expect(cover).toBeHidden({ timeout: 12_000 });
    // 하이드레이션이 아니라 CSS 안전망이 내렸다 — 표식이 그대로 남아 있어야 한다
    expect(hit.n).toBeGreaterThan(0);
    await expect(page.locator("html")).toHaveAttribute("data-app-boot", "1");
  });

  test("서비스 워커가 캐시한 셸로 다시 열어도 덮개가 켜진다(운영 빌드)", async ({ page, context }) => {
    await fakeCapacitor(page);
    await page.goto("/");
    // [원본] BASE 포트 정규식(:32xx·:33xx)으로 건너뛰었다 — 3300(병렬 dev)도 걸렸다(REV-004 웹). 실제 등록 여부로 판단한다.
    const registered = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;
      const ready = navigator.serviceWorker.ready.then(() => true);
      return Promise.race([ready, new Promise<boolean>((r) => setTimeout(() => r(false), 10_000))]);
    });
    test.skip(!registered, "서비스 워커가 등록되지 않는 서버(개발 서버 등)에서는 건너뛴다");
    await page.reload();
    await expect(page.locator("html")).not.toHaveAttribute("data-app-boot", /.*/, { timeout: 10_000 });
    // 오프라인으로 캐시 셸만 — 덮개가 실린 HTML 이 그대로 나와 표식이 켜진다
    await context.setOffline(true);
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        (window as unknown as Record<string, unknown>).__offlineAttr =
          document.documentElement.getAttribute("data-app-boot");
      });
    });
    await page.reload();
    const attr = await page.evaluate(() => (window as unknown as Record<string, unknown>).__offlineAttr);
    expect(attr).toBe("1");
    await context.setOffline(false);
  });

  test("움직임 줄이기 — 덮개는 빈 윤곽에서 멈춘다(다 찬 로고로 튀지 않게)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await fakeCapacitor(page);
    const hit = await holdChunks(page, { delayMs: 3_000 });
    await page.goto("/", { waitUntil: "commit" });
    const cover = page.getByTestId("app-boot-cover");
    await expect(cover).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-app-boot", "1");
    expect(hit.n).toBeGreaterThan(0);
    const fillShown = await cover.evaluate(
      (el) => getComputedStyle(el.querySelector(".lf-win") as HTMLElement).display,
    );
    expect(fillShown).toBe("none");
  });
});

test("웹 브라우저(앱 UA 아님)에서는 덮개가 켜지지 않고 스플래시 호출도 없다", async ({ page }) => {
  await fakeCapacitor(page);
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveAttribute("data-app-boot", /.*/);
  await expect(page.getByTestId("app-boot-cover")).toBeHidden();
  const calls = await page.evaluate(() => (window as unknown as { __splash: unknown[] }).__splash.length);
  expect(calls).toBe(0);
});
