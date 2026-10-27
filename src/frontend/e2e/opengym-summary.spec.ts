// @plm SRS-079 SRS-080  기간 성과 요약 · 코치에게 보내기 · DM 요약 카드 · 트레이너 리포트(core 계산) e2e (스펙 P4 검증 목록)
//
//   1. 트레이너·회원 연결 → 회원 4주 요약을 **아무것도 안 건드리고** 보냄 → 서버 스냅샷에 bodyweight 없음 → 트레이너 DM 카드 → 열기
//      → 루틴 처방 · 알림 → 그 대화(카드 강조) · 트레이너 리포트 숫자 = 회원 숫자(세션·총 볼륨·부위별) · 트레이너 저장소에 회원 id 없음
//      · 해지 후 열기 거부(「코칭이 끝나 볼 수 없어요」)
//   2. 오프라인 전송 → 복귀 후 1건(중복 없음)
//   3. A 가 못 보낸 채(대기열) 로그아웃 → B 로그인 → 서버 0건 · 대기열 비어 있음
//   4. 1년 표본 — 응답 바이트·서버 시간·트레이너 계산 시간·회원 계산 시간 기록(CPU 4배 느리게 = 360 기기 흉내)
//   (P4 /qa code 조치 2026-10-27) 표본에 맨몸 풀업 — 기본값으로 보낸 스냅샷 전체에 체중 값(72.5 · 725)이 없다(P4S-1) ·
//   시트 포커스(P4U-8) · 5. 오프라인 첫 진입(셸 · 코치 모름 안내 · P4U-5·18) · 6. 영구 실패 표시(P4U-6) · 기기 주인 멈춤(P4S-2)
import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  가입,
  동기,
  마치기,
  빠른_운동_시작,
  새_기기,
  새_메일,
  세트_기록,
  비밀번호,
  종목_추가,
  준비,
  로그인,
} from "./helpers/opengym";

type Page = import("@playwright/test").Page;
type BrowserContext = import("@playwright/test").BrowserContext;
type Browser = import("@playwright/test").Browser;

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const SEND_RPC = "**/api/coaching.v1.CoachingService/SendProgressSummary";

async function 코칭의향_켜기(page: Page) {
  await page.goto("/profile");
  await page.getByTestId("btn-edit-experience").click();
  await expect(page.getByTestId("trainer-intent")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("trainer-intent").click();
  await expect(page.getByTestId("trainer-intent")).toHaveAttribute("aria-pressed", "true", {
    timeout: 20_000,
  });
}

async function 코칭요청(page: Page, 트레이너이름: string) {
  await page.goto("/coaching");
  await page.getByTestId("coaching-query").fill(트레이너이름);
  await page.getByTestId("coaching-search").click();
  await expect(page.getByTestId("coaching-results")).toContainText(트레이너이름, { timeout: 20_000 });
  await page.getByTestId("coaching-request").first().click();
  await expect(page.getByTestId("coaching-coaches")).toContainText("수락 대기", { timeout: 20_000 });
}

async function 수락(pageT: Page) {
  await pageT.goto("/coaching");
  await pageT.getByTestId("coaching-accept").click();
  await expect(pageT.getByTestId("coaching-members")).toContainText("코칭 중", { timeout: 20_000 });
}

async function 체중_입력(page: Page, kg: string) {
  // [원본] bodyweight-value 를 눌러 바로 고치던 칸 — P3(체중 기록 시트)로 바뀌었다(opengym-bodyweight 의 프로필_입력과 같은 길)
  await page.goto("/profile");
  await expect(page.getByTestId("bodyweight")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-bodyweight-record").click();
  const sheet = page.getByTestId("bodyweight-record-sheet");
  await sheet.getByTestId("weighin-type").click();
  await sheet.getByTestId("weighin-input").fill(kg);
  await sheet.getByTestId("weighin-input").press("Enter");
  await sheet.getByTestId("weighin-save").click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("bodyweight-value")).toContainText(kg);
}

/** 회원 체중 — 이 값이 보내는 스냅샷 어디에도 숫자로 나오면 안 된다(P4S-1) */
const 체중 = "72.5";

/** 회원(page) — 체중 72.5 · 벤치 60×10 + 맨몸 풀업 0×10 한 번 */
async function 회원_운동(page: Page) {
  // [원본] await 체중_입력(page, "80"); — 벤치만 해서 맨몸 종목 체중 누출을 못 잡았다(P4U-17)
  await 체중_입력(page, 체중);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 세트_기록(page, 0, 0, 60, 10);
  await 종목_추가(page, "풀업");
  await 세트_기록(page, 1, 0, 0, 10);
  await 마치기(page);
}

/** 스냅샷 전체의 숫자 값에 체중이 없다 — 체중 · 맨몸 세트 볼륨(72.5×10) · 캐시 총 볼륨(600+725). 시각(ms)은 값 비교라 안 걸린다. */
function 체중_없음(json: string) {
  expect(json.includes(체중), json).toBe(false);
  expect(json.includes("bodyweight")).toBe(false);
  const nums: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "number") nums.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(JSON.parse(json));
  expect(nums.length).toBeGreaterThan(5);
  for (const bad of [72.5, 725, 1325]) expect(nums.includes(bad), `${bad} in ${json}`).toBe(false);
}

