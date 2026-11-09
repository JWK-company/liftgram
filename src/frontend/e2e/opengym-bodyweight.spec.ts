// @plm SRS-077 SRS-078  openGym P3 — 운동 전 체중 체크인 · 프로필 체중 칸 · 체중 기록 전체 · 통계 체중 카드
//
// 확인 목록(스펙 P3 검증 + 지시):
//   · 체크인 켜기 → 시작 → 시트(≤50dvh · 헤더 타이머 보임 · 버튼 ≥44 · 입력칸 자동 포커스 없음) → ± → 저장 → 이력·프로필 반영 · 운동 화면 그대로
//   · 같은 날 두 번째 운동은 시트 없음
//   · 「체중 없이 계속」·스크림·Esc·뒤로 가기 = 이력 불변 · 같은 운동에서 새로고침해도 다시 안 뜸 · 운동이 끝나면 표시(weighin:<id>) 지움
//   · 끈 상태·완료 세트 있음·시작 10분 지남 = 시트 없음
//   · 목표선·남은 차이·주간 변화(불규칙 간격 3점)·기록 하나면 안내·목표 지우면 둘 다 사라짐 · 축 라벨 ≤4 · aria-label 요약
//   · 맨몸 종목 볼륨이 최신 체중을 쓴다
//   · 마지막 기록 지우기 → 「체중 미설정으로 돌아가요」 확인 → 미설정
//   · 미설정(0 표식) 유지 — 「체중 미설정으로 두기」 뒤 다시 열어도 미설정, 이력은 남음, 다음 기록이 다시 내 체중
//   · [원본] lb 사용자(예전 프로필 단위 lb): 165.3lb 로 보이고 그대로 저장하면 kg 원값(75) 그대로 · lb 스텝 0.2·1·2
//     [개선] 체중은 kg 고정(SRS-067 · qa P3-3) — 예전 프로필 단위가 lb 여도 75.0kg · kg 스텝. lb 왕복·스텝은 core weighIn.test 가 지킨다
//   · (qa P3-1) 고치기로 오늘로 옮겨도 측정 시각이 지금을 넘지 않는다 → 그 뒤 새 기록이 내 체중
//   · (qa P3-2) 카드에서 막 적은 기록이 새로고침 없이 주간 변화에 들어간다
//   · (qa P3-4·P3-6·P3-8) 고치기·지우기 접근 이름 · 직접 입력 오타 방지 · 이력 0 + 프로필 값만 있어도 미설정으로 두기
//   · 백업 내보내기 → 새 계정 기기에서 가져오기 → 이력·미러 유지
import { expect, test } from "@playwright/test";
import {
  가입,
  빈_문서,
  빠른_운동_시작,
  세트_기록,
  안내_띠_닫기,
  준비,
  종목_추가,
  idb_행,
  idb_행_고치기,
  내려쓰기_대기,
} from "./helpers/opengym";

type Page = import("@playwright/test").Page;

test.use({ serviceWorkers: "block" });

// [원본] async function 체크인_설정(page, on) — 프로필 「운동 전 체중 체크인」 스위치를 켜고 껐다(SPEC-049 에서 스위치를 없앴다)

