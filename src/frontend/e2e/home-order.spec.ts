// 운동 탭 순서(2026-11-05 사용자 지시): 주간 스케줄 → 이번 주 목표 → 시작 버튼 → 내 루틴 → 프로 루틴 → 최근 운동 기록
import { expect, type Locator, test } from "@playwright/test";

async function top(l: Locator) {
  const box = await l.boundingBox();
  if (!box) throw new Error("화면에 없음");
  return box.y;
}

test("운동 탭 순서 · 더 해 보기·프로그램 생성·헬스장 줄이 없다", async ({ page }) => {
  await page.goto("/");
  const schedule = page.getByTestId("entry-schedule");
  await expect(schedule).toBeVisible({ timeout: 20_000 });
  const week = page.getByTestId("week-summary");
  const start = page.getByTestId("btn-new-routine");
  const mine = page.getByText("내 루틴", { exact: true }).first();
  const pro = page.getByTestId("concept-topic-pro-shoulders");
  await expect(pro).toBeVisible({ timeout: 20_000 });

  const ys = [await top(schedule), await top(week), await top(start), await top(mine), await top(pro)];
  expect(ys).toEqual([...ys].sort((a, b) => a - b));

  await expect(page.getByText("더 해 보기")).toHaveCount(0);
  await expect(page.getByTestId("btn-program")).toHaveCount(0);
  await expect(page.getByTestId("btn-gyms")).toHaveCount(0);
});