async function 포커스(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute("data-testid") ?? null);
}

/** 트레이너(새 기기) + 회원(page) 연결. 회원은 운동 1회를 마치고 올려 둔다. */
async function 짝(
  page: Page,
  browser: Browser,
  tag: string,
): Promise<{ ctxT: BrowserContext; pageT: Page; 트레이너: string; 회원: string; 회원메일: string }> {
  const 트레이너 = `코치${tag}${Date.now().toString(36)}`;
  const 회원 = `회원${tag}${Date.now().toString(36)}`;
  const 회원메일 = 새_메일(`m-${tag}`);
  await 준비(page);
  await 가입(page, 회원메일, 회원);
  await 회원_운동(page);
  await 동기(page);
  const [ctxT, pageT] = await 새_기기(browser);
  await 가입(pageT, 새_메일(`t-${tag}`), 트레이너);
  await 코칭의향_켜기(pageT);
  await 코칭요청(page, 트레이너);
  await 수락(pageT);
  return { ctxT, pageT, 트레이너, 회원, 회원메일 };
}

async function 요약_열기(page: Page) {
  await page.goto("/stats");
  await page.getByTestId("stats-summary-entry").click();
  await expect(page).toHaveURL(/\/stats\/summary$/);
  await expect(page.getByTestId("ps-ready")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("ps-send")).toBeEnabled({ timeout: 20_000 });
}

async function 보낸목록_펼치기(page: Page) {
  const toggle = page.getByTestId("ps-sent-toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
}

/** 숫자 묶음 — 세션·총 볼륨·부위별(트레이너 = 회원 비교용) */
async function 숫자(scope: import("@playwright/test").Locator) {
  const muscles = await scope
    .locator('[data-testid^="ps-muscle-"]')
    .evaluateAll((els) =>
      els.map((e) => `${e.getAttribute("data-testid")}=${e.getAttribute("data-sets")}`).sort(),
    );
  return {
    workouts: (await scope.getByTestId("ps-workouts").textContent())?.trim(),
    volume: (await scope.getByTestId("ps-volume").textContent())?.trim(),
    muscles,
  };
}

/** 브라우저 저장소 전부(localStorage·sessionStorage·IndexedDB 의 모든 행)를 글로 */
async function 저장소_덤프(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const parts: string[] = [];
    for (const st of [localStorage, sessionStorage])
      for (let i = 0; i < st.length; i++) {
        const k = st.key(i) ?? "";
        parts.push(`${k}=${st.getItem(k)}`);
      }
    const dbs = (await indexedDB.databases?.()) ?? [];
    for (const info of dbs) {
      if (!info.name) continue;
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open(info.name as string);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      for (const store of Array.from(db.objectStoreNames)) {
        const rows = await new Promise<unknown[]>((res) => {
          const req = db.transaction(store, "readonly").objectStore(store).getAll();
          req.onsuccess = () => res(req.result);
          req.onerror = () => res([]);
        });
        parts.push(`${info.name}/${store}:${JSON.stringify(rows)}`);
      }
      db.close();
    }
    return parts.join("\n");
  });
}