async function 운동_취소(page: Page): Promise<void> {
  await page.getByTestId("btn-session-menu").click();
  await page.getByTestId("btn-discard").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

/** 시트가 뜨지 않는다 — 판정(비동기)이 끝날 시간을 준 뒤 */
async function 시트_없음(page: Page): Promise<void> {
  await page.waitForTimeout(1_500);
  await expect(page.getByTestId("weighin-sheet")).toHaveCount(0);
}

async function 프로필_체중(page: Page): Promise<string> {
  await page.goto("/profile");
  const v = page.getByTestId("bodyweight-value");
  await expect(v).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(300);
  return (await v.textContent()) ?? "";
}

/** 프로필 「기록」 → 시트에서 steps 를 누르고 저장 */
async function 프로필_기록(page: Page, steps: string[] = []): Promise<void> {
  await page.goto("/profile");
  await page.getByTestId("btn-bodyweight-record").click();
  const sheet = page.getByTestId("bodyweight-record-sheet");
  await expect(sheet).toBeVisible();
  for (const s of steps) await sheet.getByTestId(`weighin-step-${s}`).click();
  await sheet.getByTestId("weighin-save").click();
  await expect(sheet).toHaveCount(0);
}

/** 프로필 「기록」 → 직접 입력 → 저장 */
async function 프로필_입력(page: Page, value: string): Promise<void> {
  await page.goto("/profile");
  await page.getByTestId("btn-bodyweight-record").click();
  const sheet = page.getByTestId("bodyweight-record-sheet");
  await sheet.getByTestId("weighin-type").click();
  await sheet.getByTestId("weighin-input").fill(value);
  await sheet.getByTestId("weighin-input").press("Enter");
  await sheet.getByTestId("weighin-save").click();
  await expect(sheet).toHaveCount(0);
}

async function 기록_전체(page: Page): Promise<void> {
  await page.goto("/profile");
  await page.getByTestId("row-bodyweight-history").click();
  await expect(page.getByTestId("bodyweight-history-sheet")).toBeVisible();
}

async function 이력_행(page: Page): Promise<Record<string, unknown>[]> {
  await 내려쓰기_대기(page);
  await 빈_문서(page);
  return (await idb_행(page, "bodyweight_logs")).filter((r) => r._status !== "deleted");
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// [원본] 체크인 세 시험(켜고 시작하면 시트 · 닫는 네 가지 · 뜨지 않는 경우) — 시작하자마자 뜨던 체크인 시트를
//   운동 화면 맨 위 「오늘 체중」 줄로 바꿔(SPEC-049 · S-4) 줄 흐름으로 다시 썼다. 옛 판은 git 47f940c 의 이 파일.
test("오늘 체중 줄 — 시작해도 시트 없음 · 줄 → 시트 ± 저장 · ✓ 로 접힘 · 같은 날 다음 운동은 그 값 · 누르면 그 줄을 고친다", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 360, height: 640 });
  await 준비(page);
  await 빠른_운동_시작(page);
  await 시트_없음(page);

  // [원본] 바탕 없는 한 줄 「오늘 체중 기록」 → 운동 종목과 같은 카드(11-09 사용자 지적) · 버튼 「기록/고치기」가 weighin-row
  const card = page.getByTestId("weighin-card");
  const row = page.getByTestId("weighin-row");
  await expect(card).toContainText("아직 안 적었어요", { timeout: 20_000 });
  await expect(card).toHaveAttribute("data-done", "0");
  await expect(row).toHaveText("기록");
  // 맨 위 카드 · 버튼 44px · 「운동 추가」보다 위
  const rb = await row.boundingBox();
  const cb = await card.boundingBox();
  const add = await page.getByTestId("btn-add-exercise").boundingBox();
  expect(rb && Math.round(rb.height) >= 44).toBe(true);
  expect(cb && add && cb.y < add.y).toBe(true);

  await row.click();
  const sheet = page.getByTestId("weighin-sheet");
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await expect(sheet.getByTestId("weighin-last")).toHaveText("지난 기록이 없어요 — 값을 맞춰 주세요");
  await expect(sheet.getByTestId("weighin-value")).toContainText("70.0");
  // 자동 포커스는 입력칸이 아니라 제목(키보드가 뜨지 않는다 · U-7 ③)
  await expect(sheet.getByTestId("weighin-input")).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("H2");
  // 스크림은 포커스·낭독 대상이 아니고, Tab 은 패널 안에서 돈다(qa P3-5)
  await expect(sheet.getByTestId("weighin-scrim")).toHaveAttribute("aria-hidden", "true");
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press(i % 5 === 4 ? "Shift+Tab" : "Tab");
    expect(
      await page.evaluate(() =>
        Boolean(document.querySelector('[data-testid="weighin-panel"]')?.contains(document.activeElement)),
      ),
    ).toBe(true);
  }
  // 높이 ≤ 50dvh · 헤더 타이머가 시트 위로 보인다 · 버튼 6개 ≥ 44
  const panel = await sheet.getByTestId("weighin-panel").boundingBox();
  const timer = await page.getByTestId("elapsed").boundingBox();
  expect(panel?.height ?? 999).toBeLessThanOrEqual(320 + 1);
  expect(timer && panel && timer.y + timer.height).toBeLessThanOrEqual((panel?.y ?? 0) + 0.5);
  for (const id of ["m1", "m0_5", "m0_1", "p0_1", "p0_5", "p1"]) {
    const b = await sheet.getByTestId(`weighin-step-${id}`).boundingBox();
    expect(b && b.width >= 44 && b.height >= 44, id).toBe(true);
  }
  for (const id of ["p1", "p1", "p0_5", "m0_1"]) await sheet.getByTestId(`weighin-step-${id}`).click();
  await expect(sheet.getByTestId("weighin-value")).toContainText("72.4");
  await sheet.getByTestId("weighin-save").click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("weighin-card-value")).toHaveText("72.4kg");
  await expect(card).toHaveAttribute("data-done", "1");
  await expect(row).toHaveText("고치기");
  // 접기 — 요약 한 줄만 · 새로고침해도 접힌 채 · 다시 펼침
  await page.getByTestId("weighin-card-toggle").click();
  await expect(page.getByTestId("weighin-card-body")).toHaveCount(0);
  await expect(page.getByTestId("weighin-card-summary")).toHaveText("72.4kg");
  await page.reload();
  await expect(page.getByTestId("weighin-card-summary")).toHaveText("72.4kg", { timeout: 20_000 });
  await expect(page.getByTestId("weighin-card-toggle")).toHaveAttribute("aria-expanded", "false");
  await page.getByTestId("weighin-card-toggle").click();
  await expect(row).toBeVisible();
  await expect(page).toHaveURL(/\/workout/);

  // 같은 날 다음 운동 — 시트 없음 · 접힌 값 · 누르면 그 줄을 고친다(새 줄 아님)
  await 운동_취소(page);
  await 빠른_운동_시작(page);
  await 시트_없음(page);
  await expect(page.getByTestId("weighin-card-value")).toHaveText("72.4kg", { timeout: 20_000 });
  await row.click();
  await expect(sheet.getByTestId("weighin-value")).toContainText("72.4");
  await sheet.getByTestId("weighin-step-p0_1").click();
  await sheet.getByTestId("weighin-save").click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("weighin-card-value")).toHaveText("72.5kg");

  expect(await 프로필_체중(page)).toBe("72.5kg");
  await 기록_전체(page);
  await expect(page.getByTestId("bodyweight-history-row")).toHaveCount(1);
  await expect(page.getByTestId("bodyweight-history-row").first()).toContainText("운동 전");
  const rows = await 이력_행(page);
  expect(rows.map((r) => [r.weight_kg, r.source])).toEqual([[72.5, "checkin"]]);
  // 분석 카드 머리에 바로 보인다
  await page.goto("/stats");
  await expect(page.getByTestId("bodyweight-head-latest")).toHaveText("72.5kg · 오늘", { timeout: 20_000 });
});

