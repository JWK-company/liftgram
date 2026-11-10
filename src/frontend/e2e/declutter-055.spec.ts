// SPEC-055 화면 덜어내기 Phase 1·2 e2e(REV-118 반영)
//   · PR 축하(S-65): 처음 하는 종목은 없음 · 볼륨만 늘면 없음 · 종목당 1번 · 다른 변형도 종목 전체 기준
//   · 운동 화면 머리 「취소」(S-70): ⋯ 없음 · 44px · 「완료」와 8px 이상 · 확인창 「계속하기」 · 360px 넘침 없음 · 이름 탭으로 바꾸기(S-71)
//   · 온보딩 없음(S-54): 첫 실행에 온보딩이 안 뜨고, 온보딩 표시 없이도 첫 안내 말풍선이 뜬다(R1)
//   · 기록 자랑하기(S-110): ⋯ 없이 머리 버튼 · 지난달을 보면 「n월 자랑하기」(R2)
import { expect, test } from "@playwright/test";
import {
  블록,
  빠른_운동_시작,
  세트_기록,
  안내_띠_닫기,
  칸_고르기,
  카탈로그_준비,
  종목_추가,
  마치기,
} from "./fixtures/declutter-seed";

type Page = import("@playwright/test").Page;

const base = process.env.BASE ?? "http://127.0.0.1:3100";

/** 축하가 떴다가 사라질 때까지 */
async function 축하_뜸(page: Page, 이름: string) {
  const c = page.getByTestId("pr-celebration");
  await expect(c).toBeVisible({ timeout: 8_000 });
  await expect(c).toContainText(이름);
  await expect(c).not.toContainText("볼륨");
  await expect(c).toHaveCount(0, { timeout: 8_000 });
}

/** 축하가 뜨지 않는다 — 판정(비동기)이 끝날 시간을 준 뒤 */
async function 축하_없음(page: Page) {
  await page.waitForTimeout(2_000);
  await expect(page.getByTestId("pr-celebration")).toHaveCount(0);
}

/** n번째 블록에 세트가 i+1 개가 되게 늘린다 */
async function 세트_늘리기(page: Page, n: number, 개수: number) {
  const list = page.getByTestId("set-list").nth(n).locator("> div");
  while ((await list.count()) < 개수) {
    const before = await list.count();
    await 블록(page, n).getByTestId("btn-add-set").click();
    await expect(list).toHaveCount(before + 1);
  }
}

test("PR 축하 — 처음 하는 종목은 없음 · 볼륨만 늘면 없음 · 종목당 1번 · 다른 변형도 같은 기준", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await 카탈로그_준비(page);

  // ① 처음 — 벤치·푸시다운(로프) 모두 지난 기록이 없어 축하가 없다
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 안내_띠_닫기(page);
  await 세트_기록(page, 0, 0, 60, 8);
  await 축하_없음(page);
  await 종목_추가(page, "케이블 푸시다운");
  await 칸_고르기(page, 1, ["slot-attach-rope"]);
  await 세트_기록(page, 1, 0, 25, 12);
  await 축하_없음(page);
  await 마치기(page);

  // ② 벤치: 60×12(볼륨만 늘었다) → 없음 · 62.5×8 → 중량 PR · 65×8(더 무거움) → 같은 운동이라 없음
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 안내_띠_닫기(page);
  await 세트_늘리기(page, 0, 3);
  await 세트_기록(page, 0, 0, 60, 12);
  await 축하_없음(page);
  await 세트_기록(page, 0, 1, 62.5, 8);
  await 축하_뜸(page, "벤치프레스");
  await 세트_기록(page, 0, 2, 65, 8);
  await 축하_없음(page);

  // 푸시다운을 다른 변형(일자바)으로 — 지난 로프 최고 25 와 같으면 없음(예전엔 이 칸이 처음이라 따로 셌다) · 27.5 → 축하
  await 종목_추가(page, "케이블 푸시다운");
  await 칸_고르기(page, 1, ["slot-attach-straight"]);
  await expect(page.getByTestId("variant-trigger").nth(1)).toContainText("일자", { timeout: 10_000 });
  await 세트_늘리기(page, 1, 2);
  await 세트_기록(page, 1, 0, 25, 12);
  await 축하_없음(page);
  await 세트_기록(page, 1, 1, 27.5, 10);
  await 축하_뜸(page, "푸시다운");

  // 완료 요약의 PR 집계는 그대로(볼륨 PR 도 요약엔 남는다) — 요약이 뜨기만 보면 된다
  await 마치기(page);
});