test.describe.configure({ mode: "serial" });

test("요약 기본값 그대로 보냄 → 스냅샷에 체중 없음 → 트레이너 DM 카드·알림·루틴 처방 · 리포트 숫자 같음 · 저장소에 회원 id 없음 · 해지 후 거부", async ({
  page,
  browser,
}) => {
  test.setTimeout(420_000);
  const { ctxT, pageT, 회원 } = await 짝(page, browser, "a");
  try {
    // ── 회원: 4주(기본) 요약 — 체중 섹션은 있지만 꺼져 있고 미리보기에도 없다 ──
    await 요약_열기(page);
    await expect(page.getByTestId("ps-period-4w")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("ps-section-bodyweight")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("ps-bodyweight")).toHaveCount(0);
    await expect(page.getByTestId("ps-workouts")).toHaveText("1회");
    // 켜면 미리보기에 바로 들어오고 경고 한 줄 · 다시 끄면 빠진다(보는 그대로 보낸다)
    await page.getByTestId("ps-section-bodyweight").click();
    await expect(page.getByTestId("ps-bodyweight")).toBeVisible();
    await expect(page.getByTestId("ps-bodyweight-warn")).toHaveText("코치가 체중 변화를 보게 돼요");
    await page.getByTestId("ps-section-bodyweight").click();
    await expect(page.getByTestId("ps-bodyweight")).toHaveCount(0);
    const 회원숫자 = await 숫자(page.getByTestId("ps-view"));
    expect(회원숫자.muscles.length).toBeGreaterThan(0);
    // 맨몸 종목은 추가 무게만 — 총 볼륨 600(벤치) · 풀업 0kg × 10 · 안내 한 줄(P4S-1)
    await expect(page.getByTestId("ps-volume")).toHaveText("600kg");
    await expect(page.getByTestId("ps-bw-free")).toHaveText("맨몸 종목은 추가 무게만 셉니다");
    await expect(page.getByTestId("ps-basis")).toContainText("통계 화면과 다를 수 있어요");
    await expect(
      page.getByTestId("ps-top-row").filter({ hasText: "풀업" }).getByTestId("ps-top-change"),
    ).toHaveText("0kg × 10 → 0kg × 10");

    // 시트 포커스(U-23 · P4U-8) — 열면 제목, 닫으면 여는 버튼
    await page.getByTestId("ps-send").click();
    await expect(page.getByTestId("ps-send-sheet")).toBeVisible();
    await expect.poll(() => 포커스(page)).toBe("ps-send-title");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("ps-send-sheet")).toHaveCount(0);
    await expect.poll(() => 포커스(page)).toBe("ps-send");

    // ── 보내기(아무 토글도 바꾸지 않은 상태) — 요청 본문의 스냅샷에 bodyweight 키도 체중 값도 없다 ──
    await page.getByTestId("ps-send").click();
    await expect(page.getByTestId("ps-send-sheet")).toBeVisible();
    await expect(page.getByTestId("ps-send-includes")).not.toContainText("체중");
    const req = page.waitForRequest(SEND_RPC);
    const resP = page.waitForResponse(SEND_RPC);
    await page.getByTestId("ps-send-confirm").click();
    const body = JSON.parse((await req).postData() ?? "{}") as {
      snapshotJson: string;
      clientId: string;
      schemaVersion: number;
    };
    expect((await resP).status()).toBe(200);
    const snap = JSON.parse(body.snapshotJson) as Record<string, unknown>;
    expect(snap.schemaVersion).toBe(1);
    expect("bodyweight" in snap).toBe(false);
    체중_없음(body.snapshotJson);
    expect(body.clientId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page.getByTestId("ps-send-sheet")).toHaveCount(0);
    await 보낸목록_펼치기(page);
    await expect(page.getByTestId("ps-sent-row")).toHaveCount(1, { timeout: 20_000 });

    // ── 트레이너: 대화 목록 미리보기(숫자 없음) → 대화 → 카드(고정 문구) → 열기 ──
    await pageT.goto("/messages");
    const row = pageT.getByTestId("dm-row").filter({ hasText: 회원 });
    await expect(row).toContainText("성과 요약", { timeout: 20_000 });
    await row.click();
    const card = pageT.getByTestId("conv-summary-card");
    await expect(card).toHaveText(/성과 요약 · 눌러서 보기/, { timeout: 20_000 });
    const getP = pageT.waitForResponse("**/api/coaching.v1.CoachingService/GetProgressSummary");
    await card.click();
    const got = (await (await getP).json()) as { summary: { memberId: string; snapshotJson: string } };
    const 회원id = got.summary.memberId;
    expect("bodyweight" in JSON.parse(got.summary.snapshotJson)).toBe(false); // 서버에 저장된 스냅샷
    체중_없음(got.summary.snapshotJson);
    const open = pageT.getByTestId("ps-open");
    await expect(open.getByTestId("ps-sent-label")).toContainText("회원이 보낸 요약(보낸 시점");
    await expect(open.getByTestId("ps-bodyweight")).toHaveCount(0);
    expect(await 숫자(open)).toEqual(회원숫자); // 받은 요약 = 보낸 미리보기
    await open.getByTestId("ps-prescribe").click();
    await expect(pageT.getByTestId("coaching-routines-view")).toBeVisible({ timeout: 20_000 });
    await pageT.keyboard.press("Escape");

    // ── 알림 → 그 회원과의 대화(카드 강조) ──
    await pageT.goto("/notifications");
    const n = pageT.getByTestId("notif-row").filter({ hasText: "성과 요약을 보냈어요" });
    await expect(n).toBeVisible({ timeout: 20_000 });
    await n.click();
    await expect(pageT).toHaveURL(/\/messages\/.+\?highlight=summary/, { timeout: 20_000 });
    await expect(pageT.getByTestId("conv-summary-card")).toHaveAttribute("data-highlight", "1", {
      timeout: 20_000,
    });

    // ── 트레이너 리포트(원본 → 이 기기 core 계산) = 회원 숫자 ──
    await pageT.goto("/coaching");
    await pageT.getByTestId("coaching-report").click();
    const ready = pageT.getByTestId("report-ready");
    await expect(ready).toBeVisible({ timeout: 20_000 });
    await expect(pageT.getByTestId("report-unit-note")).toContainText("세트 수");
    expect(await 숫자(ready)).toEqual(회원숫자);
    await pageT.getByTestId("coaching-report-view").getByRole("button", { name: "확인" }).click();

    // ── 트레이너 브라우저 저장소에 회원 id 가 없다(S-20) ──
    await pageT.waitForTimeout(1_500); // LokiJS 자동 저장이 돌 시간
    const dump = await 저장소_덤프(pageT);
    expect(dump.length).toBeGreaterThan(100);
    expect(dump.includes(회원id)).toBe(false);

    // ── 회원이 해지 → 트레이너가 카드를 다시 열면 거부 ──
    await page.goto("/coaching");
    await page.getByTestId("coaching-revoke").first().click();
    await expect(page.getByTestId("coaching-coaches")).toHaveCount(0, { timeout: 20_000 });
    await pageT.goto("/messages");
    await pageT.getByTestId("dm-row").filter({ hasText: 회원 }).click();
    await pageT.getByTestId("conv-summary-card").click();
    await expect(pageT.getByTestId("ps-open-ended")).toHaveText("코칭이 끝나 볼 수 없어요", {
      timeout: 20_000,
    });
    await expect(pageT.getByTestId("ps-prescribe")).toHaveCount(0);
  } finally {
    await ctxT.close();
  }
});

