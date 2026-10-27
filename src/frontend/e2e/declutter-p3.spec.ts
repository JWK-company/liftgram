// @plm SRS-071  화면 정리 P3 — 홈·피드·칸 시트 + 결함(F1·F2·F4·F6·F7) 측정 e2e
//
// 고치기 **전** 코드에서 실패하는지 먼저 확인하고 고친다(게이트가 진짜 막는지).
//   · D8  홈 진행 중 표시는 하나(하단 막대) — 분홍 진행 카드가 없다
//   · D8  이번 주 요약은 막대 + 숫자 한 줄(카드 높이 상한)
//   · F7  빠른 운동을 마치면 이름이 부위·종목 수로 자동(「가슴·삼두 · 2종목」)
//   · D9  칸 시트: 최근 쓴 브랜드가 위 줄 · 이름 없는 커스텀 1~3 은 숨김 · 순서 브랜드 → 적재 → 기구 바꾸기
//   · F4  휴식 막대가 시트 배경(스크림) 위로 뜨지 않는다(elementFromPoint)
//   · F6  종목 탭 첫 항목이 영문 접두(「EZ바 …」)가 아니다
//   · D7·F1·F2  피드 운동 카드: 숫자 한 줄 메타 · 「운동」 배지 없음 · 버튼 2칸 한 줄 글자 · 자동 문구 없음 ·
//              + 버튼(FAB)이 마지막 카드를 가리지 않음 · 남의 운동 「바로 시작」 (두 계정)
import { expect, test } from "@playwright/test";
import {
  블록,
  빠른_운동_시작,
  세트_기록,
  안내_띠_닫기,
  칸_고르기,
  카탈로그_준비,
  종목_추가,
  마치기,
} from "./fixtures/declutter-seed";

type Page = import("@playwright/test").Page;

/** 요소 안 글자가 몇 줄로 그려졌나 — 글자 노드의 줄 상자 위치(top)를 6px 묶음으로 센다. */
async function 글자_줄수(loc: import("@playwright/test").Locator): Promise<number> {
  return loc.evaluate((el) => {
    const tops: number[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim()) continue;
      const r = document.createRange();
      r.selectNodeContents(n);
      for (const rect of Array.from(r.getClientRects())) {
        if (rect.width < 1) continue;
        if (!tops.some((t) => Math.abs(t - rect.top) < 6)) tops.push(rect.top);
      }
    }
    return tops.length;
  });
}

test("D8 — 홈의 진행 중 표시는 하단 막대 하나(진행 카드 없음) · 이번 주 요약은 한 줄", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await 빠른_운동_시작(page);
  await page.goto("/");
  await expect(page.getByTestId("global-workout-bar")).toBeVisible({ timeout: 20_000 });
  // 진행 중을 알리는 것은 막대 하나뿐
  await expect(page.getByTestId("resume-card")).toHaveCount(0);
  // 이번 주 요약 — 막대 + 숫자 한 줄(예전 카드는 KPI 3칸 줄까지 ≈ 170px)
  const h = await page.getByTestId("week-summary").evaluate((el) => el.getBoundingClientRect().height);
  expect(h).toBeLessThanOrEqual(96);
});

test("F7 — 빠른 운동은 마치면 부위·종목 수로 이름이 붙는다", async ({ page }) => {
  test.setTimeout(180_000);
  await 카탈로그_준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 세트_기록(page, 0, 0, 60, 10);
  await 종목_추가(page, "케이블 푸시다운");
  await 세트_기록(page, 1, 0, 25, 12);
  await 마치기(page);
  // 홈 최근 운동 — 「빠른 운동」 대신 「가슴·삼두 · 2종목」
  const recent = page.getByTestId("recent-workouts");
  await expect(recent).toBeVisible({ timeout: 20_000 });
  await expect(recent).toContainText("가슴·삼두 · 2종목");
  await expect(recent).not.toContainText("빠른 운동");
});

