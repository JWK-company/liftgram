// @plm SRS-073 SRS-074  openGym P1 — 세트 힘든 정도(RIR) 칩·시트 · 기록 상세 · 동기 · 좌표 · v25→v26 이관 · 다운그레이드 가드
//
// 확인 목록(스펙 2판 P1 검증):
//   · 켜기 → 칩 → 「2」 → 시트 즉시 닫힘·칩 「2」 → **다른 값에서** 바꾸기(3 → 2.5 → 지우기 → 2) → 기록 상세 「2」 → 다른 기기에도 「2」
//     (세트 표는 행 증감만 관찰한다 — 같은 값으로 돌아온 저장이 옛 그림에 남지 않는지 · 메모리 「세트 입력칸 묶인 그림」)
//   · 끄면 칩이 DOM 에 0개 · 켜면 생긴다 · 다시 끄면 0개
//   · 휴식 중(휴식 막대가 떠 있을 때) 시트 선택지 6개가 맨 위(elementFromPoint · U-2) · 포커스: 열면 제목, 닫으면 칩(U-23)
//   · 360·390: 꺼짐 = 기준선, 켜짐의 내려간 값 기록(상한 +40px · U-1)
//   · v25 모양 IndexedDB → v26 이관: 운동·세트 그대로, 새 표 3개·rir 칸 생김, 초기화 없음
//   · 다운그레이드 가드: maxSchemaSeen 을 이 번들보다 높이면 가드 화면 · 진짜 DB(repset)는 그대로
import { expect, test } from "@playwright/test";
import {
  idb_요약,
  가입,
  내려쓰기_대기,
  동기,
  로그인,
  마치기,
  빈_문서,
  빠른_운동_시작,
  새_기기,
  새_메일,
  세트_기록,
  세트_id,
  세트_줄,
  안내_띠_닫기,
  준비,
  종목_추가,
  최근_기록_상세,
  힘든정도_설정,
  v25로_되돌리기,
} from "./helpers/opengym";

type Page = import("@playwright/test").Page;
type Locator = import("@playwright/test").Locator;

/** 지금 포커스된 요소의 testid */
const 포커스 = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.testid ?? null);

async function 칩(page: Page, n = 0, i = 0): Promise<Locator> {
  const row = 세트_줄(page, n, i);
  const id = await 세트_id(row);
  return row.getByTestId(`set-rir-${id}`);
}

/** 칩을 눌러 시트를 연다 — 제목에 포커스 */
async function 시트_열기(chip: Locator, page: Page): Promise<void> {
  await chip.click();
  await expect(page.getByTestId("rir-sheet")).toBeVisible();
  await expect.poll(() => 포커스(page)).toBe("rir-sheet-title");
}