test("오프라인에서 보낸 요약은 연결되면 한 번만 간다", async ({ page, context, browser }) => {
  test.setTimeout(360_000);
  const { ctxT, pageT, 회원 } = await 짝(page, browser, "b");
  try {
    await 요약_열기(page);
    await context.setOffline(true);
    await page.getByTestId("ps-send").click();
    await page.getByTestId("ps-send-confirm").click();
    await expect(page.getByTestId("ps-queued")).toContainText("연결되면 보낼게요");
    await 보낸목록_펼치기(page);
    await expect(page.getByTestId("ps-sent-pending")).toHaveCount(1);
    // 복귀 — 대기열이 비고 서버에 1건
    const sent = page.waitForResponse((r) => r.url().includes("SendProgressSummary") && r.status() === 200);
    await context.setOffline(false);
    await sent;
    await expect(page.getByTestId("ps-sent-pending")).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByTestId("ps-sent-row")).toHaveCount(1, { timeout: 20_000 });
    // 다시 부팅해도(앱 시작 재전송) 더 가지 않는다
    await page.reload();
    await expect(page.getByTestId("ps-ready")).toBeVisible({ timeout: 20_000 });
    await 보낸목록_펼치기(page);
    await expect(page.getByTestId("ps-sent-row")).toHaveCount(1, { timeout: 20_000 });
    const left = await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((k) => k.startsWith("liftgram.summaryOutbox:"))
        .map((k) => localStorage.getItem(k)),
    );
    expect(left.every((v) => !v || (JSON.parse(v) as { pending: unknown[] }).pending.length === 0)).toBe(
      true,
    );
    // 트레이너 대화에 카드 1장
    await pageT.goto("/messages");
    await pageT.getByTestId("dm-row").filter({ hasText: 회원 }).click();
    await expect(pageT.getByTestId("conv-summary-card")).toHaveCount(1, { timeout: 20_000 });
  } finally {
    await ctxT.close();
  }
});

