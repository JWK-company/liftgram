// 화면 정리 P2 — 요약·기록 상세·분석 측정(SRS-070 수용 기준). 보고서 기준선: 요약 PR 8줄(종목 이름 반복) ·
// 추정 1RM 빨강 · 「Epley …」 주석 종목마다 · 「한쪽 ×2」 배지 세트마다 · 빈 RPE 열 · lb 종목 1RM 이 kg · 분석 「추정치」 태그 7개.
//
// 여기서 재는 것 — 모두 옛 코드(v0.39.0)에서 실패하는 것을 먼저 확인했다:
//   · 요약: PR 은 따로 줄을 갖지 않고 종목 줄 오른쪽 금색 「PR n」(D5) — `summary-pr-list` 안 줄 수 = 종목 수
//   · 요약: 브랜드 빨강은 주 버튼 「완료」에만(1RM 은 회색 보조 글자) · 공유 한마디 입력은 공유 시트 안
//   · 요약·기록 상세: lb 로 기록한 종목의 1RM 이 lb(F5)
//   · 기록 상세: 「한쪽 입력(볼륨 ×2)」 은 종목 머리에 한 번 · 기록하지 않은 RPE 열 숨김 · 추정 주석은 화면에 한 번(D6)
//   · 분석: 「추정치」 태그 0 · 같은 종목이 「추정 1RM」 과 「최근 PR」 두 곳에 겹쳐 나오지 않는다
import { expect, test } from "@playwright/test";
import {
  마치기,
  빠른_운동_시작,
  세트_기록,
  안내_띠_닫기,
  요약_재료,
  요약에서_멈추기,
  종목_추가,
  칸_고르기,
  카탈로그_준비,
} from "./fixtures/declutter-seed";

type Page = import("@playwright/test").Page;

/** 범위 안 브랜드 빨강(글자·배경) 요소의 testid/태그 — 「완료」 주 버튼은 뺀다. */
async function 빨강(page: Page, scope: string): Promise<string[]> {
  return page.getByTestId(scope).evaluate((root) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-brand)";
    document.body.appendChild(probe);
    const brand = getComputedStyle(probe).color;
    probe.remove();
    const out: string[] = [];
    for (const el of Array.from(root.querySelectorAll("*"))) {
      if (el.closest('[data-testid="btn-summary-close"]')) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const ownText = Array.from(el.childNodes).some((x) => x.nodeType === 3 && (x.textContent ?? "").trim());
      if ((ownText && cs.color === brand) || cs.backgroundColor === brand)
        out.push(
          (el as HTMLElement).dataset?.testid ??
            `${el.tagName.toLowerCase()}:${el.textContent?.slice(0, 12)}`,
        );
    }
    return out;
  });
}

test("요약 — PR 은 종목 줄에 합치고, 1RM 은 회색·입력 단위, 공유 한마디는 시트 안", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await 요약_재료(page);

  const list = page.getByTestId("summary-pr-list");
  await expect(list).toContainText("벤치프레스", { timeout: 15_000 });
  // 종목 3개 → 줄 3개(옛: PR 6줄 — 종목 × 중량·볼륨)
  await expect(list.getByTestId("summary-row")).toHaveCount(3);
  await expect(page.getByTestId("summary-row-pr")).toHaveCount(3);
  await expect(page.getByTestId("summary-row-pr").first()).toContainText("PR 2");

  // lb 종목(덤벨 플라이)의 1RM 은 lb
  const fly = list.getByTestId("summary-row").filter({ hasText: "덤벨 플라이" });
  await expect(fly.getByTestId("summary-row-1rm")).toContainText("lb");

  // 빨강은 「완료」 뿐
  expect(await 빨강(page, "summary-body")).toEqual([]);

  // 공유 한마디는 처음에 보이지 않는다 — 「공유」 를 누르면 시트 안에
  await expect(page.getByTestId("share-caption")).toHaveCount(0);
  await page.getByTestId("btn-summary-share").click();
  await expect(page.getByTestId("share-caption")).toBeVisible();
});

