// 안드로이드 앱 자체 배포 e2e (SPEC-018 · SRS-099 · ADR-047)
//
// 서비스워커는 운영 빌드에서만 등록된다 — 로컬 운영 빌드(웹 3200 · API 3201 · 새 DB)에 대고 돌린다:
//   BASE=http://127.0.0.1:3200 bunx playwright test -c frontend/playwright.config.ts app-distribution
// /downloads/ 에는 배포 스크립트가 넣는 android.json · APK 가 있어야 한다(로컬은 build-android-release.sh 출력을 복사).
import { type Browser, expect, test, type Page } from "@playwright/test";

async function 워커_제어(page: Page) {
  await page.goto("/");
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
  test.skip(!ok, "서비스워커가 등록되지 않는 대상(개발 서버) — 운영 빌드에 대고 돌린다");
}

// ── Phase 1 — 정적 배포물 · 서비스 워커 ─────────────────────────────────────────

test("android.json 은 no-store · APK 는 형식·attachment·immutable · Range 206", async ({ request }) => {
  const j = await request.get("/downloads/android.json");
  test.skip(j.status() === 404, "이 대상에는 /downloads/android.json 이 없다(배포물 없이 띄운 서버)");
  expect(j.headers()["cache-control"]).toContain("no-store");
  const meta = await j.json();
  expect(meta.v).toBe(1);
  expect(meta.url).toMatch(/^\/downloads\/liftgram-\d+\.\d+\.\d+-\d+-[0-9a-f]{8}\.apk$/);
  expect(meta.url).toContain(meta.sha256.slice(0, 8));
  expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(meta.certSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(meta.minVersionCode).toBeLessThanOrEqual(meta.versionCode);
  expect(meta.minSignedVersionCode).toBeLessThanOrEqual(meta.versionCode);

  const a = await request.head(meta.url);
  expect(a.status()).toBe(200);
  expect(a.headers()["content-type"]).toBe("application/vnd.android.package-archive");
  expect(a.headers()["content-disposition"]).toBe(`attachment; filename="${meta.url.split("/").pop()}"`);
  expect(a.headers()["cache-control"]).toContain("immutable");
  expect(Number(a.headers()["content-length"])).toBe(meta.size);

  // 화면의 받기 링크(?_rsc=apk — 옛 워커 비켜 가기)도 같은 헤더·같은 바이트(REV-013 계약 H-1)
  const q = await request.head(`${meta.url}?_rsc=apk`);
  expect(q.status()).toBe(200);
  expect(q.headers()["content-type"]).toBe("application/vnd.android.package-archive");
  expect(q.headers()["content-disposition"]).toBe(`attachment; filename="${meta.url.split("/").pop()}"`);
  expect(Number(q.headers()["content-length"])).toBe(meta.size);

  const r = await request.get(meta.url, { headers: { Range: "bytes=0-0" } });
  expect(r.status()).toBe(206);

  // 없는 이름 — Next 404 HTML 이 APK 헤더를 달고 「.apk」로 저장되면 안 된다(Phase 1 qa 웹 M-1)
  const miss = await request.get("/downloads/liftgram-0.0.0-1-deadbeef.apk");
  expect(miss.status()).toBe(404);
  expect(miss.headers()["content-type"]).toContain("text/plain");
  expect(miss.headers()["content-disposition"]).toBeUndefined();
  expect(miss.headers()["cache-control"]).toContain("no-store");
  expect((await request.get("/downloads/..%2Fsw.js")).status()).toBe(404);
});

test("서비스 워커는 /downloads/ 를 가로채지 않는다 — 끊기면 셸이 아니라 네트워크 오류", async ({
  page,
  context,
}) => {
  await 워커_제어(page);
  // 온라인: 워커를 거쳐도 진짜 json
  const online = await page.goto("/downloads/android.json");
  test.skip(online?.status() === 404, "이 대상에는 /downloads/android.json 이 없다");
  expect(online?.headers()["content-type"]).toContain("application/json");
  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null);
  // 셸 캐시에 담기지 않았다
  const cached = await page.evaluate(async () => {
    const out: string[] = [];
    for (const k of await caches.keys())
      for (const r of await (await caches.open(k)).keys())
        if (new URL(r.url).pathname.startsWith("/downloads/")) out.push(`${k} ${r.url}`);
    return out;
  });
  expect(cached).toEqual([]);
  // 끊긴 상태: 옛 규칙이면 /offline 셸(200)을 대신 줬다 — 이제는 브라우저 네트워크 오류
  await context.setOffline(true);
  await expect(page.goto("/downloads/android.json")).rejects.toThrow();
  await context.setOffline(false);

  // 받기 링크를 누르면 워커를 지나 진짜 APK 가 내려받아진다(셸 HTML 이 아니라 · Phase 1 qa 웹 L-2)
  const meta = await (await page.request.get("/downloads/android.json")).json();
  await page.goto("/");
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null);
  await page.evaluate((u) => {
    const a = document.createElement("a");
    a.href = u;
    a.download = "";
    a.id = "e2e-apk";
    a.textContent = "apk";
    document.body.appendChild(a);
  }, meta.url);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#e2e-apk")]);
  expect(dl.suggestedFilename()).toBe(meta.url.split("/").pop());
  const path = await dl.path();
  const { createHash } = await import("node:crypto");
  const { readFileSync } = await import("node:fs");
  expect(createHash("sha256").update(readFileSync(path)).digest("hex")).toBe(meta.sha256);
});