test("D9 — 칸 시트: 최근 브랜드 위 줄 · 이름 없는 커스텀 숨김 · 브랜드 → 적재 → 기구 바꾸기", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  // 지난 기록 — 머신 체스트 프레스를 테크노짐으로 한 번
  await 빠른_운동_시작(page);
  await 종목_추가(page, "머신 체스트 프레스");
  await 칸_고르기(page, 0, ["slot-brand-technogym"]);
  await 세트_기록(page, 0, 0, 40, 10);
  await 마치기(page);

  await 빠른_운동_시작(page);
  await 종목_추가(page, "머신 체스트 프레스");
  await 안내_띠_닫기(page);
  await page.getByTestId("variant-trigger").first().click();
  const sheet = page.getByTestId("variant-sheet");
  await expect(sheet).toBeVisible();
  // 최근 쓴 브랜드 줄에 테크노짐
  await expect(sheet.getByTestId("slot-brand-recent")).toContainText("테크노짐");
  // 이름을 붙이지 않은 커스텀 슬롯은 숨김
  for (const k of ["custom1", "custom2", "custom3"])
    await expect(sheet.getByTestId(`slot-brand-${k}`)).toHaveCount(0);
  // 순서: 브랜드 → 적재 → 기구 바꾸기
  const y = async (id: string) => (await sheet.getByTestId(id).boundingBox())?.y ?? -1;
  const brandY = await y("slot-brand");
  const loadY = await y("slot-load");
  const swapY = await y("swap-equipment");
  expect(brandY).toBeGreaterThanOrEqual(0);
  expect(loadY).toBeGreaterThan(brandY);
  expect(swapY).toBeGreaterThan(loadY);
});

test("F4 — 칸 시트를 열면 휴식 막대가 시트 배경 위로 뜨지 않는다", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "머신 체스트 프레스");
  await 안내_띠_닫기(page);
  await 세트_기록(page, 0, 0, 40, 10);
  await expect(page.getByTestId("rest-bar")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("variant-trigger").first().click();
  await expect(page.getByTestId("variant-sheet")).toBeVisible();
  const onTop = await page.getByTestId("rest-bar").evaluate((bar) => {
    const r = bar.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && bar.contains(hit);
  });
  expect(onTop).toBe(false);
});

test("F6 — 종목 탭 첫 항목은 영문 접두(EZ바 …)가 아니다", async ({ page }) => {
  await 카탈로그_준비(page);
  const first = page.getByTestId("exercise-list").locator("> li").first().locator("span.truncate").first();
  await expect(first).toBeVisible({ timeout: 20_000 });
  const name = (await first.innerText()).trim();
  expect(/^[A-Za-z]/.test(name), `첫 항목: ${name}`).toBe(false);
});

// ── 피드(두 계정) ─────────────────────────────────────────────────────────────
async function 가입(page: Page, 접두: string, 이름: string) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(`e2e-${접두}-${Date.now()}@example.com`);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill(이름);
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

