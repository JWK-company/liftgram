// 화면 정리(SRS-069~072) 측정·캡처용 시드 — 실제로 쓰는 모습에 가깝게 기록을 채운다.
//
// 로그인 없이 기기 안 저장소만으로 채운다(운동 기록은 로컬이 정본 — ADR-002). 같은 테스트 안에서 부르면 된다.
//   · 케이블 푸시다운: 로프로 한 번, 일자바로 한 번 → 지난 조합·다른 조합·PR·이전 기록이 다 있는 블록
//   · 머신 체스트 프레스: 플레이트 + 한쪽 입력 → 「한쪽」 표 머리
//   · 바벨 벤치프레스: 기본 칸 → 슈퍼셋·순서 화살표 재료
import { expect } from "@playwright/test";

type Page = import("@playwright/test").Page;

export async function 카탈로그_준비(page: Page): Promise<void> {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
}

export async function 빠른_운동_시작(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await expect(page.getByTestId("btn-add-exercise")).toBeVisible({ timeout: 15_000 });
}

export async function 종목_추가(page: Page, 이름: string): Promise<void> {
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill(이름);
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("exercise-picker")).toHaveCount(0);
  await expect(page.getByTestId("we-name").filter({ hasText: 이름 }).first()).toBeVisible({
    timeout: 15_000,
  });
}

/** n번째 블록(0부터) */
export function 블록(page: Page, n = 0) {
  return page.getByTestId("workout-exercises").locator("> div").nth(n);
}

export async function 세트_기록(page: Page, n: number, i: number, kg: number, reps: number): Promise<void> {
  const row = page.getByTestId("set-list").nth(n).locator("> div").nth(i);
  await row.getByTestId("set-weight").fill(String(kg));
  await row.getByTestId("set-reps").fill(String(reps));
  await row.getByTestId("set-reps").blur();
  await row.getByTestId("set-done").click();
  await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
}

export async function 칸_고르기(page: Page, n: number, testIds: string[]): Promise<void> {
  await page.getByTestId("variant-trigger").nth(n).click();
  await expect(page.getByTestId("variant-sheet")).toBeVisible();
  for (const id of testIds) await page.getByTestId(id).click();
  await page
    .getByTestId("variant-sheet")
    .locator("xpath=..")
    .locator('button[aria-label="닫기"]')
    .click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId("variant-sheet")).toHaveCount(0);
}

export async function 마치기(page: Page): Promise<void> {
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 15_000 });
  for (const id of ["btn-finish-dont-save", "btn-finish-today"]) {
    const b = page.getByTestId(id);
    if (await b.isVisible()) await b.click();
  }
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

/**
 * 지난 기록 두 번을 남긴다 — 케이블 푸시다운(로프 → 일자바) + 바벨 벤치프레스.
 * 끝나면 홈. 다음 운동에서 푸시다운 블록은 지난 조합(일자바)·다른 조합(로프)·PR·이전 기록을 모두 가진다.
 */
export async function 지난_기록_채우기(page: Page): Promise<void> {
  await 빠른_운동_시작(page);
  await 종목_추가(page, "케이블 푸시다운");
  await 칸_고르기(page, 0, ["slot-attach-rope"]);
  await 세트_기록(page, 0, 0, 25, 12);
  await 종목_추가(page, "바벨 벤치프레스");
  await 세트_기록(page, 1, 0, 60, 10);
  await 마치기(page);

  await 빠른_운동_시작(page);
  await 종목_추가(page, "케이블 푸시다운");
  await 칸_고르기(page, 0, ["slot-attach-straight"]);
  await 세트_기록(page, 0, 0, 35, 10);
  await 마치기(page);
}

/** 측정·캡처용 운동 화면 — 푸시다운(정보가 가장 많은 블록) + 벤치프레스(순서 화살표가 생긴다). 끝나면 운동 화면. */
export async function 붐비는_운동_화면(page: Page): Promise<void> {
  await 빠른_운동_시작(page);
  await 종목_추가(page, "케이블 푸시다운");
  await 종목_추가(page, "바벨 벤치프레스");
  // 로그인하지 않은 기기라 위에 「이 기기에만 저장」 안내가 뜬다 — 실제 사용자(로그인)는 보지 않는 띠라 닫고 잰다.
  const later = page.getByTestId("sync-localonly-banner").getByRole("button", { name: "나중에" });
  if (await later.isVisible()) await later.click();
  // 첫 블록에 이전 기록·PR 이 왔는지(시드가 들어갔는지)
  await expect(
    page.getByTestId("set-list").first().locator("> div").first().getByTestId("set-prev"),
  ).toContainText("35", { timeout: 15_000 });
}
