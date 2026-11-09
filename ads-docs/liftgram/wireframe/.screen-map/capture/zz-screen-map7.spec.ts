// 화면 지도 보고서 캡처 — 7단계(11-09): 흐름이 바뀌어 앞 단계에서 막히는 시트. SHOTS=<폴더> BASE=…
import { expect, test, type Page } from "@playwright/test";
import { 가입, 빠른_운동_시작, 세트_기록, 안내_띠_닫기, 종목_추가, 새_메일, 준비 } from "./helpers/opengym";

const OUT = process.env.SHOTS as string;
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5, locale: "ko-KR" });
const f = (id: string) => id.replace(/[^\w.-]/g, "_");
async function shot(page: Page, id: string) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${f(id)}.jpg`, type: "jpeg", quality: 72 });
}
async function tryShot(page: Page, id: string, run: () => Promise<unknown>) {
  try { await run(); await shot(page, id); console.log("ok", id); } catch (e) { console.log("실패", id, String(e).split("\n")[0].slice(0, 120)); }
}

test("흐름 바뀐 시트", async ({ page }) => {
  test.setTimeout(600_000);
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 20_000 });
  // 루틴 하나 — 편집기 세트 ⋯ 메뉴
  await page.goto("/");
  await page.getByTestId("btn-new-routine").click();
  await page.getByTestId("routine-name").fill("가슴 A");
  await page.getByTestId("routine-name").blur();
  await page.getByTestId("btn-add-routine-exercise").click();
  await page.getByTestId("picker-search").fill("바벨 벤치프레스");
  await page.getByTestId("picker-list").locator("button").first().click();
  await page.getByTestId("picker-confirm").click();
  // s.rxmenu 는 루틴 편집에 없다(코칭 처방 편집에서만) — 여기서 찍지 않는다
  await page.getByTestId("btn-routine-done").click();
  await expect(page.getByTestId("routine-list")).toContainText("가슴 A", { timeout: 10_000 });
  // 운동 중에 루틴 시작 → 「진행 중인 운동이 있어요」
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 스쿼트");
  await 세트_기록(page, 0, 0, 60, 8);
  await page.goto("/");
  await 안내_띠_닫기(page).catch(() => {});
  await tryShot(page, "s.active", () => page.getByTestId("btn-start-routine").first().click({ timeout: 8_000 }));
  await page.keyboard.press("Escape");
  // 루틴 아닌 운동을 마치면 「루틴으로 저장할까요?」
  await page.goto("/workout");
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await tryShot(page, "s.finname", () => expect(page.getByTestId("btn-finish-dont-save")).toBeVisible({ timeout: 15_000 }));
  // 내 글 메뉴 — 가입하고 글 하나
  const a = 새_메일("sm7");
  await 가입(page, a, "시연 사용자"); await 준비(page);
  await page.goto("/feed"); await page.getByTestId("feed-compose").click();
  await page.getByTestId("feed-caption").fill("오늘 가슴 운동 끝 #가슴운동"); await page.getByTestId("feed-post").click();
  await page.waitForTimeout(1500);
  const mine = async () => {
    await page.goto("/feed");
    const tab = page.getByTestId("feed-tabs").getByText("팔로잉");
    if (await tab.count()) await tab.click();
    await page.getByTestId("post-menu").first().click({ timeout: 10_000 });
  };
  await tryShot(page, "s.ownmenu", mine);
  await tryShot(page, "s.caption", () => page.getByTestId("post-edit").click({ timeout: 5_000 }));
  await tryShot(page, "s.rmpost", async () => { await mine(); await page.getByTestId("post-delete").click({ timeout: 5_000 }); });
});