test("오늘 체중 시트 닫기(취소·스크림·Esc·뒤로) = 이력 불변 · 운동 화면 그대로 · 프로필에 체크인 스위치 없음", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await 준비(page);
  await page.goto("/profile");
  await expect(page.getByTestId("bodyweight-value")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("switch-weighin")).toHaveCount(0);

  await 빠른_운동_시작(page);
  const row = page.getByTestId("weighin-row");
  const sheet = page.getByTestId("weighin-sheet");
  await expect(row).toBeVisible({ timeout: 20_000 });
  // ① 취소
  await row.click();
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("weighin-secondary").click();
  await expect(sheet).toHaveCount(0);
  // ② 스크림
  await row.click();
  await expect(sheet).toBeVisible();
  await page.mouse.click(20, 20);
  await expect(sheet).toHaveCount(0);
  // ③ Esc
  await row.click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  // ④ 뒤로 가기 = 시트만 닫는다(운동 화면을 떠나지 않는다 · P1-2 리뷰 trapBack)
  await row.click();
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/workout/);
  // 닫아도 운동 화면 그대로 · 기록 없음
  await expect(page).toHaveURL(/\/workout/);
  await expect(page.getByTestId("weighin-card")).toHaveAttribute("data-done", "0");
  await 운동_취소(page);

  expect(await 프로필_체중(page)).toBe("미설정");
  expect(await 이력_행(page)).toEqual([]);
});

