// 세션 심화 e2e — app에서 옮겨 온 "운동 중에 실제로 쓰는 것들"이 도는지 본다
//
// 여기서 보는 것은 화면이 아니라 **연결**이다: 눌렀을 때 도메인·저장소의 규칙이 제대로 걸리는가.
//   · 세트를 체크하면 휴식이 시작되는가(전역 타이머)
//   · 지난 세션의 기록이 '이전' 칩으로 오고, 누르면 그대로 채워지는가
//   · PR이 뜨는가(중량·볼륨 2종)
//   · 세트 타입(워밍업)이 볼륨에서 빠지는가 — 도메인 규칙
//   · 슈퍼셋으로 묶이는가
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });
}

async function 운동_시작(page: Page, 검색: string) {
  await page.goto("/workout");
  await expect(page.getByTestId("btn-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-start").click();
  await 종목_추가(page, 검색);
}

async function 종목_추가(page: Page, 검색: string) {
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill(검색);
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("exercise-picker")).toHaveCount(0);
}

function 세트(page: Page, 블록: number, index: number) {
  return page
    .getByTestId("workout-exercises")
    .locator("> div")
    .nth(블록)
    .getByTestId("set-list")
    .locator("> div")
    .nth(index);
}

async function 세트_기록(page: Page, 블록: number, index: number, kg: number, reps: number) {
  const row = 세트(page, 블록, index);
  await row.getByTestId("set-weight").fill(String(kg));
  await row.getByTestId("set-reps").fill(String(reps));
  await row.getByTestId("set-reps").blur();
  await row.getByTestId("set-done").click();
  await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
}

test("세트를 체크하면 휴식이 시작되고, 건너뛰면 사라진다", async ({ page }) => {
  await 카탈로그_준비(page);
  await 운동_시작(page, "바벨 벤치프레스");

  // 아직 아무것도 체크하지 않았으므로 휴식 바는 없다.
  await expect(page.getByTestId("rest-bar")).toHaveCount(0);

  await 세트_기록(page, 0, 0, 60, 5);

  // 기본 휴식은 종목 설정값(120초)이다 — 체크 직후라 2:00에서 시작한다.
  const bar = page.getByTestId("rest-bar");
  await expect(bar).toBeVisible();
  await expect(bar).toContainText("휴식 ");

  // +15초를 누르면 남은 시간이 늘어난다.
  const before = await bar.innerText();
  await page.getByTestId("rest-plus").click();
  await expect(bar).not.toHaveText(before);

  await page.getByTestId("rest-skip").click();
  await expect(page.getByTestId("rest-bar")).toHaveCount(0);
});

test("워밍업 세트는 볼륨에서 빠진다 — 도메인 규칙", async ({ page }) => {
  await 카탈로그_준비(page);
  await 운동_시작(page, "바벨 스쿼트");

  await 세트_기록(page, 0, 0, 100, 10); // 1,000kg
  await expect(page.getByTestId("live-volume")).toHaveText("볼륨 1000kg");

  // 같은 세트를 워밍업으로 바꾸면 볼륨에서 빠진다(app과 같은 규칙 — 저장소가 판단한다).
  await 세트(page, 0, 0).getByTestId("set-type").click();
  await page.getByTestId("set-type-sheet").getByText("워밍업 (W)").click();
  await expect(page.getByTestId("live-volume")).toHaveText("볼륨 0kg", { timeout: 10_000 });
  await expect(세트(page, 0, 0).getByTestId("set-type")).toHaveText("W");
});

test("지난 세션의 기록이 '이전'으로 오고, 누르면 그대로 채워진다 · PR이 선다", async ({ page }) => {
  await 카탈로그_준비(page);

  // ① 한 세션을 완료해 기록을 남긴다.
  await 운동_시작(page, "데드리프트");
  await 세트_기록(page, 0, 0, 140, 3);
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toHaveText("420kg", { timeout: 15_000 });

  // ② 요약을 닫고 같은 종목으로 다시 시작하면 지난 기록이 따라온다.
  await page.getByTestId("btn-summary-close").click();
  await 운동_시작(page, "데드리프트");

  const prev = 세트(page, 0, 0).getByTestId("set-prev");
  await expect(prev).toContainText("140×3");

  // PR 칩 — 첫 세션이 곧 최고 기록이다.
  await expect(page.getByTestId("pr-chip")).toContainText("PR");

  // '이전'을 누르면 그 값이 그대로 들어온다(헬스장에서 제일 빠른 길).
  await prev.click();
  await expect(세트(page, 0, 0).getByTestId("set-weight")).toHaveValue("140");
  await expect(세트(page, 0, 0).getByTestId("set-reps")).toHaveValue("3");
});

test("두 종목을 슈퍼셋으로 묶고 풀 수 있다", async ({ page }) => {
  await 카탈로그_준비(page);
  await 운동_시작(page, "바벨 벤치프레스");
  await 종목_추가(page, "바벨 로우");
  await expect(page.getByTestId("workout-exercises").locator("> div")).toHaveCount(2);

  // 첫 종목에서 슈퍼셋 → 상대 고르기
  await page.getByTestId("workout-exercises").locator("> div").first().getByTestId("btn-superset").click();
  await page.getByTestId("superset-option").first().click();

  // 묶이면 두 종목이 한 컨테이너 안으로 들어간다.
  await expect(page.getByTestId("btn-unlink-superset")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("workout-exercises").locator("> div")).toHaveCount(1);

  await page.getByTestId("btn-unlink-superset").click();
  await expect(page.getByTestId("workout-exercises").locator("> div")).toHaveCount(2, { timeout: 10_000 });
});
