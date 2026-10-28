// @plm SRS-081 SRS-082  다른 앱(Strong·Hevy) 기록 가져오기 — 전체 화면 단계·종목 맞추기·묶음 되돌리기·동기 e2e
//
// 확인 목록(스펙 2판 P5 검증):
//   · Strong 표본 → 기록·캘린더·통계 반영 · 「≈RIR」(RPE 세트) · 재가져오기 0건 · 되돌리기 → 0 · user_edited 경고(로그아웃 기기)
//   · Hevy(kg) 로그인 → 「서버로 올리는 중」 · 피드·스토리·PR 폭죽 없음(서버 posts·stories 0) · 오프라인 + 되돌린 묶음 → 막힘 · 진행 중 운동 → 막힘
//   · 1만 세트 → 동기 성공 → 서버 sync_records 수 = 로컬 → 다른 기기 pull 일치 · 되돌리기 → 동기 성공(D-1)
//   · 되돌리기 → 동기 → 새 기기에서 같은 파일 → 동기 두 번 → 운동 수 = 파일(D-2)
//   · n번째 묶음 실패 → 남은 행 0 · 쓰는 도중 강제 새로고침 → 부팅 정리 뒤 남은 행 0 → 다시 가져오기 성공(D-3)
//   · 나가기 확인(탭바·뒤로 가기) · 맞추기 결정 임시 저장(새로고침 뒤 같은 파일이면 이어서) · 진행 화면은 닫히지 않음
//   · 서비스워커가 켜진 셸에서도 Worker 로 계산 · 오프라인이면 메인 대체
// 서버 숫자는 docker 공유 db 에 직접 묻는다(`E2E_DB` 가 있을 때만 — 없으면 그 검사만 건너뛴다).
import { expect, test } from "@playwright/test";
import {
  idb_행_고치기,
  idb_행,
  idb_행_수,
  가입,
  가져오기_끝까지,
  가져오기_시작,
  가져오기_파일,
  내려쓰기_대기,
  동기,
  로그인,
  빈_문서,
  빠른_운동_시작,
  새_기기,
  새_메일,
  서버_가져온_수,
  서버_숫자,
  시험_파일,
  준비,
  큰_Strong_파일,
} from "./helpers/opengym";

type Page = import("@playwright/test").Page;

const 표 = ["workouts", "workout_exercises", "set_logs"];

async function 가져온_행(page: Page): Promise<Record<string, number>> {
  await 빈_문서(page);
  const n = await idb_행_수(page, 표, "imp-");
  const b = await idb_행_수(page, ["import_batches"]);
  return { ...n, import_batches: b.import_batches };
}

async function 되돌리기(page: Page, editedWarn = false, editedWorkoutWarn = false): Promise<void> {
  await page.goto("/account");
  const row = page.getByTestId("import-history").locator('[data-status="done"]').first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByTestId("btn-import-undo").click();
  const dlg = page.getByTestId("import-undo-dialog");
  await expect(dlg).toBeVisible();
  if (editedWarn) await expect(dlg).toContainText("고친 세트(무게·횟수·RPE·RIR 등) 1개");
  if (editedWorkoutWarn) await expect(dlg).toContainText("이름·메모를 고친 운동 1개");
  await dlg.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("import-card-status")).toContainText("되돌렸어요", { timeout: 60_000 });
}

