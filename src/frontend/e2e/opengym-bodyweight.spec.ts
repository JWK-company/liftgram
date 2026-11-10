// @plm SRS-077 SRS-078  openGym P3 — 운동 전 체중 체크인 · 프로필 체중 칸 · 체중 기록 전체 · 통계 체중 카드
//
// 확인 목록(스펙 P3 검증 + 지시):
//   · 체크인 켜기 → 시작 → 시트(≤50dvh · 헤더 타이머 보임 · 버튼 ≥44 · 입력칸 자동 포커스 없음) → ± → 저장 → 이력·프로필 반영 · 운동 화면 그대로
//     [개선] 2026-11-10 — 운동 화면은 바닥 시트 없이 「오늘 체중」 카드 안에 펼친다(weighin-card-editor) · 포탈 시트 접근성은 통계 「기록」 시트에서 본다
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
//   · [개선] 체중 한 줄(2026-11-10) — 프로필은 「체중 ‹최근 값› ›」 한 줄 · 누르면 「체중」 시트(맨 위 바로 입력 → 지난 기록 → 미설정으로 두기)
//     저장해도 시트는 열린 채 새 줄이 맨 위 · 부가 설명 없음 · 360px 넘침 없음 · 다크
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
  // [개선] 운동 화면엔 그 시트가 원래 없다 — 카드 안 입력도 저절로 펼쳐지지 않는다(리뷰 L-5)
  await expect(page.getByTestId("weighin-card-editor")).toHaveCount(0);
}

async function 프로필_체중(page: Page): Promise<string> {
  await page.goto("/profile");
  const v = page.getByTestId("bodyweight-value");
  await expect(v).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(300);
  return (await v.textContent()) ?? "";
}

// [원본] 프로필_기록·프로필_입력 — 「기록」 버튼(btn-bodyweight-record) → 따로 뜨는 기록 시트(bodyweight-record-sheet) → 저장하면 닫힘
//   기록_전체 — 「체중 기록 전체」 줄(row-bodyweight-history) → bodyweight-history-sheet
// [개선] 체중 한 줄(2026-11-10) — 「체중」 줄 → 「체중」 시트(bodyweight-sheet) 맨 위 바로 입력(bodyweight-entry). 저장해도 열린 채

/** 다 읽은 「체중」 시트 목록의 줄 수(읽기 전 빈 목록을 0개로 세지 않게) */
async function 목록_줄수(page: Page): Promise<number> {
  await expect(
    page.locator(
      '[data-testid="bodyweight-history-list"][data-loaded="1"], [data-testid="bodyweight-history-empty"]',
    ),
  ).toHaveCount(1);
  return page.getByTestId("bodyweight-history-row").count();
}

/**
 * 「체중」 시트 바로 입력의 저장 — 목록 줄이 하나 늘면 저장 끝(리뷰 M-3: 알림은 2.6초 남아 연속 저장의 신호로 못 쓴다).
 * 시트가 열린 채인지 본 뒤 close 면 「확인」으로 닫는다
 */
async function 바로_저장(page: Page, close = true): Promise<void> {
  const n = await 목록_줄수(page);
  await page.getByTestId("bodyweight-entry").getByTestId("weighin-save").click();
  await expect(page.getByTestId("bodyweight-history-row")).toHaveCount(n + 1);
  await expect(page.getByTestId("bodyweight-sheet")).toBeVisible();
  if (!close) return;
  await page.getByTestId("bodyweight-history-close").click();
  await expect(page.getByTestId("bodyweight-sheet")).toHaveCount(0);
}

/** 프로필 「체중」 줄 → 시트 · 바로 입력 묶음을 돌려준다 */
async function 체중_시트(page: Page) {
  await page.goto("/profile");
  await page.getByTestId("bodyweight").click({ timeout: 20_000 });
  await expect(page.getByTestId("bodyweight-sheet")).toBeVisible();
  return page.getByTestId("bodyweight-entry");
}

/** 프로필 「체중」 → 바로 입력에서 steps 를 누르고 저장 */
async function 프로필_기록(page: Page, steps: string[] = []): Promise<void> {
  const sheet = await 체중_시트(page);
  for (const s of steps) await sheet.getByTestId(`weighin-step-${s}`).click();
  await 바로_저장(page);
}

/** 프로필 「체중」 → 바로 입력에서 직접 입력 → 저장 */
async function 프로필_입력(page: Page, value: string): Promise<void> {
  const sheet = await 체중_시트(page);
  await sheet.getByTestId("weighin-type").click();
  await sheet.getByTestId("weighin-input").fill(value);
  await sheet.getByTestId("weighin-input").press("Enter");
  await 바로_저장(page);
}

