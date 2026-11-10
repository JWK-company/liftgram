// 프로필 e2e — 설정이 **다른 화면의 계산까지 바꾸는지** 본다
//
// 프로필은 값을 저장하는 화면이 아니라, 저장한 값이 세션·분석의 숫자를 바꾸는 화면이다.
// 그래서 여기서는 "저장됐다"가 아니라 "다른 화면이 그 값을 쓴다"를 확인한다.
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });
}

// [원본] 「단위를 lb로 바꾸면 세션의 무게 표기가 따라간다」 — 프로필 단위 선택이 없어졌다(2026-10-27 · SRS-067 Q3 A).
// 한 헬스장에 kg·lb 기구가 섞여 있어 단위는 운동 블록마다 토글한다 → e2e/unit-toggle.spec.ts.
test("프로필에 단위가 없고, 세션의 무게 표기는 블록 토글을 따라간다", async ({ page }) => {
  await 카탈로그_준비(page);

  await page.goto("/profile");
  // [원본] bar-weight — 플레이트 계산과 함께 봉 무게 줄을 뺐다(SPEC-023)
  await expect(page.getByTestId("theme")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("bar-weight")).toHaveCount(0);
  await expect(page.getByTestId("unit")).toHaveCount(0);

  // 세션을 열면 기본 kg — 블록의 lb 를 누르면 무게 컬럼이 lb 로 바뀐다(저장은 계속 kg — 표시만 바뀐다).
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click(); // 전체 화면 피커 — 골라서 「N개 추가」(SRS-093)

  await expect(page.getByTestId("workout-exercises")).toContainText("무게 (kg)", { timeout: 20_000 });
  await page.getByTestId("unit-toggle-lb").click();
  await expect(page.getByTestId("workout-exercises")).toContainText("무게 (lb)", { timeout: 20_000 });
});

test("체중을 넣으면 세션의 '체중 미설정' 경고가 사라진다", async ({ page }) => {
  await 카탈로그_준비(page);

  // 어시스트 종목(체중 기준이 필요한 종목)을 담은 세션을 연다.
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill("어시스트 풀업");
  const first = page.getByTestId("picker-list").locator("button").first();
  if ((await first.count()) === 0) test.skip(true, "어시스트 종목이 카탈로그에 없다");
  await first.click();
  await page.getByTestId("picker-confirm").click(); // 전체 화면 피커 — 골라서 「N개 추가」(SRS-093)

  await expect(page.getByTestId("workout-exercises")).toContainText("체중 미설정", { timeout: 20_000 });

  // 체중을 넣는다 — 「기록」 시트에서 직접 입력한다(스테퍼 → 이력 기록 · SRS-077 U-9).
  await page.goto("/profile");
  await expect(page.getByTestId("bodyweight")).toBeVisible({ timeout: 20_000 });
  // [원본] 스테퍼의 값을 눌러 직접 입력 — bodyweight-value 클릭 → bodyweight-input 70 → Enter
  // [원본] await page.getByTestId("btn-bodyweight-record").click(); — 체중 한 줄(2026-11-10): 「체중」 줄 → 시트 맨 위 바로 입력
  await page.getByTestId("bodyweight").click();
  await page.getByTestId("weighin-type").click();
  await page.getByTestId("weighin-input").fill("70");
  await page.getByTestId("weighin-input").press("Enter");
  await page.getByTestId("weighin-save").click();
  await expect(page.getByTestId("bodyweight-value")).toHaveText("70.0kg");

  await page.goto("/workout");
  await expect(page.getByTestId("workout-exercises")).not.toContainText("체중 미설정", { timeout: 20_000 });
});

test("장비함에 담은 장비가 남는다 — 새로고침해도", async ({ page }) => {
  await page.goto("/gear");
  await expect(page.getByTestId("gear-all")).toBeVisible({ timeout: 20_000 });

  // 목록에서 첫 장비를 담는다.
  const first = page.getByTestId("gear-all").locator("button").first();
  const label = (await first.innerText()).trim();
  await first.click();
  await expect(first).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.getByTestId("gear-all").locator("button").first()).toHaveAttribute(
    "aria-pressed",
    "true",
    { timeout: 20_000 },
  );
  // 담은 것은 위쪽 "저장된" 목록에도 뜬다.
  await expect(page.locator("body")).toContainText(label);
});

// 2026-11-04 실기기 — 「커스텀 기구 이름이 업데이트·재시작마다 사라진다」
// 원인: 입력칸이 user 를 읽기 전 첫 그림에서 한 번만 값을 잡아 빈 칸으로 굳고, 그 빈 칸을 blur 가 저장해 실제로 지웠다.
test("커스텀 기구 이름이 남는다 — 새로고침해도 칸에 보이고, 빈 칸을 눌렀다 나와도 지워지지 않는다 · 연달아 고치고 바로 닫아도 둘 다 저장", async ({
  page,
}) => {
  // 실행마다 다른 값 — 지난 실행이 남긴 값으로 거짓 통과하지 않게(REV-020 #4)
  const tag = String(Date.now()).slice(-6);
  const A = `포커스${tag}`;
  const B = `해머${tag}`;
  await page.goto("/profile");
  await page.getByTestId("row-machine-labels").click({ timeout: 20_000 });
  const f0 = page.getByTestId("machine-label-0");
  await expect(f0).not.toHaveValue(A);
  await f0.fill(A);
  await f0.blur();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("machine-sheet")).toHaveCount(0);

  // 새로고침(= 앱 재시작·업데이트) — 첫 그림이 user 읽기 전이어도 칸에 저장값이 보여야 한다
  await page.reload();
  await page.getByTestId("row-machine-labels").click({ timeout: 20_000 });
  await expect(page.getByTestId("machine-label-0")).toHaveValue(A, { timeout: 10_000 });

  // 다른 칸을 눌렀다 빠져나오기만 — 저장값이 지워지지 않는다
  await page.getByTestId("machine-label-1").focus();
  await page.getByTestId("machine-label-1").blur();
  await page.reload();
  await page.getByTestId("row-machine-labels").click({ timeout: 20_000 });
  await expect(page.getByTestId("machine-label-0")).toHaveValue(A, { timeout: 10_000 });

  // 경합 — 칸 0 을 고치고 칸 1 로 옮겨(blur 저장 시작) 칸 1 을 고친 뒤 곧바로 닫는다 → 둘 다 남는다(REV-020 H-1)
  await page.getByTestId("machine-label-0").fill(`${A}x`);
  await page.getByTestId("machine-label-1").fill(B);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("machine-sheet")).toHaveCount(0);
  // 닫자마자 다시 열어도 편집이 보인다(옛 값으로 되돌리지 않음 · REV-020 M-2)
  await page.getByTestId("row-machine-labels").click();
  await expect(page.getByTestId("machine-label-1")).toHaveValue(B);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("machine-sheet")).toHaveCount(0);
  await page.waitForTimeout(800); // 줄 선 저장이 기기 DB 에 내려써질 시간
  await page.reload();
  await page.getByTestId("row-machine-labels").click({ timeout: 20_000 });
  await expect(page.getByTestId("machine-label-0")).toHaveValue(`${A}x`, { timeout: 10_000 });
  await expect(page.getByTestId("machine-label-1")).toHaveValue(B);
});