test.describe("로그아웃 기기 — Strong 표본", () => {
  test.use({ serviceWorkers: "block" });

  test("기록·캘린더·통계 반영 · ≈RIR · 재가져오기 0건 · user_edited 경고 · 되돌리기 → 0", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const csv = 시험_파일("strong-comma.csv");
    await 준비(page);

    // 입구: 로그아웃 분기의 계정 화면
    await page.goto("/account");
    await expect(page.getByTestId("import-card")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("btn-import-open").click();
    await expect(page).toHaveURL(/\/account\/import$/);

    await 가져오기_파일(page, "strong_export.csv", csv);
    await expect(page.getByTestId("import-summary-head")).toContainText("Strong 파일 · 운동 2개");
    // 단위를 고르기 전에는 다음으로 못 간다 · 고르면 표본 한 줄
    await expect(page.getByTestId("btn-import-to-match")).toBeDisabled();
    await page.getByTestId("import-unit-kg").click();
    await expect(page.getByTestId("import-sample")).toContainText("80kg × 5");
    await page.getByTestId("import-unit-lb").click();
    await expect(page.getByTestId("import-sample")).toContainText("80lb × 5");
    await page.getByTestId("import-unit-kg").click();
    await 가져오기_끝까지(page, null);
    await expect(page.getByTestId("import-done-summary")).toContainText("운동 2개");
    // 계산은 Worker 에서 돌았다(번들러 Worker 청크가 운영 빌드에서 열린다)
    await expect(page.getByTestId("import-flow")).toHaveAttribute("data-import-via", "worker");
    // PR 폭죽·완료 요약 없음
    await expect(page.getByTestId("pr-celebration")).toHaveCount(0);
    await expect(page.getByTestId("summary-volume")).toHaveCount(0);

    // 기록: 2개 · 8월 25일 운동 상세에 RPE 8 → 「≈RIR 2」
    await page.getByTestId("btn-import-go-history").click();
    await expect(page).toHaveURL(/\/history$/);
    const items = page.getByTestId("history-list").locator('[data-testid^="history-imp-"]');
    await expect(items).toHaveCount(2, { timeout: 20_000 });
    await items.nth(1).click();
    await expect(page.getByTestId("detail-set").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("detail-set-rir").filter({ hasText: "≈RIR 2" }).first()).toBeVisible();
    await expect(page.getByTestId("detail-set-rir").filter({ hasText: "≈RIR 1.5" }).first()).toBeVisible();

    // 캘린더: 8월 25·27일
    await page.goto("/calendar");
    await expect(page.getByTestId("calendar-grid")).toBeVisible({ timeout: 20_000 });
    for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "이전 달" }).click();
    await expect(page.getByTestId("month-label")).toContainText("8월");
    await expect(page.getByTestId("day-25")).toHaveAttribute("data-worked", "1");
    await expect(page.getByTestId("day-27")).toHaveAttribute("data-worked", "1");

    // 통계 「전체」: 운동 2회
    await page.goto("/stats");
    await page.getByTestId("period-all").click();
    await expect(page.getByTestId("stat-sessions")).toHaveText("2", { timeout: 20_000 });

    // 재가져오기: 0건 · 가져오기 기록은 하나 그대로
    await page.goto("/account/import");
    await 가져오기_파일(page, "strong_export.csv", csv);
    await 가져오기_끝까지(page, "kg");
    await expect(page.getByTestId("import-step-done")).toContainText("새로 가져올 운동이 없어요");
    await expect(page.getByTestId("import-skipped")).toContainText("이미 있는 운동 2개");
    await page.goto("/account");
    await expect(page.getByTestId("import-history").locator("li")).toHaveCount(1, { timeout: 20_000 });

    // 가져온 세트 하나를 사람이 고친 것으로 → 되돌리기 확인창에 경고
    await 내려쓰기_대기(page);
    await 빈_문서(page);
    const sets = (await idb_행(page, "set_logs")).filter((r) => String(r.id).startsWith("imp-"));
    expect(sets.length).toBe(9);
    await idb_행_고치기(page, "set_logs", [{ id: String(sets[0].id), set: { user_edited: true } }]);
    // 가져온 운동 하나의 이름을 고친 것으로(updated_at 이 created_at 보다 뒤) → 「고친 운동 1개」 경고(P5-12)
    const ws = (await idb_행(page, "workouts")).filter((r) => String(r.id).startsWith("imp-"));
    await idb_행_고치기(page, "workouts", [
      { id: String(ws[0].id), set: { name: "이름 바꿈" }, shiftUpdatedAt: 60_000 },
    ]);
    await 되돌리기(page, true, true);
    await expect(page.getByTestId("import-batch-undone")).toBeVisible();
    await 내려쓰기_대기(page);
    const left = await 가져온_행(page);
    expect(left).toEqual({ workouts: 0, workout_exercises: 0, set_logs: 0, import_batches: 1 });
    await page.goto("/history");
    await expect(page.locator('[data-testid^="history-imp-"]')).toHaveCount(0);
  });

  test("나가기 확인(탭바·뒤로 가기) · 결정 임시 저장 → 새로고침 뒤 같은 파일이면 이어서", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const csv = 시험_파일("strong-comma.csv");
    await 준비(page);
    await page.goto("/account");
    await page.goto("/account/import");
    await 가져오기_파일(page, "strong_export.csv", csv);
    await page.getByTestId("import-unit-kg").click();
    await page.getByTestId("btn-import-to-match").click();
    // 자동 묶음까지 펼쳐 첫 줄을 「가져오지 않기」로
    if ((await page.getByTestId("import-match-auto-toggle").count()) > 0)
      await page.getByTestId("import-match-auto-toggle").click();
    const first = page.getByTestId("import-match-row").first();
    const src = await first.getByTestId("import-match-source").textContent();
    await first.getByTestId("import-match-skip").click();
    await expect(first).toHaveAttribute("data-decision", "skip");

    // 탭바 링크 → 확인창 · 취소하면 그대로
    await page.getByTestId("shell-nav").locator('a[href="/stats"]').click();
    await expect(page.getByTestId("import-leave-dialog")).toBeVisible();
    await page.getByTestId("dialog-cancel").click();
    await expect(page).toHaveURL(/\/account\/import$/);
    await expect(page.getByTestId("import-match-head")).toBeVisible();

    // 새로고침(확인 없이 다시 연다) → 같은 파일을 고르면 결정이 남아 있다
    page.on("dialog", (d) => void d.accept());
    await page.reload();
    await expect(page.getByTestId("import-draft-kept")).toBeVisible({ timeout: 20_000 });
    await 가져오기_파일(page, "strong_export.csv", csv);
    await page.getByTestId("btn-import-to-match").click(); // 단위도 남아 있다(kg)
    if ((await page.getByTestId("import-match-auto-toggle").count()) > 0)
      await page.getByTestId("import-match-auto-toggle").click();
    const again = page
      .getByTestId("import-match-row")
      .filter({ hasText: src ?? "" })
      .first();
    await expect(again).toHaveAttribute("data-decision", "skip");

    // 뒤로 가기 → 확인창(주소 그대로) → 나가기 → 앞 화면, 임시 저장은 지워진다
    await page.goBack();
    await expect(page.getByTestId("import-leave-dialog")).toBeVisible();
    await expect(page).toHaveURL(/\/account\/import$/);
    await page.getByTestId("dialog-confirm").click();
    await expect(page).not.toHaveURL(/\/account\/import$/, { timeout: 10_000 });
    expect(await page.evaluate(() => sessionStorage.getItem("liftgram.importDraft"))).toBeNull();
  });

  test("n번째 묶음 실패 → 남은 행 0 · 쓰는 도중 새로고침 → 부팅 정리 뒤 0 → 다시 가져오기 성공", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const big = 큰_Strong_파일({ workouts: 300 }); // 행 300 + 1500 + 3000 = 4800 → 3묶음
    await 준비(page);
    await page.evaluate(() => localStorage.setItem("liftgram.e2e.importFault", "throw:2"));
    await page.goto("/account/import");
    await 가져오기_파일(page, "big.csv", big.text);
    await page.getByTestId("import-unit-kg").click();
    await page.getByTestId("btn-import-to-match").click();
    await 가져오기_시작(page);
    await expect(page.getByTestId("import-error")).toContainText("쓴 것은 모두 지웠어요", {
      timeout: 120_000,
    });
    await 내려쓰기_대기(page);
    expect(await 가져온_행(page)).toEqual({
      workouts: 0,
      workout_exercises: 0,
      set_logs: 0,
      import_batches: 0,
    });

    // 쓰는 도중 강제 새로고침(2번째 묶음 뒤 디스크에 내리고 reload)
    await page.goto("/account");
    await page.evaluate(() => localStorage.setItem("liftgram.e2e.importFault", "reload:2"));
    await page.goto("/account/import");
    await 가져오기_파일(page, "big.csv", big.text);
    await page.getByTestId("import-unit-kg").click();
    await page.getByTestId("btn-import-to-match").click();
    page.on("dialog", (d) => void d.accept());
    // 새로고침으로 오는 문서는 앱 대신 빈 문서로 받는다 — 앱이 부팅 정리를 하기 **전** 디스크 상태를 본다
    await page.route("**/account/import", (route) =>
      route.request().resourceType() === "document"
        ? route.fulfill({
            status: 200,
            contentType: "text/html",
            body: "<!doctype html><title>blank</title>",
          })
        : route.continue(),
    );
    const reloaded = page.waitForEvent("load", { timeout: 120_000 });
    await 가져오기_시작(page);
    await reloaded;
    const half = await idb_행_수(page, 표, "imp-");
    const halfBatches = (await idb_행(page, "import_batches")).map((b) => b.status);
    expect(halfBatches).toEqual(["writing"]); // 끝나지 않은 묶음이 남았다
    expect(half.workouts).toBeGreaterThan(0); // 2묶음까지 쓴 행이 디스크에 있다
    expect(half.workouts).toBeLessThan(300);
    await page.unroute("**/account/import");
    await page.evaluate(() => localStorage.removeItem("liftgram.e2e.importFault"));
    await page.goto("/account/import");
    await expect(page.getByTestId("import-flow")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(3_000); // 부팅 정리 + 자동 저장
    await 내려쓰기_대기(page);
    expect(await 가져온_행(page)).toEqual({
      workouts: 0,
      workout_exercises: 0,
      set_logs: 0,
      import_batches: 0,
    });

    // 삭제 표시가 남지 않았다 → 같은 파일을 다시 가져올 수 있다
    await page.goto("/account/import");
    await 가져오기_파일(page, "big.csv", big.text);
    await 가져오기_끝까지(page, "kg");
    await expect(page.getByTestId("import-done-summary")).toContainText("운동 300개");
  });
});