async function 기록_전체(page: Page): Promise<void> {
  await 체중_시트(page);
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
// [원본] test("오늘 체중 줄 — 시작해도 시트 없음 · 줄 → 시트 ± 저장 · ✓ 로 접힘 · …")
// [개선] 운동 중엔 바닥 시트 대신 카드 안에 펼친다(2026-11-10 사용자 요청). 시트의 접근성(제목 포커스·Tab 가두기·스크림)은 통계 「기록」 시트 시험으로 옮겼다
test("오늘 체중 줄 — 시작해도 시트 없음 · 「기록 ⌄」 → 카드 안 ± 저장 · 접히고 ✓ · 같은 날 다음 운동은 그 값 · 누르면 그 줄을 고친다", async ({
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

  /* [원본] 줄 → 바닥 시트(weighin-sheet) — 제목 포커스·Tab 가두기·≤50dvh·헤더 타이머 위 · 버튼 6개 ≥44 · ± → 저장하면 시트 닫힘
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
  */
  // [개선] 「기록 ⌄」 → 카드 안 입력(시트 없음 · aria-expanded) · 키보드가 뜨지 않게 입력칸 자동 포커스 없음 · 버튼 6개 ≥44
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await row.click();
  const sheet = page.getByTestId("weighin-card-editor");
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("weighin-sheet")).toHaveCount(0);
  await expect(page.getByTestId("weighin-scrim")).toHaveCount(0);
  await expect(sheet.getByTestId("weighin-last")).toHaveText("지난 기록이 없어요 — 값을 맞춰 주세요");
  await expect(sheet.getByTestId("weighin-value")).toContainText("70.0");
  await expect(sheet.getByTestId("weighin-input")).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe("weighin-row");
  for (const id of ["m1", "m0_5", "m0_1", "p0_1", "p0_5", "p1"]) {
    const b = await sheet.getByTestId(`weighin-step-${id}`).boundingBox();
    expect(b && b.width >= 44 && b.height >= 44, id).toBe(true);
  }
  for (const id of ["p1", "p1", "p0_5", "m0_1"]) await sheet.getByTestId(`weighin-step-${id}`).click();
  await expect(sheet.getByTestId("weighin-value")).toContainText("72.4");
  await sheet.getByTestId("weighin-save").click();
  await expect(sheet).toHaveCount(0);
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("weighin-card-value")).toHaveText("72.4kg");
  await expect(card).toHaveAttribute("data-done", "1");
  await expect(row).toHaveText("고치기");
  // 저장 뒤 포커스는 「고치기」 버튼(사라진 저장 버튼에서 body 로 빠지지 않게)
  await expect(page.getByTestId("weighin-row")).toBeFocused(); // 포커스는 effect 뒤에 옮겨진다 — 기다려 읽는다(리뷰 L-1)
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

/* [원본] 운동 화면의 「오늘 체중」 바닥 시트를 취소·스크림·Esc·뒤로로 닫는 시험 — 운동 화면은 카드 안 입력으로 바뀌었다(2026-11-10)
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

*/
// [개선] 운동 화면 — 다시 누르면 접힘 · 카드를 접어도 닫힘 = 이력 불변 · 화면 그대로.
//   통계 「기록 ›」 시트(= 프로필 「체중」 시트)의 닫기 셋(확인·스크림·Esc)·연 곳으로 포커스도 본다
test("오늘 체중 카드 입력 닫기(다시 누름·카드 접기·Esc) = 이력 불변 · 통계 「기록 ›」 시트 닫기(확인·스크림·Esc) · 프로필에 체크인 스위치 없음", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await 준비(page);
  await page.goto("/profile");
  await expect(page.getByTestId("bodyweight-value")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("switch-weighin")).toHaveCount(0);

  await 빠른_운동_시작(page);
  const row = page.getByTestId("weighin-row");
  const editor = page.getByTestId("weighin-card-editor");
  await expect(row).toBeVisible({ timeout: 20_000 });
  // ① 다시 누름 = 접힘(값을 바꿔 두어도 저장 안 됨)
  await row.click();
  await expect(editor).toBeVisible();
  await editor.getByTestId("weighin-step-p1").click();
  await row.click();
  await expect(editor).toHaveCount(0);
  await expect(row).toHaveAttribute("aria-expanded", "false");
  // ② 카드 접기 = 입력도 닫힘 · 다시 펼쳐도 입력은 닫힌 채
  await row.click();
  await expect(editor).toBeVisible();
  await page.getByTestId("weighin-card-toggle").click();
  await expect(editor).toHaveCount(0);
  await page.getByTestId("weighin-card-toggle").click();
  await expect(row).toBeVisible();
  await expect(editor).toHaveCount(0);
  // ③ Esc = 접기 · 운동 화면 그대로 · 포커스는 「기록」 버튼(리뷰 M-1·L-3)
  await row.click();
  await expect(editor).toBeVisible();
  await expect(page.getByTestId("weighin-sheet")).toHaveCount(0);
  await editor.getByTestId("weighin-step-p1").focus();
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(page).toHaveURL(/\/workout/);
  await expect(page.getByTestId("weighin-row")).toBeFocused(); // 포커스는 effect 뒤에 옮겨진다 — 기다려 읽는다(리뷰 L-1)
  await expect(page.getByTestId("weighin-card")).toHaveAttribute("data-done", "0");
  await 운동_취소(page);
  expect(await 프로필_체중(page)).toBe("미설정");

  // 통계 「기록 ›」 = 프로필과 같은 「체중」 시트(체중 패널 · 2026-11-10) — 닫기 셋(확인·스크림·Esc) · 입력칸 자동 포커스 없음 · 연 곳으로 포커스
  //   [원본] 통계 「기록」 포탈 시트(bodyweight-record-sheet)의 제목 포커스·스크림 aria-hidden·Tab 가두기 — 그 시트를 쓰는 곳이 없어졌다
  await page.goto("/stats");
  const open = page.getByTestId("btn-bodyweight-card-record");
  const sheet = page.getByTestId("bodyweight-sheet");
  await open.click({ timeout: 20_000 });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("bodyweight-panel")).toBeVisible();
  await expect(sheet.getByTestId("weighin-input")).toHaveCount(0);
  await sheet.getByTestId("bodyweight-entry").getByTestId("weighin-step-p1").click(); // 바꿔 두어도 닫으면 저장 안 됨
  await page.getByTestId("bodyweight-history-close").click();
  await expect(sheet).toHaveCount(0);
  await open.click();
  await expect(sheet).toBeVisible();
  await page.mouse.click(20, 20);
  await expect(sheet).toHaveCount(0);
  await open.click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe(
    "btn-bodyweight-card-record",
  );
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
    await expect(page.getByTestId("bodyweight-sheet")).toBeVisible();
  }
  await page.getByTestId("bodyweight-history-close").click();

  // 서로 다른 날 2개 → 「한 번 더」 · 카드 머리 「기록」으로 세 번째 → 새로고침 없이 주간 변화(qa P3-2)
  await page.goto("/stats");
  await expect(page.getByTestId("bodyweight-weekly")).toHaveText("한 번 더 적으면 추세가 보여요", {
    timeout: 20_000,
  });
  await page.getByTestId("btn-bodyweight-card-record").click();
  // [원본] bodyweight-record-sheet → 저장하면 닫힘 · [개선] 같은 「체중」 시트의 바로 입력 → 저장(열린 채) → 확인
  const rec = page.getByTestId("bodyweight-entry");
  await rec.getByTestId("weighin-type").click();
  await rec.getByTestId("weighin-input").fill("72.4");
  await rec.getByTestId("weighin-input").press("Enter");
  await 바로_저장(page);
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

  // [원본] 카드 머리(SPEC-049) — 최근 값·날짜 + 테두리 「기록」 + ⋯ 가 제목과 한 줄
  // [개선] 최근 값·날짜 + 「기록 ›」(회색 글자 · 테두리·채움 없음) 가 제목과 한 줄 · 360px 안 · 44px · ⋯ 없음(2026-11-10)
  await expect(page.getByTestId("bodyweight-head-latest")).toHaveText("72.4kg · 오늘");
  {
    const [title, rec] = await Promise.all(
      ["bodyweight-card-title", "btn-bodyweight-card-record"].map((id) => page.getByTestId(id).boundingBox()),
    );
    expect(title && rec).toBeTruthy();
    if (title && rec) {
      expect(Math.abs(rec.y + rec.height / 2 - (title.y + title.height / 2))).toBeLessThanOrEqual(8);
      expect(Math.round(rec.height)).toBeGreaterThanOrEqual(44);
      expect(rec.x + rec.width).toBeLessThanOrEqual(360);
    }
  }
  await expect(page.getByTestId("bodyweight-more")).toHaveCount(0);
  // 카드에는 목표 버튼이 없다 — 목표는 「기록 ›」 시트(체중 패널) 안
  await expect(page.getByTestId("btn-bodyweight-goal")).toHaveCount(0);

  // [원본] ⋯ → 「목표 바꾸기」 → 따로 뜨는 목표 시트
  // [개선] 「기록 ›」 → 패널 목표 「정하기」 → 그 자리 입력 → 저장(2번 누름) → 확인 → 목표선 · 남은 차이
  await page.getByTestId("btn-bodyweight-card-record").click();
  await expect(page.getByTestId("bodyweight-goal-value")).toHaveText("없음");
  await page.getByTestId("btn-bodyweight-goal").click();
  const goal = page.getByTestId("bodyweight-goal-sheet");
  await goal.getByTestId("weighin-type").click();
  await goal.getByTestId("weighin-input").fill("70");
  await goal.getByTestId("weighin-save").click();
  await expect(goal).toHaveCount(0);
  await expect(page.getByTestId("bodyweight-goal-value")).toHaveText("70.0kg");
  await page.getByTestId("bodyweight-history-close").click();
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
  // [원본] ⋯ → 「목표 지우기」 · [개선] 「기록 ›」 → 패널 「지우기」(한 번) → 확인
  await page.getByTestId("btn-bodyweight-card-record").click();
  await page.getByTestId("btn-bodyweight-goal-clear").click();
  await expect(page.getByTestId("bodyweight-goal-value")).toHaveText("없음");
  await page.getByTestId("bodyweight-history-close").click();
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

  // [원본] btn-bodyweight-record → bodyweight-record-sheet
  await page.getByTestId("bodyweight").click();
  const sheet = page.getByTestId("bodyweight-entry");
  await expect(sheet.getByTestId("weighin-value")).toContainText("75.0");
  await expect(sheet.getByTestId("weighin-value")).toContainText("kg");
  await expect(sheet.getByTestId("weighin-value")).not.toContainText("lb");
  for (const id of ["m1", "m0_5", "m0_1", "p0_1", "p0_5", "p1"])
    await expect(sheet.getByTestId(`weighin-step-${id}`)).toBeVisible();
  await expect(sheet.getByTestId("weighin-step-p0_2")).toHaveCount(0);
  await sheet.getByTestId("weighin-type").click();
  await sheet.getByTestId("weighin-input").press("Enter");
  // [원본] await sheet.getByTestId("weighin-save").click(); await expect(sheet).toHaveCount(0);
  await 바로_저장(page);
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
  // [원본] btn-bodyweight-record → bodyweight-record-sheet(저장하면 닫힘)
  const sheet = await 체중_시트(page);
  await sheet.getByTestId("weighin-type").click();
  await sheet.getByTestId("weighin-input").fill("7");
  await sheet.getByTestId("weighin-input").press("Enter");
  await expect(sheet.getByTestId("weighin-entry-error")).toHaveText("20~300kg 사이 숫자를 적어 주세요");
  await expect(sheet.getByTestId("weighin-value")).toContainText("72.0");
  await sheet.getByTestId("weighin-save").click();
  // [원본] await expect(sheet).toBeVisible(); — 바로 입력은 저장해도 남아 늘 통과했다(리뷰 M-2) → 줄 수로 본다
  await expect(page.getByTestId("bodyweight-history-value")).toHaveText(["72.0kg"]); // 이유 줄이 보이는 동안은 저장하지 않는다
  await sheet.getByTestId("weighin-type").click();
  await sheet.getByTestId("weighin-input").fill("100");
  await sheet.getByTestId("weighin-input").press("Enter");
  await expect(sheet.getByTestId("weighin-entry-error")).toHaveCount(0);
  await sheet.getByTestId("weighin-save").click();
  await expect(sheet.getByTestId("weighin-jump-confirm")).toContainText("지난 기록 72.0kg");
  await expect(sheet.getByTestId("weighin-save")).toHaveText("그대로 저장");
  // [원본] await sheet.getByTestId("weighin-save").click(); await expect(sheet).toHaveCount(0);
  await 바로_저장(page, false);
  // 저장 뒤 바로 입력은 다음 기록을 받는다 — 확인 문구·「그대로 저장」은 걷힌다 · 새 줄이 맨 위
  await expect(sheet.getByTestId("weighin-jump-confirm")).toHaveCount(0);
  await expect(sheet.getByTestId("weighin-save")).toHaveText("저장");
  await expect(page.getByTestId("bodyweight-history-value")).toHaveText(["100.0kg", "72.0kg"]);
  // 프로필 바로 입력도 입력 중 바깥(스크림) 누르기 = 입력만 확정(닫지 않음 · qa P3-7 · 리뷰 M-1) · 다음 누름에 닫는다
  await sheet.getByTestId("weighin-type").click();
  await sheet.getByTestId("weighin-input").fill("99.5");
  await page.mouse.click(20, 20);
  await expect(page.getByTestId("bodyweight-sheet")).toBeVisible();
  await expect(sheet.getByTestId("weighin-value")).toContainText("99.5");
  await expect(page.getByTestId("bodyweight-history-value")).toHaveText(["100.0kg", "72.0kg"]); // 확정만 · 저장 아님
  await page.mouse.click(20, 20);
  await expect(page.getByTestId("bodyweight-sheet")).toHaveCount(0);
  expect(await 프로필_체중(page)).toBe("100.0kg");
  // [원본] 입력 중 스크림 누르기 = 입력만 확정 — 프로필 「기록」 시트로 쟀다. 그 포탈 시트는 이제 통계 카드 「기록」만 연다 → 거기서 잰다(qa P3-7)
  await page.goto("/stats");
  await page.getByTestId("btn-bodyweight-card-record").click({ timeout: 20_000 });
  // [원본] const rec = page.getByTestId("bodyweight-record-sheet"); — [개선] 통계도 프로필과 같은 「체중」 시트(체중 패널 · 2026-11-10)
  const rec = page.getByTestId("bodyweight-sheet");
  const recEntry = rec.getByTestId("bodyweight-entry");
  await recEntry.getByTestId("weighin-type").click();
  await recEntry.getByTestId("weighin-input").fill("99.5");
  await page.mouse.click(20, 20);
  await expect(rec).toBeVisible();
  await expect(recEntry.getByTestId("weighin-value")).toContainText("99.5");
  await page.mouse.click(20, 20);
  await expect(rec).toHaveCount(0);
  // 닫으면 연 버튼으로 포커스가 돌아간다(qa P3-5 ③) — 카드 「기록」 · 프로필 「체중」 줄 둘 다
  await page.getByTestId("btn-bodyweight-card-record").click();
  await expect(rec).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(rec).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe(
    "btn-bodyweight-card-record",
  );
  await 체중_시트(page);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("bodyweight-sheet")).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe("bodyweight");
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
  // [원본] /profile → btn-bodyweight-record → bodyweight-record-sheet
  const rec = await 체중_시트(page);
  // [원본] await expect(rec.getByTestId("weighin-smm")).toHaveCount(0); // 접혀서 시작 → 토글 클릭
  // [개선] 처음부터 두 칸이 보인다(토글 없음 · 2026-11-10)
  await expect(rec.getByTestId("weighin-smm")).toBeVisible();
  await expect(rec.getByTestId("weighin-inbody-toggle")).toHaveCount(0);
  await rec.getByTestId("weighin-smm").fill("120");
  await rec.getByTestId("weighin-pbf").fill("1");
  await rec.getByTestId("weighin-save").click();
  await expect(rec.getByTestId("weighin-smm-error")).toHaveText("골격근량은 5~100kg 로 적어 주세요");
  await expect(rec.getByTestId("weighin-pbf-error")).toHaveText("체지방률은 2~70% 로 적어 주세요");
  // [원본] await expect(rec).toBeVisible(); — 바로 입력은 저장해도 남아 늘 통과했다(리뷰 L-1) → 목록이 빈 채인지 본다
  await expect(page.getByTestId("bodyweight-history-empty")).toBeVisible();
  // (이력_행 은 빈 문서로 옮겨 시트를 닫는다 — 기록 없음은 끝의 「두 줄뿐」으로도 확인)

  // ② 고쳐서 저장 → 이력 행에 두 칸
  await rec.getByTestId("weighin-smm").fill("33.1");
  await rec.getByTestId("weighin-pbf").fill("18.5");
  // [원본] await rec.getByTestId("weighin-save").click(); await expect(rec).toHaveCount(0);
  await 바로_저장(page, false);
  // [원본] 저장 뒤 바로 입력은 인바디 칸을 비우고 접는다 → [개선] 비운다(칸은 그대로 보임 · 같은 값이 다음 줄에 또 붙지 않게) · 새 줄이 목록 맨 위
  await expect(page.getByTestId("bodyweight-history-inbody").first()).toHaveText(
    "골격근량 33.1kg · 체지방률 18.5%",
  );
  await expect(rec.getByTestId("weighin-smm")).toBeVisible();
  await expect(rec.getByTestId("weighin-smm")).toHaveValue("");
  await expect(rec.getByTestId("weighin-pbf")).toHaveValue("");
  let rows = await 이력_행(page);
  expect(rows.map((r) => [r.weight_kg, r.skeletal_muscle_kg, r.body_fat_pct])).toEqual([[70, 33.1, 18.5]]);

  // ③ 둘째 기록(체지방률만) → 첫 기록을 10일 전으로
  // [원본] /profile → btn-bodyweight-record
  await 체중_시트(page);
  await rec.getByTestId("weighin-step-p1").click();
  // [원본] await rec.getByTestId("weighin-inbody-toggle").click();
  await rec.getByTestId("weighin-smm").fill("33.8");
  await rec.getByTestId("weighin-pbf").fill("17.9");
  // [원본] await rec.getByTestId("weighin-save").click(); await expect(rec).toHaveCount(0);
  await 바로_저장(page);
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
  // [원본] ⋯ → 「목표 정하기」 → 목표 시트 · [개선] 「기록 ›」 → 패널 목표 「정하기」
  await page.getByTestId("btn-bodyweight-card-record").click();
  await page.getByTestId("btn-bodyweight-goal").click();
  const goal = page.getByTestId("bodyweight-goal-sheet");
  await expect(goal).toBeVisible();
  // [원본] await expect(goal.getByTestId("weighin-inbody-toggle")).toHaveCount(0);
  await expect(goal.getByTestId("weighin-inbody")).toHaveCount(0);
  await expect(goal.getByTestId("weighin-smm")).toHaveCount(0);
  await goal.getByTestId("weighin-secondary").click();
  await expect(goal).toHaveCount(0);
  await page.getByTestId("bodyweight-history-close").click();

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
  // [원본] const sheet = page.getByTestId("weighin-sheet"); await expect(sheet.locator("h2")).toHaveText("오늘 체중");
  // [개선] 카드 안 입력 — 이름(fieldset)이 「오늘 체중」(새 줄)
  // [개선] 체중 패널 바로 입력(bodyweight-entry — 프로필·통계와 같은 testid)
  const sheet = page.getByTestId("weighin-card-editor").getByTestId("bodyweight-entry");
  await expect(sheet).toHaveAttribute("aria-label", "오늘 체중");
  await sheet.getByTestId("weighin-save").click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId("weighin-card")).toHaveAttribute("data-done", "1");
  await 운동_취소(page);
  expect(await 프로필_체중(page)).toBe("72.0kg");
  // 측정 줄 둘(처음 + 새로) · 표식 하나
  const rows = await 이력_행(page);
  expect(rows.map((r) => r.weight_kg).sort()).toEqual([0, 72, 72]);
});

