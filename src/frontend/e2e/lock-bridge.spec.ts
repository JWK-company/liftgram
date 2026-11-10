// 잠금화면 운동 카드 — 웹 다리·적용기 e2e(SPEC-017 Phase 3 · SRS-096 · ADR-046)
//
// 가짜 플러그인(LiftgramLock)을 window.Capacitor 로 꽂는다. 네이티브 저장소(대기열·사본·휴식·seq)는 localStorage 한 칸이라
// 새로고침(=앱 재시작)해도 남는다. 「잠금 중 버튼」은 테스트가 네이티브처럼 사본의 첫 단계로 조작을 만들고 단계를 뺀다(rebase).
// 운영 빌드 + 새 DB 에서 돈다(로컬 운영 빌드 e2e). 결함 주입(kill·봉인)은 NEXT_PUBLIC_E2E_FAULTS=1 빌드에서만 — 아니면 건너뛴다.
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;
type Snap = {
  clock: { startedAt: number; accumulatedPauseMs: number; pausedAt: number | null };
  theme: string;
  sessionId: string;
  dbEpoch: string;
  storeId: string;
  appliedThroughSeq: number;
  steps: {
    setIds: string[];
    openApp: boolean;
    restAfterSec: number;
    members: {
      setId: string;
      weId?: string;
      refill?: boolean;
      label: string;
      display: { weight: number | null; reps: number | null };
      expect: { weightKg: number | null; reps: number | null; seconds: number | null };
    }[];
  }[];
  rest: { endsAt: number | null; setAt: number; by: string };
  caps?: string[];
};
type Fake = {
  queue: Record<string, unknown>[];
  rest: Record<string, unknown> | null;
  storeId: string;
  seq: number;
  calls: { name: string; arg?: unknown; t: number }[];
  snapshot: Snap | null;
  drainDelayMs?: number;
  perm?: {
    notifications?: boolean;
    exactAlarm?: boolean;
    lockScreen?: boolean;
    fullScreen?: boolean;
    overlay?: boolean;
    battery?: boolean;
    diag?: string[];
  };
  failSet?: boolean;
  setDelayMs?: number;
};

/** 가짜 네이티브 — native=false 면 「웹 브라우저」(isNativePlatform false · 플러그인은 있어도 부르면 안 된다). */
function fakeScript(native: boolean) {
  return `(() => {
    const K = '__fakeLock';
    const blank = () => ({ queue: [], rest: null, storeId: 'S-e2e', seq: 0, calls: [], snapshot: null });
    const load = () => { try { return JSON.parse(localStorage.getItem(K) || 'null') || blank(); } catch { return blank(); } };
    const save = (s) => localStorage.setItem(K, JSON.stringify(s));
    const rec = (name, arg) => { const s = load(); s.calls.push({ name, arg, t: Date.now() }); if (name === 'sessionUpdate') s.snapshot = arg.snapshot; save(s); return s; };
    const listeners = {};
    const LiftgramLock = {
      info: async () => { const s = rec('info'); return { version: 'e2e', features: ['session', 'queue'], ...(s.perm || {}) }; },
      openSettings: async (a) => { rec('openSettings', a); return {}; },
      setLockScreen: async (a) => { const s = rec('setLockScreen', a); if (s.setDelayMs) await new Promise((r) => setTimeout(r, s.setDelayMs)); if (s.failSet) throw new Error('fail'); s.perm = { ...(s.perm || {}), lockScreen: a.enabled }; save(s); return { lockScreen: a.enabled }; },
      sessionUpdate: async (a) => { rec('sessionUpdate', a); return {}; },
      sessionSetRest: async (a) => { rec('sessionSetRest', a); return {}; },
      sessionEnd: async () => { rec('sessionEnd'); return {}; },
      queueDrain: async () => {
        const s = rec('queueDrain');
        if (s.drainDelayMs) await new Promise((r) => setTimeout(r, s.drainDelayMs));
        const t = load();
        return { actions: t.queue, rest: t.rest, storeId: t.storeId };
      },
      queueAck: async (a) => { rec('queueAck', a); const s = load(); s.queue = s.queue.filter((x) => !a.ids.includes(x.id)); save(s); return {}; },
      queueClear: async () => { rec('queueClear'); const s = load(); s.queue = []; save(s); return {}; },
      addListener: async (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); return { remove: async () => {} }; },
    };
    window.__fakeLockFire = (ev, d) => { for (const f of listeners[ev] || []) f(d || {}); };
    window.Capacitor = {
      isNativePlatform: () => ${native},
      getPlatform: () => ${native ? "'android'" : "'web'"},
      isPluginAvailable: (n) => n === 'LiftgramLock' || n === 'App',
      Plugins: { LiftgramLock, App: { addListener: LiftgramLock.addListener, getLaunchUrl: async () => ({}) } },
    };
  })();`;
}