test("D7·F1·F2 — 피드 운동 카드: 한 줄 메타·배지 없음·2칸 버튼(글자 안 꺾임)·자동 문구 없음·FAB 안 가림 · 바로 시작", async ({
  page: author,
  browser,
}) => {
  test.setTimeout(300_000);
  const 이름 = `정리${Date.now().toString(36)}`;
  // ① 올리는 사람 — 운동을 마치고 한마디 없이 공유
  await 가입(author, "dcp3-a", 이름);
  await 카탈로그_준비(author);
  await 빠른_운동_시작(author);
  await 종목_추가(author, "바벨 데드리프트");
  await 세트_기록(author, 0, 0, 100, 5);
  await 종목_추가(author, "덤벨 컬");
  await 세트_기록(author, 1, 0, 12, 10);
  await author.getByTestId("btn-complete").click();
  await author.getByTestId("dialog-confirm").click();
  await expect(author.getByTestId("summary-volume")).toBeVisible({ timeout: 15_000 });
  const skip = author.getByTestId("btn-finish-dont-save");
  if (await skip.isVisible()) await skip.click();
  await expect(author.getByTestId("btn-summary-share")).toBeEnabled({ timeout: 20_000 });
  await author.getByTestId("btn-summary-share").click();
  await expect(author.getByTestId("share-workout")).toBeVisible({ timeout: 20_000 });
  await author.getByTestId("btn-share-workout").click();
  await expect(author.getByTestId("btn-summary-share")).toBeDisabled({ timeout: 20_000 });

  // ② 보는 사람 — 다른 기기(새 컨텍스트) · 좁은 폰(360×640)
  const base = process.env.BASE ?? "http://127.0.0.1:3100";
  const other = await browser.newContext({
    baseURL: base,
    viewport: { width: 360, height: 640 },
    storageState: {
      cookies: [],
      origins: [{ origin: base, localStorage: [{ name: "onboarding_seen_v1", value: "yes" }] }],
    },
  });
  const page = await other.newPage();
  await 가입(page, "dcp3-b", "보는사람");
  await 카탈로그_준비(page);
  await page.goto("/feed");
  await page.getByTestId("feed-discover").click();
  await page.getByTestId("discover-query").fill(이름);
  await expect(page.getByTestId("discover-list")).toContainText(이름, { timeout: 20_000 });
  await page.getByTestId("discover-follow").first().click();
  await expect(page.getByTestId("discover-follow").first()).toHaveText("팔로잉", { timeout: 20_000 });
  await page.goto("/feed");
  const card = page.getByTestId("post-workout").first();
  await expect(card).toBeVisible({ timeout: 20_000 });

  // 숫자 한 줄 메타
  const meta = card.getByTestId("post-workout-meta");
  await expect(meta).toBeVisible();
  expect(await 글자_줄수(meta)).toBeLessThanOrEqual(1);
  // 「운동」 배지 없음 · 자동 문구(「운동 완료! …」) 없음
  await expect(page.getByTestId("feed-list").getByText("운동 완료", { exact: false })).toHaveCount(0);
  const header = page.getByTestId("post-author").first().locator("xpath=..");
  await expect(header.getByText("운동", { exact: true })).toHaveCount(0);
  // 버튼 2칸 — 같은 줄, 글자가 한 줄
  const start = card.getByTestId("post-start-now");
  const imp = card.getByTestId("post-routine-import");
  const [sb, ib] = [await start.boundingBox(), await imp.boundingBox()];
  expect(sb && ib).toBeTruthy();
  if (sb && ib) expect(Math.abs(sb.y - ib.y)).toBeLessThan(2);
  for (const b of [start, imp]) expect(await 글자_줄수(b)).toBe(1);
  // FAB 가 마지막 카드의 발(좋아요 줄)을 가리지 않는다 — 맨 아래까지 내린 상태
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const fab = await page.getByTestId("feed-compose").boundingBox();
  const like = await page.getByTestId("post-like").last().boundingBox();
  expect(fab && like).toBeTruthy();
  if (fab && like) {
    const overlap = !(
      like.y + like.height <= fab.y ||
      fab.y + fab.height <= like.y ||
      like.x + like.width <= fab.x ||
      fab.x + fab.width <= like.x
    );
    const footerBottom = like.y + like.height;
    expect(overlap, "FAB 가 좋아요 줄과 겹침").toBe(false);
    expect(footerBottom).toBeLessThanOrEqual(fab.y);
  }
  // 바로 시작 — 그 구성으로 운동이 시작된다
  await page.evaluate(() => window.scrollTo(0, 0));
  await start.click();
  await expect(page).toHaveURL(/\/workout/, { timeout: 20_000 });
  await expect(page.getByTestId("workout-exercises").locator("> div")).toHaveCount(2, { timeout: 15_000 });
  await expect(블록(page, 0).getByTestId("we-name")).toHaveText("바벨 데드리프트");
  await other.close();
});