test("기록 상세 — 한쪽 입력은 머리에 한 번, 빈 RPE 열·반복 주석 없음, lb 1RM", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await 요약_재료(page);
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

  await page.goto("/history");
  await page.getByTestId("history-list").locator("a").first().click();
  await expect(page.getByTestId("detail-exercises")).toBeVisible({ timeout: 20_000 });
  const ex = page.getByTestId("detail-exercises");

  // 한쪽 입력 표시는 3세트짜리 종목에 한 번(옛: 세트마다 배지 3)
  await expect(ex.getByTestId("detail-set-oneside")).toHaveCount(1);
  await expect(ex.getByTestId("detail-set-oneside")).toContainText("×2");
  // RPE 를 하나도 적지 않았으니 RPE 열이 없다
  await expect(ex.getByText("RPE", { exact: true })).toHaveCount(0);
  // 추정 주석은 화면에 한 번(옛: 종목마다 3)
  await expect(page.getByText("Epley 공식 기반 추정치 · 실측값 아님")).toHaveCount(1);
  // lb 종목 1RM 은 lb
  const flyCard = ex.locator("> *").filter({ hasText: "덤벨 플라이" });
  await expect(flyCard.getByTestId("detail-1rm")).toContainText("lb");
});

test("분석 — 「추정치」 태그 없음 · 같은 종목이 1RM·최근 PR 에 겹치지 않음", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await 요약_재료(page);
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

  await page.goto("/stats");
  await expect(page.getByTestId("stat-volume")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("추정치", { exact: true })).toHaveCount(0);
  const names = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        '[data-testid="stats-1rm"] a, [data-testid="stats-recent-prs"] li, [data-testid="stats-recent-prs"] > *',
      ),
    )
      .map((el) => (el.textContent ?? "").replace(/\s+/g, " "))
      .filter(Boolean),
  );
  for (const n of ["덤벨 플라이", "머신 체스트 프레스", "바벨 벤치프레스"]) {
    expect(names.filter((x) => x.includes(n)).length, n).toBeLessThanOrEqual(1);
  }
});

// ── P2 /qa code 보강 ─────────────────────────────────────────────────────────

test("요약 — 같은 종목·다른 칸 두 블록이면 줄이 나뉘고 PR 이 제 줄에 · 합 = 머리 PR 수 (H-1)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "케이블 푸시다운");
  await 칸_고르기(page, 0, ["slot-attach-rope"]);
  await 세트_기록(page, 0, 0, 25, 12);
  await 종목_추가(page, "케이블 푸시다운");
  await 칸_고르기(page, 1, ["slot-attach-straight"]);
  await 세트_기록(page, 1, 0, 30, 10);
  await 안내_띠_닫기(page);
  await 요약에서_멈추기(page);

  const rows = page.getByTestId("summary-pr-list").getByTestId("summary-row");
  await expect(rows).toHaveCount(2, { timeout: 15_000 });
  // 두 줄 모두 칸 이름으로 구분되고, 둘 다 자기 PR 을 단다(첫 기록 → 중량·볼륨 2개씩)
  await expect(rows.nth(0).getByTestId("summary-row-slot")).toBeVisible();
  await expect(rows.nth(1).getByTestId("summary-row-slot")).toBeVisible();
  await expect(page.getByTestId("summary-row-pr")).toHaveCount(2);
  const counts = await page
    .getByTestId("summary-row-pr")
    .evaluateAll((els) => els.map((e) => Number((e.textContent ?? "").replace(/\D+/g, "")) || 0));
  const head = Number(await page.getByTestId("summary-prs").textContent());
  expect(counts.reduce((a, b) => a + b, 0)).toBe(head);
  expect(head).toBe(4);
});