async function fake(page: Page): Promise<Fake> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("__fakeLock") || "null"));
}
async function patchFake(page: Page, patch: Partial<Fake>): Promise<void> {
  await page.evaluate((p) => {
    const s = JSON.parse(localStorage.getItem("__fakeLock") || "null");
    localStorage.setItem("__fakeLock", JSON.stringify({ ...s, ...p }));
  }, patch);
}
const calls = async (page: Page, name: string) =>
  ((await fake(page))?.calls ?? []).filter((c) => c.name === name);

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });
}
async function 종목_추가(page: Page, 검색: string) {
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill(검색);
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  await expect(page.getByTestId("exercise-picker")).toHaveCount(0);
}
async function 운동_시작(page: Page, 검색: string) {
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await 종목_추가(page, 검색);
}
function 세트(page: Page, 블록: number, index: number) {
  return page
    .getByTestId("workout-exercises")
    .locator("> div")
    .nth(블록)
    .getByTestId("set-list")
    .locator("> div")
    .nth(index);
}
async function 값_적기(page: Page, 블록: number, index: number, kg: number, reps: number) {
  const row = 세트(page, 블록, index);
  await row.getByTestId("set-weight").fill(String(kg));
  await row.getByTestId("set-weight").blur();
  await row.getByTestId("set-reps").fill(String(reps));
  await row.getByTestId("set-reps").blur();
}

/** 사본이 조건을 만족할 때까지(스냅샷 300ms 디바운스) */
async function 사본(page: Page, ok: (s: Snap) => boolean, msg = "사본"): Promise<Snap> {
  let last: Snap | null = null;
  await expect
    .poll(
      async () => {
        last = (await fake(page))?.snapshot ?? null;
        return !!last && ok(last);
      },
      { message: msg, timeout: 15_000 },
    )
    .toBe(true);
  return last as unknown as Snap;
}

/** 잠금 중 버튼 — 네이티브처럼 사본의 첫 단계로 조작을 만들고 사본에서 뺀다. over 로 조작을 바꿀 수 있다. */
async function 잠금_완료(page: Page, over: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return page.evaluate((o) => {
    const s = JSON.parse(localStorage.getItem("__fakeLock") || "null");
    const snap = s.snapshot;
    const step = snap.steps[0];
    s.seq += 1;
    const a = {
      id: `act-${s.seq}`,
      storeId: s.storeId,
      dbEpoch: snap.dbEpoch,
      seq: s.seq,
      kind: "complete",
      sessionId: snap.sessionId,
      setIds: step.setIds,
      expect: step.members.map((m: { setId: string; expect: unknown }) => ({
        setId: m.setId,
        ...(m.expect as object),
      })),
      at: Date.now(),
      ...o,
    };
    s.queue.push(a);
    snap.steps = snap.steps.slice(1);
    localStorage.setItem("__fakeLock", JSON.stringify(s));
    return a;
  }, over);
}
async function 앱_복귀(page: Page) {
  await page.evaluate(() =>
    (window as unknown as { __fakeLockFire: (e: string) => void }).__fakeLockFire("lockAction"),
  );
}