test("운동 화면 머리 「취소」 — ⋯ 없음 · 44px · 「완료」와 8px · 확인창 「계속하기」 · 확인하면 운동 탭", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 360, height: 780 });
  await 카탈로그_준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 스쿼트");
  await 안내_띠_닫기(page);

  await expect(page.getByTestId("btn-session-menu")).toHaveCount(0);
  await expect(page.getByTestId("btn-rename")).toHaveCount(0);
  // 오늘 근육 단추가 켜진 상태(기본)에서 잰다(REV-118 U2)
  await expect(page.getByTestId("btn-today-muscles")).toBeVisible({ timeout: 15_000 });
  const cancel = page.getByTestId("btn-discard");
  await expect(cancel).toBeVisible();
  await expect(cancel).toHaveText("취소");
  await expect(cancel).toHaveAttribute("aria-label", "운동 취소(삭제)");
  const cb = await cancel.boundingBox();
  const db = await page.getByTestId("btn-complete").boundingBox();
  // [원본] expect(cb?.height ?? 0).toBeGreaterThanOrEqual(44);
  // [개선] 보이는 크기·세로 가운데는 「완료」와 같다(사용자 지적 — 혼자 44px 라 줄이 안 맞았다) · 누르는 자리는 ::before 로 44px
  expect(Math.abs((cb?.height ?? 0) - (db?.height ?? 0)), "「완료」와 같은 높이").toBeLessThanOrEqual(1);
  expect(
    Math.abs((cb?.y ?? 0) + (cb?.height ?? 0) / 2 - ((db?.y ?? 0) + (db?.height ?? 0) / 2)),
    "「완료」와 같은 세로 가운데",
  ).toBeLessThanOrEqual(1);
  const hit = await cancel.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const at = (y: number) => el.contains(document.elementFromPoint(cx, y));
    return {
      up: at(r.top - 3.5),
      down: at(r.bottom + 3.5),
      h: Math.abs(parseFloat(getComputedStyle(el, "::before").height) - 44) <= 0.5,
    };
  });
  expect(hit, "누르는 자리 44px(테두리 안쪽에서 위아래 5px)").toEqual({ up: true, down: true, h: true });
  expect((cb?.x ?? 0) - ((db?.x ?? 0) + (db?.width ?? 0)), "「완료」와 간격").toBeGreaterThanOrEqual(8);
  // 회색 글자·테두리 — 빨강 채움이 아니다
  const style = await cancel.evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, border: s.borderTopWidth };
  });
  expect(style.border).toBe("1px");
  expect(["rgba(0, 0, 0, 0)", "transparent"]).toContain(style.bg);
  // 360px 넘침 없음 — 머리 안에서도, 문서 가로로도
  const over = await page.evaluate(() => {
    const h = document.querySelector('[data-testid="session-header"]') as HTMLElement;
    const r = h.getBoundingClientRect();
    const kids = Array.from(h.children).map((c) => c.getBoundingClientRect().right);
    return {
      sw: document.documentElement.scrollWidth,
      hsw: h.scrollWidth,
      hcw: h.clientWidth,
      right: Math.max(...kids),
      hr: r.right,
    };
  });
  expect(over.sw).toBeLessThanOrEqual(360);
  expect(over.hsw).toBeLessThanOrEqual(over.hcw);
  expect(over.right).toBeLessThanOrEqual(over.hr);
  await page.screenshot({ path: "test-results/declutter-055-header-360.png" });

  // 이름 바꾸기는 머리 운동 이름(✏) 탭
  await page.getByTestId("workout-name").click();
  await expect(page.getByTestId("rename-input")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("rename-input")).toHaveCount(0);

  // 취소 → 확인창 · 닫기 단추는 「계속하기」 → 운동 그대로
  await cancel.click();
  const dlg = page.getByTestId("confirm-discard");
  await expect(dlg).toBeVisible();
  await expect(dlg.getByTestId("dialog-cancel")).toHaveText("계속하기");
  await dlg.getByTestId("dialog-cancel").click();
  await expect(dlg).toHaveCount(0);
  await expect(page).toHaveURL(/\/workout/);

  // 다시 취소 → 삭제 → 운동 탭
  await cancel.click();
  await dlg.getByTestId("dialog-confirm").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await expect(page.getByTestId("btn-quick-start")).toBeVisible();
  await expect(page.getByTestId("global-workout-bar")).toHaveCount(0);
});