test.describe("진행 화면은 닫을 수 없다", () => {
  test.use({ serviceWorkers: "block" });

  test("쓰는 동안 탭바·뒤로 가기·앱바 뒤로는 화면을 옮기지 않는다 · 새로고침하면 부팅 정리", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await 준비(page);
    await page.evaluate(() => localStorage.setItem("liftgram.e2e.importFault", "hold:1"));
    await page.goto("/account/import");
    await 가져오기_파일(page, "big.csv", 큰_Strong_파일({ workouts: 300 }).text);
    await page.getByTestId("import-unit-kg").click();
    await page.getByTestId("btn-import-to-match").click();
    await 가져오기_시작(page);
    await expect(page.getByTestId("import-write-progress-label")).toContainText("묶음 1/5", {
      timeout: 60_000,
    });
    await page.getByTestId("shell-nav").locator('a[href="/stats"]').click();
    await page.getByTestId("btn-back").click();
    await page.goBack();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/account\/import$/);
    await expect(page.getByTestId("import-step-progress")).toBeVisible();
    await expect(page.getByTestId("import-leave-dialog")).toHaveCount(0);
    // 강제로 새로고침(브라우저가 묻는 확인을 받아들임) → 부팅 정리 → 남은 행 0
    await page.evaluate(() => localStorage.removeItem("liftgram.e2e.importFault"));
    page.on("dialog", (d) => void d.accept());
    await page.reload();
    await expect(page.getByTestId("import-flow")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(3_000);
    expect(await 가져온_행(page)).toEqual({
      workouts: 0,
      workout_exercises: 0,
      set_logs: 0,
      import_batches: 0,
    });
  });
});