test("A 가 못 보낸 채 로그아웃 → B 로그인 → 서버 0건 · 대기열 비어 있음", async ({ page, browser }) => {
  test.setTimeout(360_000);
  const { ctxT, pageT, 회원, 회원메일 } = await 짝(page, browser, "c");
  try {
    await 요약_열기(page);
    // 망은 살아 있지만 보내기 RPC 만 끊긴다(재전송 대상 오류) → 대기열
    await page.route(SEND_RPC, (r) => r.abort("internetdisconnected"));
    await page.getByTestId("ps-send").click();
    await page.getByTestId("ps-send-confirm").click();
    await expect(page.getByTestId("ps-queued")).toBeVisible();
    const keysBefore = await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith("liftgram.summaryOutbox:")),
    );
    expect(keysBefore.length).toBe(1);
    // 로그아웃 → 대기열 지움
    await page.goto("/account");
    await page.getByTestId("btn-logout").click();
    await expect(page.getByTestId("auth-email-input")).toBeVisible({ timeout: 20_000 });
    // B 로그인(같은 기기) — 끊김을 풀어도 A 의 요약이 가지 않는다
    await page.unroute(SEND_RPC);
    let sends = 0;
    page.on("request", (r) => {
      if (r.url().includes("SendProgressSummary")) sends++;
    });
    await 가입(page, 새_메일("b-other"), `다른사람${Date.now().toString(36)}`);
    await page.waitForTimeout(3_000);
    expect(sends).toBe(0);
    const keysAfter = await page.evaluate(() =>
      Object.keys(localStorage).filter(
        (k) => k.startsWith("liftgram.summaryOutbox:") && localStorage.getItem(k)?.includes("pending"),
      ),
    );
    expect(keysAfter).toEqual([]);
    // 서버 0건 — A 로 다른 기기에서 로그인해 보낸 목록을 본다 · 트레이너 대화에도 카드가 없다
    const [ctxA, pageA] = await 새_기기(browser);
    try {
      await 로그인(pageA, 회원메일);
      await pageA.goto("/stats/summary");
      await expect(pageA.getByTestId("ps-sent-toggle")).toHaveText(/보낸 요약 0/, { timeout: 20_000 });
    } finally {
      await ctxA.close();
    }
    await pageT.goto("/messages");
    await expect(pageT.getByTestId("dm-row").filter({ hasText: 회원 })).toHaveCount(0);
  } finally {
    await ctxT.close();
  }
});