test("옛 워커가 셸 캐시에 담아 둔 /downloads/ 는 새 워커가 활성화될 때 지운다", async ({ page }) => {
  // 워커 스크립트를 붙잡아 두고, 그 사이에 옛 워커가 남긴 것처럼 캐시를 심는다 → 놓아주면 설치·활성화가 청소한다.
  let release: () => void = () => {};
  const held = new Promise<void>((r) => {
    release = r;
  });
  await page.route("**/sw.js", async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/offline");
  await page.evaluate(async () => {
    // 「바로 앞 세대」로 적어 둬야 활성화가 그 캐시를 통째로 지우지 않고 남긴다 — 남은 캐시 안에서 /downloads/ 만 지우는지 본다.
    await (await caches.open("liftgram-meta")).put("/__current_build", new Response("oldbuild"));
    const c = await caches.open("liftgram-pages-oldbuild");
    await c.put("/downloads/android.json", new Response("{}"));
    await c.put("/downloads/liftgram-0.0.0-1-deadbeef.apk", new Response("x"));
    await c.put("/history", new Response("shell"));
  });
  release();
  const ok = await page
    .waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!ok, "서비스워커가 등록되지 않는 대상(개발 서버)");
  const left = await page.evaluate(async () => {
    const out: string[] = [];
    for (const k of await caches.keys())
      for (const r of await (await caches.open(k)).keys()) out.push(`${k} ${new URL(r.url).pathname}`);
    return out
      .map((x) => x.split(" ")[1])
      .concat(out.filter((x) => x.startsWith("liftgram-pages-oldbuild ")));
  });
  // 앞 세대 캐시가 **그 이름 그대로** 남아 /history 를 들고 있다 — 캐시째 지운 게 아니다(새 워커 셸과 헷갈리지 않게 · Phase 1 qa 웹 L-1)
  expect(left).toContain("liftgram-pages-oldbuild /history");
  expect(left.filter((p) => p.startsWith("/downloads/"))).toEqual([]);
});

// ── Phase 4 — 판정 · 웹 화면 ───────────────────────────────────────────────────
//
// 최신판 json 은 시험마다 가짜로 준다(page.route) — 배포물 없이도 돈다. 앱은 window.Capacitor 를 흉내 낸다.

const SHA = "76a28bfb81c80fa25e0f26aa92f5775f9e3f2920f6e37fb5cb04da6150bd2583";
const CERT = "7d124a8d64e38b3f2ed6e4308188d336d18f87f23f0a42a3fa7e1e23fae780b8";
const OTHER = "50ef6650b9c6345aacbde2e998fb1808c3f9be0dd41790b5b46435b926ac91a4";
const UA_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const UA_SAMSUNG = UA_CHROME.replace("Chrome/130", "SamsungBrowser/26.0 Chrome/130");
const UA_KAKAO = `${UA_CHROME} KAKAOTALK 10.8.0`;
const UA_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const PW = "hunter22!";

function latestJson(o: Record<string, unknown> = {}) {
  return {
    v: 1,
    versionName: "1.2.1",
    versionCode: 4,
    url: `/downloads/liftgram-1.2.1-4-${SHA.slice(0, 8)}.apk`,
    sha256: SHA,
    size: 3202532,
    certSha256: CERT,
    minVersionCode: 1,
    minSignedVersionCode: 3,
    ...o,
  };
}

async function 최신판(page: Page, o: Record<string, unknown> = {}) {
  await page.route("**/downloads/android.json", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(latestJson(o)) }),
  );
}

async function 가입(page: Page, tag: string) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page
    .getByTestId("auth-email-input")
    .fill(`e2e-dist-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`);
  await page.getByTestId("auth-password-input").fill(PW);
  await page.getByTestId("auth-name-input").fill("배포");
  await page.getByTestId("age-confirm").check();
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

type FakeApp = {
  bridge?: boolean;
  os?: "android" | "ios";
  versionCode?: number;
  certSha256?: string | null;
  installer?: string | null;
  debug?: boolean;
  canInstall?: boolean;
  downloadFail?: string;
  installFail?: string;
  justUpdated?: { from: number; to: number } | null;
};