test.describe("서비스워커가 켜진 운영 셸", () => {
  test("온라인이면 Worker 에서 계산 · 오프라인이면 메인 대체로도 가져온다", async ({ page, context }) => {
    test.setTimeout(180_000);
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
    test.skip(!ok, "서비스워커가 등록되지 않는 대상");
    await 준비(page);
    await 가져오기_파일(page, "hevy_lb.csv", 시험_파일("hevy-lb.csv"));
    await expect(page.getByTestId("import-flow")).toHaveAttribute("data-import-via", "worker");
    await expect(page.getByTestId("import-unit")).toContainText("lb");
    await 가져오기_끝까지(page, null);
    await expect(page.getByTestId("import-flow")).toHaveAttribute("data-import-via", "worker");

    // 오프라인: 새로 연 화면(Worker 를 새로 만든다) — 쿼리 붙은 Worker 주소는 캐시에 없을 수 있다 → 메인 대체여도 끝까지
    await context.setOffline(true);
    await page.goto("/account/import");
    await 가져오기_파일(page, "strong_export.csv", 시험_파일("strong-comma.csv"));
    await 가져오기_끝까지(page, "kg");
    await expect(page.getByTestId("import-done-summary")).toContainText("운동 2개");
    const via = await page.getByTestId("import-flow").getAttribute("data-import-via");
    expect(["worker", "main"]).toContain(via);
    await context.setOffline(false);
  });
});