test("통계 체중 카드 — 하나면 안내 · 불규칙 간격 3점 곡선 · 목표선·남은 차이 · 주간 변화 · 축 라벨 ≤4 · 목표 지우기", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await 준비(page);
  await page.goto("/stats");
  await expect(page.getByTestId("bodyweight-card-empty")).toBeVisible({ timeout: 20_000 });

  await 프로필_입력(page, "74");
  await page.goto("/stats");
  await expect(page.getByTestId("bodyweight-latest")).toHaveText("최근 74.0kg", { timeout: 20_000 });
  // [원본] await expect(page.getByTestId("bodyweight-chart-empty")).toHaveText("한 번 더 적으면 추세가 보여요");
  // [개선] 주간 변화는 최근 28일의 서로 다른 날 3개 — 하나뿐이면 「한 번 더」는 약속을 못 지킨다(qa P3-12 ⓑ)
  await expect(page.getByTestId("bodyweight-chart-empty")).toHaveText(
    "최근 4주에 2번 더 적으면 추세가 보여요",
  );
  await expect(page.getByTestId("bodyweight-weekly")).toHaveCount(0); // 같은 안내를 두 번 쓰지 않는다

  await 프로필_입력(page, "73");
  // [원본] await 프로필_입력(page, "72.4"); — 세 번째는 카드에서 적는다(qa P3-2)
  // 날짜를 불규칙하게 — 74 = 20일 전, 73 = 9일 전, 72.4 = 오늘
  const now = new Date();
  const ago = (d: number) => ymd(new Date(now.getTime() - d * 86_400_000));
  await 기록_전체(page);
  for (const [value, days] of [
    ["74.0kg", 20],
    ["73.0kg", 9],
  ] as const) {
    const row = page.getByTestId("bodyweight-history-row").filter({ hasText: value });
    await row.getByTestId("bodyweight-history-edit").click();
    const ed = page.getByTestId("bodyweight-edit-sheet");
    await ed.getByTestId("bodyweight-edit-date").fill(ago(days));
    await ed.getByTestId("weighin-save").click();
    await expect(ed).toHaveCount(0);
    await expect(page.getByTestId("bodyweight-history-sheet")).toBeVisible();
  }
  await page.getByTestId("bodyweight-history-close").click();

  // 서로 다른 날 2개 → 「한 번 더」 · 카드 머리 「기록」으로 세 번째 → 새로고침 없이 주간 변화(qa P3-2)
  await page.goto("/stats");
  await expect(page.getByTestId("bodyweight-weekly")).toHaveText("한 번 더 적으면 추세가 보여요", {
    timeout: 20_000,
  });
  await page.getByTestId("btn-bodyweight-card-record").click();
  const rec = page.getByTestId("bodyweight-record-sheet");
  await rec.getByTestId("weighin-type").click();
  await rec.getByTestId("weighin-input").fill("72.4");
  await rec.getByTestId("weighin-input").press("Enter");
  await rec.getByTestId("weighin-save").click();
  await expect(rec).toHaveCount(0);
  await expect(page.getByTestId("bodyweight-weekly")).toContainText("주간 변화 −");

  // 최근 것이 위
  await 기록_전체(page);
  await expect(page.getByTestId("bodyweight-history-value")).toHaveText(["72.4kg", "73.0kg", "74.0kg"]);
  await page.getByTestId("bodyweight-history-close").click();

  await page.goto("/stats");
  const chart = page.getByTestId("bodyweight-chart");
  await expect(chart).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("bodyweight-change")).toHaveText("기간 변화 −1.6kg");
  await expect(page.getByTestId("bodyweight-weekly")).toContainText("주간 변화 −");
  // 점 3개 · 가로는 날짜 비례(20일 전 → 9일 전 간격 : 9일 전 → 오늘 간격 ≈ 11 : 9)
  const xs = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="bodyweight-chart-svg"] circle[data-point]')].map((c) =>
      Number(c.getAttribute("cx")),
    ),
  );
  expect(xs.length).toBe(3);
  const ratio = (xs[1] - xs[0]) / (xs[2] - xs[1]);
  expect(ratio).toBeGreaterThan(1.05);
  expect(ratio).toBeLessThan(1.45);
  const axis = async (a: string) =>
    page.evaluate(
      (a) => document.querySelectorAll(`[data-testid="bodyweight-chart-svg"] text[data-axis="${a}"]`).length,
      a,
    );
  expect(await axis("x")).toBeLessThanOrEqual(4);
  expect(await axis("y")).toBeLessThanOrEqual(4);
  // 가로 라벨이 서로 겹치지 않는다(360)
  const boxes = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="bodyweight-chart-svg"] text[data-axis="x"]')].map((n) => {
      const r = (n as SVGTextElement).getBoundingClientRect();
      return [r.left, r.right];
    }),
  );
  for (let i = 1; i < boxes.length; i += 1) expect(boxes[i][0]).toBeGreaterThan(boxes[i - 1][1]);
  await expect(page.getByTestId("bodyweight-chart-svg")).toHaveAttribute("role", "img");
  await expect(page.getByTestId("bodyweight-chart-svg")).toHaveAttribute(
    "aria-label",
    "체중 곡선 · 최근 72.4kg · 기간 변화 −1.6kg",
  );
  // 고르기 전에는 안내(읽지 않음 · 값 줄 밖) — 누르면 사라진다(SPEC-046)
  const hint = page.getByTestId("bodyweight-chart-hint");
  await expect(hint).toBeVisible();
  await expect(hint).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByTestId("bodyweight-chart-readout").getByTestId("bodyweight-chart-hint")).toHaveCount(
    0,
  );
  // 누르면 그 점 값
  const svgBox = await page.getByTestId("bodyweight-chart-svg").boundingBox();
  if (svgBox) await page.mouse.click(svgBox.x + xs[0], svgBox.y + 40);
  await expect(page.getByTestId("bodyweight-chart-readout")).toContainText("74.0kg");
  await expect(hint).toHaveCount(0);

  // 카드 머리(SPEC-049) — 최근 값·날짜 + 테두리 「기록」 + ⋯ 가 제목과 한 줄 · 360px 안 · 「기록」 44px
  await expect(page.getByTestId("bodyweight-head-latest")).toHaveText("72.4kg · 오늘");
  {
    const [title, rec, more] = await Promise.all(
      ["bodyweight-card-title", "btn-bodyweight-card-record", "bodyweight-more"].map((id) =>
        page.getByTestId(id).boundingBox(),
      ),
    );
    expect(title && rec && more).toBeTruthy();
    if (title && rec && more) {
      expect(Math.abs(rec.y + rec.height / 2 - (title.y + title.height / 2))).toBeLessThanOrEqual(8);
      expect(Math.round(rec.height)).toBeGreaterThanOrEqual(44);
      expect(more.x + more.width).toBeLessThanOrEqual(360);
    }
  }
  // 바닥의 밑줄 글자 버튼은 없다 — 목표는 ⋯ 안
  await expect(page.getByTestId("btn-bodyweight-goal")).toHaveCount(0);

  // 목표 70 → 목표선 · 남은 차이
  await page.getByTestId("bodyweight-more").click();
  await page.getByTestId("btn-bodyweight-goal").click();
  const goal = page.getByTestId("bodyweight-goal-sheet");
  await goal.getByTestId("weighin-type").click();
  await goal.getByTestId("weighin-input").fill("70");
  await goal.getByTestId("weighin-save").click();
  await expect(page.getByTestId("bodyweight-chart-goal")).toHaveCount(1);
  await expect(page.getByTestId("bodyweight-chart-goal")).toContainText("목표");
  await expect(page.getByTestId("bodyweight-goal-gap")).toHaveText("목표까지 2.4kg · 목표 70.0kg");
  await expect(page.getByTestId("bodyweight-chart-svg")).toHaveAttribute("aria-label", /목표 70\.0kg$/);
  // 기간 전환 — 1개월에도 3점, 1년·전체도 같다
  for (const r of ["1m", "1y", "all"]) {
    await page.getByTestId(`bodyweight-range-${r}`).click();
    await expect(page.locator('[data-testid="bodyweight-chart-svg"] circle[data-point]')).toHaveCount(3);
  }
  // 목표는 계정 설정 — 새로고침해도 남는다
  await page.reload();
  await expect(page.getByTestId("bodyweight-goal-gap")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("bodyweight-more").click();
  await page.getByTestId("btn-bodyweight-goal-clear").click();
  await expect(page.getByTestId("bodyweight-chart-goal")).toHaveCount(0);
  await expect(page.getByTestId("bodyweight-goal-gap")).toHaveCount(0);
});

test("맨몸 종목 볼륨은 최신 체중을 쓴다", async ({ page }) => {
  test.setTimeout(150_000);
  await 준비(page);
  await 프로필_입력(page, "72");
  await 빠른_운동_시작(page);
  await 종목_추가(page, "풀업");
  await 안내_띠_닫기(page);
  await 세트_기록(page, 0, 0, 0, 10);
  await expect(page.getByTestId("live-volume")).toHaveText("볼륨 720kg", { timeout: 10_000 });
  await 프로필_입력(page, "80");
  await page.goto("/workout");
  await expect(page.getByTestId("live-volume")).toHaveText("볼륨 800kg", { timeout: 10_000 });
});

