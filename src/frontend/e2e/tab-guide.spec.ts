// 탭별 ? 사용법 안내 e2e(SPEC-058)
//   · 운동·기록·분석·피드 머리 오른쪽에 ? · 안 본 탭이면 점(e2e 억제 표식이 있으면 없음) · 자동으로 뜨지 않음
//   · 실제 화면 짚기: 링이 대상 위 · 짚은 실제 버튼을 눌러도 화면이 안 바뀜(누름 차단)
//   · 연습 블록 9종: 해내면 「잘했어요」 · 연습 중 /api 쓰기 요청 0건
//   · 닫기: ×·Esc·뒤로·마치기 → ? 로 초점 복귀 · 360px 넘침 없음 · 프로필에 「안내 다시 보기」 없음
import { expect, type Page, test } from "@playwright/test";

function freshEmail(tag: string): string {
  return `e2e-guide-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}
async function 가입(page: Page, email: string, name: string) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill(name);
  await page.getByTestId("age-confirm").check();
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

const overlay = (page: Page) => page.getByTestId("guide-overlay");
const 다음 = (page: Page) => page.getByTestId("guide-next").click();

async function 단계로(page: Page, title: string) {
  for (let n = 0; n < 30; n++) {
    if ((await page.getByTestId("guide-step-title").textContent()) === title) return;
    await 다음(page);
  }
  throw new Error(`단계를 못 찾음: ${title}`);
}

async function 넘침_없음(page: Page) {
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
}

test("운동 탭 ? — 점 · 짚기 · 누름 차단 · 연습 9종 · 쓰기 0건 · 닫기", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  const btn = page.getByTestId("guide-workout");
  await expect(btn).toBeVisible({ timeout: 20_000 });
  // e2e 기본(첫 안내 억제)에서는 점이 없다 · 자동으로 뜨지 않는다
  await expect(btn.locator("span")).toHaveCount(0);
  await expect(overlay(page)).toHaveCount(0);

  // 억제 표식이 없으면 안 본 탭에 점 → 열면 사라진다
  await page.evaluate(() => localStorage.removeItem("liftgram.hint.suppressed"));
  await page.reload();
  await expect(btn.locator("span")).toHaveCount(1, { timeout: 20_000 });
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await btn.click();
  await expect(overlay(page)).toBeVisible();
  await expect(btn.locator("span")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("liftgram.guide.workout"))).toBe("seen");

  // 짚기 — 빠른 운동 시작 위 링 · 눌러도 운동이 시작되지 않는다
  await 단계로(page, "빠른 운동 시작");
  await expect(overlay(page)).toHaveAttribute("data-spot", "btn-quick-start");
  const ring = await page.getByTestId("guide-ring").boundingBox();
  const target = await page.getByTestId("btn-quick-start").boundingBox();
  expect(ring && target).toBeTruthy();
  if (ring && target) {
    expect(ring.x).toBeLessThanOrEqual(target.x);
    expect(ring.y).toBeLessThanOrEqual(target.y);
    expect(ring.x + ring.width).toBeGreaterThanOrEqual(target.x + target.width);
    await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
  }
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/$/);
  await expect(overlay(page)).toBeVisible();

  // 연습 — 쓰기 요청을 센다
  const writes: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/") && r.method() !== "GET") writes.push(`${r.method()} ${r.url()}`);
  });
  const 잘했어요 = page.getByTestId("guide-practice-done");

  await 단계로(page, "이전 값 채우기");
  await page.getByTestId("practice-prev").click();
  await expect(잘했어요).toHaveText(/잘했어요/);
  await 넘침_없음(page);

  await 다음(page);
  await page.getByTestId("practice-set-number").click();
  await page.getByTestId("practice-type-warmup").click();
  await expect(page.getByTestId("practice-set-number")).toHaveText("W");
  await expect(잘했어요).toHaveText(/잘했어요/);

  await 다음(page);
  await page.getByTestId("practice-scheme").click();
  await page.getByTestId("practice-scheme-topBackoff").click();
  await expect(page.getByTestId("practice-scheme-rows")).toHaveAttribute("data-scheme", "topBackoff");
  await expect(잘했어요).toHaveText(/잘했어요/);

  await 다음(page);
  await page.getByTestId("practice-variant").click();
  await page.getByTestId("practice-combo-rope").click();
  await expect(page.getByTestId("practice-variant-prev")).toHaveText("–");
  await expect(잘했어요).toHaveText(/잘했어요/);

  await 다음(page);
  await page.getByTestId("practice-check").click();
  await expect(page.getByTestId("practice-rest")).toBeVisible();
  await expect(잘했어요).toHaveText(/잘했어요/);

  // 슈퍼세트 — 짧게는 묶음 전체(해냄 아님), 길게는 이 종목만(해냄)
  await 다음(page);
  const ss = page.getByTestId("practice-ss-check");
  await ss.click();
  await expect(page.getByTestId("practice-ss-b")).toHaveAttribute("data-done", "1");
  await expect(잘했어요).toHaveText("");
  await page.getByTestId("practice-ss-reset").click();
  const box = await ss.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
  }
  await expect(page.getByTestId("practice-ss-a")).toHaveAttribute("data-done", "1");
  await expect(page.getByTestId("practice-ss-b")).toHaveAttribute("data-done", "0");
  await expect(잘했어요).toHaveText(/잘했어요/);

  await 다음(page);
  await page.getByTestId("practice-rir").click();
  await page.getByTestId("practice-rir-2").click();
  await expect(잘했어요).toHaveText(/잘했어요/);

  await 다음(page);
  await page.getByTestId("practice-pr").click();
  await expect(잘했어요).toHaveText(/잘했어요/);

  await 다음(page);
  await page.getByTestId("practice-plate").click();
  await expect(page.getByTestId("practice-plate-calc")).toContainText("40kg");
  await expect(잘했어요).toHaveText(/잘했어요/);
  await 넘침_없음(page);

  expect(writes, writes.join("\n")).toHaveLength(0);

  // 마지막 단계 — 마치기로 닫히고 ? 로 초점
  await expect(page.getByTestId("guide-next")).toHaveText("마치기");
  await 다음(page);
  await expect(overlay(page)).toHaveCount(0);
  await expect(btn).toBeFocused();
  await expect(page).toHaveURL(/\/$/);
});

test("슈퍼세트 연습 — 키보드로 길게 누르기(Enter 0.5초)", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("guide-workout").click();
  await 단계로(page, "슈퍼세트 — 길게 눌러 이 종목만");
  const ss = page.getByTestId("practice-ss-check");
  await ss.focus();
  await page.keyboard.down("Enter");
  await page.waitForTimeout(700);
  await page.keyboard.up("Enter");
  await expect(page.getByTestId("practice-ss-a")).toHaveAttribute("data-done", "1");
  await expect(page.getByTestId("practice-ss-b")).toHaveAttribute("data-done", "0");
  await expect(page.getByTestId("guide-practice-done")).toHaveText(/잘했어요/);
});

test("닫기 — × · Esc · 뒤로 가기(화면은 그대로)", async ({ page }) => {
  await page.goto("/");
  const btn = page.getByTestId("guide-workout");
  await btn.click();
  await page.getByTestId("guide-close").click();
  await expect(overlay(page)).toHaveCount(0);
  await expect(btn).toBeFocused();

  await btn.click();
  await expect(overlay(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overlay(page)).toHaveCount(0);

  await btn.click();
  await expect(overlay(page)).toBeVisible();
  await page.goBack();
  await expect(overlay(page)).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

test("기록·분석 탭 ? — 첫 단계가 실제 화면을 짚는다", async ({ page }) => {
  for (const [path, tab, spot] of [
    ["/history", "records", "records-view"],
    ["/calendar", "records", "records-view"],
    ["/stats", "stats", "stats-period"],
  ] as const) {
    await page.goto(path);
    const btn = page.getByTestId(`guide-${tab}`);
    await expect(btn).toBeVisible({ timeout: 20_000 });
    await btn.click();
    await expect(overlay(page)).toHaveAttribute("data-spot", spot);
    await expect(page.getByTestId("guide-step-count")).toContainText("1 /");
    await page.keyboard.press("Escape");
    await expect(overlay(page)).toHaveCount(0);
  }
});

test("피드 ? — 로그인 뒤 머리 맨 오른쪽 · 360px 한 줄 · 추천/팔로잉을 짚는다", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await 가입(page, freshEmail("feed"), "안내");
  await page.goto("/feed");
  const ids = ["feed-explore", "feed-people", "feed-messages", "feed-notifications", "guide-feed"];
  await expect(page.getByTestId("guide-feed")).toBeVisible({ timeout: 20_000 });
  const title = await page.getByTestId("screen-title").boundingBox();
  let prevRight = (title?.x ?? 0) + (title?.width ?? 0);
  for (const id of ids) {
    const b = await page.getByTestId(id).boundingBox();
    expect(b, id).toBeTruthy();
    if (!b || !title) continue;
    expect(Math.abs(b.y + b.height / 2 - (title.y + title.height / 2)), id).toBeLessThan(6);
    expect(b.x, id).toBeGreaterThanOrEqual(prevRight - 1);
    expect(b.height, id).toBeGreaterThanOrEqual(44);
    prevRight = b.x + b.width;
  }
  expect(prevRight).toBeLessThanOrEqual(360);
  await 넘침_없음(page);
  await page.getByTestId("guide-feed").click();
  await expect(overlay(page)).toHaveAttribute("data-spot", "feed-tabs");
});

test("프로필 — 「안내 다시 보기」 줄이 없다", async ({ page }) => {
  await page.goto("/profile");
  await expect(page.getByTestId("screen-title")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("row-hints-reset")).toHaveCount(0);
});