/** 서비스워커가 이 페이지를 제어하고 요약 셸이 설치 캐시에 있을 때까지 */
async function 워커_요약셸(page: Page) {
  await page.goto("/");
  const controlled = () =>
    page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20_000 });
  await controlled().catch(async () => {
    await page.reload();
    await controlled();
  });
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          for (const k of await caches.keys())
            if (k.startsWith("liftgram-pages-") && (await (await caches.open(k)).match("/stats/summary")))
              return true;
          return false;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
}

test("오프라인 첫 진입 — 셸로 열리고 기기에서 계산 · 코치를 못 불러와 봤으면 「연결되면 코치를 불러와요」(거짓 「코치 없음」 아님)", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  await 준비(page);
  await 가입(page, 새_메일("m-off1"), `회원o${Date.now().toString(36)}`);
  await 회원_운동(page);
  await 워커_요약셸(page);
  await page.waitForTimeout(2_000); // LokiJS 내려쓰기
  await context.setOffline(true);
  try {
    // 이 기기에서 요약 화면을 한 번도 열지 않았다 — 설치 때 받아 둔 셸로 연다
    await page.goto("/stats/summary");
    await expect(page.getByTestId("offline-page")).toHaveCount(0);
    await expect(page.getByTestId("ps-ready")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("ps-workouts")).toHaveText("1회");
    await expect(page.getByTestId("ps-coach-unknown")).toContainText("연결되면 코치를 불러와요", {
      timeout: 20_000,
    });
    await expect(page.getByTestId("ps-nocoach")).toHaveCount(0);
  } finally {
    await context.setOffline(false);
  }
  // 연결되면 다시 시도 → 실제로 코치가 없으니 그때 「코칭 중인 코치가 없어요」
  await page.getByTestId("ps-coach-retry").click();
  await expect(page.getByTestId("ps-nocoach")).toContainText("코칭 중인 코치가 없어요", { timeout: 20_000 });
});

test("백그라운드 재전송의 영구 실패는 접힌 목록 밖에 뜨고 알린다 · 앱을 오프라인으로 열어 기기 주인 판정이 없으면 보내지 않는다", async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(360_000);
  const { ctxT } = await 짝(page, browser, "d");
  try {
    await 요약_열기(page);
    // 재전송 대상 오류(끊김)로 대기열에 둔다
    await page.route(SEND_RPC, (r) => r.abort("internetdisconnected"));
    await page.getByTestId("ps-send").click();
    await page.getByTestId("ps-send-confirm").click();
    await expect(page.getByTestId("ps-queued")).toBeVisible();
    await expect(page.getByTestId("ps-sent-toggle")).toContainText("대기 1");
    // 다시 연결됐는데 서버가 하루 상한(ResourceExhausted)으로 거절 — 영구 실패
    await page.unroute(SEND_RPC);
    await page.route(SEND_RPC, (r) =>
      r.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ code: "resource_exhausted", message: "daily limit" }),
      }),
    );
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByTestId("ps-failed-note")).toHaveText("못 보낸 요약 1 · 이유 보기", {
      timeout: 20_000,
    });
    await expect(page.getByText("못 보낸 요약이 있어요")).toBeVisible(); // 한 번 알림(toast)
    await expect(page.getByTestId("ps-sent-toggle")).toContainText("못 보냄 1");
    await expect(page.getByTestId("ps-sent-toggle")).not.toContainText("대기");
    await page.getByTestId("ps-failed-note").click();
    await expect(page.getByTestId("ps-sent-failed")).toContainText("오늘은 더 보낼 수 없어요");
    await page.unroute(SEND_RPC);

    // ── 기기 주인(P4S-2): 다른 계정 기록이 남아 동기가 멈춘 기기를 오프라인으로 연다(메모리 대조 결과 없음) ──
    await 워커_요약셸(page);
    await page.evaluate(() => {
      localStorage.setItem("sync_owner_blocked", "someone-else");
      // 멈추기 전에 쌓여 있던 대기 항목 하나(이 사람 것) — 연결돼도 나가면 안 된다
      const key = Object.keys(localStorage).find((k) => k.startsWith("liftgram.summaryOutbox:")) ?? "";
      const box = JSON.parse(localStorage.getItem(key) ?? "{}");
      box.pending = [
        {
          clientId: crypto.randomUUID(),
          ownerUserId: key.slice("liftgram.summaryOutbox:".length),
          trainerId: "t",
          periodStart: Date.now() - 86_400_000,
          periodEnd: Date.now(),
          schemaVersion: 1,
          snapshotJson: "{}",
          queuedAt: Date.now(),
        },
      ];
      localStorage.setItem(key, JSON.stringify(box));
    });
    let sends = 0;
    page.on("request", (r) => {
      if (r.url().includes("SendProgressSummary")) sends++;
    });
    await context.setOffline(true);
    try {
      await page.goto("/stats/summary");
      await expect(page.getByTestId("ps-ready")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("ps-owner-conflict")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId("ps-send")).toHaveCount(0);
    } finally {
      await context.setOffline(false);
    }
    // 화면에 머문 채 연결 — 대조 없이 대기열이 돌아도 기기 주인 판정이 막는다
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForTimeout(3_000);
    expect(sends).toBe(0);
    await expect(page.getByTestId("ps-owner-conflict")).toBeVisible();
    await expect(page.getByTestId("ps-sent-toggle")).toContainText("대기 1"); // 버리지 않고 남겨 둔다(풀리면 다시)
    await page.evaluate(() => localStorage.setItem("sync_owner_blocked", ""));
  } finally {
    await ctxT.close();
  }
});

