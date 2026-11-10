// 영상·글로 루틴 가져오기 e2e(SPEC-054 Phase 3 · SRS-116 · ADR-063)
//   글 → 확인 → 저장 · 못 찾은 줄 고르기 · 후보 칩 · 링크(가짜 응답) · 로그인 없음·없는 영상 문구 ·
//   새로고침 뒤 초안 복원 · 원문 미저장(저장소 4종 + 요청 본문) · 여러 날 → 목록 안내
import { expect, type Page, test } from "@playwright/test";
import { 내려쓰기_대기 } from "./helpers/opengym";

const DESCRIBE = "**/video.v1.VideoService/DescribeVideo";
const VID = "dQw4w9WgXcQ";
/** 원문 표식 — 이 글자가 저장소·요청 본문 어디에도 남으면 안 된다(ADR-063) */
const MARK = "원문표식ZQX";

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });
}

async function 가져오기_열기(page: Page) {
  await page.goto("/");
  await page.getByTestId("btn-routine-import").click();
  await expect(page.getByTestId("import-input")).toBeVisible({ timeout: 20_000 });
}

async function 초안(page: Page, text: string) {
  await page.getByTestId("import-text").fill(text);
  await page.getByTestId("import-make").click();
  await expect(page.getByTestId("import-review")).toBeVisible({ timeout: 20_000 });
}

/** 기기 저장소 4종(localStorage·sessionStorage·IndexedDB·Cache Storage)에 표식이 있나 */
async function 저장소에_표식(page: Page, mark: string): Promise<string[]> {
  return page.evaluate(async (m) => {
    const hits: string[] = [];
    for (const [name, st] of [
      ["localStorage", localStorage],
      ["sessionStorage", sessionStorage],
    ] as const) {
      for (let i = 0; i < st.length; i++) {
        const k = st.key(i) ?? "";
        if ((st.getItem(k) ?? "").includes(m) || k.includes(m)) hits.push(`${name}:${k}`);
      }
    }
    const dbs = (await indexedDB.databases?.()) ?? [];
    for (const d of dbs) {
      if (!d.name) continue;
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open(d.name as string);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      for (const store of [...db.objectStoreNames]) {
        const all = await new Promise<unknown[]>((res) => {
          const req = db.transaction(store, "readonly").objectStore(store).getAll();
          req.onsuccess = () => res(req.result);
          req.onerror = () => res([]);
        });
        if (JSON.stringify(all).includes(m)) hits.push(`indexedDB:${d.name}/${store}`);
      }
      db.close();
    }
    for (const c of await caches.keys()) {
      const cache = await caches.open(c);
      for (const req of await cache.keys()) {
        const body = await (await cache.match(req))?.text();
        if (body?.includes(m)) hits.push(`cache:${c}`);
      }
    }
    return hits;
  }, mark);
}