/** 가짜 앱 웹뷰 — LiftgramUpdate 다리 · Browser · App. 부른 기록은 window.__upd */
async function 가짜앱(browser: Browser, f: FakeApp = {}): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.addInitScript((cfg: FakeApp) => {
    const w = window as unknown as Record<string, unknown>;
    const state = {
      calls: [] as string[],
      opened: [] as string[],
      listeners: {} as Record<string, Array<(d: Record<string, unknown>) => void>>,
    };
    w.__upd = state;
    const emit = (ev: string, d: Record<string, unknown>) => {
      for (const fn of state.listeners[ev] ?? []) fn(d);
    };
    w.__emit = emit;
    const err = (code: string) => Object.assign(new Error(code), { code });
    const upd = {
      info: async () => {
        state.calls.push("info");
        return {
          versionName: "1.2.0",
          versionCode: cfg.versionCode ?? 3,
          certSha256:
            cfg.certSha256 === undefined
              ? "7d124a8d64e38b3f2ed6e4308188d336d18f87f23f0a42a3fa7e1e23fae780b8"
              : cfg.certSha256,
          expectedCertSha256: "7d124a8d64e38b3f2ed6e4308188d336d18f87f23f0a42a3fa7e1e23fae780b8",
          installer: cfg.installer ?? null,
          debug: cfg.debug ?? false,
          canInstall: cfg.canInstall ?? true,
          sdk: 34,
          metered: false,
          justUpdated: cfg.justUpdated ?? null,
        };
      },
      state: async () => ({ downloading: null, installing: null, confirmWaiting: false, lastResult: null }),
      ackJustUpdated: async () => {
        state.calls.push("ack");
        return {};
      },
      download: async (o: { url: string; sha256: string; size: number }) => {
        state.calls.push(`download:${o.url}`);
        if (cfg.downloadFail) throw err(cfg.downloadFail);
        emit("progress", { received: o.size / 2, total: o.size });
        await new Promise((r) => setTimeout(r, 100));
        emit("progress", { received: o.size, total: o.size });
        return { id: o.sha256 };
      },
      cancelDownload: async () => {
        state.calls.push("cancelDownload");
        return {};
      },
      install: async (o: { id: string; mode?: string }) => {
        state.calls.push(`install:${o.mode ?? "session"}`);
        if (cfg.installFail) throw err(cfg.installFail);
        return { mode: o.mode ?? "session", sessionId: 1 };
      },
      cancelInstall: async () => {
        state.calls.push("cancelInstall");
        return {};
      },
      openInstallSettings: async () => {
        state.calls.push("settings");
        return { opened: true };
      },
      addListener: async (ev: string, fn: (d: Record<string, unknown>) => void) => {
        if (!state.listeners[ev]) state.listeners[ev] = [];
        state.listeners[ev].push(fn);
        return { remove: async () => {} };
      },
    };
    w.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => cfg.os ?? "android",
      isPluginAvailable: (n: string) =>
        n === "App" || n === "Browser" || (n === "LiftgramUpdate" && cfg.bridge !== false),
      Plugins: {
        LiftgramUpdate: upd,
        Browser: {
          open: async (o: { url: string }) => {
            state.opened.push(o.url);
          },
          close: async () => {},
          addListener: async () => ({ remove: async () => {} }),
        },
        App: {
          addListener: async () => ({ remove: async () => {} }),
          getLaunchUrl: async () => ({}),
        },
      },
    };
  }, f);
  return page;
}

/** 판정이 끝났다는 표식(app-offer-state)을 기다린 뒤 띠가 없는지 본다 — waitForTimeout 대신(REV-013 시험 M-1) */
async function 띠_없음(page: Page) {
  await expect(page.getByTestId("app-offer-state")).toHaveAttribute("data-kind", "none", { timeout: 20_000 });
  await expect(page.getByTestId("app-dist-banner")).toHaveCount(0);
}

const 호출 = (page: Page) =>
  page.evaluate(() => (window as unknown as { __upd: { calls: string[] } }).__upd.calls);