// [원본] test("인바디 — 한 수치만 · 접고 고치면 값 유지 · 비우면 지움 · 360×640 에서 펼쳐도 저장 버튼이 화면 안(REV-096)")
test("인바디 — 한 수치만 · 고치기에서 체중만 바꾸면 값 유지 · 비우면 지움 · 360×640 에서 저장 버튼이 화면 안(REV-096)", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 360, height: 640 });
  await 준비(page);

  // 체지방률만 적는다
  // [원본] /profile → btn-bodyweight-record → bodyweight-record-sheet(저장하면 닫힘)
  const rec = await 체중_시트(page);
  // [원본] await rec.getByTestId("weighin-inbody-toggle").click();
  await rec.getByTestId("weighin-pbf").fill("20");
  const save = await rec.getByTestId("weighin-save").boundingBox();
  expect(save && save.y + save.height <= 640, "펼쳐도 저장 버튼이 보인다").toBe(true);
  await 바로_저장(page);

  // 카드 — 체지방률 탭만 생긴다 · 하나뿐이면 곡선 안내
  await page.goto("/stats");
  await expect(page.getByTestId("bodyweight-metric-pbf")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("bodyweight-metric-smm")).toHaveCount(0);
  await page.getByTestId("bodyweight-metric-pbf").click();
  await expect(page.getByTestId("bodyweight-metric-empty")).toHaveText("한 번 더 적으면 곡선이 보여요");

  // [원본] 고치기 — 펼친 채 열림 → 접고 체중만 바꿔 저장 → 체지방률 유지
  // [개선] 고치기 — 적어 둔 값이 칸에 · 비었던 골격근량은 빈 칸 → 체중만 바꿔 저장 → 체지방률 유지 · 골격근량은 여전히 없음
  await 기록_전체(page);
  const row = page.getByTestId("bodyweight-history-row").first();
  await expect(row.getByTestId("bodyweight-history-inbody")).toHaveText("체지방률 20.0%");
  await row.getByTestId("bodyweight-history-edit").click();
  const ed = page.getByTestId("bodyweight-edit-sheet");
  await expect(ed.getByTestId("weighin-pbf")).toHaveValue("20");
  // [원본] await ed.getByTestId("weighin-inbody-toggle").click();
  await expect(ed.getByTestId("weighin-smm")).toHaveValue("");
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

  // 바닥에 붙는 저장 줄(REV-096 M-1)은 포탈 기록 시트의 것 — 프로필은 바로 입력으로 바뀌어 통계 카드 「기록」에서 잰다(리뷰 L-3)
  await page.goto("/stats");
  await page.getByTestId("btn-bodyweight-card-record").click({ timeout: 20_000 });
  // [원본] const card = page.getByTestId("bodyweight-record-sheet"); … weighin-secondary 로 닫음
  // [개선] 통계도 같은 「체중」 시트 — 바로 입력의 저장 버튼이 화면 안 · 「확인」으로 닫음
  const card = page.getByTestId("bodyweight-entry");
  await card.getByTestId("weighin-pbf").fill("20");
  const cs = await card.getByTestId("weighin-save").boundingBox();
  expect(cs && cs.y + cs.height <= 640, "카드 기록 시트도 저장 버튼이 보인다").toBe(true);
  await page.getByTestId("bodyweight-history-close").click();
  await expect(page.getByTestId("bodyweight-sheet")).toHaveCount(0);
});

