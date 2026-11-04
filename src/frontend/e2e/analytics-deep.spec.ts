// 분석 탭 심화 분석(SRS-101 · ADR-051) — 한 페이지 · 코치 보내기 없음 · 무료.
// 과거 기록은 브라우저 시계를 옮겨 실제 운동 화면으로 남긴다.
import { expect, test } from "@playwright/test";
import { 마치기, 빠른_운동_시작, 세트_기록, 종목_추가, 준비 } from "./helpers/opengym";

type Page = import("@playwright/test").Page;

const DAY = 86_400_000;
const NOW = Date.now();

async function 운동(page: Page, daysAgo: number, 줄: [string, number][]) {
  await page.clock.setFixedTime(new Date(NOW - daysAgo * DAY));
  await 빠른_운동_시작(page);
  for (const [i, [이름, kg]] of 줄.entries()) {
    await 종목_추가(page, 이름);
    await 세트_기록(page, i, 0, kg, 5);
  }
  await 마치기(page);
  await page.goto("/");
}

/** "rgb(…)" 또는 "color(srgb r g b)" → 0~255 */
function 색(s: string): number[] {
  const srgb = s.match(/color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)/);
  if (srgb) return srgb.slice(1, 4).map((v) => Number(v) * 255);
  return (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
}
function 대비(a: number[], b: number[]): number {
  const L = (c: number[]) => {
    const [r, g, bl] = c.map((v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [L(a), L(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

async function 표_확인(page: Page) {
  // 칸 안에서 넘쳐 옆 칸을 덮지 않는다(표 자체는 table-fixed 라 늘 맞으므로 칸마다 잰다)
  const over = await page
    .getByTestId("stats-weekly")
    .locator("thead th, td")
    .evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 0.5).map((e) => e.textContent));
  expect(over).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const cells = await page.getByTestId("weekly-cell").evaluateAll((els) =>
    els
      .filter((e) => (e as HTMLElement).style.backgroundColor)
      .map((e) => {
        const c = getComputedStyle(e);
        return [c.color, c.backgroundColor];
      }),
  );
  expect(cells.length).toBeGreaterThan(0);
  for (const [fg, bg] of cells) expect(대비(색(fg), 색(bg)), `${fg} / ${bg}`).toBeGreaterThanOrEqual(4.5);
}

test("심화 분석이 분석 탭 한 페이지에 있고, 입구·코치 보내기·잠금이 없다", async ({ page }) => {
  test.setTimeout(420_000);
  await page.setViewportSize({ width: 360, height: 800 });
  await 준비(page);

  // 벤치: 8주 전 최고 뒤 3회 더 낮게 → 그대로인 종목 / 스쿼트: 오름 / 데드: 내림(최근 두 번)
  await 운동(page, 56, [["바벨 벤치프레스", 100]]);
  await 운동(page, 29, [["바벨 벤치프레스", 90]]);
  await 운동(page, 20, [
    ["바벨 벤치프레스", 90],
    ["바벨 스쿼트", 100],
    ["바벨 로우", 120],
  ]);
  await 운동(page, 3, [
    ["바벨 벤치프레스", 90],
    ["바벨 스쿼트", 110],
    ["바벨 로우", 110],
  ]);

  await page.clock.setFixedTime(new Date(NOW));
  await page.goto("/stats");
  await page.getByTestId("period-month").click();
  await expect(page.getByTestId("stat-volume")).toBeVisible({ timeout: 20_000 });

  // 없어진 것
  await expect(page.getByTestId("stats-summary-entry")).toHaveCount(0);
  await expect(page.getByText("코치에게 보내기")).toHaveCount(0);
  await expect(page.getByText("서포터")).toHaveCount(0);

  // 오른·내린 종목(Epley: 100×5 = 116.7 → 110×5 = 128.3)
  const up = page.getByTestId("stats-changes-up");
  await expect(up).toContainText("바벨 스쿼트", { timeout: 20_000 });
  await expect(up.getByTestId("change-values")).toContainText("→");
  await expect(up).toContainText("▲ 10.0%");
  const down = page.getByTestId("stats-changes-down");
  await expect(down).toContainText("바벨 로우");
  await expect(down).toContainText("▼ 8.3%");

  // 그대로인 종목
  const plateau = page.getByTestId("stats-plateaus");
  await expect(plateau).toContainText("바벨 벤치프레스");
  await expect(plateau).toContainText("8주 전 최고 · 그 뒤 3회");

  // 주간 세트 표: 3일 전 주(또는 이번 주)에 가슴 1세트 이상, 8칸
  const chest = page.getByTestId("weekly-row-chest");
  await expect(chest.getByTestId("weekly-cell")).toHaveCount(8);
  await 표_확인(page);
  await page.screenshot({ path: test.info().outputPath("light.png"), fullPage: true });

  // 다크
  await page.emulateMedia({ colorScheme: "dark" });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await 표_확인(page);
  await page.screenshot({ path: test.info().outputPath("dark.png"), fullPage: true });
  await page.emulateMedia({ colorScheme: "light" });

  // 기간을 바꾸면 종목 변화가 따라온다 — 「주」에는 두 번 한 종목이 없다
  await page.getByTestId("period-week").click();
  await expect(page.getByTestId("stats-changes-empty")).toHaveText("이 기간에 두 번 이상 한 종목이 없어요");
  await expect(page.getByTestId("stat-sessions-delta")).toHaveCount(0); // 직전 7일에 기록 없음

  // 직전 대비 — 「월」: 이번 30일 3회, 직전 30일 1회
  await page.getByTestId("period-month").click();
  await expect(page.getByTestId("stat-sessions-delta")).toHaveText("▲ 2");

  // 이번 주에 쉬어도 기간과 무관한 카드는 보인다
  await page.clock.setFixedTime(new Date(NOW + 10 * DAY));
  await page.goto("/stats");
  await expect(page.getByTestId("stats-plateaus")).toBeVisible({ timeout: 20_000 }); // 데이터를 다 받은 뒤
  await expect(page.getByTestId("stat-volume")).toHaveCount(0);
  await expect(page.getByTestId("stats-weekly")).toBeVisible();
  await page.clock.setFixedTime(new Date(NOW));

  // 옛 주소
  await page.goto("/stats/summary");
  await expect(page).toHaveURL(/\/stats$/, { timeout: 20_000 });
});