test("안드로이드 크롬 PWA — 바꾸기: 끊김·설정 대기면 멈춤 → 0건 → APK 링크 → intent(코드 없음·package·fallback /app) → 끝", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ userAgent: UA_CHROME });
  const page = await ctx.newPage();
  await 최신판(page);
  await 가입(page, "pwa");
  await page.goto("/");
  await expect(page.getByTestId("app-dist-banner")).toHaveAttribute("data-kind", "switch", {
    timeout: 20_000,
  });
  await page.getByTestId("btn-app-dist-open").click();
  await expect(page.getByTestId("switch-step")).toHaveAttribute("data-step", "check");

  // 설정 대기가 남았으면 멈춘다
  await page.evaluate(() =>
    localStorage.setItem(
      "liftgram.prefsPending",
      JSON.stringify({ weekly_goal: { value: "3", at: Date.now() } }),
    ),
  );
  await page.getByTestId("btn-switch-check").click();
  await expect(page.getByTestId("switch-check-fail")).toHaveAttribute("data-why", "prefs", {
    timeout: 20_000,
  });
  await page.evaluate(() => localStorage.removeItem("liftgram.prefsPending"));

  // 동기가 실패하면 멈춘다
  await page.route("**/api/sync.v1.SyncService/**", (r) => r.abort());
  await page.getByTestId("btn-switch-check").click();
  await expect(page.getByTestId("switch-check-fail")).toHaveAttribute("data-why", "sync-failed", {
    timeout: 20_000,
  });
  await page.unroute("**/api/sync.v1.SyncService/**");

  // 끊긴 상태
  await ctx.setOffline(true);
  await page.getByTestId("btn-switch-check").click();
  await expect(page.getByTestId("switch-check-fail")).toHaveAttribute("data-why", "offline");
  await ctx.setOffline(false);

  // 통과 → APK 받기
  await page.getByTestId("btn-switch-check").click();
  await expect(page.getByTestId("switch-check-ok")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("switch-step")).toHaveAttribute("data-step", "download");
  const apk = page.getByTestId("switch-apk-link");
  // 옛 서비스 워커가 가로채지 않게 _rsc 를 붙인다(REV-013 계약 H-1)
  await expect(apk).toHaveAttribute("href", `${latestJson().url}?_rsc=apk`);
  await expect(apk).toHaveAttribute("download", "");
  await expect(page.getByTestId("switch-manual")).toHaveCount(0);

  // 단계는 남는다(설치하고 돌아와도) — 단, 돌아오면 다시 확인한다: 그 사이 동기가 실패하면 1단계로(REV-013 보안 H-1)
  await page.route("**/api/sync.v1.SyncService/**", (r) => r.abort());
  await page.reload();
  await page.getByTestId("btn-app-dist-open").click({ timeout: 20_000 });
  await expect(page.getByTestId("switch-check-fail")).toHaveAttribute("data-why", "sync-failed", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("switch-step")).toHaveAttribute("data-step", "check");
  await page.unroute("**/api/sync.v1.SyncService/**");
  await page.getByTestId("btn-switch-check").click();
  await expect(page.getByTestId("switch-step")).toHaveAttribute("data-step", "download", { timeout: 20_000 });
  await page.reload();
  await page.getByTestId("btn-app-dist-open").click({ timeout: 20_000 });
  await expect(page.getByTestId("switch-step")).toHaveAttribute("data-step", "download", { timeout: 20_000 });
  await expect(page.getByTestId("switch-check-ok")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("btn-switch-installed").click();
  await expect(page.getByTestId("switch-step")).toHaveAttribute("data-step", "open", { timeout: 20_000 });
  const href = (await page.getByTestId("switch-open-app").getAttribute("href")) ?? "";
  expect(href).toMatch(/^intent:\/\/start#Intent;scheme=liftgram;package=org\.tarae\.liftgram;/);
  expect(href).toContain(`S.browser_fallback_url=${encodeURIComponent(`${new URL(page.url()).origin}/app`)}`);
  expect(href).not.toMatch(/code|ac=|token/i);
  await page.getByTestId("btn-switch-next").click();
  await expect(page.getByTestId("switch-done")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-switch-finish").click();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith("liftgram.appSwitch.step")),
    ),
  ).toEqual([]);
  await ctx.close();
});

test("브라우저 갈래 — 삼성 인터넷은 manual 안내 · 인앱·iOS·데스크톱·로그아웃은 띠 없음", async ({
  browser,
}) => {
  const s = await browser.newContext({ userAgent: UA_SAMSUNG });
  const sp = await s.newPage();
  await 최신판(sp);
  await 가입(sp, "samsung");
  await sp.goto("/");
  await expect(sp.getByTestId("app-dist-banner")).toHaveAttribute("data-kind", "switch", { timeout: 20_000 });
  await sp.getByTestId("btn-app-dist-open").click();
  await sp.getByTestId("btn-switch-check").click();
  await expect(sp.getByTestId("switch-manual")).toBeVisible({ timeout: 20_000 });
  await s.close();

  for (const ua of [UA_KAKAO, UA_IOS, undefined]) {
    const c = await browser.newContext(ua ? { userAgent: ua } : {});
    const p = await c.newPage();
    await 최신판(p);
    await 가입(p, "none");
    await p.goto("/");
    await expect(p.getByTestId("btn-quick-start")).toBeVisible({ timeout: 20_000 });
    await 띠_없음(p);
    await p.goto("/profile");
    await expect(p.getByTestId("app-version-row")).toBeVisible({ timeout: 20_000 });
    await expect(p.getByTestId("app-update-card")).toHaveCount(0);
    await c.close();
  }
  // 로그아웃한 안드로이드 크롬 — 바꾸기를 권하지 않는다(로그인부터)
  const anon = await browser.newContext({ userAgent: UA_CHROME });
  const ap = await anon.newPage();
  await 최신판(ap);
  await ap.goto("/");
  await expect(ap.getByTestId("btn-quick-start")).toBeVisible({ timeout: 20_000 });
  await 띠_없음(ap);
  await anon.close();
});