// 체중 한 줄(2026-11-10 사용자 요청) — 두 줄(「체중」+「기록」 버튼 · 「체중 기록 전체 n개 ›」)을 「체중 ‹최근 값› ›」 한 줄로.
//   시트 = 맨 위 바로 입력 → 지난 기록 → 미설정으로 두기. 줄·시트의 부가 설명은 없고 미설정 설명은 확인 창에만.
test("체중 한 줄 — 줄 하나 · 최근 값 · › 로 시트 · 바로 입력하면 목록·줄 값이 바로 · 설명 문구 없음 · 360px 넘침 없음 · 다크", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await 준비(page);
  await page.goto("/profile");
  const row = page.getByTestId("bodyweight");
  await expect(row).toBeVisible({ timeout: 20_000 });
  const value = page.getByTestId("bodyweight-value");

  // 줄 하나 — 옛 「기록」 버튼·「체중 기록 전체」 줄·부가 설명 없음 · 줄 전체가 누르는 자리(≥44px · ›)
  await expect(page.getByTestId("btn-bodyweight-record")).toHaveCount(0);
  await expect(page.getByTestId("row-bodyweight-history")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("체중 기록 전체");
  await expect(page.locator("main")).not.toContainText("볼륨 계산 기준");
  await expect(value).toHaveText("미설정");
  expect(await row.evaluate((el) => el.tagName)).toBe("BUTTON");
  await expect(row).toHaveAccessibleName(/^체중\s*미설정$/);
  await expect(row.locator("svg")).toHaveCount(1); // ›
  const rb = await row.boundingBox();
  expect(rb && rb.height >= 44).toBe(true);
  // 값과 › 가 제목과 한 줄
  const vb = await value.boundingBox();
  expect(rb && vb && vb.y >= rb.y && vb.y + vb.height <= rb.y + rb.height).toBe(true);

  // › → 「체중」 시트 — 기록이 없으면 바로 입력 + 「아직 기록이 없어요」 · 미설정으로 두기 없음
  await row.click();
  const sheet = page.getByTestId("bodyweight-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("dialog")).toHaveAccessibleName("체중");
  const entry = sheet.getByTestId("bodyweight-entry");
  await expect(entry.getByTestId("weighin-value")).toBeVisible();
  // 기록이 없으면 「지난 기록이 없어요 — 값을 맞춰 주세요」(출발값이 진짜 값처럼 보이지 않게 · 리뷰 L-1) — 기록이 생기면 줄이 빠진다(목록과 겹침)
  await expect(entry.getByTestId("weighin-last")).toHaveText("지난 기록이 없어요 — 값을 맞춰 주세요");
  await expect(entry.getByTestId("weighin-secondary")).toHaveCount(0); // 닫기는 시트의 「확인」 하나
  await expect(sheet.getByTestId("bodyweight-history-heading")).toHaveText("지난 기록");
  await expect(sheet.getByTestId("bodyweight-history-empty")).toHaveText("아직 기록이 없어요");
  await expect(sheet.getByTestId("btn-bodyweight-unset")).toHaveCount(0);

  // 바로 입력 → 저장 — 시트는 열린 채 · 목록 맨 위 · 뒤의 줄 값도 바로
  await entry.getByTestId("weighin-type").click();
  await entry.getByTestId("weighin-input").fill("71");
  await entry.getByTestId("weighin-input").press("Enter");
  await 바로_저장(page, false);
  // 방금 저장한 같은 값을 곧바로(2초 안) 또 누르면 줄이 늘지 않는다(두 번 누름 · 리뷰 M-3)
  await entry.getByTestId("weighin-save").click();
  await page.waitForTimeout(500);
  await expect(sheet.getByTestId("bodyweight-history-value")).toHaveText(["71.0kg"]);
  await expect(value).toHaveText("71.0kg");
  await expect(entry.getByTestId("weighin-last")).toHaveCount(0);
  // 저장 뒤 포커스는 저장 버튼(disabled 동안 body 로 빠지지 않게 · 리뷰 M-2)
  expect(await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))).toBe("weighin-save");
  await entry.getByTestId("weighin-step-p0_5").click();
  await 바로_저장(page, false);
  await expect(sheet.getByTestId("bodyweight-history-value")).toHaveText(["71.5kg", "71.0kg"]);
  await expect(value).toHaveText("71.5kg");
  // 미설정으로 두기 — 버튼 아래 설명은 없고 확인 창에만
  await expect(sheet.getByTestId("btn-bodyweight-unset")).toBeVisible();
  await expect(sheet).not.toContainText("기록은 남아요");
  await sheet.getByTestId("btn-bodyweight-unset").click();
  await expect(page.getByTestId("bodyweight-unset-confirm")).toContainText(
    "기록은 남아요. 맨몸·어시스트 볼륨은 체중 없이 계산해요",
  );
  await page.getByTestId("dialog-cancel").click();
  await expect(value).toHaveText("71.5kg");
  // 미설정으로 둔 뒤 바로 입력으로 저장하면 다시 내 체중(리뷰 L-2) · 미설정 버튼이 다시 생긴다
  await sheet.getByTestId("btn-bodyweight-unset").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(value).toHaveText("미설정");
  await expect(sheet.getByTestId("btn-bodyweight-unset")).toHaveCount(0);
  await expect(sheet.getByTestId("bodyweight-history-value")).toHaveText(["71.5kg", "71.0kg"]); // 기록은 남는다
  await entry.getByTestId("weighin-step-m0_5").click();
  await 바로_저장(page, false);
  await expect(value).toHaveText("71.0kg");
  await expect(sheet.getByTestId("btn-bodyweight-unset")).toBeVisible();

  // 360px — 문서·시트 모두 가로로 넘치지 않는다
  const over = await page.evaluate(() => {
    const dlg = document.querySelector('[data-testid="bodyweight-sheet"] [role="dialog"]') as HTMLElement;
    return {
      doc: document.documentElement.scrollWidth - window.innerWidth,
      sheet: dlg.scrollWidth - dlg.clientWidth,
      wide: [...dlg.querySelectorAll<HTMLElement>("*")]
        .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 0.5)
        .map((e) => e.getAttribute("data-testid") ?? e.tagName),
    };
  });
  expect(over).toEqual({ doc: 0, sheet: 0, wide: [] });
  await page.screenshot({ path: test.info().outputPath("light.png") });

  // 다크 — 시트 바탕이 어둡고 값 글자는 밝다(대비)
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  const lum = await page.evaluate(() => {
    const L = (c: string) => {
      const m = c.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
      return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
    };
    const dlg = document.querySelector('[data-testid="bodyweight-sheet"] [role="dialog"]') as HTMLElement;
    const v = document.querySelector('[data-testid="bodyweight-history-value"]') as HTMLElement;
    const big = document.querySelector(
      '[data-testid="bodyweight-entry"] [data-testid="weighin-value"] span',
    ) as HTMLElement;
    return {
      bg: L(getComputedStyle(dlg).backgroundColor),
      v: L(getComputedStyle(v).color),
      big: L(getComputedStyle(big).color),
    };
  });
  expect(lum.bg).toBeLessThan(0.3);
  expect(lum.v).toBeGreaterThan(0.6);
  expect(lum.big).toBeGreaterThan(0.6);
  await page.screenshot({ path: test.info().outputPath("dark.png") });
  await page.emulateMedia({ colorScheme: "light" });

  // 「확인」으로 닫고 다시 열면 그대로 · 새로고침해도 최근 값
  await page.getByTestId("bodyweight-history-close").click();
  await expect(sheet).toHaveCount(0);
  await page.reload();
  await expect(value).toHaveText("71.0kg", { timeout: 20_000 }); // 미설정 뒤 마지막으로 적은 71.0
});