test.describe("앱이 아니면", () => {
  test("웹 브라우저(isNativePlatform false)면 플러그인이 있어도 호출 0 · 운동은 그대로", async ({ page }) => {
    await page.addInitScript(fakeScript(false));
    await 카탈로그_준비(page);
    await 운동_시작(page, "바벨 스쿼트");
    await 값_적기(page, 0, 0, 100, 5);
    await 세트(page, 0, 0).getByTestId("set-done").click();
    await expect(세트(page, 0, 0).getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(800);
    expect((await fake(page))?.calls ?? []).toEqual([]);
    await expect(page.getByTestId("lock-draining")).toHaveCount(0);
  });
  test("웹 브라우저면 프로필에 잠금 카드 줄이 없고 info 도 부르지 않는다(REV-007 테스트 M-12)", async ({
    page,
  }) => {
    await page.addInitScript(fakeScript(false));
    await 카탈로그_준비(page);
    await page.goto("/profile");
    await expect(page.getByTestId("row-rest-sound").or(page.locator("main")).first()).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForTimeout(800);
    await expect(page.getByTestId("row-lock-card")).toHaveCount(0);
    await expect(page.getByTestId("row-lock-exact")).toHaveCount(0);
    expect((await fake(page))?.calls ?? []).toEqual([]);
  });
});

test.describe("앱(가짜 플러그인)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(fakeScript(true));
  });

  test("첫 로드에 운동이 없으면 고아 카드 정리 · 운동을 시작하면 사본 · 사람이 적은 값은 누를 수 있다", async ({
    page,
  }) => {
    await 카탈로그_준비(page);
    await expect
      .poll(async () => (await calls(page, "sessionEnd")).length, { timeout: 10_000 })
      .toBeGreaterThan(0);
    await 운동_시작(page, "바벨 벤치프레스");
    const first = await 사본(page, (s) => s.steps.length > 0, "첫 사본");
    expect(first.steps[0].openApp).toBe(true); // 기본값(사람이 안 본 값) — 앱 열기
    await 값_적기(page, 0, 0, 60, 5);
    const snap = await 사본(
      page,
      (s) => s.steps[0]?.members[0]?.display.weight === 60 && s.steps[0].members[0].display.reps === 5,
      "적은 값",
    );
    expect(snap.steps[0].openApp).toBe(false);
    expect(snap.steps[0].members[0].label).toBe("1");
  });

  test("잠금 중 완료 → 앱 복귀 drain: 화면 완료 · ack · 워터마크 = seq · 같은 조작 재전송·해제 뒤 옛 조작은 다시 완료하지 않는다", async ({
    page,
  }) => {
    await 카탈로그_준비(page);
    await 운동_시작(page, "바벨 스쿼트");
    await 값_적기(page, 0, 0, 100, 5);
    await 사본(page, (s) => s.steps[0]?.openApp === false);
    const a = await 잠금_완료(page);
    await 앱_복귀(page);
    await expect(세트(page, 0, 0).getByTestId("set-done")).toHaveAttribute("aria-pressed", "true", {
      timeout: 10_000,
    });
    await expect.poll(async () => (await fake(page)).queue.length).toBe(0);
    await 사본(page, (s) => s.appliedThroughSeq === a.seq, "appliedThroughSeq");
    // ack 전에 앱이 죽어 같은 조작이 다시 온다 → 건너뛴다 / 앱에서 해제한 뒤에 와도 다시 완료하지 않는다(H-3)
    await 세트(page, 0, 0).getByTestId("set-done").click();
    await expect(세트(page, 0, 0).getByTestId("set-done")).toHaveAttribute("aria-pressed", "false");
    await patchFake(page, { queue: [a] });
    await 앱_복귀(page);
    await expect.poll(async () => (await fake(page)).queue.length, { timeout: 10_000 }).toBe(0);
    await expect(세트(page, 0, 0).getByTestId("set-done")).toHaveAttribute("aria-pressed", "false");
  });

  test("잠금화면에서 앱으로 돌아오면 지금 하는 종목이 보인다 · 「잠금 해제」 링크에도 맨 위로 가지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 520 });
    await 카탈로그_준비(page);
    await 운동_시작(page, "바벨 벤치프레스");
    await 종목_추가(page, "바벨 스쿼트");
    await 종목_추가(page, "바벨 데드리프트");
    let snap = await 사본(page, (s) => new Set(s.steps.map((x) => x.members[0].weId)).size >= 3, "세 종목");
    const first = snap.steps[0].members[0].weId;
    const 앱상태 = (isActive: boolean) =>
      page.evaluate(
        (v) =>
          (window as unknown as { __fakeLockFire: (e: string, d: unknown) => void }).__fakeLockFire(
            "appStateChange",
            {
              isActive: v,
            },
          ),
        isActive,
      );
    await 앱상태(false); // 잠금화면이 앱을 가렸다
    while (snap.steps[0].members[0].weId === first) {
      await 잠금_완료(page);
      snap = (await fake(page)).snapshot as Snap;
    }
    const target = snap.steps[0].members[0].weId;
    const 위치 = () =>
      page.evaluate((id) => {
        const el = document.querySelector(`[data-testid="we-${id}"]`);
        return { top: el ? Math.round(el.getBoundingClientRect().top) : -1, y: Math.round(window.scrollY) };
      }, target);
    const 보임 = async () =>
      expect
        .poll(
          async () => {
            const p = await 위치();
            return p.y > 0 && p.top >= 0 && p.top < 220;
          },
          { timeout: 10_000 },
        )
        .toBe(true);
    await 앱상태(true);
    await 보임();
    // 「잠금 해제」(liftgram://workout) — 이미 운동 화면이면 이동하지 않고(기록이 쌓이지 않고) 지금 종목으로
    await page.evaluate(() => window.scrollTo(0, 0));
    const before = await page.evaluate(() => history.length);
    await page.evaluate(() =>
      (window as unknown as { __fakeLockFire: (e: string, d: unknown) => void }).__fakeLockFire(
        "appUrlOpen",
        {
          url: "liftgram://workout",
        },
      ),
    );
    await 보임();
    expect(await page.evaluate(() => history.length)).toBe(before);
    // 그냥 앱을 오간 것이면(반영할 조작 없음) 보던 자리를 건드리지 않는다
    await page.evaluate(() => window.scrollTo(0, 0));
    await 앱_복귀(page);
    await page.waitForTimeout(1000);
    expect((await 위치()).y).toBe(0);
  });

  test("카드에 본 값과 저장값이 다르면 완료하고 두 값을 보인다 · 「본 값으로 바꾸기」", async ({ page }) => {
    await 카탈로그_준비(page);
    await 운동_시작(page, "바벨 벤치프레스");
    await 값_적기(page, 0, 0, 62.5, 5);
    const snap = await 사본(page, (s) => s.steps[0]?.members[0]?.display.weight === 62.5);
    const id = snap.steps[0].setIds[0];
    // 낡은 카드(60kg 를 보고 눌렀다)
    await 잠금_완료(page, { expect: [{ setId: id, weightKg: 60, reps: 5, seconds: null }] });
    await 앱_복귀(page);
    await expect(세트(page, 0, 0).getByTestId("set-done")).toHaveAttribute("aria-pressed", "true", {
      timeout: 10_000,
    });
    const box = page.getByTestId("lock-mismatch");
    await expect(box).toBeVisible();
    await expect(box.getByTestId("lock-mismatch-line")).toContainText(
      "잠금화면에서 본 값: 60kg×5 · 저장된 값: 62.5kg×5",
    );
    await box.getByTestId("lock-mismatch-use-seen").click();
    await expect(page.getByTestId("lock-mismatch")).toHaveCount(0);
    await expect(세트(page, 0, 0).getByTestId("set-weight")).toHaveValue("60", { timeout: 10_000 });
  });

  test("버림 — 다른 세션의 조작은 반영하지 않고 한 번 알린다 · ack 는 한다", async ({ page }) => {
    await 카탈로그_준비(page);
    await 운동_시작(page, "바벨 스쿼트");
    await 사본(page, (s) => s.steps.length > 0);
    await 잠금_완료(page, { sessionId: "other-session" });
    await 앱_복귀(page);
    await expect(page.getByText("잠금화면 조작 1개는 운동이 바뀌어 반영하지 않았어요")).toBeVisible({
      timeout: 10_000,
    });
    await expect.poll(async () => (await fake(page)).queue.length).toBe(0);
    await expect(세트(page, 0, 0).getByTestId("set-done")).toHaveAttribute("aria-pressed", "false");
  });

  test("휴식 LWW — 잠금 중 건 휴식(더 늦은 setAt)이 이긴다 · 시간 만료는 쓰기가 아니다 · 새로고침해도 이어진다", async ({
    page,
  }) => {
    await 카탈로그_준비(page);
    await 운동_시작(page, "바벨 스쿼트");
    await 값_적기(page, 0, 0, 100, 5);
    await 세트(page, 0, 0).getByTestId("set-done").click();
    const bar = page.getByTestId("rest-bar");
    await expect(bar).toContainText(/휴식 [12]:\d\d/);
    await expect.poll(async () => (await calls(page, "sessionSetRest")).length).toBeGreaterThan(0);
    // 잠금 중 끝내기 뒤 +3초(더 늦은 setAt) — 웹 휴식을 이긴다
    const now = await page.evaluate(() => Date.now());
    await patchFake(page, { rest: { endsAt: now + 3000, totalSec: 3, setAt: now + 10, by: "native" } });
    await 앱_복귀(page);
    await expect(bar).toContainText(/휴식 0:0[1-3]/, { timeout: 5_000 });
    const sentBefore = (await calls(page, "sessionSetRest")).length;
    // 시간이 지나 끝남 — 계산한 상태일 뿐 네이티브로 보내지 않는다(잠금 중 +30초를 이기면 안 된다)
    await expect(bar).toHaveCount(0, { timeout: 6_000 });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await page.waitForTimeout(500);
    expect((await calls(page, "sessionSetRest")).length).toBe(sentBefore);
    // 앱 복귀 시 시간 만료 vs 잠금 중 +30초 — 네이티브 값(더 늦은 setAt)이 살아난다
    const t2 = await page.evaluate(() => Date.now());
    await patchFake(page, { rest: { endsAt: t2 + 30_000, totalSec: 30, setAt: t2, by: "native" } });
    await 앱_복귀(page);
    await expect(bar).toContainText(/휴식 0:(2\d|30)/, { timeout: 5_000 });
    // 새로고침(앱 재시작)해도 이어진다
    await page.reload();
    await expect(page.getByTestId("rest-bar")).toContainText(/휴식 0:[12]\d/, { timeout: 15_000 });
  });

  test("첫 drain 이 끝나기 전에는 세션 화면이 입력을 막는다(확인 중) · 끝나면 걷힌다", async ({ page }) => {
    await 카탈로그_준비(page);
    await 운동_시작(page, "바벨 스쿼트");
    await 사본(page, (s) => s.steps.length > 0);
    await patchFake(page, { drainDelayMs: 1500 });
    await page.reload();
    await expect(page.getByTestId("lock-draining")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("lock-draining")).toHaveCount(0, { timeout: 10_000 });
    await expect(세트(page, 0, 0).getByTestId("set-done")).toBeEnabled();
  });

  test("블록 휴식은 시트를 닫을 때 이번 운동에 저장 — 새로고침해도 유지 · 카드의 단계 휴식도 따른다", async ({
    page,
  }) => {
    await 카탈로그_준비(page);
    await 운동_시작(page, "바벨 스쿼트");
    const btn = page.getByTestId("btn-rest-setting").first();
    await expect(btn).toContainText("2:00");
    await btn.click();
    await expect(page.getByTestId("rest-sheet")).toBeVisible();
    // [원본] await expect(page.getByTestId("rest-saved-hint")).toContainText("이번 운동에 저장돼요");
    // [개선] 설명 줄 없앰(SPEC-055 Phase 4)
    await expect(page.getByTestId("rest-saved-hint")).toHaveCount(0);
    await page.getByTestId("rest-seconds-plus").click();
    await page.mouse.click(5, 5);
    await expect(page.getByTestId("rest-sheet")).toHaveCount(0);
    const changed = (await btn.innerText()).match(/\d+:\d\d/)?.[0];
    expect(changed).toBeTruthy();
    expect(changed).not.toBe("2:00");
    // 카드의 단계 휴식도 바뀐 값(REV-006 테스트 M-7)
    const [m, sec] = (changed as string).split(":").map(Number);
    await 사본(page, (sn) => sn.steps[0]?.restAfterSec === m * 60 + sec, "단계 휴식");
    await page.reload();
    await expect(page.getByTestId("btn-rest-setting").first()).toContainText(changed as string, {
      timeout: 15_000,
    });
  });
});