test.describe("로그인 기기", () => {
  test.use({ serviceWorkers: "block" });

  test("Hevy → 서버로 올리는 중 · 피드·스토리 없음 · 오프라인+되돌린 묶음 막힘 · 진행 중 운동 막힘", async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    const email = 새_메일("imp-hevy");
    await 준비(page);
    await 가입(page, email, "가져오기 헤비");
    await expect(page.getByTestId("import-card")).toBeVisible();
    await 가져오기_파일(page, "hevy_workouts.csv", 시험_파일("hevy-kg.csv"));
    await expect(page.getByTestId("import-unit")).toContainText("파일에 적힌 대로");
    await 가져오기_끝까지(page, null);
    await expect(page.getByTestId("import-uploading")).toBeVisible();
    await expect(page.getByTestId("pr-celebration")).toHaveCount(0);
    await 동기(page);

    // 피드·스토리: 화면과 서버 둘 다 0
    await page.goto("/feed");
    await expect(page.getByTestId("feed-list")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("post-author")).toHaveCount(0);
    const safe = email.replace(/'/g, "''");
    const posts = 서버_숫자(
      `select count(*) from posts p join users u on u.id = p.author_id where u.email = '${safe}'`,
    );
    const stories = 서버_숫자(
      `select count(*) from stories s join users u on u.id = s.author_id where u.email = '${safe}'`,
    );
    if (posts != null) expect(posts).toBe(0);
    if (stories != null) expect(stories).toBe(0);
    const srv = 서버_가져온_수(email, "workouts");
    if (srv != null) expect(srv).toBeGreaterThan(0);

    // 되돌린 뒤 오프라인 → 「온라인에서 다시 시도」
    await 되돌리기(page);
    await page.goto("/account/import");
    await expect(page.getByTestId("btn-import-pick")).toBeEnabled({ timeout: 20_000 });
    await context.setOffline(true);
    await expect(page.getByTestId("import-blocked")).toContainText("온라인에서 다시 시도", {
      timeout: 10_000,
    });
    await expect(page.getByTestId("btn-import-pick")).toBeDisabled();
    await context.setOffline(false);
    await expect(page.getByTestId("import-blocked")).toHaveCount(0, { timeout: 10_000 });
    await 동기(page);

    // 진행 중 운동 → 시작 안 됨
    await 빠른_운동_시작(page);
    await page.goto("/account/import");
    await expect(page.getByTestId("import-blocked")).toContainText("운동을 마친 뒤", { timeout: 20_000 });
    await expect(page.getByTestId("btn-import-pick")).toBeDisabled();
  });

  test("1만 세트 → 동기 성공 → 서버 수 = 로컬 → 다른 기기 pull 일치 · 되돌리기 → 동기 성공(D-1)", async ({
    page,
    browser,
  }) => {
    test.setTimeout(900_000);
    const big = 큰_Strong_파일();
    const email = 새_메일("imp-10k");
    await 준비(page);
    await 가입(page, email, "가져오기 만");
    const t0 = Date.now();
    await 가져오기_파일(page, "strong_10k.csv", big.text);
    const tAnalyze = Date.now() - t0;
    await page.getByTestId("import-unit-kg").click();
    await page.getByTestId("btn-import-to-match").click();
    const t1 = Date.now();
    await 가져오기_시작(page);
    await expect(page.getByTestId("import-step-done")).toBeVisible({ timeout: 300_000 });
    const tImport = Date.now() - t1;
    await expect(page.getByTestId("import-done-summary")).toContainText("운동 1,000개 · 세트 10,000개");

    const t2 = Date.now();
    await 동기(page);
    const tSync = Date.now() - t2;
    await 내려쓰기_대기(page);
    const local = await 가져온_행(page);
    expect(local).toEqual({ workouts: 1000, workout_exercises: 5000, set_logs: 10000, import_batches: 1 });
    for (const t of 표) {
      const n = 서버_가져온_수(email, t);
      if (n != null) expect(n, `서버 ${t}`).toBe(local[t]);
    }

    // 다른 기기: 로그인 → pull → 같은 수
    const [ctx2, p2] = await 새_기기(browser);
    try {
      await 준비(p2);
      const t3 = Date.now();
      await 로그인(p2, email);
      await 동기(p2);
      const tPull = Date.now() - t3;
      await 내려쓰기_대기(p2);
      expect(await 가져온_행(p2)).toEqual(local);
      console.log(
        `[측정] 1만 세트: 분석 ${tAnalyze}ms · 가져오기(계획+쓰기+flush) ${tImport}ms · 첫 동기(push) ${tSync}ms · 다른 기기 로그인+pull ${tPull}ms`,
      );
    } finally {
      await ctx2.close();
    }

    // 되돌리기 → 동기 성공 → 서버 살아 있는 가져온 레코드 0
    await 되돌리기(page);
    await 동기(page);
    for (const t of 표) {
      const n = 서버_가져온_수(email, t);
      if (n != null) expect(n, `되돌린 뒤 서버 ${t}`).toBe(0);
    }
  });

  test("되돌리기 → 동기 → 새 기기에서 같은 파일 → 동기 두 번 → 운동 수 = 파일(D-2)", async ({
    page,
    browser,
  }) => {
    test.setTimeout(400_000);
    const file = 큰_Strong_파일({ workouts: 60 });
    const email = 새_메일("imp-d2");
    await 준비(page);
    await 가입(page, email, "가져오기 다시");
    await 가져오기_파일(page, "strong_60.csv", file.text);
    await 가져오기_끝까지(page, "kg");
    await 동기(page);
    await 되돌리기(page);
    await 동기(page);

    const [ctx2, p2] = await 새_기기(browser);
    try {
      await 준비(p2);
      await 로그인(p2, email);
      await 동기(p2);
      await 가져오기_파일(p2, "strong_60.csv", file.text);
      await 가져오기_끝까지(p2, "kg");
      await expect(p2.getByTestId("import-done-summary")).toContainText("운동 60개");
      await 동기(p2);
      await 동기(p2);
      await 내려쓰기_대기(p2);
      const n = await 가져온_행(p2);
      expect(n.workouts).toBe(60);
      expect(n.set_logs).toBe(file.sets);
      const srv = 서버_가져온_수(email, "workouts");
      if (srv != null) expect(srv).toBe(60);
    } finally {
      await ctx2.close();
    }
    // 처음 기기도 동기 뒤 60(예전 삭제 표시가 새 행을 지우지 않는다)
    await 동기(page);
    await 동기(page);
    await 내려쓰기_대기(page);
    expect((await 가져온_행(page)).workouts).toBe(60);
  });
});