test("켜면 세트에 힘든 정도를 적고 · 다른 값에서 바꾸고 · 기록 상세와 다른 기기에 같은 값이 보인다", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const 메일 = 새_메일("rir");
  await 준비(page);
  await 가입(page, 메일, "힘든정도");
  await 힘든정도_설정(page, true);

  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 세트_기록(page, 0, 0, 60, 10);

  const chip = await 칩(page);
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText("힘든 정도");

  // 누르는 자리 44×44 — 버튼 폭 ≥ 44, 보이는 칩 위아래 4px 바깥(::before)도 칩이 받는다
  const box = await chip.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  const hit = await chip.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const up = document.elementFromPoint(x, r.top - 3);
    const down = document.elementFromPoint(x, r.bottom + 3);
    return { h: Math.round(r.height + 8), up: !!up && el.contains(up), down: !!down && el.contains(down) };
  });
  expect(hit).toEqual({ h: 44, up: true, down: true });

  // 「2」 → 곧바로 닫히고 칩이 「2」, 포커스는 칩으로
  await 시트_열기(chip, page);
  await page.getByTestId("rir-opt-2").click();
  await expect(page.getByTestId("rir-sheet")).toHaveCount(0);
  await expect(chip).toHaveText("2");
  await expect.poll(() => 포커스(page)).toMatch(/^set-rir-/);

  // 다른 값에서 바꾸기 — 3(선택) → 2.5(스테퍼, 닫을 때 저장) → 지우기 → 2(같은 값으로 돌아옴)
  await 시트_열기(chip, page);
  await page.getByTestId("rir-opt-3").click();
  await expect(chip).toHaveText("3");
  await 시트_열기(chip, page);
  await page.getByTestId("rir-step-minus").click();
  await expect(page.getByTestId("rir-step-value")).toHaveText("2.5");
  await expect(page.getByTestId("rir-sheet")).toBeVisible(); // 스테퍼는 닫지 않는다
  await page.getByTestId("rir-close").click();
  await expect(chip).toHaveText("2.5");
  await 시트_열기(chip, page);
  await page.getByTestId("rir-clear").click();
  await page.keyboard.press("Escape"); // Esc 로 닫아도 저장
  await expect(chip).toHaveText("힘든 정도");
  await expect.poll(() => 포커스(page)).toMatch(/^set-rir-/);
  await 시트_열기(chip, page);
  await page.getByTestId("rir-opt-2").click();
  await expect(chip).toHaveText("2");
  // 다음 다시 그리기(1.5초 폴링) 뒤에도 옛 값으로 돌아가지 않는다
  await page.waitForTimeout(2_000);
  await expect(chip).toHaveText("2");
  await expect(chip).toHaveAttribute("data-rir", "2");

  await 마치기(page);
  await 최근_기록_상세(page);
  await expect(page.getByTestId("detail-set-rir").first()).toHaveText("2");

  // 분석 — 노력 카드 머리 한 줄 · 종목 진척 막대 채움 + 범례(SRS-074)
  await page.goto("/stats");
  await expect(page.getByTestId("effort-head")).toHaveText("평균 여유 2.0개 · 여유 3개 이하 100%", {
    timeout: 20_000,
  });
  await expect(page.getByTestId("effort-coverage")).toContainText("적은 세트 1/1");
  await page.getByTestId("stats-1rm").locator("a").first().click();
  await expect(page.getByTestId("progress-effort-legend")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("progress-effort-fill")).toHaveCount(1);
  await 동기(page);

  // 다른 기기 — 같은 계정으로 받으면 같은 값 · 설정(켬)도 따라온다
  const [ctxB, pageB] = await 새_기기(browser);
  try {
    await 준비(pageB);
    await 로그인(pageB, 메일);
    const t0 = Date.now();
    await 동기(pageB);
    test
      .info()
      .annotations.push({ type: "D-14 첫 동기(전량 pull) ms", description: String(Date.now() - t0) });
    await 최근_기록_상세(pageB);
    await expect(pageB.getByTestId("detail-set-rir").first()).toHaveText("2");
    await expect
      .poll(() => pageB.evaluate(() => localStorage.getItem("liftgram.effortLogging")), { timeout: 20_000 })
      .toBe("1");
  } finally {
    await ctxB.close();
  }
});

test("끄면 세트 줄에 칩이 없고(DOM 0) · 켜면 생기고 · 다시 끄면 사라진다", async ({ page }) => {
  test.setTimeout(120_000);
  await 준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await expect(세트_줄(page)).toBeVisible();
  await expect(page.locator('[data-testid^="set-rir-"]')).toHaveCount(0);

  await 힘든정도_설정(page, true);
  await page.goto("/workout");
  await expect(page.locator('[data-testid^="set-rir-"]').first()).toBeVisible({ timeout: 15_000 });

  await 힘든정도_설정(page, false);
  await page.goto("/workout");
  await expect(세트_줄(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-testid^="set-rir-"]')).toHaveCount(0);
});

test("처방 RIR 이 있으면 칩 하나로 합친다 — 꺼짐 「RIR 2」 · 켜짐 「목표 2」 → 「1 · 목표 2」", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await 준비(page);
  await 힘든정도_설정(page, false);
  // 루틴: 1세트 처방 RIR 2
  const 이름 = `RIR 목표 ${Date.now().toString(36)}`;
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("routine-name").fill(이름);
  await page.getByTestId("routine-name").blur();
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("routine-exercises").locator("> div")).toHaveCount(1, { timeout: 10_000 });
  await page.getByTestId("btn-rx").click();
  const sheet = page.getByTestId("rx-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("rx-targetRir").nth(0).fill("2");
  await page.getByTestId("btn-rx-save").click();
  await page.getByTestId("btn-routine-done").click();
  await expect(page.getByTestId("routine-list")).toContainText(이름, { timeout: 10_000 });
  const tid = await page
    .getByTestId("routine-list")
    .locator("[data-testid^=routine-]")
    .filter({ hasText: 이름 })
    .first()
    .getAttribute("data-testid");
  await page
    .getByTestId(tid ?? "")
    .getByTestId("btn-start-routine")
    .click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });

  // 꺼짐 — 처방 줄은 예전 그대로(「RIR 2」 글자), 칩 없음
  const row = 세트_줄(page, 0, 0);
  await expect(row).toContainText("RIR 2", { timeout: 15_000 });
  await expect(page.locator('[data-testid^="set-rir-"]')).toHaveCount(0);

  // 켜짐 — 처방 RIR 글자는 칩 하나로(「목표 2」), 고르면 「1 · 목표 2」
  await 힘든정도_설정(page, true);
  await page.goto("/workout");
  const chip = await 칩(page);
  await expect(chip).toHaveText("목표 2", { timeout: 15_000 });
  await expect(세트_줄(page, 0, 0)).not.toContainText("RIR 2");
  await 시트_열기(chip, page);
  await expect(page.getByTestId("rir-sheet-target")).toHaveText("목표 여유 2개");
  await page.getByTestId("rir-opt-1").click();
  await expect(chip).toHaveText("1 · 목표 2");
});