test.describe("앱(가짜 플러그인) — 입력 중 값", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(fakeScript(true));
  });
  test("입력칸에서 아직 안 나간(blur 전) 값도 drain 전에 저장된다 — 잠금 완료가 그 값을 지우지 않는다(REV-006 테스트 M-10)", async ({
    page,
  }) => {
    await 카탈로그_준비(page);
    await 운동_시작(page, "바벨 스쿼트");
    await 값_적기(page, 0, 0, 100, 5);
    await 사본(page, (s) => s.steps[0]?.members[0]?.display.weight === 100);
    // 두 번째 칸에 적기만 하고 blur 없이 잠금
    await 세트(page, 0, 0).getByTestId("set-reps").fill("7");
    await 잠금_완료(page);
    await 앱_복귀(page);
    await expect(세트(page, 0, 0).getByTestId("set-done")).toHaveAttribute("aria-pressed", "true", {
      timeout: 10_000,
    });
    await expect(세트(page, 0, 0).getByTestId("set-reps")).toHaveValue("7");
    // 카드는 5회를 보였고 저장값은 7회 — 두 값을 보인다
    await expect(page.getByTestId("lock-mismatch-line")).toContainText("저장된 값: 100kg×7");
    await page.reload();
    await expect(세트(page, 0, 0).getByTestId("set-reps")).toHaveValue("7", { timeout: 15_000 });
  });
});