test("새 앱 — 업데이트 시트: 받기 진행 → 「업데이트」 → 확인 화면 대기 · 프로필 카드 배지·지문", async ({
  browser,
}) => {
  const page = await 가짜앱(browser);
  await 최신판(page);
  await page.goto("/");
  await expect(page.getByTestId("app-dist-banner")).toHaveAttribute("data-kind", "update", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("app-dist-title")).toContainText("1.2.1");
  await page.getByTestId("btn-app-dist-open").click();
  await expect(page.getByTestId("app-update-size")).toContainText("3.1MB");
  await page.getByTestId("btn-app-update-download").click();
  await expect(page.getByTestId("app-update-phase")).toHaveAttribute("data-phase", "ready", {
    timeout: 20_000,
  });
  await page.getByTestId("btn-app-update-install").click();
  await expect(page.getByTestId("app-update-phase")).toHaveAttribute("data-phase", "installing");
  expect(await 호출(page)).toEqual(
    expect.arrayContaining([`download:${latestJson().url}`, "install:session"]),
  );

  await page.goto("/profile");
  await expect(page.getByTestId("app-update-card")).toHaveAttribute("data-kind", "update", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("app-update-card-badge")).toHaveAttribute(
    "data-badge",
    "appDist.badgeUpdate",
  );
  await expect(page.getByTestId("app-update-card-fp")).toHaveCount(0); // 서명 지문은 보이지 않는다(SPEC-025)
  await page.context().close();
});

test("새 앱 — 실패 코드별 문구 · aborted 는 이어서 · downgrade 는 「이미 최신」 · 설치 허용 꺼짐 → 설정", async ({
  browser,
}) => {
  // 받기 실패(hash)
  const a = await 가짜앱(browser, { downloadFail: "hash" });
  await 최신판(a);
  await a.goto("/");
  await a.getByTestId("btn-app-dist-open").click({ timeout: 20_000 });
  await a.getByTestId("btn-app-update-download").click();
  await expect(a.getByTestId("app-update-error")).toHaveAttribute("data-code", "hash");
  await expect(a.getByTestId("app-update-error")).toContainText("손상");
  await a.context().close();

  // 설치 단계 실패(downgrade) — 다시 시도 버튼 없음
  const b = await 가짜앱(browser, { installFail: "downgrade" });
  await 최신판(b);
  await b.goto("/");
  await b.getByTestId("btn-app-dist-open").click({ timeout: 20_000 });
  await b.getByTestId("btn-app-update-download").click();
  await b.getByTestId("btn-app-update-install").click({ timeout: 20_000 });
  await expect(b.getByTestId("app-update-error")).toHaveAttribute("data-code", "downgrade");
  await expect(b.getByTestId("app-update-error")).toContainText("이미 최신");
  await expect(b.getByTestId("btn-app-update-install")).toHaveCount(0);
  await expect(b.getByTestId("btn-app-update-download")).toHaveCount(0);

  // 확인 화면에서 취소(aborted 이벤트) → 다시 누르면 이어서(받기 없이 설치)
  const c = await 가짜앱(browser);
  await 최신판(c);
  await c.goto("/");
  await c.getByTestId("btn-app-dist-open").click({ timeout: 20_000 });
  await c.getByTestId("btn-app-update-download").click();
  await c.getByTestId("btn-app-update-install").click({ timeout: 20_000 });
  await expect(c.getByTestId("app-update-phase")).toHaveAttribute("data-phase", "installing");
  await c.evaluate(() =>
    (window as unknown as { __emit: (e: string, d: unknown) => void }).__emit("installResult", {
      status: "aborted",
      sessionId: 1,
      at: Date.now(),
    }),
  );
  await expect(c.getByTestId("app-update-error")).toHaveAttribute("data-code", "aborted");
  // 실기기(갤럭시) aborted 반복 — 우회 길: 대체 설치 · 브라우저로 받기 · 원인 코드(누가 판정했나)
  await expect(c.getByTestId("app-update-error-detail")).toHaveAttribute("data-src", "result");
  await expect(c.getByTestId("btn-app-update-view")).toBeVisible();
  await expect(c.getByTestId("btn-app-update-browser")).toBeVisible();
  // 브라우저 길 — 같은 출처 절대 주소 + 옛 서비스 워커 비켜 가기(?_rsc=apk)
  await c.getByTestId("btn-app-update-browser").click();
  await expect
    .poll(() =>
      c.evaluate(() => (window as unknown as { __upd: { opened: string[] } }).__upd.opened.at(-1) ?? ""),
    )
    .toMatch(/^http:\/\/[^/]+\/downloads\/liftgram-[^?]+\.apk\?_rsc=apk$/);
  await c.getByTestId("btn-app-update-install").click();
  await expect(c.getByTestId("app-update-phase")).toHaveAttribute("data-phase", "installing");
  expect((await 호출(c)).filter((x) => x.startsWith("download:"))).toHaveLength(1);

  // blocked → 대체 설치는 한 번만
  await c.evaluate(() =>
    (window as unknown as { __emit: (e: string, d: unknown) => void }).__emit("installResult", {
      status: "blocked",
      sessionId: 1,
      at: Date.now(),
    }),
  );
  await c.getByTestId("btn-app-update-view").click();
  await expect.poll(() => 호출(c)).toContain("install:view");
  await c.evaluate(() =>
    (window as unknown as { __emit: (e: string, d: unknown) => void }).__emit("installResult", {
      status: "blocked",
      sessionId: 1,
      at: Date.now(),
    }),
  );
  await expect(c.getByTestId("app-update-error")).toHaveAttribute("data-code", "blocked");
  await expect(c.getByTestId("btn-app-update-view")).toHaveCount(0);
  await expect(c.getByTestId("btn-app-update-browser")).toBeVisible(); // 대체 설치를 써 본 뒤에도 브라우저 길은 남는다
  // 경계 — expired 는 브라우저 길만 · 목록 밖 코드(conflict)는 둘 다 없음
  for (const [status, browserN] of [
    ["expired", 1],
    ["conflict", 0],
  ] as const) {
    await c.evaluate(
      (st) =>
        (window as unknown as { __emit: (e: string, d: unknown) => void }).__emit("installResult", {
          status: st,
          sessionId: 1,
          at: Date.now(),
        }),
      status,
    );
    await expect(c.getByTestId("app-update-error")).toHaveAttribute("data-code", status);
    await expect(c.getByTestId("btn-app-update-view")).toHaveCount(0);
    await expect(c.getByTestId("btn-app-update-browser")).toHaveCount(browserN);
  }
  await c.context().close();
  await b.context().close();

  // 설치 허용 꺼짐 → 설정 단계
  const d = await 가짜앱(browser, { canInstall: false });
  await 최신판(d);
  await d.goto("/");
  await d.getByTestId("btn-app-dist-open").click({ timeout: 20_000 });
  await d.getByTestId("btn-app-update-download").click();
  await expect(d.getByTestId("app-update-allow")).toBeVisible();
  await d.getByTestId("btn-app-update-settings").click();
  await expect.poll(() => 호출(d)).toContain("settings");
  await d.context().close();
});

