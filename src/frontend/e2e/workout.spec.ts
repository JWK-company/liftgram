// 운동 세션 e2e — 이 스택에서 처음으로 **쓰는 기능**이 도는지 본다
//
// 확인하는 것: 시작 → 종목 추가 → 세트 기록 → 완료의 한 바퀴가 **로컬에서** 돌고,
// 그 과정에서 app과 같은 도메인 규칙이 적용되는가(볼륨은 done인 세트만 · PR은 완료 시 확정).
// 규칙 자체는 core의 단위테스트 154건이 이미 본다 — 여기서는 화면이 그 규칙에 제대로 붙었는지만 본다.
import { expect, test } from "@playwright/test";

/** 카탈로그가 로컬에 있어야 종목을 고를 수 있다. 첫 방문에서 그것부터 끝낸다. */
async function 카탈로그_준비(page: import("@playwright/test").Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });
}

/** 빈 운동을 시작하고 종목 하나를 넣는다. */
async function 운동_시작(page: import("@playwright/test").Page, 종목검색: string) {
  await page.goto("/workout");
  await expect(page.getByTestId("btn-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-start").click();

  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill(종목검색);
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("workout-exercises").locator("> div")).toHaveCount(1);
}

/**
 * 세트 한 줄에 무게·횟수를 넣고 완료로 체크한다.
 *
 * 값은 **blur에서 저장**된다(입력 중 매 글자마다 쓰지 않는다) — 그래서 체크 전에 포커스를 뺀다.
 * 체크는 화면 입력값을 함께 넘기므로 커밋이 늦어도 볼륨·PR은 옳게 나온다.
 */
async function 세트_기록(
  page: import("@playwright/test").Page,
  index: number,
  weightKg: number,
  reps: number,
) {
  const row = page.getByTestId("set-list").locator("> div").nth(index);
  await row.getByTestId("set-weight").fill(String(weightKg));
  await row.getByTestId("set-reps").fill(String(reps));
  await row.getByTestId("set-reps").blur();
  await row.getByTestId("set-done").click();
  await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
}

test("운동 한 바퀴 — 시작·종목 추가·세트 기록·완료", async ({ page }) => {
  await 카탈로그_준비(page);
  await 운동_시작(page, "바벨 벤치프레스");

  // 종목을 넣으면 세트가 **미리 깔린다**(지난 세션 세트 수만큼 · 처음이면 1개).
  // 체크만 하면 되도록 하는 것이 app의 동작이고, 저장소가 그대로 해 준다.
  await expect(page.getByTestId("set-list").locator("> div")).toHaveCount(1);
  // 아직 체크하지 않았으므로 볼륨은 0이다 — 볼륨은 done인 세트만 센다(도메인 규칙).
  await expect(page.getByTestId("live-volume")).toHaveText("볼륨 0kg");

  // 100kg × 10 = 1,000kg. 체크한 뒤에야 볼륨에 들어간다(도메인 규칙).
  await 세트_기록(page, 0, 100, 10);
  await expect(page.getByTestId("live-volume")).toHaveText("볼륨 1000kg");

  // 두 번째 세트까지 하면 2,000kg.
  await page.getByTestId("btn-add-set").click();
  await 세트_기록(page, 1, 100, 10);
  await expect(page.getByTestId("live-volume")).toHaveText("볼륨 2000kg");

  // 완료 — 되돌릴 수 없으므로 확인창을 거친다(app의 Alert 자리).
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toHaveText("2000kg", { timeout: 15_000 });
  await expect(page.getByTestId("summary-sets")).toHaveText("2");

  // 첫 운동이라 중량·볼륨 PR이 선다(도메인이 인정하는 PR은 이 2종뿐이다).
  await expect(page.getByTestId("summary-prs")).not.toHaveText("0");
  await expect(page.getByTestId("summary-pr-list")).toContainText("벤치프레스");
});

test("진행 중인 운동은 새로고침해도 이어진다", async ({ page }) => {
  await 카탈로그_준비(page);
  await 운동_시작(page, "스쿼트");

  await 세트_기록(page, 0, 60, 5);
  await expect(page.getByTestId("live-volume")).toHaveText("볼륨 300kg");

  // 기록 직후 새로고침 — 로컬에 확실히 내려썼다면 그대로 이어져야 한다.
  // (LokiJS는 비동기로 내려쓰기 때문에 flush를 걸어 두지 않으면 여기서 사라진다)
  await page.reload();
  await expect(page.getByTestId("live-volume")).toHaveText("볼륨 300kg", { timeout: 20_000 });
  await expect(page.getByTestId("workout-exercises").locator("> div")).toHaveCount(1);
});

test("네트워크가 끊겨도 운동을 기록할 수 있다", async ({ page, context }) => {
  await 카탈로그_준비(page);

  // 헬스장 지하 — 서버로 가는 길을 막는다. 기록은 전부 로컬이라 그대로 돌아야 한다(SRS-006).
  await context.route("**/api/**", (route) => route.abort());

  await 운동_시작(page, "데드리프트");
  await 세트_기록(page, 0, 140, 3);
  await expect(page.getByTestId("live-volume")).toHaveText("볼륨 420kg");

  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toHaveText("420kg", { timeout: 15_000 });
});