test.describe("앱(가짜 플러그인) — 프로필 잠금 카드 줄", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(fakeScript(true));
  });
  test("알림이 꺼져 있으면 「꺼짐 — 켜기」 → 설정 열기 · 정확한 알람 꺼짐 안내 · 켜져 있으면 「켜짐」(SPEC-017 §11)", async ({
    page,
  }) => {
    await 카탈로그_준비(page);
    await patchFake(page, { perm: { notifications: false, exactAlarm: false } });
    await page.goto("/profile");
    const row = page.getByTestId("row-lock-card");
    await expect(row).toContainText("꺼짐 — 켜기", { timeout: 15_000 });
    await expect(page.getByTestId("row-lock-exact")).toHaveCount(0);
    await row.click();
    await expect
      .poll(async () => (await calls(page, "openSettings")).map((c) => (c.arg as { kind: string }).kind))
      .toEqual(["notifications"]);
    await patchFake(page, { perm: { notifications: true, exactAlarm: false } });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(row).toContainText("켜짐");
    await page.getByTestId("row-lock-exact").click();
    await expect.poll(async () => (await calls(page, "openSettings")).length).toBe(2);
  });
});

test.describe("앱(가짜 플러그인) — 잠금 운동 화면(SPEC-019)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(fakeScript(true));
  });
  test("사본에 운동 시간 재료·테마 — 테마를 바꾸면 사본이 다시 간다(SPEC-021)", async ({ page }) => {
    await 카탈로그_준비(page);
    await 운동_시작(page, "바벨 스쿼트");
    const snap = await 사본(page, (s) => !!s.clock);
    expect(snap.clock.startedAt).toBeGreaterThan(0);
    expect(snap.clock.accumulatedPauseMs).toBe(0);
    expect(snap.clock.pausedAt).toBeNull();
    expect(snap.theme).toBe("system");
    // 다른 기기에서 내려온 값처럼 — localStorage 반영 뒤 PREFS_EVENT(REV-021 데이터 M-1)
    await page.evaluate(() => localStorage.setItem("liftgram.theme", "dark"));
    await page.evaluate((ev) => window.dispatchEvent(new Event(ev)), "liftgram-prefs");
    await 사본(page, (s) => s.theme === "dark");
    // 일시정지 → 재개 — 멈춘 시각이 갔다가 지워지고, 멈춘 길이가 쌓인다(REV-022 데이터)
    await page.getByTestId("btn-pause").click();
    await 사본(page, (s) => (s.clock.pausedAt ?? 0) > 0);
    await page.waitForTimeout(300);
    await page.getByTestId("btn-pause").click();
    await 사본(page, (s) => s.clock.pausedAt === null && s.clock.accumulatedPauseMs > 0);
    // 프로필에서 고른 길(setTheme) — 저장소 값만 바꾼 위 경로와 다르다
    await page.goto("/profile");
    await page.getByTestId("theme").click();
    await page.getByTestId("theme-light").click();
    await 사본(page, (s) => s.theme === "light");
  });

  test("사본에 caps values · 멤버 weId — 잠금 화면에서 바꾼 무게·횟수로 완료하면 기록에 그 값(한 번만)", async ({
    page,
  }) => {
    await 카탈로그_준비(page);
    await 운동_시작(page, "바벨 스쿼트");
    await 값_적기(page, 0, 0, 100, 5);
    const snap = await 사본(page, (s) => s.steps[0]?.openApp === false);
    expect(snap.caps).toContain("values");
    expect(snap.steps[0].members[0].weId).toBeTruthy();
    const id = snap.steps[0].setIds[0];
    const a = await 잠금_완료(page, { values: [{ setId: id, weight: 102.5, reps: 4, unit: "kg" }] });
    await 앱_복귀(page);
    await expect(세트(page, 0, 0).getByTestId("set-done")).toHaveAttribute("aria-pressed", "true", {
      timeout: 10_000,
    });
    await expect(세트(page, 0, 0).getByTestId("set-weight")).toHaveValue("102.5");
    await expect(세트(page, 0, 0).getByTestId("set-reps")).toHaveValue("4");
    await expect(page.getByTestId("lock-mismatch")).toHaveCount(0);
    // 같은 조작이 다시 와도(ack 전 죽음) 값을 다시 쓰지 않는다 — 다른 값을 실어 보내도 워터마크로 건너뛴다
    await patchFake(page, { queue: [{ ...a, values: [{ setId: id, weight: 200, reps: 1, unit: "kg" }] }] });
    await 앱_복귀(page);
    await expect.poll(async () => (await fake(page)).queue.length, { timeout: 10_000 }).toBe(0);
    await page.waitForTimeout(500);
    await expect(세트(page, 0, 0).getByTestId("set-weight")).toHaveValue("102.5");
    await expect(세트(page, 0, 0).getByTestId("set-reps")).toHaveValue("4");
  });

  test("프로필 — 잠금 운동 화면 스위치 · 허용 필요면 설정 열기 · 옛 껍데기(값 없음)면 줄 없음", async ({
    page,
  }) => {
    await 카탈로그_준비(page);
    await patchFake(page, { perm: { notifications: true, exactAlarm: true } });
    await page.goto("/profile");
    await expect(page.getByTestId("row-lock-card")).toContainText("켜짐", { timeout: 15_000 });
    await expect(page.getByTestId("row-lock-screen")).toHaveCount(0);

    await patchFake(page, {
      perm: { notifications: true, exactAlarm: true, lockScreen: true, fullScreen: false },
    });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    const sw = page.getByTestId("row-lock-screen");
    await expect(sw).toHaveAttribute("role", "switch");
    await expect(sw).toHaveAttribute("aria-checked", "true");
    // 「켜짐」 글자 대신 다른 줄과 같은 스위치 모양(SPEC-046)
    await expect(sw.getByTestId("row-lock-screen-switch")).toBeVisible();
    await page.getByTestId("row-lock-fullscreen").click();
    await expect
      .poll(async () => (await calls(page, "openSettings")).map((c) => (c.arg as { kind: string }).kind))
      .toEqual(["fullScreen"]);
    // 허용하고 돌아오면 「허용 필요」 줄이 사라진다
    await patchFake(page, {
      perm: { notifications: true, exactAlarm: true, lockScreen: true, fullScreen: true },
    });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByTestId("row-lock-fullscreen")).toHaveCount(0);
    // 실패하면 스위치는 그대로
    await patchFake(page, { failSet: true });
    await sw.click();
    await page.waitForTimeout(300);
    await expect(sw).toHaveAttribute("aria-checked", "true");
    await patchFake(page, { failSet: false, calls: [], setDelayMs: 400 });
    // 연타 — 한 번만 부른다
    await sw.dblclick();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    expect((await calls(page, "setLockScreen")).map((c) => (c.arg as { enabled: boolean }).enabled)).toEqual([
      false,
    ]);
    await expect(page.getByTestId("row-lock-fullscreen")).toHaveCount(0);
  });
});