test("글 → 초안 → 확인 → 저장 — 하루짜리는 편집기로 · 표기 없음·못 찾음·후보 칩 · 세트 시트", async ({
  page,
}) => {
  await 카탈로그_준비(page);
  await 가져오기_열기(page);
  await 초안(
    page,
    `바벨 스쿼트 5x5\n레그 프레스 4x10\n벤치프레스 3세트 10회\n뽀로로 ${MARK} 3x12\n레그 익스텐션`,
  );

  const rows = page.getByTestId("import-row");
  // 처방 목록 글에서 처방 없는 이름 줄(레그 익스텐션)은 줄이 아니라 「언급만」으로 빠진다(해석기 설계)
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText("바벨 스쿼트");
  await expect(rows.nth(0)).toContainText("5세트 × 5회");
  const mentioned = page.getByTestId("import-mentioned");
  await mentioned.locator("summary").click();
  await mentioned.getByTestId("import-mentioned-add").first().click();
  await expect(rows).toHaveCount(5);
  await expect(page.getByTestId("import-mentioned")).toHaveCount(0);
  // 처방이 없는 줄은 기본값 + 「표기 없음」
  await expect(rows.nth(4)).toContainText("레그 익스텐션");
  await expect(rows.nth(4).getByTestId("import-row-default")).toBeVisible();
  // 확인 필요 줄 — 이름을 누르면 후보 칩
  const review = rows.nth(2);
  await expect(review).toHaveAttribute("data-status", "review");
  await review.getByTestId("import-row-name").click();
  const chips = review.getByTestId("import-candidate");
  expect(await chips.count()).toBeGreaterThanOrEqual(2);
  await chips.nth(1).click();
  await expect(review).toHaveAttribute("data-status", "auto");
  await expect(review.getByTestId("import-row-needs")).toHaveCount(0);

  // 못 찾음 줄 — 선택 창이 검색어를 채워 열린다
  const none = rows.nth(3);
  await expect(none).toHaveAttribute("data-status", "none");
  await none.getByTestId("import-row-name").click();
  const search = page.getByTestId("picker-search");
  await expect(search).toHaveValue(new RegExp(MARK));
  await search.fill("데드리프트");
  await page.getByTestId("picker-list").locator("li").first().click();
  await expect(none).toHaveAttribute("data-status", "auto");

  // 세트 시트 — 기본값을 고치면 「표기 없음」이 사라진다
  await rows.nth(4).getByTestId("import-row-presc").click();
  await page.getByTestId("ir-sets-4").click();
  await page.getByTestId("ir-reps-12").click();
  await page.getByTestId("ir-done").click();
  await expect(rows.nth(4)).toContainText("4세트 × 12회");
  await expect(rows.nth(4).getByTestId("import-row-default")).toHaveCount(0);

  // ⋯ → 위로 · 알림
  await rows.nth(4).getByTestId("import-row-menu-btn").click();
  await page.getByTestId("import-move-up").click();
  await expect(page.getByTestId("import-live")).toHaveText("4번째로 옮겼어요");

  await expect(page.getByTestId("import-name")).toHaveValue(/^가져온 루틴 · \d+\/\d+$/);
  await page.getByTestId("import-name").fill("가져온 하체");
  await page.getByTestId("import-save").click();
  await expect(page).toHaveURL(/\/routines\/(?!import$)[^/]+$/, { timeout: 20_000 });
  await expect(page.getByTestId("routine-name")).toHaveValue("가져온 하체", { timeout: 20_000 });
  // 글에서만 온 루틴은 메모(출처) 없음
  await expect(page.getByTestId("routine-notes")).toHaveValue("");
  await 내려쓰기_대기(page);
  expect(await 저장소에_표식(page, MARK)).toEqual([]);
});

test("링크(가짜 응답) — 영상 id 만 보낸다 · 설명란 해석 · 제목·약관 · 메모에 출처 영상 링크", async ({
  page,
}) => {
  await 카탈로그_준비(page);
  const bodies: string[] = [];
  page.on("request", (r) => {
    const b = r.postData();
    if (b) bodies.push(b);
  });
  await page.route(DESCRIBE, async (route) => {
    const req = JSON.parse(route.request().postData() ?? "{}");
    expect(req).toEqual({ videoId: VID });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        videoId: VID,
        title: "하체 루틴 영상",
        channel: "테스트 채널",
        description: "오늘 루틴\nBarbell Squat 5x5\nLeg Press 4x10\nLeg Curl 3x12",
        durationSec: 900,
        embeddable: true,
      }),
    });
  });
  await 가져오기_열기(page);
  await 초안(page, `https://youtu.be/${VID}?si=abc ${MARK}`);
  await expect(page.getByTestId("import-video-title")).toContainText("하체 루틴 영상");
  await expect(page.getByTestId("import-yt-terms")).toHaveAttribute(
    "href",
    "https://www.youtube.com/t/terms",
  );
  await expect(page.getByTestId("import-sources")).toContainText("설명란");
  await expect(page.getByTestId("import-row")).toHaveCount(3);
  await expect(page.getByTestId("import-name")).toHaveValue(/^영상 루틴 · /);
  await page.getByTestId("import-save").click();
  // 「확인 필요」 줄(레그 컬 후보)이 있어 저장 전 확인창이 뜬다
  const confirm = page.getByTestId("import-save-confirm");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "저장" }).click();
  await expect(page).toHaveURL(/\/routines\/(?!import$)[^/]+$/, { timeout: 20_000 });
  await expect(page.getByTestId("routine-notes")).toHaveValue(
    `출처 영상: https://www.youtube.com/watch?v=${VID}`,
    {
      timeout: 20_000,
    },
  );
  // 원문 표식·제목은 어떤 요청 본문에도 없다
  expect(bodies.filter((b) => b.includes(MARK))).toEqual([]);
  await 내려쓰기_대기(page);
  expect(await 저장소에_표식(page, MARK)).toEqual([]);
  expect(await 저장소에_표식(page, "하체 루틴 영상")).toEqual([]);
});