for (const vp of [
  { width: 360, height: 640 },
  { width: 390, height: 844 },
]) {
  test(`휴식 중 시트 선택지 6개가 휴식 막대 위 · 포커스 복귀 (${vp.width}×${vp.height})`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(vp);
    await 준비(page);
    await 힘든정도_설정(page, true);
    await 빠른_운동_시작(page);
    await 종목_추가(page, "바벨 벤치프레스");
    await 안내_띠_닫기(page);
    await 세트_기록(page, 0, 0, 60, 10);
    await expect(page.getByTestId("rest-bar")).toBeVisible({ timeout: 10_000 });

    const chip = await 칩(page);
    await 시트_열기(chip, page);
    // 선택지 6개 각각의 가운데 점이 그 선택지(휴식 막대가 아니라)
    const tops = await page.getByTestId("rir-options").evaluate((ul) =>
      Array.from(ul.querySelectorAll("button")).map((b) => {
        const r = b.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && b.contains(hit);
      }),
    );
    expect(tops).toEqual([true, true, true, true, true, true]);
    // 스테퍼·지우기도 가려지지 않는다
    for (const id of ["rir-step-minus", "rir-step-plus", "rir-clear"]) {
      const onTop = await page.getByTestId(id).evaluate((b) => {
        const r = b.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && b.contains(hit);
      });
      expect(onTop, id).toBe(true);
    }
    // 휴식 막대 가운데 점은 막대가 아니다(시트·스크림이 위)
    const barOnTop = await page.getByTestId("rest-bar").evaluate((bar) => {
      const r = bar.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && bar.contains(hit);
    });
    expect(barOnTop).toBe(false);

    // Esc 로 닫으면 포커스가 칩으로
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("rir-sheet")).toHaveCount(0);
    const chipId = await chip.getAttribute("data-testid");
    await expect.poll(() => 포커스(page)).toBe(chipId);
  });

  test(`좌표 — 꺼짐 = 기준선, 켜짐 증가분 ≤ 40px (${vp.width}×${vp.height})`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize(vp);
    await 준비(page);
    await 힘든정도_설정(page, false);
    await 빠른_운동_시작(page);
    await 종목_추가(page, "바벨 벤치프레스");
    await page.getByTestId("btn-add-set").first().click();
    await expect(세트_줄(page, 0, 1)).toBeVisible();
    await 안내_띠_닫기(page);

    const 재기 = async () => {
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(세트_줄(page, 0, 1).getByTestId("set-done")).toBeVisible({ timeout: 15_000 });
      return page.evaluate(() => {
        const rows = document.querySelectorAll('[data-testid="set-list"] > div');
        const top = (el: Element | null | undefined) =>
          el ? Math.round(el.getBoundingClientRect().top) : -1;
        return {
          set1: top(rows[0]?.querySelector('[data-testid="set-done"]')),
          set2: top(rows[1]?.querySelector('[data-testid="set-done"]')),
          addSet: top(document.querySelector('[data-testid="btn-add-set"]')),
        };
      });
    };
    const off = await 재기();
    await 힘든정도_설정(page, true);
    await page.goto("/workout");
    await 안내_띠_닫기(page);
    await expect(page.locator('[data-testid^="set-rir-"]').first()).toBeVisible({ timeout: 15_000 });
    const on = await 재기();
    await 힘든정도_설정(page, false);
    await page.goto("/workout");
    await 안내_띠_닫기(page);
    const offAgain = await 재기();

    test.info().annotations.push({
      type: `좌표 ${vp.width}×${vp.height}`,
      description: JSON.stringify({ off, on, offAgain }),
    });
    // 꺼짐은 기준선과 같다(켰다 끈 뒤에도)
    expect(offAgain).toEqual(off);
    // 첫 세트 체크는 그대로(칩은 그 아래 둘째 줄) · 둘째 세트·세트 추가는 줄 하나만큼(≤ 40)
    expect(on.set1 - off.set1).toBe(0);
    expect(on.set2 - off.set2).toBeGreaterThan(0);
    expect(on.set2 - off.set2).toBeLessThanOrEqual(40);
    expect(on.addSet - off.addSet).toBeLessThanOrEqual(80); // 세트 두 줄 × 줄 하나
  });
}