test.describe("앱(가짜 플러그인) — 잠금 운동 화면 진단(SPEC-020)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(fakeScript(true));
  });
  test("빠진 허용(다른 앱 위 · 전체 화면 · 배터리)만 줄로 · 누르면 그 설정 · 허용하면 사라짐 · 옛 앱은 없음", async ({
    page,
  }) => {
    await 카탈로그_준비(page);
    // 옛 앱(값 없음) — 진단 줄 없음
    await patchFake(page, {
      perm: { notifications: true, exactAlarm: true, lockScreen: true, fullScreen: true },
    });
    await page.goto("/profile");
    await expect(page.getByTestId("row-lock-screen")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("row-lock-overlay")).toHaveCount(0);
    await expect(page.getByTestId("row-lock-battery")).toHaveCount(0);
    await expect(page.getByTestId("row-lock-diag")).toHaveCount(0);

    await patchFake(page, {
      perm: {
        notifications: true,
        exactAlarm: true,
        lockScreen: true,
        fullScreen: false,
        overlay: false,
        battery: false,
        // 문자열이 아닌 원소는 버린다(lockInfo 타입 검사)
        diag: [
          "11-03 10:00:00 화면 꺼짐 · 직접 시작 못 함",
          1,
          null,
          "11-03 10:00:05 화면 켜짐 · 운동 화면 없음 → 전체 화면 알림",
        ] as unknown as string[],
      },
    });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    const ov = page.getByTestId("row-lock-overlay");
    await expect(ov).toBeVisible();
    await expect(ov).toContainText("다른 앱 위에 표시 허용");
    // 다른 앱 위 줄이 전체 화면 줄보다 위(DOM 순서 — 박스가 없으면 거짓 통과하지 않게)
    const fs = page.getByTestId("row-lock-fullscreen");
    await expect(fs).toBeVisible();
    const before = await ov.evaluate(
      (a, b) => Boolean(a.compareDocumentPosition(b as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
      await fs.elementHandle(),
    );
    expect(before).toBe(true);
    // 배터리 먼저(다른 앱 위 줄은 안내 토스트를 띄운다 — 토스트가 아래 줄을 가리지 않게)
    await page.getByTestId("row-lock-battery").click();
    await expect.poll(async () => (await calls(page, "openSettings")).length).toBe(1);
    await ov.click();
    await expect
      .poll(async () => (await calls(page, "openSettings")).map((c) => (c.arg as { kind: string }).kind))
      .toEqual(["battery", "overlay"]);
    await expect(
      page.getByText("다음 화면에서 '리프트그램'을 찾아 켜 주세요", { exact: false }),
    ).toBeVisible();
    // 진단 기록은 협업자·관리자에게만 보인다(SPEC-025) — 일반 사용자에게는 없다
    await expect(page.getByTestId("row-lock-diag")).toHaveCount(0);

    // 허용하고 돌아오면 사라진다
    await patchFake(page, {
      perm: {
        notifications: true,
        exactAlarm: true,
        lockScreen: true,
        fullScreen: true,
        overlay: true,
        battery: true,
        diag: [],
      },
    });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(ov).toHaveCount(0);
    await expect(page.getByTestId("row-lock-battery")).toHaveCount(0);
    await expect(page.getByTestId("row-lock-fullscreen")).toHaveCount(0);

    // 알림이 꺼졌거나 잠금 운동 화면을 끄면 진단 줄 없음
    await patchFake(page, {
      perm: {
        notifications: false,
        exactAlarm: true,
        lockScreen: true,
        fullScreen: false,
        overlay: false,
        battery: false,
      },
    });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByTestId("row-lock-card")).toContainText("꺼짐");
    await expect(ov).toHaveCount(0);
    await expect(page.getByTestId("row-lock-battery")).toHaveCount(0);
    // 옛 앱(overlay 없음) + 전체 화면만 빠짐 → 전체 화면 줄만
    await patchFake(page, {
      perm: {
        notifications: true,
        exactAlarm: true,
        lockScreen: true,
        fullScreen: false,
        overlay: "false" as unknown as boolean,
      },
    });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByTestId("row-lock-fullscreen")).toBeVisible();
    await expect(ov).toHaveCount(0);
    await expect(page.getByTestId("row-lock-battery")).toHaveCount(0);
    await patchFake(page, {
      perm: {
        notifications: true,
        exactAlarm: true,
        lockScreen: false,
        fullScreen: false,
        overlay: false,
        battery: false,
      },
    });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByTestId("row-lock-screen")).toHaveAttribute("aria-checked", "false");
    await expect(ov).toHaveCount(0);
    await expect(page.getByTestId("row-lock-battery")).toHaveCount(0);
  });
});