// ── /qa code P5 조치 ────────────────────────────────────────────────────────
test.describe("다른 탭 가드(P5-1)", () => {
  test.use({ serviceWorkers: "block" });

  // @plm SRS-089  P4(다중 탭 단일 쓰기) 뒤: 나중에 연 탭이 쓰기 주인이 되고 진 탭은 봉인돼 presence 를 놓는다(재검토 M-5) —
  // 봉인 탭은 어떤 경로로도 디스크에 쓰지 못하므로 가져오기를 막을 이유가 없다. 그래서 「다른 탭이 열려 있으면 막힘」은
  // Web Locks 브라우저에서 더는 닿지 않는다(코드는 판정 수단이 없는 브라우저의 대비로 남긴다).
  test("다른 탭이 열려 있어도 그 탭은 봉인(덮개)돼 가져오기·되돌리기가 막히지 않는다", async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    const csv = 시험_파일("strong-comma.csv");
    await 준비(page);
    await 가져오기_파일(page, "strong_export.csv", csv);
    await 가져오기_끝까지(page, "kg");
    await expect(page.getByTestId("import-done-summary")).toContainText("운동 2개");

    const other = await context.newPage();
    await other.goto("/");
    await expect(other.getByTestId("shell-nav")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("tab-elsewhere")).toBeVisible({ timeout: 15_000 }); // 나중 탭이 주인

    // 가져오기 화면을 다시 열면(새 문서 = 새 주인) 다른 탭이 멈추고 막힘이 없다
    await page.goto("/account/import");
    await expect(other.getByTestId("tab-elsewhere")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("btn-import-pick")).toBeEnabled({ timeout: 20_000 });
    await expect(page.getByTestId("import-blocked")).toHaveCount(0);
    await expect(other.getByTestId("import-elsewhere-notice")).toHaveCount(0);

    // 되돌리기: 확인창까지 간다(취소)
    await page.goto("/account");
    await expect(other.getByTestId("tab-elsewhere")).toBeVisible({ timeout: 15_000 });
    const row = page.getByTestId("import-history").locator('[data-status="done"]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByTestId("btn-import-undo").click();
    const dlg = page.getByTestId("import-undo-dialog");
    await expect(dlg).toBeVisible();
    await dlg.getByTestId("dialog-cancel").click();
    await expect(row).toHaveAttribute("data-status", "done");
    await other.close();
  });

  // [원본] P4 이전 — 다른 탭이 쓰기 가능한 채 열려 있던 때의 막힘 확인(위 테스트로 바뀜 · 원복 시 skip 을 푼다)
  test.skip("탭 둘이면 가져오기·되돌리기가 막히고, 다른 탭을 닫으면 풀린다", async ({ page, context }) => {
    test.setTimeout(240_000);
    const csv = 시험_파일("strong-comma.csv");
    await 준비(page);
    // 혼자일 때 한 번 가져온다(되돌리기 막힘을 보려고)
    await 가져오기_파일(page, "strong_export.csv", csv);
    await 가져오기_끝까지(page, "kg");
    await expect(page.getByTestId("import-done-summary")).toContainText("운동 2개");

    const other = await context.newPage();
    await other.goto("/");
    await expect(other.getByTestId("shell-nav")).toBeVisible({ timeout: 30_000 });

    // 가져오기: 파일 고르기 전부터 막힌다
    await page.goto("/account/import");
    await expect(page.getByTestId("import-blocked")).toContainText("다른 탭에 열린 리프트그램을 닫은 뒤", {
      timeout: 20_000,
    });
    await expect(page.getByTestId("btn-import-pick")).toBeDisabled();
    // 다른 탭은 안내를 띄우지 않는다(가져오는 중이 아니다)
    await expect(other.getByTestId("import-elsewhere-notice")).toHaveCount(0);

    // 되돌리기: 확인창 전에 막힌다 · 묶음은 그대로
    await page.goto("/account");
    const row = page.getByTestId("import-history").locator('[data-status="done"]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByTestId("btn-import-undo").click();
    await expect(page.getByTestId("import-card-status")).toContainText("다른 탭에 열린 리프트그램을 닫은 뒤");
    await expect(page.getByTestId("import-undo-dialog")).toHaveCount(0);
    await expect(row).toHaveAttribute("data-status", "done");

    // 다른 탭을 닫으면 곧바로 풀린다
    await page.goto("/account/import");
    await expect(page.getByTestId("import-blocked")).toBeVisible({ timeout: 20_000 });
    await other.close();
    await expect(page.getByTestId("import-blocked")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId("btn-import-pick")).toBeEnabled();
  });

  test("가져오는 중에 새로 연 탭은 부팅 정리를 하지 않고 안내만 · 가져오던 탭이 닫힌 뒤 새로고침하면 정리", async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    await 준비(page);
    await page.evaluate(() => localStorage.setItem("liftgram.e2e.importFault", "hold:1"));
    await page.goto("/account/import");
    await 가져오기_파일(page, "big.csv", 큰_Strong_파일({ workouts: 300 }).text);
    await page.getByTestId("import-unit-kg").click();
    await page.getByTestId("btn-import-to-match").click();
    await 가져오기_시작(page);
    await expect(page.getByTestId("import-write-progress-label")).toContainText("묶음 1/5", {
      timeout: 60_000,
    });
    // 진행 중 앱바 뒤로 → 「나갈 수 없어요」(P5-9)
    await page.getByTestId("btn-back").click();
    await expect(page.getByTestId("import-cant-leave")).toBeVisible();
    await page.evaluate(() => localStorage.removeItem("liftgram.e2e.importFault"));
    await 내려쓰기_대기(page); // 1묶음이 디스크에 내려가게(자동 저장)

    const other = await context.newPage();
    await other.goto("/");
    const notice = other.getByTestId("import-elsewhere-notice");
    await expect(notice).toBeVisible({ timeout: 30_000 });
    await expect(notice).toHaveAttribute("data-state", "importing");
    await expect(notice).toContainText("다른 탭에서 기록을 가져오는 중이에요");
    await other.waitForTimeout(3_000); // 부팅 파이프라인이 돌았으면 지웠을 시간
    // 디스크: 쓰다 만 묶음이 그대로다(새 탭이 지우지 않았다)
    const batches = await idb_행(other, "import_batches");
    expect(batches.map((b) => b.status)).toEqual(["writing"]);
    const half = await idb_행_수(other, 표, "imp-");
    expect(half.workouts).toBeGreaterThan(0);

    // 가져오던 탭이 닫힌다(탭이 닫힌 것 = 쓰다 만 묶음) → 새 탭을 새로고침하면 부팅 정리가 지운다
    page.on("dialog", (d) => void d.accept());
    await page.close({ runBeforeUnload: false });
    await other.reload();
    await expect(other.getByTestId("shell-nav")).toBeVisible({ timeout: 30_000 });
    await expect(other.getByTestId("import-elsewhere-notice")).toHaveCount(0);
    await other.waitForTimeout(3_000);
    expect(await 가져온_행(other)).toEqual({
      workouts: 0,
      workout_exercises: 0,
      set_logs: 0,
      import_batches: 0,
    });
  });
});

