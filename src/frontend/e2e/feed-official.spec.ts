// 공식 예시 글(ADR-060 · SPEC-039) — 추천이 먼저 · 스토리는 두 탭 모두 · 배지·AI 고지 · 루틴 가져오기.
// scripts/seed-official-feed.mjs 를 적용한 서버에서만 돈다(FEED_SEEDED=1).
import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { 내려쓰기_대기 } from "./helpers/opengym";

const posts: { caption: string; aiNotice: string; routine?: string }[] = JSON.parse(
  readFileSync(new URL("../../scripts/feed-seed/posts.json", import.meta.url), "utf8"),
);

test.skip(!process.env.FEED_SEEDED, "공식 글을 넣은 서버에서만 돈다");

async function 가입(page: Page) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(`official-${Date.now()}@example.com`);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill("새 회원");
  await page.getByTestId("age-confirm").check();
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

// 목록을 끝까지 내려 모든 공식 글을 불러온다.
async function 전부_불러오기(page: Page) {
  const badges = page.getByTestId("post-official");
  for (let i = 0; i < 12 && (await badges.count()) < posts.length; i++) {
    await page.mouse.wheel(0, 6000);
    await page.waitForTimeout(500);
  }
  await expect(badges).toHaveCount(posts.length);
}

test("글마다 배지·AI 고지 · 루틴 칸 수 · 사진이 실제로 내려온다", async ({ page }) => {
  await 가입(page);
  await page.goto("/feed");
  await 전부_불러오기(page);
  await expect(page.getByTestId("post-ai-notice")).toHaveCount(posts.length);
  const virtual = posts.filter((p) => p.aiNotice === "virtual_person").length;
  await expect(page.getByTestId("post-ai-notice").filter({ hasText: "가상인물" })).toHaveCount(virtual);
  await expect(page.getByTestId("post-routine")).toHaveCount(posts.filter((p) => p.routine).length);

  // 지연 로딩이라 화면 밖 사진은 불러오기 전일 수 있다 — 주소마다 직접 받아 본다.
  const srcs = await page
    .getByTestId("post-image")
    .evaluateAll((els) =>
      els.map((e) => (e instanceof HTMLImageElement ? e : e.querySelector("img"))?.src ?? ""),
    );
  expect(srcs.filter(Boolean).length).toBeGreaterThanOrEqual(posts.length);
  for (const src of srcs.filter(Boolean)) {
    const res = await page.request.get(src);
    expect(res.status(), src).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/");
  }
});

// 카탈로그를 미리 받지 않는다 — 가입하고 바로 피드에서 눌러도 종목이 빠지면 안 된다.
test("글의 「루틴 가져오기」 → 출처·고지 확인 → 저장 → 내 루틴에 전 종목이 들어가고 이름에 실명이 없다", async ({
  page,
}) => {
  await 가입(page);
  await page.goto("/feed");
  await 전부_불러오기(page);

  const card = page.getByTestId("post-routine").first();
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText("제휴");
  await expect(card.getByTestId("post-routine-video")).toHaveAttribute(
    "href",
    /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/,
  );
  const label = (await card.locator("span span").first().innerText()).trim();
  await card.getByTestId("post-routine-import").click();

  const sheet = page.getByTestId("creator-sheet");
  await expect(sheet).toBeVisible();
  await expect(page.getByTestId("creator-source")).toContainText("출처:");
  await expect(page.getByTestId("creator-disclaimer")).toContainText("제휴");
  const source = (await page.getByTestId("creator-source").innerText()).trim();
  const channel = source.replace(/^출처:\s*/, "").split(" · ")[0];
  await expect(page.getByTestId("creator-save")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("creator-save").click();
  await expect(sheet).toBeHidden({ timeout: 20_000 });

  await 내려쓰기_대기(page);
  await page.goto("/");
  const list = page.getByTestId("routine-list");
  await expect(list).toContainText(label, { timeout: 20_000 });
  for (const part of channel.match(/^(.+)\((.+)\)$/)?.slice(1) ?? [channel]) {
    await expect(list).not.toContainText(part);
  }
  // 맨 위 글의 루틴은 5종이다(posts.json · cr-bg-fb-five)
  expect(posts.find((p) => p.routine)?.routine).toBe("cr-bg-fb-five");
  const tid = await list.locator("[data-testid^=routine-]").first().getAttribute("data-testid");
  await page.goto(`/routines/${(tid ?? "").replace("routine-", "")}`);
  await expect(page.getByTestId("set-table")).toHaveCount(5, { timeout: 20_000 });
});

test("글에 붙은 루틴은 전부 시트가 열리고 저장할 수 있는 상태다", async ({ page }) => {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });
  await 가입(page);
  await page.goto("/feed");
  await 전부_불러오기(page);
  const cards = page.getByTestId("post-routine");
  const n = await cards.count();
  expect(n).toBe(posts.filter((p) => p.routine).length);
  for (let i = 0; i < n; i++) {
    await cards.nth(i).getByTestId("post-routine-import").click();
    await expect(page.getByTestId("creator-sheet")).toBeVisible();
    await expect(page.getByTestId("creator-save")).toBeEnabled({ timeout: 10_000 });
    await page.getByTestId("creator-back").click();
    await expect(page.getByTestId("creator-sheet")).toBeHidden();
  }
});