test.describe("앱(가짜 플러그인) — 운동 중 잠금화면 준비 안내(2026-11-04 실기기)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(fakeScript(true));
  });
  test("운동 중 알림이 꺼져 있으면 알림만 · 켜면 다른 앱 위·전체 화면이 둘 다 없을 때만 · 하나만 있으면 없음 · 숨기기", async ({
    page,
  }) => {
    await 카탈로그_준비(page);
    // 알림 꺼짐 — 알림 하나만(전체 화면은 알림이 꺼지면 늘 false 라 거짓 양성 · REV-019 M-1)
    await patchFake(page, {
      perm: {
        notifications: false,
        exactAlarm: true,
        lockScreen: true,
        fullScreen: false,
        overlay: false,
        battery: false,
      },
    });
    await 운동_시작(page, "바벨 스쿼트");
    const box = page.getByTestId("lock-readiness");
    await expect(box).toBeVisible({ timeout: 15_000 });
    await expect(box).toHaveAttribute("data-missing", "notifications");
    await expect(box).toContainText("알림이 꺼져 있어");
    await page.getByTestId("lock-readiness-notifications").click();
    await expect
      .poll(async () => (await calls(page, "openSettings")).map((c) => (c.arg as { kind: string }).kind))
      .toEqual(["notifications"]);

    // 알림을 켜고 돌아옴 — 다른 앱 위·전체 화면 둘 다 없으면 둘 다(서로의 대체 길 · REV-019 M-2) · 배터리는 조르지 않는다
    await patchFake(page, {
      perm: {
        notifications: true,
        exactAlarm: true,
        lockScreen: true,
        fullScreen: false,
        overlay: false,
        battery: false,
      },
    });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(box).toHaveAttribute("data-missing", "overlay,fullScreen");
    await page.getByTestId("lock-readiness-overlay").click();
    await expect(
      page.getByText("다음 화면에서 '리프트그램'을 찾아 켜 주세요", { exact: false }),
    ).toBeVisible();

    // 하나만 허용해도 사라진다
    await patchFake(page, {
      perm: {
        notifications: true,
        exactAlarm: true,
        lockScreen: true,
        fullScreen: false,
        overlay: true,
        battery: false,
      },
    });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(box).toHaveCount(0);

    // 다시 빠짐 → 이번 운동에서 숨기기 · 새로고침해도 숨김(읽기가 끝난 뒤 확인 — REV-019 M-4)
    await patchFake(page, {
      perm: {
        notifications: false,
        exactAlarm: true,
        lockScreen: true,
        fullScreen: false,
        overlay: false,
        battery: false,
      },
    });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(box).toBeVisible();
    await page.getByTestId("lock-readiness-hide").click();
    await expect(box).toHaveCount(0);
    const before = (await calls(page, "info")).length;
    await page.reload();
    await expect(page.getByTestId("workout-exercises")).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await calls(page, "info")).length).toBeGreaterThan(before);
    await page.waitForTimeout(500);
    await expect(page.getByTestId("lock-readiness")).toHaveCount(0);
  });

  test("잠금 운동 화면을 끈 사용자 · 모두 허용된 사용자에게는 안내가 없다", async ({ page }) => {
    await 카탈로그_준비(page);
    await patchFake(page, {
      perm: {
        notifications: true,
        exactAlarm: true,
        lockScreen: false,
        fullScreen: false,
        overlay: false,
        battery: false,
      },
    });
    await 운동_시작(page, "바벨 스쿼트");
    await expect(page.getByTestId("workout-exercises")).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await calls(page, "info")).length).toBeGreaterThan(0);
    await expect(page.getByTestId("lock-readiness")).toHaveCount(0);
    await patchFake(page, {
      perm: {
        notifications: true,
        exactAlarm: true,
        lockScreen: true,
        fullScreen: true,
        overlay: true,
        battery: true,
      },
    });
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByTestId("lock-readiness")).toHaveCount(0);
  });
});