test("링크 오류 문구 — 로그인 없음 · 없는 영상 · 글이 함께 있으면 글로 계속", async ({ page }) => {
  await 카탈로그_준비(page);
  let mode: "unauth" | "notfound" = "unauth";
  await page.route(DESCRIBE, (route) =>
    route.fulfill(
      mode === "unauth"
        ? {
            status: 401,
            contentType: "application/json",
            body: JSON.stringify({ code: "unauthenticated", message: "로그인하면 링크로 불러올 수 있어요" }),
          }
        : {
            status: 404,
            contentType: "application/json",
            body: JSON.stringify({ code: "not_found", message: "비공개거나 삭제된 영상이에요" }),
          },
    ),
  );
  await 가져오기_열기(page);
  await page.getByTestId("import-text").fill(`https://www.youtube.com/watch?v=${VID}`);
  await page.getByTestId("import-make").click();
  await expect(page.getByTestId("import-error")).toContainText("로그인하면 링크로 불러올 수 있어요");
  mode = "notfound";
  await page.getByTestId("import-make").click();
  await expect(page.getByTestId("import-error")).toHaveText("비공개거나 삭제된 영상이에요");
  // 링크 + 글 — 링크를 못 읽어도 글로 초안
  await page.getByTestId("import-text").fill(`https://www.youtube.com/watch?v=${VID}\n바벨 스쿼트 5x5`);
  await page.getByTestId("import-make").click();
  await expect(page.getByTestId("import-review")).toBeVisible();
  await expect(page.getByTestId("import-row")).toHaveCount(1);
});