test("마지막 기록 지우기 = 「체중 미설정으로 돌아가요」 확인 · 미설정(0) 유지 · 다음 기록이 다시 내 체중", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await 준비(page);
  await 프로필_입력(page, "80");
  await 프로필_입력(page, "81");
  expect(await 프로필_체중(page)).toBe("81.0kg");

  // 하나 남을 때까지는 평범한 확인 · 마지막 하나는 미설정 안내
  await 기록_전체(page);
  // 고치기·지우기 접근 이름에 어느 기록인지(qa P3-4)
  await expect(page.getByTestId("bodyweight-history-edit").first()).toHaveAttribute(
    "aria-label",
    /^81\.0kg · .+ 고치기$/,
  );
  await expect(page.getByTestId("bodyweight-history-delete").first()).toHaveAttribute(
    "aria-label",
    /^81\.0kg · .+ 지우기$/,
  );
  await page.getByTestId("bodyweight-history-row").first().getByTestId("bodyweight-history-delete").click();
  await expect(page.getByTestId("bodyweight-delete-confirm")).toContainText("이 기록을 지울까요?");
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("bodyweight-history-row")).toHaveCount(1);
  expect(await 프로필_체중(page)).toBe("80.0kg");
  await 기록_전체(page);
  await page.getByTestId("bodyweight-history-delete").click();
  await expect(page.getByTestId("bodyweight-delete-confirm")).toContainText(
    "마지막 기록을 지우면 체중이 미설정으로 돌아가요",
  );
  await expect(page.getByTestId("bodyweight-delete-confirm")).toContainText("80.0kg · "); // 마지막도 값·날짜(qa P3-4)
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("bodyweight-history-empty")).toBeVisible();
  expect(await 프로필_체중(page)).toBe("미설정");
  await page.reload();
  expect(await 프로필_체중(page)).toBe("미설정");

  // 미설정(0 표식) — 이력은 남고 다시 열어도(부팅 정리 두 번) 미설정
  await 프로필_입력(page, "78");
  await 기록_전체(page);
  await page.getByTestId("btn-bodyweight-unset").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("btn-bodyweight-unset")).toHaveCount(0);
  await expect(page.getByTestId("bodyweight-history-row")).toHaveCount(1);
  for (let i = 0; i < 2; i += 1) {
    await 내려쓰기_대기(page);
    await page.reload();
    expect(await 프로필_체중(page)).toBe("미설정");
  }
  const rows = await 이력_행(page);
  expect(rows.map((r) => r.weight_kg).sort()).toEqual([0, 78]);
  const profiles = await idb_행(page, "user_profiles");
  expect(profiles[0]?.bodyweight_kg ?? null).toBeNull();
  // 통계 곡선에는 표식이 안 보인다(유효 행만)
  await page.goto("/stats");
  await expect(page.getByTestId("bodyweight-latest")).toHaveText("최근 78.0kg", { timeout: 20_000 });

  await 프로필_입력(page, "79");
  expect(await 프로필_체중(page)).toBe("79.0kg");
});

// [원본] lb 사용자 — 165.3lb 로 보이고 그대로 저장하면 kg 원값 · lb 스텝 0.2·1·2 (판단 ① — SRS-067 과 어긋나 qa P3-3 로 철회)
// [개선] 예전 프로필 단위가 lb 여도 체중은 kg — 프로필·기록 시트·목록·통계 모두 kg · kg 스텝 · 그대로 저장하면 원값
test("예전 프로필 단위가 lb 인 사용자도 체중은 kg(SRS-067) · 그대로 저장하면 원값 · kg 스텝", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await 준비(page);
  await 프로필_입력(page, "75");
  expect(await 프로필_체중(page)).toBe("75.0kg");
  await 내려쓰기_대기(page);
  await 빈_문서(page);
  await idb_행_고치기(page, "user_profiles", [{ set: { weight_unit: "lb" } }]);
  expect(await 프로필_체중(page)).toBe("75.0kg");

  await page.getByTestId("btn-bodyweight-record").click();
  const sheet = page.getByTestId("bodyweight-record-sheet");
  await expect(sheet.getByTestId("weighin-value")).toContainText("75.0");
  await expect(sheet.getByTestId("weighin-value")).toContainText("kg");
  await expect(sheet.getByTestId("weighin-value")).not.toContainText("lb");
  for (const id of ["m1", "m0_5", "m0_1", "p0_1", "p0_5", "p1"])
    await expect(sheet.getByTestId(`weighin-step-${id}`)).toBeVisible();
  await expect(sheet.getByTestId("weighin-step-p0_2")).toHaveCount(0);
  await sheet.getByTestId("weighin-type").click();
  await sheet.getByTestId("weighin-input").press("Enter");
  await sheet.getByTestId("weighin-save").click();
  await expect(sheet).toHaveCount(0);
  await 프로필_기록(page, ["p0_5"]);
  expect(await 프로필_체중(page)).toBe("75.5kg");
  await 기록_전체(page);
  await expect(page.getByTestId("bodyweight-history-value")).toHaveText(["75.5kg", "75.0kg", "75.0kg"]);
  const rows = await 이력_행(page);
  expect(rows.map((r) => Number(r.weight_kg)).sort((a, b) => a - b)).toEqual([75, 75, 75.5]);
  await page.goto("/stats");
  await expect(page.getByTestId("bodyweight-latest")).toHaveText("최근 75.5kg", { timeout: 20_000 });
});

