// 운동 팁 e2e(SPEC-047 · SRS-112)
//
// 확인하는 것:
//   · 운동 탭 「운동 팁」 구역 → 주제 → 팁 상세: 요점·출처 인용·안전·제휴 아님 고지·원본 링크(새 창)·챕터 시각 링크
//   · 상세에서 「‹ 목록」과 기기 뒤로가 시트를 닫지 않고 목록으로 돌아간다(스펙 리뷰 U2)
//   · 종목 상세 「관련 팁」 → 팁 상세 시트
//   · 루틴 미리보기 「시작 전」 한 줄 → 같은 시트 안에서 팁 상세 → 「‹ 루틴」으로 복귀(제목은 날마다 바뀌어 보지 않는다 · U6)
import { expect, test } from "@playwright/test";

type Page = import("@playwright/test").Page;

const WATCH = /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/;
const WATCH_AT = /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}(&t=\d+s)?$/;

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });
}

async function 상세_확인(page: Page) {
  const d = page.getByTestId("tip-detail");
  await expect(d).toBeVisible();
  await expect(page.getByTestId("tip-points").locator("li").first()).toBeVisible();
  await expect(page.getByTestId("tip-source")).toContainText("출처:");
  await expect(page.getByTestId("tip-safety")).toContainText("전문가");
  await expect(page.getByTestId("tip-disclaimer")).toContainText("제휴하거나 보증받은 내용이 아니에요");
  const link = page.getByTestId("tip-open-video");
  await expect(link).toHaveAttribute("href", WATCH);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
}

test("운동 탭 → 운동 팁 주제 → 상세(출처·고지·원본·챕터) → ‹ 목록 · 기기 뒤로 = 목록", async ({ page }) => {
  await page.goto("/");
  const section = page.getByTestId("tip-section");
  await expect(section).toBeVisible({ timeout: 20_000 });
  await expect(section).toContainText("운동 팁");
  // 주제 5개(팁 0개 주제는 숨는다 — 첫판은 다 있다)
  await expect(section.locator('[data-testid^="tip-topic-"]')).toHaveCount(5);
  await page.getByTestId("tip-topic-injury").click();

  const sheet = page.getByTestId("tip-topic-sheet");
  await expect(sheet).toBeVisible();
  const neck = page.getByTestId("tip-row-tip-neck-strength");
  await expect(neck).toBeVisible();
  await expect(neck).toContainText("출처:");
  await neck.click();
  await 상세_확인(page);
  // 사용자가 준 영상 — 챕터 링크가 그 시각으로 열린다
  await expect(page.getByTestId("tip-open-video")).toHaveAttribute(
    "href",
    "https://www.youtube.com/watch?v=zJgwAAM_tNY",
  );
  const chapters = page.getByTestId("tip-chapter");
  await expect(chapters.first()).toBeVisible();
  for (const href of await chapters.evaluateAll((els) => els.map((e) => e.getAttribute("href")))) {
    expect(href).toMatch(WATCH_AT);
  }
  await expect(chapters.nth(1)).toHaveAttribute("href", /&t=\d+s$/);
  await expect(chapters.first()).toHaveAttribute("target", "_blank");

  // ‹ 목록
  await page.getByTestId("tip-back").click();
  await expect(page.getByTestId("tip-detail")).toHaveCount(0);
  await expect(neck).toBeVisible();

  // 기기 뒤로 — 시트 전체가 아니라 목록으로
  await neck.click();
  await expect(page.getByTestId("tip-detail")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("tip-detail")).toHaveCount(0);
  await expect(page.getByTestId("tip-topic-sheet")).toBeVisible();
  // 한 번 더 뒤로 = 시트 닫기 · 밑 화면은 운동 탭 그대로(코드 리뷰 REV-089 H-1)
  await page.goBack();
  await expect(page.getByTestId("tip-topic-sheet")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("tip-section")).toBeVisible();
});

test("종목 상세 「관련 팁」 → 팁 상세 시트 · 관련 팁이 없는 종목에는 카드가 없다", async ({ page }) => {
  await page.goto("/exercise/seed-barbell-squat");
  const card = page.getByTestId("related-tips");
  await expect(card).toBeVisible({ timeout: 20_000 });
  const rows = card.getByTestId("related-tip");
  expect(await rows.count()).toBeGreaterThanOrEqual(1);
  expect(await rows.count()).toBeLessThanOrEqual(3);
  await rows.first().click();
  await expect(page.getByTestId("tip-detail-sheet")).toBeVisible();
  await 상세_확인(page);
  await page.getByTestId("tip-back").click();
  await expect(page.getByTestId("tip-detail-sheet")).toHaveCount(0);

  // 주동근이 전신뿐인 종목(러닝머신) — 일반 팁은 종목 상세에 붙이지 않아 카드 자체가 없다
  await page.goto("/exercise/seed-treadmill-running");
  await expect(page.getByText("러닝머신").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("related-tips")).toHaveCount(0);
});

test("루틴 미리보기 「시작 전」 한 줄 → 같은 시트 안 팁 상세 → ‹ 루틴 으로 복귀", async ({ page }) => {
  await 카탈로그_준비(page);
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await expect(page.getByTestId("routine-name")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("routine-name").fill("팁 확인 루틴");
  await page.getByTestId("routine-name").blur();
  for (const [i, q] of ["바벨 벤치프레스", "바벨 스쿼트"].entries()) {
    await page.getByTestId("btn-add-routine-exercise").click();
    await page.getByTestId("picker-search").fill(q);
    await page.getByTestId("picker-list").locator("button").first().click();
    await page.getByTestId("picker-confirm").click();
    await expect(page.getByTestId("routine-exercises").locator("> div")).toHaveCount(i + 1, {
      timeout: 10_000,
    });
  }
  await page.getByTestId("btn-routine-done").click();
  await expect(page.getByTestId("routine-list")).toContainText("팁 확인 루틴", { timeout: 10_000 });

  await page.getByTestId("open-routine-preview").first().click();
  const preview = page.getByTestId("routine-preview");
  await expect(page.getByTestId("routine-preview-list")).toBeVisible({ timeout: 10_000 });
  const tipLine = page.getByTestId("routine-preview-tip");
  await expect(tipLine).toBeVisible();
  await expect(tipLine).toContainText("시작 전");
  // 줄은 목록·버튼과 같은 순간에 있다 — 시작 버튼보다 위
  const lineY = (await tipLine.boundingBox())?.y ?? 0;
  const startY = (await page.getByTestId("routine-preview-start").boundingBox())?.y ?? 0;
  expect(lineY).toBeLessThan(startY);

  await tipLine.click();
  await expect(preview).toHaveCount(1); // 시트를 겹치지 않는다
  await 상세_확인(page);
  await page.getByTestId("tip-back").click();
  await expect(page.getByTestId("tip-detail")).toHaveCount(0);
  await expect(page.getByTestId("routine-preview-start")).toBeVisible();
  // 기기 뒤로 — 팁 상세만 닫고 미리보기는 남는다 · 한 번 더면 미리보기 닫기
  await tipLine.click();
  await expect(page.getByTestId("tip-detail")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("tip-detail")).toHaveCount(0);
  await expect(page.getByTestId("routine-preview-start")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("routine-preview")).toHaveCount(0);
  await expect(page.getByTestId("routine-list")).toContainText("팁 확인 루틴");
});