test("새로고침 뒤 초안 복원 — 원문은 없다 · 버리기 · 나가기 확인", async ({ page }) => {
  await 카탈로그_준비(page);
  await 가져오기_열기(page);
  await 초안(page, `바벨 스쿼트 5x5\n${MARK} 머신 3x12\n레그 프레스 4x10`);
  await expect(page.getByTestId("import-row")).toHaveCount(3);
  expect(await 저장소에_표식(page, MARK)).toEqual([]);

  await page.reload();
  await expect(page.getByTestId("import-resume")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("import-resume-go").click();
  await expect(page.getByTestId("import-row")).toHaveCount(3);
  await expect(page.getByTestId("import-row").nth(0)).toContainText("5세트 × 5회");
  // 원문 조각(못 찾은 줄의 검색어)은 복원되지 않는다
  await expect(page.getByTestId("import-review")).not.toContainText(MARK);

  // 탭 막대 등 화면 안 링크 → 나가기 확인
  await page.getByTestId("import-back").click();
  await expect(page.getByTestId("import-leave")).toBeVisible();
  await page.getByTestId("import-leave").getByRole("button", { name: "취소" }).click();
  await expect(page.getByTestId("import-review")).toBeVisible();

  await page.getByTestId("import-restart").click();
  await page.reload();
  await expect(page.getByTestId("import-input")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("import-resume")).toHaveCount(0);
});

test("여러 날 — 날마다 루틴 · 목록으로 와서 「루틴 N개를 저장했어요」", async ({ page }) => {
  await 카탈로그_준비(page);
  await 가져오기_열기(page);
  await 초안(
    page,
    "Day 1\n바벨 스쿼트 5x5\n레그 프레스 4x10\nDay 2\n바벨 벤치프레스 5x5\n케이블 랫풀다운 3x12",
  );
  await expect(page.getByTestId("import-day")).toHaveCount(2);
  await page.getByTestId("import-name").fill("가져온 2분할");
  await page.getByTestId("import-save").click();
  // 확인 필요 줄이 있을 때만 확인창
  const confirm = page.getByTestId("import-save-confirm");
  const saved = page.getByText("루틴 2개를 저장했어요");
  await expect(confirm.or(saved)).toBeVisible({ timeout: 20_000 });
  if (await confirm.isVisible()) await confirm.getByRole("button", { name: "저장" }).click();
  await expect(saved).toBeVisible({ timeout: 20_000 });
  const list = page.getByTestId("routine-list");
  await expect(list).toContainText("가져온 2분할 · 1일차");
  await expect(list).toContainText("가져온 2분할 · 2일차");
});

// ── Phase 4 — 영상 보며 받아 적기(가짜 IFrame API) ──

/** 공식 IFrame API 대신 — 시각·seekTo·멈춤·재생을 window.__yt 에 기록한다. __ytError 가 있으면 그 코드로 onError */
const FAKE_IFRAME_API = `(function(){
  window.__yt = { t: 0, seeks: [], state: 1, paused: 0, played: 0, opts: null };
  function Player(el, opts){
    window.__yt.opts = { videoId: opts.videoId, host: opts.host, playerVars: opts.playerVars };
    var f = document.createElement('iframe');
    f.setAttribute('data-testid', 'fake-yt-iframe');
    f.style.width = '100%'; f.style.height = '100%';
    el.replaceWith(f);
    this._f = f;
    setTimeout(function(){
      if (window.__ytNoReady) return;
      if (opts.events && opts.events.onReady) opts.events.onReady();
      if (window.__ytError && opts.events && opts.events.onError) opts.events.onError({ data: window.__ytError });
    }, 30);
  }
  Player.prototype.getCurrentTime = function(){ return window.__yt.t; };
  Player.prototype.seekTo = function(s){ window.__yt.seeks.push(s); window.__yt.t = s; };
  Player.prototype.pauseVideo = function(){ window.__yt.paused++; window.__yt.state = 2; };
  Player.prototype.playVideo = function(){ window.__yt.played++; window.__yt.state = 1; };
  Player.prototype.getPlayerState = function(){ return window.__yt.state; };
  Player.prototype.getIframe = function(){ return this._f; };
  Player.prototype.destroy = function(){};
  window.YT = { Player: Player };
  setTimeout(function(){ if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady(); }, 0);
})();`;

async function 영상_가짜(page: Page, opts: { embeddable?: boolean; description?: string } = {}) {
  await page.route("https://www.youtube.com/iframe_api", (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_IFRAME_API }),
  );
  await page.route(DESCRIBE, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        videoId: VID,
        title: "받아 적기 영상",
        channel: "테스트 채널",
        description: opts.description ?? "Barbell Squat 5x5\nLeg Press 4x10",
        durationSec: 900,
        embeddable: opts.embeddable ?? true,
      }),
    }),
  );
}
const 시각 = (page: Page, sec: number) =>
  page.evaluate((s) => {
    (window as unknown as { __yt: { t: number } }).__yt.t = s;
  }, sec);
const yt = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          __yt: { seeks: number[]; paused: number; played: number; opts: Record<string, unknown> };
        }
      ).__yt,
  );