test("고치기로 오늘로 옮겨도 측정 시각은 지금을 넘지 않는다 — 그 뒤 새 기록이 내 체중(qa P3-1)", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await 준비(page);
  await 프로필_입력(page, "78");
  // 그 줄을 「어제 23:59」로 — 날짜만 오늘로 바꾸면 오늘 23:59(미래)가 되는 시각
  await 내려쓰기_대기(page);
  await 빈_문서(page);
  const [row] = await 이력_행(page);
  const y = new Date();
  y.setDate(y.getDate() - 1);
  y.setHours(23, 59, 0, 0);
  await idb_행_고치기(page, "bodyweight_logs", [{ id: String(row.id), set: { measured_at: y.getTime() } }]);
  await 기록_전체(page);
  await page.getByTestId("bodyweight-history-edit").click();
  const ed = page.getByTestId("bodyweight-edit-sheet");
  await ed.getByTestId("bodyweight-edit-date").fill(ymd(new Date()));
  await ed.getByTestId("weighin-save").click();
  await expect(ed).toHaveCount(0);
  const before = Date.now();
  const [fixed] = await 이력_행(page);
  expect(Number(fixed.measured_at)).toBeLessThanOrEqual(before);
  expect(ymd(new Date(Number(fixed.measured_at)))).toBe(ymd(new Date()));
  await 프로필_입력(page, "80");
  expect(await 프로필_체중(page)).toBe("80.0kg");
});

test("직접 입력 오타 방지 — 20kg 미만은 이유 한 줄 · 지난 값과 ±30% 넘으면 한 번 더 눌러야 저장(qa P3-6)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await 준비(page);
  await 프로필_입력(page, "72");
  await page.getByTestId("btn-bodyweight-record").click();
  const sheet = page.getByTestId("bodyweight-record-sheet");
  await sheet.getByTestId("weighin-type").click();
  await sheet.getByTestId("weighin-input").fill("7");
  await sheet.getByTestId("weighin-input").press("Enter");
  await expect(sheet.getByTestId("weighin-entry-error")).toHaveText("20~300kg 사이 숫자를 적어 주세요");
  await expect(sheet.getByTestId("weighin-value")).toContainText("72.0");
  await sheet.getByTestId("weighin-save").click();
  await expect(sheet).toBeVisible(); // 이유 줄이 보이는 동안은 저장하지 않는다
  await sheet.getByTestId("weighin-type").click();
  await sheet.getByTestId("weighin-input").fill("100");
  await sheet.getByTestId("weighin-input").press("Enter");
  await expect(sheet.getByTestId("weighin-entry-error")).toHaveCount(0);
  await sheet.getByTestId("weighin-save").click();
  await expect(sheet.getByTestId("weighin-jump-confirm")).toContainText("지난 기록 72.0kg");
  await expect(sheet.getByTestId("weighin-save")).toHaveText("그대로 저장");
  await sheet.getByTestId("weighin-save").click();
  await expect(sheet).toHaveCount(0);
  expect(await 프로필_체중(page)).toBe("100.0kg");
  // 입력 중 스크림 누르기 = 입력만 확정(닫지 않음 · qa P3-7)
  await page.getByTestId("btn-bodyweight-record").click();
  await sheet.getByTestId("weighin-type").click();
  await sheet.getByTestId("weighin-input").fill("99.5");
  await page.mouse.click(20, 20);
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("weighin-value")).toContainText("99.5");
  await page.mouse.click(20, 20);
  await expect(sheet).toHaveCount(0);
  // 닫으면 연 버튼으로 포커스가 돌아간다(qa P3-5 ③)
  await page.getByTestId("btn-bodyweight-record").click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe(
    "btn-bodyweight-record",
  );
});

test("이력 0 · 프로필 값만 있는 사람도 「체중 미설정으로 두기」 — 통계 빈 안내도 그 값(qa P3-8)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await 준비(page);
  await page.goto("/profile");
  await expect(page.getByTestId("bodyweight-value")).toBeVisible({ timeout: 20_000 });
  await 내려쓰기_대기(page);
  await 빈_문서(page);
  await idb_행_고치기(page, "user_profiles", [{ set: { bodyweight_kg: 75 } }]);
  expect(await 프로필_체중(page)).toBe("75.0kg");
  expect(await 이력_행(page)).toEqual([]);
  await page.goto("/stats");
  await expect(page.getByTestId("bodyweight-card-empty")).toHaveText(
    "프로필 값 75.0kg · 기록하면 곡선이 그려져요",
    {
      timeout: 20_000,
    },
  );
  await 기록_전체(page);
  await expect(page.getByTestId("bodyweight-history-empty")).toBeVisible();
  const unset = page.getByTestId("btn-bodyweight-unset");
  await expect(unset).toBeVisible();
  const box = await unset.boundingBox();
  expect(box && box.height >= 44).toBe(true);
  await unset.click();
  await page.getByTestId("dialog-confirm").click();
  await expect(unset).toHaveCount(0);
  expect(await 프로필_체중(page)).toBe("미설정");
  await page.reload();
  expect(await 프로필_체중(page)).toBe("미설정");
});