test.describe("가져올 것이 없을 때(P5-5)", () => {
  test.use({ serviceWorkers: "block" });

  test("운동 0개 파일은 확인 단계에서 막고, 전부 「가져오지 않기」면 시작을 막는다", async ({ page }) => {
    test.setTimeout(120_000);
    await 준비(page);
    const broken =
      "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE\n" +
      'not-a-date,"Push Day",1h,"Bench Press (Barbell)",1,80,5,,0,,,\n';
    await 가져오기_파일(page, "broken.csv", broken);
    await expect(page.getByTestId("import-no-workouts")).toContainText("읽을 수 있는 운동이 없어요");
    await expect(page.getByTestId("btn-import-to-match")).toBeDisabled();

    await page.goto("/account");
    await 가져오기_파일(page, "strong_export.csv", 시험_파일("strong-comma.csv"));
    await page.getByTestId("import-unit-kg").click();
    await page.getByTestId("btn-import-to-match").click();
    if ((await page.getByTestId("import-match-auto-toggle").count()) > 0)
      await page.getByTestId("import-match-auto-toggle").click();
    for (;;) {
      const skip = page.getByTestId("import-match-skip");
      if ((await skip.count()) === 0) break;
      await skip.first().click();
    }
    await expect(page.getByTestId("import-nothing-to-import")).toBeVisible();
    await expect(page.getByTestId("btn-import-start")).toBeDisabled();
  });
});