test("새 앱 — 띠 없음: 최신 ≤ 설치본 · 플레이 설치본 · 개발 빌드(지문 다름) · 운동 중 · 막 업데이트되면 한 번 알림", async ({
  browser,
}) => {
  const cases: Array<[FakeApp, string]> = [
    [{ versionCode: 4 }, "appDist.badgeLatest"],
    [{ versionCode: 5 }, "appDist.badgeLatest"],
    [{ installer: "com.android.vending" }, "appDist.badgePlay"],
    [{ debug: true, certSha256: OTHER }, "appDist.badgeDebug"],
  ];
  for (const [cfg, badge] of cases) {
    const p = await 가짜앱(browser, cfg);
    await 최신판(p);
    await p.goto("/");
    await expect(p.getByTestId("btn-quick-start")).toBeVisible({ timeout: 20_000 });
    await 띠_없음(p);
    await p.goto("/profile");
    await expect(p.getByTestId("app-update-card-badge")).toHaveAttribute("data-badge", badge, {
      timeout: 20_000,
    });
    await p.context().close();
  }

  // 운동 중이면 띠가 없다 · 끝나면 다시
  const w = await 가짜앱(browser);
  await 최신판(w);
  await w.goto("/");
  await expect(w.getByTestId("app-dist-banner")).toBeVisible({ timeout: 20_000 });
  await w.getByTestId("btn-quick-start").click();
  await expect(w).toHaveURL(/\/workout/, { timeout: 20_000 });
  await w.goto("/");
  await expect(w.getByTestId("btn-quick-start").or(w.getByTestId("btn-resume-workout")).first()).toBeVisible({
    timeout: 20_000,
  });
  await 띠_없음(w);
  await w.context().close();

  // 막 업데이트돼 다시 열림 — 알림 한 번 · 표식 지움
  const j = await 가짜앱(browser, { versionCode: 4, justUpdated: { from: 3, to: 4 } });
  await 최신판(j);
  await j.goto("/");
  await expect(j.getByText("1.2.0(으)로 업데이트됐어요")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => 호출(j)).toContain("ack");
  await j.context().close();
});

