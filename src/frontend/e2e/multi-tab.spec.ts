// @plm SRS-089  다중 탭 기록 덮어쓰기 방지 e2e — 같은 브라우저(context)의 두 page = 두 탭.
//
// 원래 결함: LokiJS 증분 IDB 어댑터는 다른 탭이 디스크를 바꾼 것을 보면 **자기 메모리 사본으로 DB 전체를 덮어썼다**(slow path).
// 그래서 탭 A 를 열어 둔 채 탭 B 에서 세트를 저장하면, A 가 숨겨질 때(화면 끄기·탭 전환 — flushOnHide) B 의 세트가 디스크에서 사라졌다.
//
// 단언은 화면이 아니라 **IndexedDB 를 직접 읽어** 한다(재검토 H-5 — 렌더 타이밍·덮개와 무관하게 「디스크에 남았는가」만 본다).
// 수정 전 빌드에서 ①·②가 실제 소실로 실패한다(보고서 report/_work/20261028_p4_execute.md 에 그 로그).
import { expect, test } from "@playwright/test";
import {
  idb_행,
  빠른_운동_시작,
  세트_기록,
  종목_추가,
  준비,
  큰_Strong_파일,
  가져오기_파일,
  가져오기_시작,
  idb_행_수,
} from "./helpers/opengym";

type Page = import("@playwright/test").Page;

test.use({ serviceWorkers: "block" });

/** 디스크(IndexedDB repset)의 살아 있는 세트 무게들(정렬) */
async function 디스크_무게(page: Page): Promise<number[]> {
  const rows = await idb_행(page, "set_logs");
  return rows
    .filter((r) => r._status !== "deleted")
    .map((r) => Number(r.weight_kg))
    .filter((w) => w > 0)
    .sort((a, b) => a - b);
}

/** 디스크에 그 무게 세트가 내려갈 때까지(자동 저장 500ms · 명시 flush) */
async function 디스크에_닿음(page: Page, kg: number): Promise<void> {
  await expect.poll(() => 디스크_무게(page), { timeout: 15_000 }).toContain(kg);
}

/** 숨김 이벤트 — 화면을 끄거나 탭을 옮긴 것처럼(ActiveWorkout 의 flushOnHide 가 내려쓴다 · 재검토 H-5) */
async function 숨김_이벤트(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  });
  await page.waitForTimeout(1_500); // 내려쓰기가 끝날 시간
}

/** 디스크 loki 청크의 versionId — 누가 내려쓰면 바뀐다 */
async function 디스크_버전(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("repset", 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const v: string | null = await new Promise((res) => {
      const r = db
        .transaction(["LokiIncrementalData"], "readonly")
        .objectStore("LokiIncrementalData")
        .get("loki");
      r.onsuccess = () => res(r.result ? (JSON.parse(r.result.value).idbVersionId ?? null) : null);
      r.onerror = () => res(null);
    });
    db.close();
    return v;
  });
}

/** 다른 page 에서 운동 화면을 연다 — 이미 진행 중인 운동이 보인다 */
async function 운동_화면(page: Page): Promise<void> {
  await page.goto("/workout");
  await expect(page.getByTestId("btn-add-exercise")).toBeVisible({ timeout: 30_000 });
}

/** 이 page 가 쓰기 주인이 될 때까지(덮개가 없는 탭) */
async function 주인(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.tabWriter ?? ""), { timeout: 15_000 })
    .toBe("owner");
}

/** 봉인 로그를 모은다 — 혼자 쓰는 사용자에게는 0이어야 한다(거짓 봉인·거부 새로고침 감시) */
function 봉인_로그(page: Page): string[] {
  const seen: string[] = [];
  page.on("console", (m) => {
    const t = m.text();
    if (t.includes("기기 DB 를 봉인했다") || t.includes("다른 탭이 기기 DB 를 바꿨다")) seen.push(t);
  });
  return seen;
}

