// @plm SRS-085  수동 업데이트 e2e — 진짜 서비스워커로 「새 버전 대기」를 만들어 프로필 버튼 하나로만 적용되는지 본다
//
// 스펙 .ouroboros/docs/spec/20261027_manual-update/spec.md §9.2 (E1~E8)
//
// 진짜 새 워커: 이 테스트를 돌리는 **로컬 운영 빌드**의 public/sw.js 를 BUILD_ID·APP_VERSION 만 바꾼 내용으로 덮어쓰고
// registration.update() → 브라우저가 바뀐 바이트를 보고 진짜로 설치(정적 파일 미리 받기)까지 끝낸 waiting 워커가 생긴다.
// Next 는 public 파일을 그때그때 디스크에서 읽는다(실측). 테스트가 끝나면 원본으로 되돌린다.
// ⚠ 같은 디스크의 서버에 대고만 돈다(운영·다른 세션의 dev 서버에 대고 돌리면 건너뛴다 — SW_FILE 이 없거나 다른 내용).
//
//   BASE=http://127.0.0.1:3500 npx playwright test manual-update     (worktree 의 로컬 운영 빌드)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { 빠른_운동_시작, 세트_기록, 안내_띠_닫기, 종목_추가, 카탈로그_준비 } from "./fixtures/declutter-seed";

const SW_FILE = process.env.SW_FILE ?? fileURLToPath(new URL("../public/sw.js", import.meta.url));
let original = "";
let n = 0;

test.beforeAll(async ({ request }) => {
  try {
    original = readFileSync(SW_FILE, "utf8");
  } catch {
    original = "";
  }
  const served = await (await request.get("/sw.js")).text().catch(() => "");
  test.skip(
    !original || served !== original,
    "이 디스크의 운영 빌드에 대고만 돈다(sw.js 를 바꿔 치기 해야 한다)",
  );
});

test.afterEach(() => {
  if (original) writeFileSync(SW_FILE, original);
});

/** 문서마다 다른 값 — 새로고침되면 바뀐다. 첫 몇 프레임의 부팅 덮개 상태도 적는다. */
async function 문서_표식(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __pageId: number; __coverFrames: boolean[] };
    w.__pageId = Math.random();
    w.__coverFrames = [];
    let k = 0;
    const tick = () => {
      w.__coverFrames.push(document.documentElement.hasAttribute("data-updating"));
      if (++k < 120) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const pageId = (page: Page) => page.evaluate(() => (window as unknown as { __pageId: number }).__pageId);

/** 워커가 이 문서를 제어할 때까지 — 첫 방문은 설치만, 제어는 다음 로드부터일 수 있다. */
async function 워커_제어(page: Page, path = "/"): Promise<void> {
  await page.goto(path);
  const ok = await page
    .waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 })
    .then(() => true)
    .catch(async () => {
      await page.reload();
      return page
        .waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
    });
  expect(ok, "서비스워커가 이 문서를 제어한다").toBe(true);
}

/** 디스크의 sw.js 를 바꿔 진짜 새 워커를 기다리게 한다. */
async function 새_워커(page: Page, opts: { version?: string; ignoreSkip?: boolean } = {}): Promise<string> {
  n += 1;
  const build = `e2e${Date.now()}x${n}`;
  let s = original.replace(/const BUILD_ID = "([^"]*)";/, `const BUILD_ID = "$1-${build}";`);
  s = s.replace(/const APP_VERSION = "[^"]*";/, `const APP_VERSION = "${opts.version ?? "0.49.0"}";`);
  if (opts.ignoreSkip) s = s.replace(`if (event.data === "skip-waiting") self.skipWaiting();`, "");
  writeFileSync(SW_FILE, s);
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.update();
  });
  await expect
    .poll(
      () => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting != null),
      {
        timeout: 30_000,
      },
    )
    .toBe(true);
  return build;
}

const 기다리는_워커 = (page: Page) =>
  page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting != null);

/** 지금 controller 가 답하는 빌드 */
const 제어_빌드 = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string | null>((resolve) => {
        const c = navigator.serviceWorker.controller;
        if (!c) return resolve(null);
        const ch = new MessageChannel();
        const t = setTimeout(() => resolve(null), 2_000);
        ch.port1.onmessage = (e) => {
          clearTimeout(t);
          resolve((e.data as { build?: string })?.build ?? null);
        };
        c.postMessage({ type: "version" }, [ch.port2]);
      }),
  );

test("E8 /app-version — 버전·최소 버전(기본 빈 값) · 캐시 금지", async ({ request }) => {
  const r = await request.get("/app-version");
  expect(r.status()).toBe(200);
  expect(r.headers()["cache-control"]).toBe("no-store");
  expect(await r.json()).toEqual({ version: "0.48.0", minClientVersion: "" });
});

test("E1 대기 없음 — 프로필 「앱 버전 v0.48.0」 · 버튼·탭 점 없음", async ({ page }) => {
  await 워커_제어(page, "/profile");
  await expect(page.getByTestId("app-version-current")).toHaveText("앱 버전 v0.48.0");
  await expect(page.getByTestId("app-update-btn")).toHaveCount(0);
  await expect(page.getByTestId("nav-profile-update-dot")).toHaveCount(0);
});