test("옛 앱(다리 없음) → 재설치: 기록 확인 → 시스템 브라우저로 /app · 다른 키 앱도 재설치 · iOS 앱은 없음", async ({
  browser,
}) => {
  const old = await 가짜앱(browser, { bridge: false });
  await 최신판(old);
  await 가입(old, "old");
  await old.goto("/");
  await expect(old.getByTestId("app-dist-banner")).toHaveAttribute("data-kind", "reinstall", {
    timeout: 20_000,
  });
  await old.getByTestId("btn-app-dist-open").click();
  await old.getByTestId("btn-switch-check").click();
  await expect
    .poll(
      () =>
        old.evaluate(() => (window as unknown as { __upd: { opened: string[] } }).__upd.opened.at(-1) ?? ""),
      {
        timeout: 20_000,
      },
    )
    .toMatch(/\/app$/);
  await old.context().close();

  const other = await 가짜앱(browser, { certSha256: OTHER });
  await 최신판(other);
  await other.goto("/");
  await expect(other.getByTestId("app-dist-banner")).toHaveAttribute("data-kind", "reinstall", {
    timeout: 20_000,
  });
  await other.context().close();

  const ios = await 가짜앱(browser, { os: "ios", bridge: false });
  await 최신판(ios);
  await ios.goto("/");
  await expect(ios.getByTestId("btn-quick-start")).toBeVisible({ timeout: 20_000 });
  await 띠_없음(ios);
  await ios.goto("/profile");
  await expect(ios.getByTestId("app-version-row")).toBeVisible({ timeout: 20_000 });
  await expect(ios.getByTestId("app-update-card")).toHaveCount(0);
  await ios.context().close();
});

test("「나중에」 — 숨김 · 새로고침해도 숨김 · 새 버전이면 다시 · 꼭 해야 하는 업데이트는 「나중에」 없음", async ({
  browser,
}) => {
  const p = await 가짜앱(browser);
  await 최신판(p);
  await p.goto("/");
  await p.getByTestId("btn-app-dist-later").click({ timeout: 20_000 });
  await expect(p.getByTestId("app-dist-banner")).toHaveCount(0);
  const rec = JSON.parse(
    (await p.evaluate(() => localStorage.getItem("liftgram.appDist.dismissed"))) ?? "{}",
  );
  expect(rec.key).toBe("update:4");
  expect(rec.until - Date.now()).toBeGreaterThan(2.9 * 86_400_000);
  await p.reload();
  await expect(p.getByTestId("btn-quick-start")).toBeVisible({ timeout: 20_000 });
  await expect(p.getByTestId("app-offer-state")).toHaveAttribute("data-why", "dismissed", {
    timeout: 20_000,
  });
  await expect(p.getByTestId("app-dist-banner")).toHaveCount(0);
  // 프로필 카드는 늘 보인다
  await p.goto("/profile");
  await expect(p.getByTestId("app-update-card")).toHaveAttribute("data-kind", "update", { timeout: 20_000 });

  await p.unroute("**/downloads/android.json");
  await 최신판(p, {
    versionName: "1.2.2",
    versionCode: 5,
    url: `/downloads/liftgram-1.2.2-5-${SHA.slice(0, 8)}.apk`,
  });
  await p.goto("/");
  await expect(p.getByTestId("app-dist-title")).toContainText("1.2.2", { timeout: 20_000 });

  await p.unroute("**/downloads/android.json");
  await 최신판(p, {
    versionName: "1.2.2",
    versionCode: 5,
    minVersionCode: 4,
    url: `/downloads/liftgram-1.2.2-5-${SHA.slice(0, 8)}.apk`,
  });
  await p.goto("/");
  await expect(p.getByTestId("app-dist-banner")).toBeVisible({ timeout: 20_000 });
  await expect(p.getByTestId("btn-app-dist-later")).toHaveCount(0);
  await p.context().close();
});

test("공개 /app — 버전·크기·지문 전체·받기 · 인앱이면 크롬으로 열기 · 워커가 가로채지 않음", async ({
  browser,
}) => {
  const c = await browser.newContext({ userAgent: UA_CHROME });
  const p = await c.newPage();
  await 최신판(p);
  await p.goto("/app");
  await expect(p.getByTestId("app-page-version")).toContainText("1.2.1", { timeout: 20_000 });
  await expect(p.getByTestId("app-page-download")).toHaveAttribute("href", `${latestJson().url}?_rsc=apk`);
  await expect(p.getByTestId("app-page-fp")).toHaveCount(0); // 서명 지문은 보이지 않는다(SPEC-025)
  await c.close();

  const k = await browser.newContext({ userAgent: UA_KAKAO });
  const kp = await k.newPage();
  await 최신판(kp);
  await kp.goto("/app");
  await expect(kp.getByTestId("app-page-inapp")).toBeVisible({ timeout: 20_000 });
  await expect(kp.getByTestId("app-page-open-browser")).toHaveAttribute(
    "href",
    /^intent:\/\/[^/]+\/app#Intent;scheme=https;package=com\.android\.chrome;end$/,
  );
  await expect(kp.getByTestId("app-page-download")).toHaveCount(0);
  await k.close();

  // 워커가 제어하는 문서에서도 /app 은 네트워크로(끊기면 셸 대신 오류)
  const sw = await browser.newContext();
  const sp = await sw.newPage();
  await 워커_제어(sp);
  await sw.setOffline(true);
  await expect(sp.goto("/app")).rejects.toThrow();
  await sw.setOffline(false);
  await sw.close();
});