test("① 두 탭 — B 가 저장한 뒤 A 가 숨겨져 내려써도 디스크에 B 의 세트가 남는다", async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  const A = page;
  await 준비(A);
  await 빠른_운동_시작(A);
  await 종목_추가(A, "바벨 벤치프레스");
  await 세트_기록(A, 0, 0, 61, 10);
  await 디스크에_닿음(A, 61);

  const B = await context.newPage();
  await 운동_화면(B);
  await 종목_추가(B, "바벨 스쿼트");
  await 세트_기록(B, 1, 0, 72, 5);
  await 디스크에_닿음(B, 72); // B 의 저장이 디스크에 닿은 뒤에(순서가 바뀌면 수정 전에도 통과한다)

  await 숨김_이벤트(A); // A 의 낡은 사본이 내려쓰려 한다 — 수정 전: slow path 로 B 세트를 지움
  await A.waitForTimeout(1_500); // A 의 자동 저장(500ms)도 한 번 넘긴다
  expect(await 디스크_무게(B)).toEqual([61, 72]);
  // 진 탭은 덮개 · 이긴 탭은 없음
  await expect(A.getByTestId("tab-elsewhere")).toBeVisible();
  await expect(B.getByTestId("tab-elsewhere")).toHaveCount(0);
});

test("② 언 탭 — A 를 얼린 채 B 가 저장 → A 를 깨워 숨김 이벤트를 일으켜도 B 의 세트가 남는다", async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  const A = page;
  await 준비(A);
  await 빠른_운동_시작(A);
  await 종목_추가(A, "바벨 벤치프레스");
  await 세트_기록(A, 0, 0, 63, 10);
  await 디스크에_닿음(A, 63);
  // A 에 세트 하나를 더 적고 곧바로 얼린다(자동 저장 전이면 A 는 바뀐 것을 들고 언다 — 그 세트는 잃는 것이 정답)
  const cdp = await context.newCDPSession(A);
  await A.getByTestId("workout-exercises").locator("> div").nth(0).getByTestId("btn-add-set").click();
  await 세트_기록(A, 0, 1, 64, 9);
  await cdp.send("Page.setWebLifecycleState", { state: "frozen" });

  const B = await context.newPage();
  await 운동_화면(B);
  await 종목_추가(B, "바벨 스쿼트");
  await 세트_기록(B, 1, 0, 74, 5);
  await 디스크에_닿음(B, 74);

  await cdp.send("Page.setWebLifecycleState", { state: "active" });
  await A.waitForTimeout(1_000);
  await 숨김_이벤트(A);
  await A.waitForTimeout(1_500);
  const w = await 디스크_무게(B);
  expect(w).toContain(74);
  await expect(A.getByTestId("tab-elsewhere")).toBeVisible();
  await expect(A.getByTestId("tab-elsewhere")).toContainText("반영되지 않았을 수 있어요");
});