test("백업 내보내기 → 새 계정 기기에서 가져오기 — 체중 이력·내 체중 유지", async ({ page, browser }) => {
  test.setTimeout(180_000);
  await 준비(page);
  await 프로필_입력(page, "76.5");
  await 프로필_입력(page, "75.8");
  await page.goto("/account");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("btn-backup-export").click(),
  ]);
  const file = await download.path();
  expect(file).toBeTruthy();

  const ctx = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: process.env.BASE ?? "http://127.0.0.1:3100",
          localStorage: [
            { name: "onboarding_seen_v1", value: "yes" },
            { name: "liftgram.hint.suppressed", value: "e2e" },
          ],
        },
      ],
    },
  });
  const other = await ctx.newPage();
  await 준비(other);
  await 가입(other, `e2e-og-bw-${Date.now()}@example.com`, "체중백업");
  await other.goto("/account");
  await other.getByTestId("backup-file-input").setInputFiles(file as string);
  await expect(other.getByTestId("backup-status")).toContainText("가져왔어요", { timeout: 30_000 });
  expect(await 프로필_체중(other)).toBe("75.8kg");
  await 기록_전체(other);
  await expect(other.getByTestId("bodyweight-history-value")).toHaveText(["75.8kg", "76.5kg"]);
  await other.reload();
  expect(await 프로필_체중(other)).toBe("75.8kg");
  await ctx.close();
});

// SPEC-049 Phase 3 — 인바디(골격근량·체지방률) · 로컬 v29
test("인바디 — 기록 시트에서 골격근량·체지방률 · 범위 밖은 저장 막음 · 이력 줄 · 카드 수치 고르기·곡선 · 목표 시트엔 없음 · 새로고침 유지", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await 준비(page);

  // ① 범위 밖 — 이유 한 줄 · 시트 남음 · 기록 없음
  await page.goto("/profile");
  await page.getByTestId("btn-bodyweight-record").click();
  const rec = page.getByTestId("bodyweight-record-sheet");
  await expect(rec.getByTestId("weighin-smm")).toHaveCount(0); // 접혀서 시작
  await rec.getByTestId("weighin-inbody-toggle").click();
  await rec.getByTestId("weighin-smm").fill("120");
  await rec.getByTestId("weighin-pbf").fill("1");
  await rec.getByTestId("weighin-save").click();
  await expect(rec.getByTestId("weighin-smm-error")).toHaveText("골격근량은 5~100kg 로 적어 주세요");
  await expect(rec.getByTestId("weighin-pbf-error")).toHaveText("체지방률은 2~70% 로 적어 주세요");
  await expect(rec).toBeVisible();
  // (이력_행 은 빈 문서로 옮겨 시트를 닫는다 — 기록 없음은 끝의 「두 줄뿐」으로 확인)

  // ② 고쳐서 저장 → 이력 행에 두 칸
  await rec.getByTestId("weighin-smm").fill("33.1");
  await rec.getByTestId("weighin-pbf").fill("18.5");
  await rec.getByTestId("weighin-save").click();
  await expect(rec).toHaveCount(0);
  let rows = await 이력_행(page);
  expect(rows.map((r) => [r.weight_kg, r.skeletal_muscle_kg, r.body_fat_pct])).toEqual([[70, 33.1, 18.5]]);

  // ③ 둘째 기록(체지방률만) → 첫 기록을 10일 전으로
  await page.goto("/profile");
  await page.getByTestId("btn-bodyweight-record").click();
  await rec.getByTestId("weighin-step-p1").click();
  await rec.getByTestId("weighin-inbody-toggle").click();
  await rec.getByTestId("weighin-smm").fill("33.8");
  await rec.getByTestId("weighin-pbf").fill("17.9");
  await rec.getByTestId("weighin-save").click();
  await expect(rec).toHaveCount(0);
  await 기록_전체(page);
  const first = page.getByTestId("bodyweight-history-row").filter({ hasText: "70.0kg" });
  await expect(first.getByTestId("bodyweight-history-inbody")).toHaveText("골격근량 33.1kg · 체지방률 18.5%");
  await first.getByTestId("bodyweight-history-edit").click();
  const ed = page.getByTestId("bodyweight-edit-sheet");
  // 고치기 시트는 적어 둔 값으로 펼쳐 열린다
  await expect(ed.getByTestId("weighin-smm")).toHaveValue("33.1");
  await ed.getByTestId("bodyweight-edit-date").fill(ymd(new Date(Date.now() - 10 * 86_400_000)));
  await ed.getByTestId("weighin-save").click();
  await expect(ed).toHaveCount(0);
  await page.getByTestId("bodyweight-history-close").click();

  // ④ 카드 — 수치 고르기 → 골격근량 최근·변화·곡선 · 체중 전용(목표·주간) 숨김
  await page.goto("/stats");
  const metric = page.getByTestId("bodyweight-metric");
  await expect(metric).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("bodyweight-metric-smm").click();
  await expect(page.getByTestId("bodyweight-metric-latest")).toHaveText("최근 33.8kg");
  await expect(page.getByTestId("bodyweight-metric-change")).toContainText("+0.7kg");
  await expect(page.getByTestId("bodyweight-metric-chart")).toBeVisible();
  await expect(page.getByTestId("bodyweight-weekly")).toHaveCount(0);
  await expect(page.getByTestId("bodyweight-goal-gap")).toHaveCount(0);
  await expect(page.getByTestId("bodyweight-latest")).toHaveCount(0);
  await page.getByTestId("bodyweight-metric-pbf").click();
  await expect(page.getByTestId("bodyweight-metric-latest")).toHaveText("최근 17.9%");
  await expect(page.getByTestId("bodyweight-metric-change")).toContainText("−0.6%p");
  await page.getByTestId("bodyweight-metric-weight").click();
  await expect(page.getByTestId("bodyweight-latest")).toHaveText("최근 71.0kg");

  // ⑤ 목표 시트엔 인바디 칸이 없다
  await page.getByTestId("bodyweight-more").click();
  await page.getByTestId("btn-bodyweight-goal").click();
  const goal = page.getByTestId("bodyweight-goal-sheet");
  await expect(goal).toBeVisible();
  await expect(goal.getByTestId("weighin-inbody-toggle")).toHaveCount(0);
  await goal.getByTestId("weighin-secondary").click();

  // ⑥ 새로고침 유지
  await page.reload();
  await expect(page.getByTestId("bodyweight-metric")).toBeVisible({ timeout: 20_000 });
  rows = await 이력_행(page);
  expect(rows.map((r) => [r.weight_kg, r.skeletal_muscle_kg, r.body_fat_pct]).sort()).toEqual([
    [70, 33.1, 18.5],
    [71, 33.8, 17.9],
  ]);
});