test.describe("확인 안 한 종목(P5-4)", () => {
  test.use({ serviceWorkers: "block" });

  test("확인 필요·못 맞춤 수를 알리고, 가져오기를 누르면 한 번 묻는다 · 취소하면 그대로", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await 준비(page);
    // 우리 카탈로그에 없는 이름 → 「못 맞춤」
    const csv =
      "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE\n" +
      '2026-08-25 10:10:00,"Day",1h,"Zorblax Gizmo Press",1,50,5,,0,,,\n';
    await 가져오기_파일(page, "odd.csv", csv);
    await page.getByTestId("import-unit-kg").click();
    await page.getByTestId("btn-import-to-match").click();
    await expect(page.getByTestId("import-unconfirmed")).toContainText("확인 안 한 종목 1개");
    await page.getByTestId("btn-import-start").click();
    const dlg = page.getByTestId("import-unconfirmed-dialog");
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText("「못 맞춤」 1개는 새 내 종목으로 가져와요. 이대로");
    await dlg.getByTestId("dialog-cancel").click();
    await expect(page.getByTestId("import-flow")).toHaveAttribute("data-step", "match");
    // 「가져오지 않기」 대신 「내 종목 만들기」로 확인하면 알림이 사라지고 묻지 않는다
    await page.getByTestId("import-match-custom-name").fill("내 기묘한 프레스");
    await expect(page.getByTestId("import-unconfirmed")).toHaveCount(0);
    await page.getByTestId("btn-import-start").click();
    await expect(page.getByTestId("import-step-done")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("import-done-summary")).toContainText("운동 1개");
  });
});