test("③ 넘겨받기 왕복 — 덮개 · 「여기서 계속하기」 · 세 탭의 세트가 모두 디스크에", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const A = page;
  await 준비(A);
  await 빠른_운동_시작(A);
  await 종목_추가(A, "바벨 벤치프레스");
  await 세트_기록(A, 0, 0, 65, 10);
  await 디스크에_닿음(A, 65);

  // B 를 열면 A 가 멈춘다
  const B = await context.newPage();
  await 운동_화면(B);
  const coverA = A.getByTestId("tab-elsewhere");
  await expect(coverA).toBeVisible({ timeout: 15_000 });
  await expect(coverA).toContainText("다른 탭에서 열려 있어요");
  await expect(B.getByTestId("tab-elsewhere")).toHaveCount(0);
  // 덮개 뒤 화면은 누를 수 없다(inert)
  expect(await A.evaluate(() => document.querySelector("main")?.closest("[inert]") !== null)).toBe(true);
  await expect(B.getByText("바벨 벤치프레스").first()).toBeVisible();
  await 종목_추가(B, "바벨 스쿼트");
  await 세트_기록(B, 1, 0, 75, 5);
  await 디스크에_닿음(B, 75);

  // A 「여기서 계속하기」 → A 가 디스크 최신본으로 다시 열고 주인 · B 가 멈춘다
  await A.getByTestId("btn-tab-take-over").click();
  await expect(A.getByTestId("btn-add-exercise")).toBeVisible({ timeout: 30_000 });
  await 주인(A);
  await expect(A.getByTestId("tab-elsewhere")).toHaveCount(0);
  await expect(B.getByTestId("tab-elsewhere")).toBeVisible({ timeout: 15_000 });
  await expect(A.getByText("바벨 스쿼트").first()).toBeVisible();
  await A.getByTestId("workout-exercises").locator("> div").nth(1).getByTestId("btn-add-set").click();
  await 세트_기록(A, 1, 1, 76, 5);
  await 디스크에_닿음(A, 76);

  // A 를 닫고 B 에서 이어 간다
  await A.close();
  await B.getByTestId("btn-tab-take-over").click();
  await expect(B.getByTestId("btn-add-exercise")).toBeVisible({ timeout: 30_000 });
  await 주인(B);
  await expect(B.getByTestId("tab-elsewhere")).toHaveCount(0);
  expect(await 디스크_무게(B)).toEqual([65, 75, 76]);
  // 덮개 상태의 탭은 디스크를 바꾸지 않는다 — C 를 열어 B 를 멈춘 뒤 C 를 닫고(아무도 주인 아님), B 에 숨김 이벤트 → 5초 동안 loki 버전 그대로
  const C = await context.newPage();
  await 운동_화면(C);
  await expect(B.getByTestId("tab-elsewhere")).toBeVisible({ timeout: 15_000 });
  await C.waitForTimeout(1_500);
  await C.close();
  const 빈 = await context.newPage(); // 앱을 띄우지 않는 같은 출처 문서 — 읽기만
  await 빈.route("**/__tabs_blank", (r) =>
    r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>blank</title>" }),
  );
  await 빈.goto("/__tabs_blank");
  const before = await 디스크_버전(빈);
  await 숨김_이벤트(B);
  await 빈.waitForTimeout(5_000);
  expect(await 디스크_버전(빈)).toBe(before);
  expect(await 디스크_무게(빈)).toEqual([65, 75, 76]);
});

test("④ 혼자 쓰는 사용자 — 새로고침 ×5 · 업데이트 새로고침 · /diag/db 왕복 뒤에도 덮개·봉인 없음", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const logs = 봉인_로그(page);
  await 준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 세트_기록(page, 0, 0, 50, 10);
  for (let i = 0; i < 5; i++) {
    // 저장 직후 곧바로 새로고침(옛 문서의 pagehide 내려쓰기와 새 문서의 읽기가 겹치는 순간)
    await page.reload();
    await expect(page.getByTestId("btn-add-exercise")).toBeVisible({ timeout: 30_000 });
    await 주인(page);
    await expect(page.getByTestId("tab-elsewhere")).toHaveCount(0);
  }
  await 디스크에_닿음(page, 50);
  // 업데이트 새로고침 — 표식을 단 새로고침(appUpdate.reloadOnce 와 같은 문서 교체)
  await page.evaluate(() => sessionStorage.setItem("liftgram.updating", JSON.stringify({ at: Date.now() })));
  await page.reload();
  await expect(page.getByTestId("btn-add-exercise")).toBeVisible({ timeout: 30_000 });
  await 주인(page);
  // /diag/db 왕복(전체 이동)
  await page.goto("/diag/db");
  await page.waitForTimeout(2_000);
  await expect(page.getByTestId("tab-elsewhere")).toHaveCount(0);
  await page.goto("/workout");
  await expect(page.getByTestId("btn-add-exercise")).toBeVisible({ timeout: 30_000 });
  await 주인(page);
  await page.waitForTimeout(1_500);
  await expect(page.getByTestId("tab-elsewhere")).toHaveCount(0);
  expect(await 디스크_무게(page)).toEqual([50]);
  expect(await page.evaluate(() => sessionStorage.getItem("liftgram.tabs.staleReload"))).toBeNull();
  expect(logs).toEqual([]);
});