test("E2·E3 새 버전 대기 → 띠·자동 적용 없음 → 프로필 「업데이트」 → 덮개 → 새 문서", async ({ page }) => {
  test.setTimeout(120_000);
  await 문서_표식(page);
  await 워커_제어(page);
  const id0 = await pageId(page);
  const build = await 새_워커(page, { version: "0.49.0" });

  // E2 — 탭 점 + 접근 이름 · 띠 없음 · 저절로 적용·새로고침 없음(10초 + 화면 이동)
  await expect(page.getByTestId("nav-profile-update-dot")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("nav-profile")).toHaveAccessibleName(/새 버전 있음/);
  await expect(page.getByTestId("sw-update")).toHaveCount(0);
  await page.waitForTimeout(10_000);
  await page.getByTestId("nav-history").click();
  await expect(page).toHaveURL(/\/history/);
  await page.waitForTimeout(2_000);
  expect(await pageId(page), "홈·기록 화면에서 저절로 새로고침하지 않는다").toBe(id0);
  expect(await 기다리는_워커(page), "저절로 skip-waiting 하지 않는다").toBe(true);

  // E3 — 프로필 「업데이트」
  await page.getByTestId("nav-profile").click();
  await expect(page.getByTestId("app-new-version")).toHaveText("새 버전 v0.49.0");
  await expect(page.getByTestId("app-update-btn")).toBeEnabled();
  const box = await page.getByTestId("app-update-btn").boundingBox();
  expect(box?.height ?? 0, "누르는 자리 44px").toBeGreaterThanOrEqual(44);
  await page.getByTestId("app-update-btn").click();
  // 덮개가 뜨면 뒤 화면 입력이 닿지 않는다(가운데 점이 덮개 안 · 뒤 앱 칸은 inert)
  await expect(page.getByTestId("update-overlay")).toBeVisible();
  // 새 문서 — pageId 가 바뀌고 새 워커가 제어한다
  await expect.poll(() => pageId(page).catch(() => id0), { timeout: 20_000 }).not.toBe(id0);
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null);
  expect(await 제어_빌드(page)).toContain(build);
  // 새 문서의 첫 프레임부터 부팅 덮개가 켜져 있다가 내려간다
  const frames = await page.evaluate(() => (window as unknown as { __coverFrames: boolean[] }).__coverFrames);
  expect(frames[0], "첫 프레임 부팅 덮개").toBe(true);
  await expect(page.locator("html")).not.toHaveAttribute("data-updating", /.*/, { timeout: 5_000 });
  await expect(page.getByTestId("update-boot-cover")).toBeHidden();
  await expect(page.getByTestId("update-overlay")).toHaveCount(0);
  await expect(page.getByTestId("app-update-btn")).toHaveCount(0);
  await expect(page.getByTestId("nav-profile-update-dot")).toHaveCount(0);
});

test("E3b 덮개는 뒤 화면 입력을 막는다", async ({ page }) => {
  test.setTimeout(90_000);
  await 워커_제어(page, "/profile");
  await 새_워커(page, { ignoreSkip: true });
  await page.getByTestId("app-update-btn").click();
  await expect(page.getByTestId("update-overlay")).toBeVisible();
  const inertOk = await page.evaluate(() => {
    const ov = document.querySelector('[data-testid="update-overlay"]');
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 30);
    const nav = document.querySelector('[data-testid="shell-nav"]');
    return { onTop: !!ov && !!el && ov.contains(el), navInert: !!nav?.closest("[inert]") };
  });
  expect(inertOk).toEqual({ onTop: true, navInert: true });
  // 탭 바 자리를 눌러도 화면이 바뀌지 않는다
  await page.mouse.click(10, (page.viewportSize()?.height ?? 700) - 20);
  await expect(page).toHaveURL(/\/profile/);
});

test("E4 운동 중이면 버튼 비활성 + 이유", async ({ page }) => {
  test.setTimeout(120_000);
  await 워커_제어(page);
  await 빠른_운동_시작(page);
  await 새_워커(page);
  await page.goto("/profile");
  await expect(page.getByTestId("app-update-btn")).toBeDisabled({ timeout: 15_000 });
  await expect(page.getByTestId("app-update-reason")).toHaveText("운동을 끝낸 뒤 업데이트할 수 있어요");
});

test("E5 요약 화면에서도·요약을 닫은 뒤에도 저절로 새로고침하지 않는다", async ({ page }) => {
  test.setTimeout(240_000);
  await 문서_표식(page);
  await 워커_제어(page);
  await 카탈로그_준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 안내_띠_닫기(page);
  await 세트_기록(page, 0, 0, 60, 8);
  const id0 = await pageId(page);
  await 새_워커(page);
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("finish-name")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(10_000);
  expect(await pageId(page), "요약·완료 시트 위에서 새로고침 없음").toBe(id0);
  await expect(page.getByTestId("finish-name")).toBeVisible();
  await page.getByTestId("btn-finish-dont-save").click();
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await page.waitForTimeout(5_000);
  expect(await pageId(page), "홈으로 돌아와도 새로고침 없음").toBe(id0);
  expect(await 기다리는_워커(page)).toBe(true);
  await expect(page.getByTestId("nav-profile-update-dot")).toBeVisible();
});