// ── 1년 표본(주 4회 × 6종목 × 4세트 = 208회) — 서버에 직접 올리고 두 기기가 받아 계산한다 ──
const SEEDS = [
  "seed-barbell-bench-press",
  "seed-barbell-squat",
  "seed-deadlift",
  "seed-pull-up",
  "seed-barbell-row",
  "seed-overhead-press",
];

async function api<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${BASE}/api/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

function 일년_표본(now: number) {
  const DAY = 86_400_000;
  const workouts: string[] = [];
  const blocks: string[] = [];
  const sets: string[] = [];
  let i = 0;
  for (let d = 364; d >= 1; d--) {
    if (![1, 2, 4, 5].includes(new Date(now - d * DAY).getDay())) continue;
    const start = now - d * DAY;
    const wid = `y1-w${i}`;
    const week = Math.floor((364 - d) / 7);
    let vol = 0;
    SEEDS.forEach((ex, k) => {
      const bid = `${wid}-b${k}`;
      blocks.push(
        JSON.stringify({
          id: bid,
          workout_id: wid,
          exercise_id: ex,
          sort_order: k,
          created_at: start,
          updated_at: start,
        }),
      );
      for (let s = 0; s < 4; s++) {
        const kg = ex === "seed-pull-up" ? 0 : 40 + week + k * 5;
        vol += kg * 8;
        sets.push(
          JSON.stringify({
            id: `${bid}-s${s}`,
            workout_exercise_id: bid,
            set_number: s + 1,
            weight_kg: kg,
            reps: 8,
            is_warmup: false,
            is_failed: false,
            done: true,
            rir: s === 3 ? 1 : 2,
            created_at: start,
            updated_at: start,
          }),
        );
      }
    });
    workouts.push(
      JSON.stringify({
        id: wid,
        name: "",
        state: "completed",
        started_at: start,
        completed_at: start + 3_600_000,
        duration_seconds: 3600,
        accumulated_pause_ms: 0,
        total_volume_kg: vol,
        pr_count: week % 2 === 0 ? 1 : 0,
        created_at: start,
        updated_at: start,
      }),
    );
    i++;
  }
  return { workouts, blocks, sets };
}

