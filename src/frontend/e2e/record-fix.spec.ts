// SPEC-044 · SRS-109 잘못 적은 기록 바로잡기 e2e
//
// 확인하는 것:
//   · 운동 중 — 지난 2회 60×8 뒤 132×8 을 체크하면 「확인 필요」 칩(시트는 스스로 뜨지 않는다) → 칩 → 「lb로 적었어요 → 59.9kg」 → 되돌리기 토스트
//   · 완료 요약 — 확인 필요가 남은 채 끝내면 카드 · 「제대로 적었어요」 → 「처리함」으로 접힌다
//   · 기록 상세 — 확인 필요 줄 표시 · 누르면 고치기 시트 위 확인 패널 · 종목 ⋯ 단위 바꾸기(예시 확인창 · 되돌리기)
import { expect, test } from "@playwright/test";
import {
  블록,
  빠른_운동_시작,
  세트_기록,
  마치기,
  요약에서_멈추기,
  종목_추가,
  카탈로그_준비,
} from "./fixtures/declutter-seed";

const 종목 = "바벨 벤치프레스";

async function 평소_두_번(page: import("@playwright/test").Page) {
  for (let k = 0; k < 2; k++) {
    await 빠른_운동_시작(page);
    await 종목_추가(page, 종목);
    await 세트_기록(page, 0, 0, 60, 8);
    await 마치기(page);
  }
}

test("운동 중 확인 필요 칩 → lb 로 바로잡기 → 되돌리기 · 완료 요약 카드 · 기록 상세 확인 패널과 단위 바꾸기", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await 카탈로그_준비(page);
  await 평소_두_번(page);

  // ① 운동 중 — 132×8 체크 → 칩만(시트 없음)
  await 빠른_운동_시작(page);
  await 종목_추가(page, 종목);
  await 세트_기록(page, 0, 0, 132, 8);
  const 칩 = 블록(page, 0).getByTestId("set-check-chip");
  await expect(칩).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("check-sheet")).toHaveCount(0);
  await expect(블록(page, 0).getByTestId("set-rep-result")).toHaveCount(0); // 목표 결과를 보이지 않는다
  await 칩.click();
  await expect(page.getByTestId("check-sheet")).toBeVisible();
  await expect(page.getByTestId("check-as-lb")).toContainText("59.9");
  await page.getByTestId("check-as-lb").click();
  await expect(page.getByTestId("check-sheet")).toHaveCount(0);
  await expect(칩).toHaveCount(0, { timeout: 10_000 });
  await expect(블록(page, 0).getByTestId("set-weight").first()).toHaveValue(/^59\.87/);
  // 되돌리기 — 132 와 칩이 돌아온다
  await page.getByTestId("check-undo").click();
  await expect(블록(page, 0).getByTestId("set-weight").first()).toHaveValue("132", { timeout: 10_000 });
  await expect(칩).toBeVisible({ timeout: 10_000 });

  // ② 완료 요약 — 남은 확인 필요가 카드로 · 「제대로 적었어요」 → 처리함 · PR 이 다시 선다
  await 요약에서_멈추기(page);
  await expect(page.getByTestId("check-list")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("summary-prs")).toHaveText("0");
  await page.getByTestId("check-row").first().click();
  await page.getByTestId("check-confirm").click();
  await expect(page.getByTestId("check-row-handled")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("summary-prs")).not.toHaveText("0", { timeout: 10_000 });
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

  // ③ 하나 더 — 이번엔 확인하지 않고 끝낸다 → 기록 상세
  await 빠른_운동_시작(page);
  await 종목_추가(page, 종목);
  await 세트_기록(page, 0, 0, 300, 8);
  await expect(블록(page, 0).getByTestId("set-check-chip")).toBeVisible({ timeout: 15_000 });
  await 마치기(page);
  await page.goto("/history");
  await page.getByTestId("history-list").locator("a").first().click();
  const 줄 = page.getByTestId("detail-set").first();
  await expect(줄.getByTestId("detail-set-check")).toBeVisible({ timeout: 15_000 });
  await expect(줄).toHaveAttribute("aria-label", /확인 필요/);
  await 줄.click();
  await expect(page.getByTestId("edit-set-sheet").getByTestId("check-panel")).toBeVisible();
  await page.getByTestId("edit-set-sheet").getByTestId("check-confirm").click();
  await expect(page.getByTestId("edit-set-sheet")).toHaveCount(0);
  await expect(page.getByTestId("detail-set").first().getByTestId("detail-set-check")).toHaveCount(0, {
    timeout: 10_000,
  });

  // 종목 ⋯ → lb 로 적은 기록이에요 → 예시 확인창 → 바꾸면 300lb · 되돌리기로 300kg
  await page.getByTestId("detail-ex-menu").first().click();
  await page.getByTestId("detail-ex-unit").click();
  await expect(page.getByTestId("confirm-unit")).toContainText("300");
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("detail-set").first()).toContainText("300lb", { timeout: 10_000 });
  await page.getByTestId("unit-undo").click();
  await expect(page.getByTestId("detail-set").first()).toContainText("300kg", { timeout: 10_000 });

  // 세트 추가 — 저장할 때 생긴다
  const n = await page.getByTestId("detail-set").count();
  await page.getByTestId("detail-ex-menu").first().click();
  await page.getByTestId("detail-ex-add-set").click();
  await expect(page.getByTestId("edit-set-sheet")).toBeVisible();
  await page.getByTestId("edit-set-weight").fill("60");
  await page.getByTestId("edit-set-reps").fill("5");
  await page.getByTestId("edit-set-save").click();
  await expect(page.getByTestId("detail-set")).toHaveCount(n + 1, { timeout: 10_000 });
});