test("오늘 체중 줄 — 「체중 미설정으로 두기」 뒤에는 ✓ 가 아니라 새로 기록 · 저장하면 다시 내 체중(P1-2 리뷰)", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await 준비(page);
  await 프로필_입력(page, "72");
  await 기록_전체(page);
  await page.getByTestId("btn-bodyweight-unset").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("btn-bodyweight-unset")).toHaveCount(0);
  await page.getByTestId("bodyweight-history-close").click();

  await 빠른_운동_시작(page);
  const row = page.getByTestId("weighin-row");
  await expect(page.getByTestId("weighin-card")).toHaveAttribute("data-done", "0", { timeout: 20_000 });
  await row.click();
  const sheet = page.getByTestId("weighin-sheet");
  await expect(sheet.locator("h2")).toHaveText("오늘 체중");
  await sheet.getByTestId("weighin-save").click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("weighin-card")).toHaveAttribute("data-done", "1");
  await 운동_취소(page);
  expect(await 프로필_체중(page)).toBe("72.0kg");
  // 측정 줄 둘(처음 + 새로) · 표식 하나
  const rows = await 이력_행(page);
  expect(rows.map((r) => r.weight_kg).sort()).toEqual([0, 72, 72]);
});

test("인바디 — 한 수치만 · 접고 고치면 값 유지 · 비우면 지움 · 360×640 에서 펼쳐도 저장 버튼이 화면 안(REV-096)", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 360, height: 640 });
  await 준비(page);

  // 체지방률만 적는다
  await page.goto("/profile");
  await page.getByTestId("btn-bodyweight-record").click();
  const rec = page.getByTestId("bodyweight-record-sheet");
  await rec.getByTestId("weighin-inbody-toggle").click();
  await rec.getByTestId("weighin-pbf").fill("20");
  const save = await rec.getByTestId("weighin-save").boundingBox();
  expect(save && save.y + save.height <= 640, "펼쳐도 저장 버튼이 보인다").toBe(true);
  await rec.getByTestId("weighin-save").click();
  await expect(rec).toHaveCount(0);

  // 카드 — 체지방률 탭만 생긴다 · 하나뿐이면 곡선 안내
  await page.goto("/stats");
  await expect(page.getByTestId("bodyweight-metric-pbf")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("bodyweight-metric-smm")).toHaveCount(0);
  await page.getByTestId("bodyweight-metric-pbf").click();
  await expect(page.getByTestId("bodyweight-metric-empty")).toHaveText("한 번 더 적으면 곡선이 보여요");

  // 고치기 — 펼친 채 열림 → 접고 체중만 바꿔 저장 → 체지방률 유지
  await 기록_전체(page);
  const row = page.getByTestId("bodyweight-history-row").first();
  await expect(row.getByTestId("bodyweight-history-inbody")).toHaveText("체지방률 20.0%");
  await row.getByTestId("bodyweight-history-edit").click();
  const ed = page.getByTestId("bodyweight-edit-sheet");
  await expect(ed.getByTestId("weighin-pbf")).toHaveValue("20");
  await ed.getByTestId("weighin-inbody-toggle").click();
  await ed.getByTestId("weighin-step-p1").click();
  await ed.getByTestId("weighin-save").click();
  await expect(ed).toHaveCount(0);
  await expect(page.getByTestId("bodyweight-history-row").first()).toContainText("71.0kg");
  await expect(page.getByTestId("bodyweight-history-inbody")).toHaveText("체지방률 20.0%");

  // 비우고 저장 → 지움
  await page.getByTestId("bodyweight-history-edit").first().click();
  await ed.getByTestId("weighin-pbf").fill("");
  await ed.getByTestId("weighin-save").click();
  await expect(ed).toHaveCount(0);
  await expect(page.getByTestId("bodyweight-history-inbody")).toHaveCount(0);
  const rows = await 이력_행(page);
  expect(rows.map((r) => [r.weight_kg, r.skeletal_muscle_kg ?? null, r.body_fat_pct ?? null])).toEqual([
    [71, null, null],
  ]);
});