// ── REV-013 반영 시험 ──────────────────────────────────────────────────────────

test("REV-013 — 「설치 취소」로 설치 중에서 빠져나옴 · 운동을 시작하면 기다리던 설치를 거둠", async ({
  browser,
}) => {
  const p = await 가짜앱(browser);
  await 최신판(p);
  await p.goto("/");
  await p.getByTestId("btn-app-dist-open").click({ timeout: 20_000 });
  await p.getByTestId("btn-app-update-download").click();
  await p.getByTestId("btn-app-update-install").click({ timeout: 20_000 });
  await expect(p.getByTestId("app-update-phase")).toHaveAttribute("data-phase", "installing");
  // 앱이 이벤트를 안 보내도(대기 중) 갇히지 않는다
  await p.getByTestId("btn-app-update-cancel-install").click();
  await expect(p.getByTestId("app-update-phase")).toHaveAttribute("data-phase", "ready");
  await expect.poll(() => 호출(p)).toContain("cancelInstall");
  // 다른 세션의 결과는 버린다
  await p.getByTestId("btn-app-update-install").click();
  await expect(p.getByTestId("app-update-phase")).toHaveAttribute("data-phase", "installing");
  await p.evaluate(() =>
    (window as unknown as { __emit: (e: string, d: unknown) => void }).__emit("installResult", {
      status: "failure",
      sessionId: 99,
      at: Date.now(),
    }),
  );
  await expect(p.getByTestId("app-update-phase")).toHaveAttribute("data-phase", "installing");
  await p.getByTestId("btn-app-update-close").click();

  // 운동 시작 → 설치 표식이 있으면 cancelInstall
  await p.evaluate(() => {
    const u = (window as unknown as { Capacitor: { Plugins: { LiftgramUpdate: Record<string, unknown> } } })
      .Capacitor.Plugins.LiftgramUpdate;
    u.state = async () => ({
      downloading: null,
      installing: { sessionId: 1, at: Date.now() },
      confirmWaiting: true,
      lastResult: null,
    });
  });
  const before = (await 호출(p)).filter((x) => x === "cancelInstall").length;
  await p.getByTestId("btn-quick-start").click();
  await expect(p).toHaveURL(/\/workout/, { timeout: 20_000 });
  await expect
    .poll(async () => (await 호출(p)).filter((x) => x === "cancelInstall").length, { timeout: 20_000 })
    .toBeGreaterThan(before);
  await p.context().close();
});

test("REV-013 — 「다시 보지 않기」는 새 버전에도 · 다른 계정의 바꾸기 단계는 이어지지 않음", async ({
  browser,
}) => {
  const c = await browser.newContext({ userAgent: UA_CHROME });
  const p = await c.newPage();
  await 최신판(p);
  await 가입(p, "never");
  await p.goto("/");
  await p.getByTestId("btn-app-dist-never").click({ timeout: 20_000 });
  await 띠_없음(p);
  await p.unroute("**/downloads/android.json");
  await 최신판(p, {
    versionName: "1.3.0",
    versionCode: 9,
    url: `/downloads/liftgram-1.3.0-9-${SHA.slice(0, 8)}.apk`,
  });
  await p.goto("/");
  await expect(p.getByTestId("app-offer-state")).toHaveAttribute("data-why", "dismissed", {
    timeout: 20_000,
  });
  await expect(p.getByTestId("app-dist-banner")).toHaveCount(0);
  // 다른 사용자의 단계가 남아 있어도 이 사용자는 1단계부터
  await p.evaluate(() => localStorage.setItem("liftgram.appSwitch.step:someone-else", "done"));
  await p.goto("/profile");
  await p.getByTestId("app-update-card").click({ timeout: 20_000 });
  await expect(p.getByTestId("switch-step")).toHaveAttribute("data-step", "check");
  await c.close();
});

test("REV-013 — /app: 안내 파일의 지문이 릴리스 지문과 다르면 받기를 내지 않음", async ({ browser }) => {
  const c = await browser.newContext({ userAgent: UA_CHROME });
  const p = await c.newPage();
  await 최신판(p, { certSha256: OTHER });
  await p.goto("/app");
  await expect(p.getByTestId("app-page-cert-mismatch")).toBeVisible({ timeout: 20_000 });
  await expect(p.getByTestId("app-page-download")).toHaveCount(0);
  await c.close();
});