test("받아 적기 — 플레이어 시각을 줄에 · ▶ 로 seekTo · 바로 고르기는 멈췄다 다시 재생 · 뒤로 = 확인 화면", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await 카탈로그_준비(page);
  await 영상_가짜(page);
  await 가져오기_열기(page);
  await 초안(page, `https://youtu.be/${VID}`);
  await expect(page.getByTestId("import-row")).toHaveCount(2);
  await page.getByTestId("import-watch").click();

  const screen = page.getByTestId("watch-screen");
  await expect(screen).toBeVisible();
  await expect(page.getByTestId("fake-yt-iframe")).toHaveAttribute("title", "영상: 받아 적기 영상");
  await expect(page.getByTestId("watch-player")).toHaveAttribute("data-ready", "1");
  const opts = (await yt(page)).opts as {
    videoId: string;
    host: string;
    playerVars: Record<string, unknown>;
  };
  expect(opts.videoId).toBe(VID);
  expect(opts.host).toBe("https://www.youtube-nocookie.com");
  expect(opts.playerVars.playsinline).toBe(1);
  // 플레이어 200×200 이상(가로는 화면 폭 — 360×640 에서 360×202 · 좁은 화면은 아래 320 테스트)
  const box = await page.getByTestId("watch-player").boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(200);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(200);

  // + 종목 — 그 시각의 빈 줄 · 알림
  await 시각(page, 83);
  await page.getByTestId("watch-add").click();
  await expect(page.getByTestId("watch-live")).toHaveText("1:23 시각을 적었어요");
  const rows = page.getByTestId("watch-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toContainText("1:23");
  await expect(rows.nth(2).getByTestId("watch-row-name")).toHaveText("종목 고르기");

  // 360×640 에서 줄 3개가 다 보인다(플레이어·하단 바에 가리지 않음)
  const vh = 640;
  const bar = await page.getByTestId("watch-add").boundingBox();
  for (let i = 0; i < 3; i++) {
    const b = await rows.nth(i).boundingBox();
    expect(b).not.toBeNull();
    expect((b?.y ?? 0) >= (box?.y ?? 0) + (box?.height ?? 0) - 1).toBe(true);
    expect((b?.y ?? 0) + (b?.height ?? 0) <= Math.min(vh, bar?.y ?? vh) + 1).toBe(true);
  }

  // ▶ 1:23 → seekTo(83)
  await 시각(page, 200);
  await rows.nth(2).getByTestId("watch-row-seek").click();
  expect((await yt(page)).seeks).toContain(83);

  // 바로 고르기 — 선택 창을 열 때 멈추고 닫으면 다시 재생(가리는 동안 재생 안 함 · Y1)
  await page.getByTestId("watch-quick-pick").check();
  await 시각(page, 125);
  const before = await yt(page);
  await page.getByTestId("watch-add").click();
  const search = page.getByTestId("picker-search");
  await expect(search).toBeVisible();
  expect((await yt(page)).paused).toBe(before.paused + 1);
  // 선택 창이 열린 채 뒤로 = 선택 창만 닫힘(받아 적기는 그대로 · 줄은 남음 · 다시 재생)
  await page.goBack();
  await expect(search).toHaveCount(0);
  await expect(screen).toBeVisible();
  await expect.poll(async () => (await yt(page)).played).toBe(before.played + 1);
  await expect(rows).toHaveCount(4);
  // 그 줄을 눌러 고른다 — 열 때 멈추고 닫으면 다시 재생
  await rows.nth(3).getByTestId("watch-row-name").click();
  await expect(search).toBeVisible();
  expect((await yt(page)).paused).toBe(before.paused + 2);
  await search.fill("데드리프트");
  await page.getByTestId("picker-list").locator("li").first().click();
  await expect(search).toHaveCount(0);
  await expect.poll(async () => (await yt(page)).played).toBe(before.played + 2);
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(3)).toContainText("2:05");
  await expect(rows.nth(3).getByTestId("watch-row-name")).not.toHaveText("종목 고르기");

  // 브라우저 뒤로 = 확인 화면으로(줄은 그대로 · 나가기 확인 없음 · 읽은 곳에 받아 적기)
  await page.goBack();
  await expect(screen).toHaveCount(0);
  await expect(page.getByTestId("import-review")).toBeVisible();
  await expect(page.getByTestId("import-sources")).toContainText("받아 적기");
  await page.waitForTimeout(300);
  await expect(page.getByTestId("import-leave")).toHaveCount(0);
  await expect(page.getByTestId("import-row")).toHaveCount(4);
  await expect(page.getByTestId("import-row").nth(2)).toHaveAttribute("data-status", "none");
  await expect(page.getByTestId("import-row").nth(3)).toContainText("2:05");
  expect(page.url()).toMatch(/\/routines\/import$/);

  // 한 번 더 뒤로 = 나가기 확인(줄이 있으니) → 취소하면 그대로
  await page.goBack();
  const leave = page.getByTestId("import-leave");
  await expect(leave).toBeVisible();
  await leave.getByRole("button", { name: "취소" }).click();
  await expect(page.getByTestId("import-review")).toBeVisible();
});