test("④-2 혼자 쓰는 사용자 — 계정 전환 리셋(다른 계정으로 로그인 → 기기 DB 비움) 뒤 저장·새로고침에 덮개 없음", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const logs = 봉인_로그(page);
  const resets: string[] = [];
  page.on("console", (m) => {
    if (m.text().includes("Database is now reset")) resets.push(m.text());
  });
  const pw = "hunter22!";
  const 메일 = (t: string) => `e2e-tabs-${t}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const 가입 = async (email: string) => {
    await page.goto("/account");
    await page.getByTestId("mode-signup").click();
    await page.getByTestId("auth-email-input").fill(email);
    await page.getByTestId("auth-password-input").fill(pw);
    await page.getByTestId("auth-name-input").fill("탭테스트");
    await page.getByTestId("btn-auth-submit").click();
    await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  };
  await 준비(page);
  await 가입(메일("one"));
  await page.getByTestId("btn-sync-now").click();
  await expect(page.getByTestId("sync-status")).toHaveText("동기 완료", { timeout: 30_000 });
  await page.getByTestId("btn-logout").click();
  await expect(page.getByTestId("auth-email-input")).toBeVisible({ timeout: 20_000 });
  // 다른 계정 — 올라가지 않은 기록이 없으니 기기 DB 를 비우고(unsafeResetDatabase → 새 Loki) 새 주인으로
  const second = 메일("two");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(second);
  await page.getByTestId("auth-password-input").fill(pw);
  await page.getByTestId("auth-name-input").fill("탭테스트2");
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toHaveText("탭테스트2", { timeout: 30_000 });
  // 실제로 리셋이 일어났는가(Watermelon 로그) — 안 일어났다면 이 테스트는 리셋 경로를 재지 못한다
  await expect.poll(() => resets.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(3_000); // 비운 뒤 다시 심기
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 세트_기록(page, 0, 0, 52, 8);
  await 디스크에_닿음(page, 52);
  await page.reload();
  await expect(page.getByTestId("btn-add-exercise")).toBeVisible({ timeout: 30_000 });
  await 주인(page);
  await page.waitForTimeout(1_500);
  await expect(page.getByTestId("tab-elsewhere")).toHaveCount(0);
  expect(await 디스크_무게(page)).toEqual([52]);
  expect(logs).toEqual([]);
});

test("⑤ 가져오는 탭이 있으면 새 탭은 주인을 빼앗지 않고 안내만 · 새 탭을 숨겨도 가져온 행이 남는다", async ({
  page,
  context,
}) => {
  test.setTimeout(300_000);
  const 운동수 = 2000;
  await 준비(page);
  await 가져오기_파일(
    page,
    "big.csv",
    큰_Strong_파일({ workouts: 운동수, exercisesPer: 3, setsPer: 2 }).text,
  );
  await page.getByTestId("import-unit-kg").click();
  await page.getByTestId("btn-import-to-match").click();
  await 가져오기_시작(page);
  // 쓰는 중(묶음 진행)에 새 탭을 연다
  await expect(page.getByTestId("import-write-progress-label")).toContainText("묶음", { timeout: 120_000 });

  const other = await context.newPage();
  await other.goto("/");
  const notice = other.getByTestId("import-elsewhere-notice");
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(other.getByTestId("tab-elsewhere")).toHaveCount(0);
  // 새 탭은 주인을 빼앗지 않았다 — 가져오던 탭에 덮개 없음 · 새 탭은 봉인돼 쓰기 주인 아님
  await expect(page.getByTestId("tab-elsewhere")).toHaveCount(0);
  expect(await other.evaluate(() => document.documentElement.dataset.tabWriter ?? "unknown")).not.toBe(
    "owner",
  );
  await 숨김_이벤트(other);
  await expect(page.getByTestId("import-step-done")).toBeVisible({ timeout: 240_000 });
  await page.waitForTimeout(2_000);
  await 숨김_이벤트(other); // 끝난 뒤에도 낡은 사본이 덮지 않는다
  await other.waitForTimeout(1_500);
  const n = await idb_행_수(other, ["workouts"], "imp-");
  expect(n.workouts).toBe(운동수);
  await expect(page.getByTestId("tab-elsewhere")).toHaveCount(0);
});

test("⑥ Web Locks 없는 브라우저 — BroadcastChannel 의 claim 으로 나중 탭이 주인 · 진 탭이 숨겨져도 B 의 세트가 남는다", async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  const A = page;
  // 새 기기 첫 실행(빈 DB 시드)은 잠금이 있는 채로 끝낸다 — 빈 DB 의 시드 top-up 과 카탈로그 받기가 겹치는 기존 경합
  // (보고서 「남은 위험」)이 이 테스트를 흔들지 않게. 그 뒤 잠금을 지우고 다시 연다.
  await 준비(A);
  await context.addInitScript(() => {
    try {
      Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
    } catch {
      // 지울 수 없으면 아래 단언이 잡는다
    }
  });
  await A.reload();
  await expect(A.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
  expect(await A.evaluate(() => "locks" in navigator && navigator.locks === undefined)).toBe(true);
  await 빠른_운동_시작(A);
  await 종목_추가(A, "바벨 벤치프레스");
  await 세트_기록(A, 0, 0, 67, 10);
  await 디스크에_닿음(A, 67);

  const B = await context.newPage();
  await 운동_화면(B);
  await expect(A.getByTestId("tab-elsewhere")).toBeVisible({ timeout: 15_000 });
  await 종목_추가(B, "바벨 스쿼트");
  await 세트_기록(B, 1, 0, 78, 5);
  await 디스크에_닿음(B, 78);
  await 숨김_이벤트(A);
  expect(await 디스크_무게(B)).toEqual([67, 78]);
  await expect(B.getByTestId("tab-elsewhere")).toHaveCount(0);
});

// ── /qa code P4 조치(M-1·M-3·M-4) ────────────────────────────────────────────────────────────

test("⑦ 앱 문서를 iframe 으로 띄워도(M-1 · 찌르기 iframe 이 /offline 셸을 받은 경우) 본 탭은 주인 그대로 — 거짓 덮개·봉인 없음", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const logs = 봉인_로그(page);
  await 준비(page);
  await 주인(page);
  const inner = await page.evaluate(async () => {
    const f = document.createElement("iframe");
    f.src = "/offline";
    f.style.cssText = "position:fixed;width:1px;height:1px;left:-9999px;top:-9999px";
    const loaded = new Promise((r) => f.addEventListener("load", r, { once: true }));
    document.body.appendChild(f);
    await loaded;
    // 앱이 뜨고 부팅(동기·쓰기 주인)을 시도할 시간
    await new Promise((r) => setTimeout(r, 4_000));
    const w = f.contentDocument?.documentElement.dataset.tabWriter ?? null;
    f.remove();
    return w;
  });
  expect(inner, "프레임 문서는 탭으로 나서지 않는다").toBe("framed");
  await page.waitForTimeout(1_500);
  expect(await page.evaluate(() => document.documentElement.dataset.tabWriter)).toBe("owner");
  await expect(page.getByTestId("tab-elsewhere")).toHaveCount(0);
  expect(logs).toEqual([]);
});

test("⑧ 배포 과도기 옛 번들 탭(M-3) — 판 없는 pong·hello 를 낸 탭을 import-start→import-end 로 얼리고 띠 · 이 탭은 주인 그대로", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  // 옛 번들 흉내 — 같은 출처 문서에서 옛 tabGuard 처럼 핑에 판(proto) 없이 답한다
  const old = await context.newPage();
  await old.goto("/sw-nudge.html");
  await old.evaluate(() => {
    const w = window as unknown as { __got: string[]; __ch: BroadcastChannel };
    w.__got = [];
    w.__ch = new BroadcastChannel("liftgram-tabs");
    w.__ch.onmessage = (e) => {
      const m = e.data as { t: string; nonce?: string; legacyFreeze?: boolean };
      w.__got.push(m.t + (m.legacyFreeze ? ":freeze" : ""));
      if (m.t === "ping")
        w.__ch.postMessage({ t: "pong", from: "old-tab", nonce: m.nonce, importing: false });
    };
  });
  const got = () =>
    old.evaluate(() => (window as unknown as { __got: string[] }).__got.filter((x) => x.endsWith(":freeze")));
  const logs = 봉인_로그(page);
  await 준비(page);
  await 주인(page);
  await expect.poll(got, { timeout: 15_000 }).toEqual(["import-start:freeze", "import-end:freeze"]);
  await expect(page.getByTestId("legacy-tab-band")).toBeVisible();
  // 나중에 열린 옛 탭(판 없는 hello)도 얼린다
  await old.evaluate(() =>
    (window as unknown as { __ch: BroadcastChannel }).__ch.postMessage({ t: "hello", from: "old-tab-2" }),
  );
  await expect
    .poll(got, { timeout: 15_000 })
    .toEqual(["import-start:freeze", "import-end:freeze", "import-start:freeze", "import-end:freeze"]);
  // 새 번들인 이 탭은 얼리기 신호에 반응하지 않는다
  await expect(page.getByTestId("tab-elsewhere")).toHaveCount(0);
  await expect(page.getByTestId("import-elsewhere-notice")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.dataset.tabWriter)).toBe("owner");
  await page.getByTestId("btn-legacy-tab-dismiss").click();
  await expect(page.getByTestId("legacy-tab-band")).toHaveCount(0);
  expect(logs).toEqual([]);
});

test("⑨ bfcache 복귀(M-4) — 새로고침 전에 내려쓴다 · 방금 기록한 세트가 남고 덮개·봉인 없음", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const logs = 봉인_로그(page);
  const flushed: string[] = [];
  page.on("console", (m) => {
    if (m.text().includes("bfcache 복귀 — 내려쓰고 새로고침")) flushed.push(m.text());
  });
  await 준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 세트_기록(page, 0, 0, 57, 8);
  // 곧바로(자동 저장 전일 수 있다) bfcache 복귀를 흉내 — 내려쓰기 → 새로고침
  await Promise.all([
    page.waitForEvent("load", { timeout: 20_000 }),
    page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }))),
  ]);
  expect(flushed.length, "새로고침 전에 내려쓰기 경로를 탔다").toBeGreaterThan(0);
  await expect(page.getByTestId("btn-add-exercise")).toBeVisible({ timeout: 30_000 });
  await 주인(page);
  expect(await 디스크_무게(page)).toEqual([57]);
  await expect(page.getByTestId("tab-elsewhere")).toHaveCount(0);
  expect(logs).toEqual([]);
});

test.describe("서비스워커 켬", () => {
  test.use({ serviceWorkers: "allow" });

  test("⑩ 오프라인 찌르기 iframe(/sw-nudge.html)은 앱 셸(/offline) 대체를 받지 않는다(M-1) · 본 탭 덮개 없음", async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
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
    expect(ok, "서비스워커가 이 문서를 제어한다").toBe(true);
    await 주인(page);
    await context.setOffline(true);
    const r = await page.evaluate(async () => {
      const f = document.createElement("iframe");
      f.src = `/sw-nudge.html?t=${Date.now()}`;
      const loaded = new Promise((res) => f.addEventListener("load", res, { once: true }));
      document.body.appendChild(f);
      await loaded;
      await new Promise((res) => setTimeout(res, 1_500));
      const d = f.contentDocument;
      const out = {
        app: !!d?.querySelector("[data-testid]"),
        writer: d?.documentElement.dataset.tabWriter ?? null,
      };
      f.remove();
      return out;
    });
    await context.setOffline(false);
    expect(r).toEqual({ app: false, writer: null });
    await page.waitForTimeout(1_000);
    expect(await page.evaluate(() => document.documentElement.dataset.tabWriter)).toBe("owner");
    await expect(page.getByTestId("tab-elsewhere")).toHaveCount(0);
  });
});
