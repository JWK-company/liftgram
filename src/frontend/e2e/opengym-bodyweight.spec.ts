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

async function 체크인_설정(page: Page, on: boolean): Promise<void> {
  await page.goto("/profile");
  const sw = page.getByTestId("switch-weighin");
  await expect(sw).toBeVisible({ timeout: 20_000 });
  if ((await sw.getAttribute("aria-checked")) !== String(on)) await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", String(on));
}

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

test("체크인 — 켜고 시작하면 시트 · ± 로 맞춰 저장 · 이력·프로필 반영 · 같은 날 두 번째 운동은 시트 없음", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 360, height: 640 });
  await 준비(page);
  await 체크인_설정(page, true);
  await 빠른_운동_시작(page);

  const sheet = page.getByTestId("weighin-sheet");
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await expect(sheet.getByTestId("weighin-last")).toHaveText("지난 기록이 없어요 — 값을 맞춰 주세요");
  await expect(sheet.getByTestId("weighin-value")).toContainText("70.0");
  // 자동 포커스는 입력칸이 아니라 제목(키보드가 뜨지 않는다 · U-7 ③) — 입력칸은 아직 없다
  await expect(sheet.getByTestId("weighin-input")).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("H2");
  // 스크림은 포커스·낭독 대상이 아니고, Tab 은 패널 안에서 돈다(qa P3-5)
  await expect(sheet.getByTestId("weighin-scrim")).toHaveAttribute("aria-hidden", "true");
  await expect(sheet.getByTestId("weighin-scrim")).toHaveAttribute("tabindex", "-1");
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press(i % 5 === 4 ? "Shift+Tab" : "Tab");
    expect(
      await page.evaluate(() =>
        Boolean(document.querySelector('[data-testid="weighin-panel"]')?.contains(document.activeElement)),
      ),
    ).toBe(true);
  }
  // 높이 ≤ 50dvh · 헤더 타이머가 시트 위로 보인다
  const panel = await sheet.getByTestId("weighin-panel").boundingBox();
  const timer = await page.getByTestId("elapsed").boundingBox();
  expect(panel?.height ?? 999).toBeLessThanOrEqual(320 + 1);
  expect(timer && panel && timer.y + timer.height).toBeLessThanOrEqual((panel?.y ?? 0) + 0.5);
  // 버튼 6개 ≥ 44×44 · 두 줄(−1 −0.5 −0.1 / +0.1 +0.5 +1)
  const ids = ["m1", "m0_5", "m0_1", "p0_1", "p0_5", "p1"];
  for (const id of ids) {
    const b = await sheet.getByTestId(`weighin-step-${id}`).boundingBox();
    expect(b && b.width >= 44 && b.height >= 44, id).toBe(true);
  }
  const rowY = async (id: string) => (await sheet.getByTestId(`weighin-step-${id}`).boundingBox())?.y ?? -1;
  expect(await rowY("m1")).toBe(await rowY("m0_1"));
  expect(await rowY("p0_1")).toBeGreaterThan(await rowY("m1"));

  for (const id of ["p1", "p1", "p0_5", "m0_1"]) await sheet.getByTestId(`weighin-step-${id}`).click();
  await expect(sheet.getByTestId("weighin-value")).toContainText("72.4");
  await sheet.getByTestId("weighin-save").click();
  await expect(sheet).toHaveCount(0);
  // 운동 화면 그대로 — 운동이 막히지 않는다
  await expect(page).toHaveURL(/\/workout/);
  await expect(page.getByTestId("btn-add-exercise")).toBeVisible();

  expect(await 프로필_체중(page)).toBe("72.4kg");
  await 기록_전체(page);
  await expect(page.getByTestId("bodyweight-history-row")).toHaveCount(1);
  await expect(page.getByTestId("bodyweight-history-row").first()).toContainText("운동 전");
  const rows = await 이력_행(page);
  expect(rows.map((r) => [r.weight_kg, r.source])).toEqual([[72.4, "checkin"]]);

  // 같은 날 두 번째 운동 — 시트 없음
  await page.goto("/workout");
  await 운동_취소(page);
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("weighin:"))),
  ).toEqual([]);
  await 빠른_운동_시작(page);
  await 시트_없음(page);
});