test("받아 적기 — 임베드 불가(onError 150)면 새 창 링크 · 시각 없는 줄", async ({ page }) => {
  await 카탈로그_준비(page);
  await 영상_가짜(page);
  await page.addInitScript(() => {
    (window as unknown as { __ytError: number }).__ytError = 150;
  });
  await 가져오기_열기(page);
  await 초안(page, `https://youtu.be/${VID}`);
  await page.getByTestId("import-watch").click();
  await expect(page.getByTestId("watch-fallback")).toBeVisible();
  await expect(page.getByTestId("watch-fallback")).toContainText("이 영상은 앱 안에서 재생할 수 없어요");
  await expect(page.getByTestId("watch-open-youtube")).toHaveAttribute(
    "href",
    `https://www.youtube.com/watch?v=${VID}`,
  );
  await page.getByTestId("watch-add").click();
  await expect(page.getByTestId("watch-live")).toHaveText("빈 줄을 더했어요");
  await expect(page.getByTestId("watch-row")).toHaveCount(3);
  await expect(page.getByTestId("watch-row").nth(2).getByTestId("watch-row-seek")).toHaveCount(0);
  await page.getByTestId("watch-done").click();
  await expect(page.getByTestId("import-row")).toHaveCount(3);
});

test("받아 적기 — 서버가 embeddable=false 면 플레이어를 띄우지 않는다 · 설명란을 못 읽은 링크도 받아 적기로", async ({
  page,
}) => {
  await 카탈로그_준비(page);
  let loaded = 0;
  await page.route("https://www.youtube.com/iframe_api", (route) => {
    loaded += 1;
    return route.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_IFRAME_API });
  });
  await page.route(DESCRIBE, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        videoId: VID,
        title: "설명 없는 영상",
        channel: "채널",
        description: "",
        durationSec: 600,
        embeddable: false,
      }),
    }),
  );
  await 가져오기_열기(page);
  await page.getByTestId("import-text").fill(`https://youtu.be/${VID}`);
  await page.getByTestId("import-make").click();
  await expect(page.getByTestId("import-error")).toBeVisible();
  await page.getByTestId("import-watch-only").click();
  await expect(page.getByTestId("watch-fallback")).toBeVisible();
  expect(loaded).toBe(0); // 대체 화면이면 IFrame API 를 부르지 않는다
  await page.getByTestId("watch-add").click();
  await page.getByTestId("watch-row-name").first().click();
  await page.getByTestId("picker-search").fill("벤치프레스");
  await page.getByTestId("picker-list").locator("li").first().click();
  await page.getByTestId("watch-done").click();
  await expect(page.getByTestId("import-row")).toHaveCount(1);
  await expect(page.getByTestId("import-row").first()).toHaveAttribute("data-status", "auto");
});

test("받아 적기 — 좁은 화면(320)에서도 플레이어 200×200 이상 · 영상만 시작 → 뒤로 두 번이면 묻지 않고 떠난다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await 카탈로그_준비(page);
  await 영상_가짜(page, { description: "" });
  await 가져오기_열기(page);
  await page.getByTestId("import-text").fill(`https://youtu.be/${VID}`);
  await page.getByTestId("import-make").click();
  await page.getByTestId("import-watch-only").click();
  const iframe = page.getByTestId("fake-yt-iframe");
  await expect(iframe).toBeVisible();
  const box = await iframe.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(200);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(200);
  // 줄 없이 뒤로 = 확인 화면(빈 날) → 한 번 더 뒤로 = 묻지 않고 떠남
  await page.goBack();
  await expect(page.getByTestId("watch-screen")).toHaveCount(0);
  await expect(page.getByTestId("import-review")).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/\/routines\/import/, { timeout: 10_000 });
  await expect(page.getByTestId("import-leave")).toHaveCount(0);
});

test("받아 적기 — 준비 8초 넘기면 대체 화면 · 저장 뒤 뒤로는 가져오기로 돌아오지 않는다", async ({
  page,
}) => {
  await 카탈로그_준비(page);
  await 영상_가짜(page);
  await page.addInitScript(() => {
    (window as unknown as { __ytNoReady: boolean }).__ytNoReady = true;
  });
  await 가져오기_열기(page);
  await 초안(page, `https://youtu.be/${VID}`);
  await page.clock.install();
  await page.getByTestId("import-watch").click();
  await expect(page.getByTestId("fake-yt-iframe")).toBeAttached();
  await page.clock.runFor(8_500);
  await expect(page.getByTestId("watch-fallback")).toBeVisible();
  await page.getByTestId("watch-done").click();
  await page.clock.resume();
  await page.getByTestId("import-save").click();
  await expect(page).toHaveURL(/\/routines\/(?!import$)[^/]+$/, { timeout: 20_000 });
  await page.goBack();
  await expect(page).not.toHaveURL(/\/routines\/import/, { timeout: 10_000 });
});
