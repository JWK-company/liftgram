// @plm SRS-091  크리에이터 루틴 e2e — 주제 → 버전 → 출처·고지·원본 링크 → 저장(이름에 채널명 없음 · 메모에 출처 · 세트×횟수)
import { expect, type Page, test } from "@playwright/test";
import { 내려쓰기_대기 } from "./helpers/opengym";

async function 카탈로그_준비(page: Page) {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });
}

test("어깨깡패 → 버전 하나 저장 — 출처 인용·제휴 아님 고지·원본 링크·루틴 메모·세트 수", async ({ page }) => {
  await 카탈로그_준비(page);
  await page.goto("/");

  const topic = page.getByTestId("concept-topic-boulder-shoulders");
  await expect(topic).toBeVisible({ timeout: 20_000 });
  await expect(topic).toContainText("영상 루틴");
  await topic.click();

  const sheet = page.getByTestId("creator-topic-sheet");
  await expect(sheet).toBeVisible();
  const first = sheet.locator('[data-testid^="creator-version-"]').first();
  const label = (await first.locator("span").first().innerText()).trim();
  await first.click();

  const v = page.getByTestId("creator-sheet");
  await expect(v).toBeVisible();
  await expect(page.getByTestId("creator-source")).toContainText("출처:");
  await expect(page.getByTestId("creator-disclaimer")).toContainText("제휴하거나 보증받은 루틴이 아니에요");
  const link = page.getByTestId("creator-open-video");
  await expect(link).toHaveAttribute("href", /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  const source = (await page.getByTestId("creator-source").innerText()).trim();
  const channel = source.replace(/^출처:\s*/, "").split(" · ")[0];

  // ‹ 목록 으로 돌아갔다가 다시(한 시트 안에서 단계 전환)
  await page.getByTestId("creator-back").click();
  await expect(page.getByTestId("creator-topic-sheet")).toBeVisible();
  await first.click();
  await expect(page.getByTestId("creator-sheet")).toBeVisible();

  const items = page.locator('[data-testid^="creator-item-"]');
  const firstSets = Number((await items.first().locator("span").nth(1).innerText()).split("×")[0]);
  await page.getByTestId("creator-save").click();

  const list = page.getByTestId("routine-list");
  await expect(list).toContainText(label, { timeout: 20_000 });
  await expect(list).not.toContainText(channel);

  // 루틴 편집기: 메모에 출처 · 첫 종목 세트 수(세션 프리필이 아니라 편집기 기준 — qa L-1)
  // 새로 불러오기 전에 LokiJS 가 디스크에 내려쓸 시간을 준다(메모리 「LokiJS 비동기 flush」)
  await 내려쓰기_대기(page);
  const tid = await list.locator("[data-testid^=routine-]").first().getAttribute("data-testid");
  await page.goto(`/routines/${(tid ?? "").replace("routine-", "")}`);
  await expect(page.getByTestId("routine-notes")).toHaveValue(/youtube\.com\/watch\?v=/, { timeout: 20_000 });
  await expect(page.getByTestId("routine-notes")).toHaveValue(
    new RegExp(channel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
  );
  await expect(page.getByTestId("re-sets").first()).toContainText(String(firstSets));
});

test("여러 날 버전(3대 5×5 A·B) — 날마다 루틴 · 다시 저장하면 중복 확인 · 확인 연타에도 한 벌만 더 (qa code M-2)", async ({
  page,
}) => {
  await 카탈로그_준비(page);
  await page.goto("/");
  const open = async () => {
    await page.getByTestId("concept-topic-big3-500").click();
    await page.getByTestId("creator-version-cr-big3-5x5").click();
    await expect(page.getByTestId("creator-sheet")).toBeVisible();
    await expect(page.getByTestId("creator-save")).toBeEnabled({ timeout: 10_000 });
  };
  await open();
  await page.getByTestId("creator-save").click();
  const list = page.getByTestId("routine-list");
  await expect(list).toContainText("3대 5×5 — A", { timeout: 20_000 });
  await expect(list).toContainText("3대 5×5 — B");
  const rows = list.locator("[data-testid^=routine-]");
  await expect(rows).toHaveCount(2);

  await open();
  await page.getByTestId("creator-save").click();
  const dupe = page.getByTestId("creator-dupe");
  await expect(dupe).toBeVisible();
  const confirm = dupe.getByRole("button", { name: "저장" });
  await confirm.click({ clickCount: 3 });
  await expect(rows).toHaveCount(4, { timeout: 20_000 });
  await page.waitForTimeout(1500);
  await expect(rows).toHaveCount(4);
});

test("분석 자료 근거가 있는 버전(씨범) — 근거 링크·문구", async ({ page }) => {
  await 카탈로그_준비(page);
  await page.goto("/");
  await page.getByTestId("concept-topic-boulder-shoulders").click();
  await page.getByTestId("creator-version-cr-shoulders-olympia").click();
  const basis = page.getByTestId("creator-basis");
  await expect(basis).toContainText("Fitness Volt");
  await expect(basis).toHaveAttribute("href", /^https:\/\/fitnessvolt\.com\//);
  await expect(basis).toHaveAttribute("target", "_blank");
  await expect(page.getByTestId("creator-source")).toContainText("Chris Bumstead");
  await expect(page.getByTestId("creator-open-video")).toHaveAttribute(
    "href",
    "https://www.youtube.com/watch?v=hpvAcZtNcPY",
  );
});