test.describe("앱 — 결함 주입(e2e 빌드)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(fakeScript(true));
  });

  test("세트는 남고 워터마크 없음(kill) → 다시 열면 noop · ack · 완료 그대로", async ({ page }) => {
    await 카탈로그_준비(page);
    const faults = await page.evaluate(() => document.documentElement.dataset.e2eFaults === "1");
    test.skip(!faults, "NEXT_PUBLIC_E2E_FAULTS=1 빌드에서만");
    await 운동_시작(page, "바벨 스쿼트");
    await 값_적기(page, 0, 0, 100, 5);
    await 사본(page, (s) => s.steps[0]?.openApp === false);
    const a = await 잠금_완료(page);
    await page.evaluate(() => localStorage.setItem("liftgram.e2e.lockFault", "kill-before-watermark"));
    await 앱_복귀(page);
    await expect(page.locator("html[data-lock-killed='1']")).toHaveCount(1, { timeout: 10_000 });
    expect((await fake(page)).queue.map((x) => x.id)).toEqual([a.id]); // ack 없음
    await page.evaluate(() => localStorage.removeItem("liftgram.e2e.lockFault"));
    await page.reload();
    await expect(세트(page, 0, 0).getByTestId("set-done")).toHaveAttribute("aria-pressed", "true", {
      timeout: 15_000,
    });
    await expect.poll(async () => (await fake(page)).queue.length, { timeout: 10_000 }).toBe(0);
    await 사본(page, (s) => s.appliedThroughSeq === a.seq);
  });

  test("내려쓰기가 봉인(sealed)이면 ack 하지 않고 백오프로 다시 — 풀리면 ack", async ({ page }) => {
    await 카탈로그_준비(page);
    const faults = await page.evaluate(() => document.documentElement.dataset.e2eFaults === "1");
    test.skip(!faults, "NEXT_PUBLIC_E2E_FAULTS=1 빌드에서만");
    await 운동_시작(page, "바벨 스쿼트");
    await 사본(page, (s) => s.steps.length > 0);
    await page.evaluate(() => localStorage.setItem("liftgram.e2e.lockFault", "flush-sealed"));
    await 잠금_완료(page);
    await 앱_복귀(page);
    await expect(세트(page, 0, 0).getByTestId("set-done")).toHaveAttribute("aria-pressed", "true", {
      timeout: 10_000,
    });
    await page.waitForTimeout(800);
    expect((await fake(page)).queue.length).toBe(1);
    expect((await calls(page, "queueAck")).length).toBe(0);
    await page.evaluate(() => localStorage.removeItem("liftgram.e2e.lockFault"));
    await expect.poll(async () => (await fake(page)).queue.length, { timeout: 15_000 }).toBe(0);
  });
});