test("요약 — 「PR n」 을 누르면 무엇을 얼마로 깼는지 · lb 블록 표시 · 360폭 1RM 안 잘림 (M-2·M-3·M-5)", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 360, height: 640 });
  await 카탈로그_준비(page);
  await 요약_재료(page);
  const list = page.getByTestId("summary-pr-list");
  const fly = list.getByTestId("summary-row").filter({ hasText: "덤벨 플라이" });
  await expect(fly.getByTestId("summary-row-lb")).toBeVisible({ timeout: 15_000 });

  // 기본은 접힘 → 누르면 값이 펼쳐진다(중량 PR 은 lb 그대로)
  await expect(fly.getByTestId("summary-row-pr-detail")).toHaveCount(0);
  await fly.getByTestId("summary-row-pr").click();
  await expect(fly.getByTestId("summary-row-pr")).toHaveAttribute("aria-expanded", "true");
  await expect(fly.getByTestId("summary-row-pr-detail")).toContainText("35lb");
  await fly.getByTestId("summary-row-pr").click();
  await expect(fly.getByTestId("summary-row-pr-detail")).toHaveCount(0);

  // 1RM 조각이 말줄임 뒤로 숨지 않는다 — 줄마다 1RM 이 줄 상자 안에 보인다
  const hidden = await list.getByTestId("summary-row").evaluateAll((rows) =>
    rows
      .map((r) => {
        const orm = r.querySelector('[data-testid="summary-row-1rm"]');
        if (!orm) return null;
        const a = orm.getBoundingClientRect();
        const b = r.getBoundingClientRect();
        const parent = orm.parentElement as HTMLElement;
        const clipped = parent.scrollWidth > parent.clientWidth + 1 || a.right > b.right + 1;
        return clipped ? (r.textContent ?? "").slice(0, 20) : null;
      })
      .filter(Boolean),
  );
  expect(hidden).toEqual([]);
});

test("요약 — 올리는 중에는 공유 시트를 닫았다 열어 두 번 올릴 수 없다 (M-1)", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await 요약_재료(page);
  await expect(page.getByTestId("btn-summary-share")).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId("btn-summary-share").click();
  await expect(page.getByTestId("share-sheet")).toBeVisible();
  // 로그인하지 않은 기기 — 올리기는 막히지만, 시트를 닫고 다시 열어도 적던 한마디가 남는다(L-1)
  await page.getByTestId("share-caption").fill("오늘 좋았다");
  await page
    .getByTestId("share-sheet")
    .locator("xpath=..")
    .locator('button[aria-label="닫기"]')
    .first()
    .click();
  await expect(page.getByTestId("share-sheet")).toHaveCount(0);
  await page.getByTestId("btn-summary-share").click();
  await expect(page.getByTestId("share-caption")).toHaveValue("오늘 좋았다");
});

test("분석 — 상위 1RM 밖 종목은 「최근 PR」 에 종목당 한 줄 · 상위 종목은 겹치지 않음 (M-7)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await 요약_재료(page);
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  // 1RM 이 가장 작은 네 번째 종목을 두 번 갱신한다 → 상위 3 밖 · PR 이력 2건
  for (const kg of [5, 6]) {
    await 빠른_운동_시작(page);
    await 종목_추가(page, "덤벨 레터럴 레이즈");
    await 세트_기록(page, 0, 0, kg, 10);
    await 마치기(page);
  }
  await page.goto("/stats");
  await expect(page.getByTestId("stat-volume")).toBeVisible({ timeout: 20_000 });
  const recent = page.getByTestId("stats-recent-prs");
  await expect(recent).toBeVisible({ timeout: 15_000 });
  await expect(recent.getByText("덤벨 레터럴 레이즈")).toHaveCount(1);
  for (const n of ["머신 체스트 프레스", "바벨 벤치프레스"]) {
    await expect(recent.getByText(n)).toHaveCount(0);
    await expect(page.getByTestId("stats-1rm").getByText(n)).toHaveCount(1);
  }
});