test("「체중 없이 계속」·스크림·Esc·뒤로 가기 = 이력 불변 · 같은 운동에서 다시 열어도 안 뜸 · 끝나면 표시 지움", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await 준비(page);
  await 체크인_설정(page, true);
  const sheet = page.getByTestId("weighin-sheet");

  // ① 「체중 없이 계속」 — 새로고침·다시 들어와도 같은 운동에서는 안 뜬다(localStorage 표시)
  await 빠른_운동_시작(page);
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await sheet.getByTestId("weighin-secondary").click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("btn-add-exercise")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("btn-add-exercise")).toBeVisible({ timeout: 20_000 });
  await 시트_없음(page);
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("weighin:")).length),
  ).toBe(1);
  await 운동_취소(page);
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("weighin:")).length),
  ).toBe(0);

  // ② 스크림
  await 빠른_운동_시작(page);
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await page.mouse.click(20, 20);
  await expect(sheet).toHaveCount(0);
  await 운동_취소(page);

  // ③ Esc
  await 빠른_운동_시작(page);
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await 운동_취소(page);

  // ④ 브라우저 뒤로 가기 — 시트만 닫히고 운동 화면에 남는다
  await 빠른_운동_시작(page);
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/\/workout/);
  await expect(page.getByTestId("btn-add-exercise")).toBeVisible();
  // 저장으로 닫을 때 쌓은 칸을 걷는다 — 뒤로 한 번이면 운동 화면을 떠난다(빈 칸이 남지 않음)는 ① 이후에도 같다
  await 운동_취소(page);

  expect(await 프로필_체중(page)).toBe("미설정");
  expect(await 이력_행(page)).toEqual([]);
});

test("시트가 뜨지 않는 경우 — 꺼짐(기본) · 완료 세트 있음 · 시작 10분 지남", async ({ page }) => {
  test.setTimeout(150_000);
  await 준비(page);
  // 기본은 꺼짐
  await page.goto("/profile");
  await expect(page.getByTestId("switch-weighin")).toHaveAttribute("aria-checked", "false", {
    timeout: 20_000,
  });
  await 빠른_운동_시작(page);
  await 시트_없음(page);

  // 완료 세트가 있는 운동에 켜고 다시 들어오면 — 안 뜬다
  await 종목_추가(page, "바벨 벤치프레스");
  await 안내_띠_닫기(page);
  await 세트_기록(page, 0, 0, 60, 5);
  await 체크인_설정(page, true);
  await page.goto("/workout");
  await expect(page.getByTestId("btn-add-exercise")).toBeVisible({ timeout: 20_000 });
  await 시트_없음(page);
  await 운동_취소(page);

  // 시작 11분 전으로 되감은 운동(세트 없음) — 안 뜬다
  await 체크인_설정(page, false);
  await 빠른_운동_시작(page);
  await 시트_없음(page);
  await 내려쓰기_대기(page);
  await 빈_문서(page);
  const ws = await idb_행(page, "workouts");
  const active = ws.find((w) => w.state === "active" && w._status !== "deleted"); // 앞에서 취소한 운동은 삭제 표시만 남아 있다
  expect(active).toBeTruthy();
  await idb_행_고치기(page, "workouts", [
    { id: String(active?.id), set: { started_at: Number(active?.started_at) - 11 * 60_000 } },
  ]);
  await 체크인_설정(page, true);
  await page.goto("/workout");
  await expect(page.getByTestId("btn-add-exercise")).toBeVisible({ timeout: 20_000 });
  await 시트_없음(page);
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
  // 누르면 그 점 값
  const svgBox = await page.getByTestId("bodyweight-chart-svg").boundingBox();
  if (svgBox) await page.mouse.click(svgBox.x + xs[0], svgBox.y + 40);
  await expect(page.getByTestId("bodyweight-chart-readout")).toContainText("74.0kg");

  // 목표 70 → 목표선 · 남은 차이
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
          localStorage: [{ name: "onboarding_seen_v1", value: "yes" }],
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