test("1년 표본 — 응답 바이트·서버 시간·트레이너/회원 계산 시간 기록(CPU 4배 느림)", async ({
  page,
  browser,
}) => {
  test.setTimeout(480_000);
  const 트레이너 = `코치y${Date.now().toString(36)}`;
  const 회원메일 = 새_메일("m-year");
  await 준비(page);
  await 가입(page, 회원메일, `회원y${Date.now().toString(36)}`);
  // 서버에 1년치를 바로 올린다(한 번에 ≤5000건)
  const login = await api<{ tokens: { accessToken: string } }>("auth.v1.AuthService/LogIn", {
    email: 회원메일,
    password: 비밀번호,
  });
  const tok = login.tokens.accessToken;
  const y = 일년_표본(Date.now() - 3_600_000);
  const chunks: [string, string[]][] = [
    ["workouts", y.workouts],
    ["workout_exercises", y.blocks],
    ["set_logs", y.sets],
  ];
  for (const [table, rows] of chunks)
    for (let k = 0; k < rows.length; k += 2000)
      await api(
        "sync.v1.SyncService/Push",
        { changes: { [table]: { created: rows.slice(k, k + 2000), updated: [], deleted: [] } } },
        tok,
      );
  await 동기(page);

  const cdpM = await page.context().newCDPSession(page);
  await cdpM.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.setViewportSize({ width: 360, height: 780 });
  const memberMs: Record<string, { read: number; compute: number; workouts: number; sets: number }> = {};
  await page.goto("/stats/summary");
  for (const p of ["7d", "4w", "3m"]) {
    await page.getByTestId(`ps-period-${p}`).click();
    const el = page.getByTestId("ps-ready");
    await expect(el).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("ps-loading")).toHaveCount(0);
    memberMs[p] = {
      read: Number(await el.getAttribute("data-read-ms")),
      compute: Number(await el.getAttribute("data-compute-ms")),
      workouts: Number(await el.getAttribute("data-workouts")),
      sets: Number(await el.getAttribute("data-sets")),
    };
  }
  await cdpM.send("Emulation.setCPUThrottlingRate", { rate: 1 });

  const [ctxT, pageT] = await 새_기기(browser);
  const trainer: Record<string, { bytes: number; serverMs: number; computeMs: number; rows: number }> = {};
  try {
    await 가입(pageT, 새_메일("t-year"), 트레이너);
    await 코칭의향_켜기(pageT);
    await 코칭요청(page, 트레이너);
    await 수락(pageT);
    await pageT.setViewportSize({ width: 360, height: 780 });
    const cdpT = await pageT.context().newCDPSession(pageT);
    await cdpT.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await pageT.goto("/coaching");
    for (const p of ["4w", "3m", "7d"]) {
      const resP = pageT.waitForResponse("**/api/coaching.v1.CoachingService/GetMemberRecords");
      if (p === "4w") await pageT.getByTestId("coaching-report").click();
      else await pageT.getByTestId(`report-period-${p}`).click();
      const res = await resP;
      const text = await res.body();
      const timing = res.request().timing();
      const ready = pageT.getByTestId("report-ready");
      await expect(ready).toBeVisible({ timeout: 60_000 });
      await expect(pageT.getByTestId("report-loading")).toHaveCount(0);
      trainer[p] = {
        bytes: text.length,
        serverMs: Math.round(timing.responseStart - timing.requestStart),
        computeMs: Number(await ready.getAttribute("data-compute-ms")),
        rows: Number(await ready.getAttribute("data-rows")),
      };
    }
    await cdpT.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  } finally {
    await ctxT.close();
  }
  const out = {
    at: new Date().toISOString(),
    sample: { workouts: y.workouts.length, blocks: y.blocks.length, sets: y.sets.length },
    cpuThrottle: 4,
    viewport: 360,
    member: memberMs,
    trainer,
  };
  console.log("[1년 표본]", JSON.stringify(out));
  const file = resolve(process.cwd(), "../../.ouroboros-work/p4-measure.json"); // playwright 는 src/frontend 에서 돈다
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(out, null, 2));
  // 기준: 360 기기에서 1초 넘으면 기본 기간 4주(이미 4주) — 4주 계산은 1초 안
  expect(trainer["4w"].computeMs).toBeLessThan(1000);
});