test.describe("로컬 DB 이관·가드", () => {
  // 빈 문서에서 IndexedDB 를 고칠 때 서비스워커가 앱 셸을 대신 내주지 않게
  test.use({ serviceWorkers: "block" });

  test("v25 모양 DB 가 v26 으로 이관된다 — 운동·세트 그대로, 새 표·rir 칸이 생긴다", async ({ page }) => {
    test.setTimeout(150_000);
    await 준비(page);
    await 빠른_운동_시작(page);
    await 종목_추가(page, "바벨 벤치프레스");
    await 세트_기록(page, 0, 0, 62.5, 8);
    await page.getByTestId("btn-add-set").first().click();
    await 세트_기록(page, 0, 1, 70, 5);
    await 마치기(page);
    await 내려쓰기_대기(page);

    await 빈_문서(page);
    const before = await idb_요약(page);
    expect(before.version).toBe("26");
    const cut = await v25로_되돌리기(page);
    const v25 = await idb_요약(page);
    expect(v25).toMatchObject({ version: "25", setsWithRirKey: 0, newTables: [] });
    expect(v25.sets).toBe(before.sets);
    expect(cut.sets).toBe(before.sets);

    // v26 번들로 다시 연다 → 이관(초기화 아님)
    await page.goto("/history");
    await 최근_기록_상세(page);
    await expect(page.getByTestId("detail-set")).toHaveCount(2);
    await expect(page.getByTestId("detail-set").first()).toContainText("62.5");
    await expect(page.getByTestId("detail-set").nth(1)).toContainText("70");
    await 내려쓰기_대기(page);

    await 빈_문서(page);
    const after = await idb_요약(page);
    test.info().annotations.push({ type: "이관", description: JSON.stringify({ before, v25, after }) });
    expect(after.version).toBe("26");
    expect(after.sets).toBe(before.sets);
    expect(after.workouts).toBe(before.workouts);
    expect(after.newTables.sort()).toEqual(["bodyweight_logs", "import_aliases", "import_batches"]);
    expect(after.setsWithRirKey).toBe(after.sets);
    expect(await page.evaluate(() => localStorage.getItem("liftgram.maxSchemaSeen"))).toBe("26");

    // 힘든 정도를 적은 세트가 없으면 노력 카드는 접힌 안내 한 줄(펼치면 설정 입구 문구 · U-22)
    await page.goto("/stats");
    await expect(page.getByTestId("effort-empty")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("effort-card")).toHaveCount(0);
    await page.getByTestId("effort-empty-toggle").click();
    await expect(page.getByTestId("effort-empty")).toContainText("설정에서 켜면 운동 중에 적을 수 있어요");
  });

  test("다운그레이드 가드 — 더 높은 스키마를 본 기기면 가드 화면, 진짜 DB 는 그대로", async ({ page }) => {
    test.setTimeout(120_000);
    await 준비(page);
    await 빠른_운동_시작(page);
    await 종목_추가(page, "바벨 벤치프레스");
    await 세트_기록(page, 0, 0, 50, 10);
    await 마치기(page);
    await 내려쓰기_대기(page);
    await 빈_문서(page);
    const before = await idb_요약(page);

    // 이 번들(v26)보다 높은 v27 을 본 기기 흉내 — 옛 번들이 새 DB 를 만난 상황
    await page.evaluate(() => localStorage.setItem("liftgram.maxSchemaSeen", "27"));
    await page.goto("/");
    await expect(page.getByTestId("schema-guard")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("schema-guard-reload")).toBeVisible();
    await page.waitForTimeout(1_500);

    await 빈_문서(page);
    const after = await idb_요약(page);
    const names = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
    test.info().annotations.push({ type: "가드", description: JSON.stringify({ before, after, names }) });
    expect(after).toEqual(before); // 진짜 DB 는 열리지도 지워지지도 않았다
    expect(names).toContain("repset-schema-guard");
    expect(await page.evaluate(() => localStorage.getItem("liftgram.maxSchemaSeen"))).toBe("27"); // 낮추지 않는다
  });
});