test("E6 15초 안에 적용되지 않으면 실패 화면 — 다시 시도 · 닫기", async ({ page }) => {
  test.setTimeout(120_000);
  await 워커_제어(page, "/profile");
  await 새_워커(page, { ignoreSkip: true });
  const t0 = Date.now();
  await page.getByTestId("app-update-btn").click();
  await expect(page.getByTestId("update-overlay-progress")).toBeVisible();
  await expect(page.getByTestId("update-overlay-failed")).toHaveText("업데이트하지 못했어요", {
    timeout: 25_000,
  });
  const waited = Date.now() - t0;
  expect(waited, "15초 언저리에서 실패").toBeGreaterThanOrEqual(14_000);
  expect(waited).toBeLessThan(22_000);
  await expect(page.getByTestId("update-retry")).toBeFocused();
  // 다시 시도 → 진행 화면으로 돌아간다
  await page.getByTestId("update-retry").click();
  await expect(page.getByTestId("update-overlay-progress")).toBeVisible();
  await expect(page.getByTestId("update-overlay-failed")).toBeVisible({ timeout: 25_000 });
  await page.getByTestId("update-close").click();
  await expect(page.getByTestId("update-overlay")).toHaveCount(0);
  await expect(page.getByTestId("app-update-btn")).toBeEnabled();
});

/**
 * 서버의 /app-version 답을 바꾼다 — 문서 안의 fetch 만 바꿔 끼운다(page.route 는 서비스워커가 제어하는 문서에서
 * 요청 가로채기가 워커 수명과 얽힐 수 있어 피한다). 서버 엔드포인트 자체는 E8 이 진짜 요청으로 본다.
 *   once: 다음 한 번만 그 값(이후 진짜 서버) · always: 계속 그 값
 */
async function 서버_버전_바꿔_끼우기(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const orig = window.fetch.bind(window);
    const stub = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/app-version")) {
        const once = sessionStorage.getItem("__appver_once");
        const always = sessionStorage.getItem("__appver_always");
        if (once) sessionStorage.removeItem("__appver_once");
        const body = once ?? always;
        if (body)
          return Promise.resolve(new Response(body, { headers: { "content-type": "application/json" } }));
      }
      return orig(input, init);
    };
    window.fetch = Object.assign(stub, { preconnect: () => {} }) as typeof fetch;
  });
}

test("E7 필수 업데이트 — 운동 화면 밖이면 덮개로 저절로 · 운동 중이면 기다리고 이유만", async ({ page }) => {
  test.setTimeout(180_000);
  await 문서_표식(page);
  await 서버_버전_바꿔_끼우기(page);
  await 워커_제어(page);
  const build = await 새_워커(page);
  const id0 = await pageId(page);
  await page.getByTestId("nav-history").click();
  await expect(page).toHaveURL(/\/history/);
  // 서버가 「최소 0.49.0 · 배포 0.49.0」 이라고 답한다 — 다음 부팅 한 번만(이 테스트의 새 번들은 실제로 0.48.0 이라
  // 업데이트 뒤 문서까지 같은 답이면 다시 필수가 된다 — 실제 배포에서는 새 번들이 0.49.0 이다)
  await page.evaluate(() =>
    sessionStorage.setItem(
      "__appver_once",
      JSON.stringify({ version: "0.49.0", minClientVersion: "0.49.0" }),
    ),
  );
  await page.reload();
  await expect
    .poll(
      async () => {
        const reason = await page
          .locator('[data-testid="update-overlay"][data-phase="failed"]')
          .getAttribute("data-reason", { timeout: 200 })
          .catch(() => null);
        if (reason) return `실패:${reason}`;
        return (await 제어_빌드(page).catch(() => null)) ?? "";
      },
      { timeout: 25_000 },
    )
    .toContain(build);
  expect(await pageId(page)).not.toBe(id0);
  await expect(page).toHaveURL(/\/history/);

  // 운동 중이면 — 덮개 없이 기다린다(운동을 먼저 시작한 뒤 서버가 최소 버전을 올린다)
  await 빠른_운동_시작(page);
  await 새_워커(page, { version: "0.50.0" });
  await page.evaluate(() =>
    sessionStorage.setItem(
      "__appver_always",
      JSON.stringify({ version: "0.50.0", minClientVersion: "0.50.0" }),
    ),
  );
  await page.reload(); // 운동 화면에서 부팅 — 필수지만 운동 화면·진행 중이라 기다린다
  await page.waitForTimeout(5_000);
  await expect(page.getByTestId("update-overlay")).toHaveCount(0);
  await page.goto("/profile");
  await expect(page.getByTestId("app-update-reason")).toHaveText(
    "필수 업데이트예요 · 운동을 끝내면 업데이트해요",
    { timeout: 15_000 },
  );
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId("update-overlay")).toHaveCount(0);
  expect(await 기다리는_워커(page)).toBe(true);
});