test.describe("온보딩 없음", () => {
  // 처음 여는 사람 — 온보딩 표시·안내 막기 없이(로그인 권유만 막는다)
  test.use({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: base,
          localStorage: [
            { name: "liftgram.nudge.suppressed", value: "e2e" },
            { name: "liftgram.hint.ms", value: "60000" },
          ],
        },
      ],
    },
  });

  test("첫 실행에 온보딩이 뜨지 않고, 온보딩 표시 없이도 첫 안내 말풍선이 뜬다", async ({ page }) => {
    test.setTimeout(150_000);
    await 카탈로그_준비(page);
    await page.goto("/");
    await expect(page.getByTestId("btn-new-routine")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1_000);
    await expect(page.getByTestId("onboarding")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("onboarding_seen_v1"))).toBeNull();

    // 루틴 세트 번호 첫 안내(coach-marks (b) 와 같은 흐름)
    await page.getByTestId("btn-new-routine").click();
    await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("btn-add-routine-exercise").click();
    await page.getByTestId("picker-search").fill("바벨 벤치프레스");
    await page.getByTestId("picker-list").locator("button").first().click();
    await page.getByTestId("picker-confirm").click();
    await expect(page.getByTestId("set-table").first()).toBeVisible({ timeout: 15_000 });
    await page
      .getByTestId("rx-type")
      .first()
      .evaluate((el) => el.scrollIntoView({ block: "center" }));
    const hint = page.getByTestId("hint-rx-type");
    await expect(hint).toBeVisible({ timeout: 10_000 });
    await expect(hint).toContainText("세트 번호");
  });
});

test("기록 자랑하기 — ⋯ 없이 머리 버튼 · 지난달을 보면 「n월 자랑하기」 · 운동 0번인 달은 숨김", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 세트_기록(page, 0, 0, 60, 10);
  await 마치기(page);

  await page.goto("/calendar");
  const brag = page.getByTestId("btn-brag-month");
  await expect(brag).toBeVisible({ timeout: 20_000 });
  await expect(brag).toHaveText("이번 달 자랑하기");
  expect((await brag.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await expect(page.getByTestId("records-more")).toHaveCount(0);
  // 머리 오른쪽(가운데보다 오른쪽)
  const bb = await brag.boundingBox();
  const vw = page.viewportSize()?.width ?? 0;
  expect((bb?.x ?? 0) + (bb?.width ?? 0) / 2).toBeGreaterThan(vw / 2);

  // 다음 달(운동 0번) → 숨김
  await page.getByRole("button", { name: "다음 달" }).click();
  await expect(brag).toHaveCount(0);

  // 시계를 다음 달로 옮겨 연다 — 지금 달(운동 있음)은 「지난달」이 되어 「n월 자랑하기」
  const now = new Date();
  const m = now.getMonth() + 1;
  await page.clock.setFixedTime(new Date(now.getFullYear(), now.getMonth() + 1, 15, 12, 0, 0));
  await page.goto("/calendar");
  await expect(page.getByTestId("month-label")).toBeVisible({ timeout: 20_000 });
  await expect(brag).toHaveCount(0);
  await page.getByRole("button", { name: "이전 달" }).click();
  await expect(brag).toBeVisible({ timeout: 10_000 });
  await expect(brag).toHaveText(`${m}월 자랑하기`);
  // 누르면 로그인 안내(로그인 안 한 기기 · 조용히 실패하지 않는다)
  await brag.click();
  await expect(page.getByTestId("toast-root")).toContainText("로그인", { timeout: 20_000 });
});
