// @plm SRS-053 SRS-073  동기 설정을 바꾼 직후 새로고침해도 옛 값으로 되돌아가지 않는다(설정 되돌림 경합)
//
// 원인(2026-10-27 release1 검증): setPref 는 localStorage 에 바로 쓰고 프로필(app_prefs) 쓰기·내려쓰기는 비동기로 돈다.
// 그 쓰기가 디스크에 닿기 전에 새로고침하면 로컬 DB 에는 옛 app_prefs 가 남아 있고, PrefsBridge 가 그 옛 값을
// localStorage 에 다시 덮어썼다. 지금은 키별 「쓰기 대기」 표식(liftgram.prefsPending)이 그 덮어쓰기를 막고,
// 부팅 때 프로필에 다시 써서 마무리한다.
//
// 확인: 켜고(디스크까지 내려쓴 뒤) → 끄고 **곧바로** 새로고침 → 꺼진 채 · 표식은 마무리 뒤 사라짐 · 한 번 더 새로고침해도 꺼짐.
// 반복은 `--repeat-each=10` 으로 돌린다(한 번에 한 경합 창 — 흔들림을 잡으려면 반복이 본체다).
import { expect, test } from "@playwright/test";
import { 내려쓰기_대기, 준비 } from "./helpers/opengym";

type Page = import("@playwright/test").Page;

const PENDING = "liftgram.prefsPending";
const PUSH = "**/sync.v1.SyncService/Push";
const ls = (page: Page, k: string) => page.evaluate((key) => localStorage.getItem(key), k);

/** 표식이 사라질 때까지(부팅 마무리 쓰기가 끝남) — 그 뒤에도 값이 그대로인지 본다 */
async function 표식_정리_대기(page: Page): Promise<void> {
  await expect.poll(() => ls(page, PENDING), { timeout: 15_000 }).toBeNull();
}

/**
 * 이 문서에서만 ① IndexedDB 쓰기 트랜잭션을 막고(LokiJS 저장 콜백이 오류를 받는다) ② 동기 올리기를 끊는다 —
 * 프로필 쓰기는 메모리 DB 에만 남고 디스크·서버엔 옛 값. 「프로필 쓰기가 끝나기 전에 닫힘」의 결정적 재현.
 * 풀 때는 page.unroute(PUSH) 후 새로고침(IndexedDB 패치는 문서와 함께 사라진다).
 */
async function 쓰기_막기(page: Page): Promise<void> {
  await page.evaluate(() => {
    const orig = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (
      this: IDBDatabase,
      ...args: Parameters<IDBDatabase["transaction"]>
    ) {
      if (args[1] === "readwrite") throw new DOMException("e2e: 쓰기 막음", "InvalidStateError");
      return orig.apply(this, args);
    } as IDBDatabase["transaction"];
  });
  await page.route(PUSH, (r) => r.abort());
}

/** 눌러서 처리기가 돈 그 틱에 새로고침한다 — 비동기 프로필 쓰기가 끝날 틈이 없다 */
async function 누르고_곧바로_새로고침(page: Page, testId: string): Promise<void> {
  await Promise.all([
    page.waitForEvent("load"),
    page.evaluate((id) => {
      (document.querySelector(`[data-testid="${id}"]`) as HTMLElement).click();
      location.reload();
    }, testId),
  ]);
}

test("힘든 정도 기록 — 끄고 곧바로 새로고침해도 꺼진 채로 남는다", async ({ page }) => {
  test.setTimeout(90_000);
  await 준비(page);
  await page.goto("/profile");
  const sw = page.getByTestId("switch-effort-logging");
  await expect(sw).toBeVisible({ timeout: 20_000 });
  if ((await sw.getAttribute("aria-checked")) !== "true") await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await 표식_정리_대기(page);
  await 내려쓰기_대기(page); // 켠 값이 프로필·디스크에 확실히 남게(되돌림의 「옛 값」을 만든다)

  // 끄고 **같은 틱에** 새로고침 — 클릭 처리기는 동기로 localStorage 에 쓰고, 프로필 쓰기(동적 import → DB 쓰기 → 내려쓰기)는
  // 시작도 못 한 채 문서가 사라진다. 이전 코드에선 매번 「켜짐」으로 되돌아왔다(결정적 재현).
  await 누르고_곧바로_새로고침(page, "switch-effort-logging");

  const sw2 = page.getByTestId("switch-effort-logging");
  await expect(sw2).toBeVisible({ timeout: 20_000 });
  await 표식_정리_대기(page);
  expect(await ls(page, "liftgram.effortLogging")).toBe("0");
  await expect(sw2).toHaveAttribute("aria-checked", "false");

  // 마무리 쓰기가 디스크에 남았는지 — 한 번 더 열어도 꺼짐
  await page.reload();
  await expect(page.getByTestId("switch-effort-logging")).toHaveAttribute("aria-checked", "false", {
    timeout: 20_000,
  });
  await page.waitForTimeout(1_000); // 프로필 값이 내려올 틈
  expect(await ls(page, "liftgram.effortLogging")).toBe("0");
});

test("테마 — 다크에서 시스템으로 바꾸고 곧바로 새로고침해도 시스템으로 남는다", async ({ page }) => {
  test.setTimeout(90_000);
  await 준비(page);
  await page.goto("/profile");
  const 고르기 = async (v: "system" | "dark") => {
    await page.getByTestId("theme").click();
    await page.getByTestId(`theme-${v}`).click();
  };
  await expect(page.getByTestId("theme")).toBeVisible({ timeout: 20_000 });
  await 고르기("dark");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
    .toBe("dark");
  await 표식_정리_대기(page);
  await 내려쓰기_대기(page);

  await page.getByTestId("theme").click();
  await expect(page.getByTestId("theme-system")).toBeVisible();
  await 누르고_곧바로_새로고침(page, "theme-system");

  await expect(page.getByTestId("theme")).toBeVisible({ timeout: 20_000 });
  await 표식_정리_대기(page);
  expect(await ls(page, "liftgram.theme")).toBe("system");
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBeNull();

  await page.reload();
  await expect(page.getByTestId("theme")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_000);
  expect(await ls(page, "liftgram.theme")).toBe("system");
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBeNull();
});

test("내려쓰기가 실패해도(IndexedDB 쓰기 중단) — 새로고침 뒤 꺼진 값이 남고, 다음 부팅이 프로필에 다시 써서 마무리한다", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await 준비(page);
  await page.goto("/profile");
  const sw = page.getByTestId("switch-effort-logging");
  await expect(sw).toBeVisible({ timeout: 20_000 });
  if ((await sw.getAttribute("aria-checked")) !== "true") await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await 표식_정리_대기(page);
  await 내려쓰기_대기(page);

  // 이 문서에서만 ① IndexedDB 쓰기 트랜잭션을 막고(LokiJS 저장 콜백이 오류를 받는다) ② 동기 올리기를 끊는다 —
  // 프로필 쓰기는 메모리 DB 에만 남고 디스크·서버엔 옛 값 "1". 이전 코드: 새로고침하면 매번 「켜짐」으로 되돌아왔다(결정적 재현).
  await 쓰기_막기(page);
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await page.waitForTimeout(1_500); // 프로필 쓰기 → 내려쓰기(실패)가 끝날 틈
  if (process.env.PF_OLD !== "1") expect(await ls(page, PENDING)).toContain("liftgram.effortLogging"); // 실패했으니 표식이 남는다
  await page.unroute(PUSH); // 새로고침 뒤엔 막지 않는다(IndexedDB 패치는 문서와 함께 사라진다)

  await page.reload(); // 새 문서 — 쓰기 중단 없음
  await expect(page.getByTestId("switch-effort-logging")).toBeVisible({ timeout: 20_000 });
  await 표식_정리_대기(page); // 부팅 마무리(다시 쓰기 → 내려쓰기 성공)
  expect(await ls(page, "liftgram.effortLogging")).toBe("0");
  await expect(page.getByTestId("switch-effort-logging")).toHaveAttribute("aria-checked", "false");

  await page.reload();
  await expect(page.getByTestId("switch-effort-logging")).toHaveAttribute("aria-checked", "false", {
    timeout: 20_000,
  });
  await page.waitForTimeout(1_000);
  expect(await ls(page, "liftgram.effortLogging")).toBe("0");
});

test("테마도 같다 — 내려쓰기 실패 뒤 새로고침해도 고른 값(라이트)이 남고 마무리된다", async ({ page }) => {
  test.setTimeout(90_000);
  await 준비(page);
  await page.goto("/profile");
  const 고르기 = async (v: "light" | "dark") => {
    await page.getByTestId("theme").click();
    await page.getByTestId(`theme-${v}`).click();
  };
  await expect(page.getByTestId("theme")).toBeVisible({ timeout: 20_000 });
  await 고르기("dark");
  await 표식_정리_대기(page);
  await 내려쓰기_대기(page);

  await 쓰기_막기(page);
  await 고르기("light");
  await page.waitForTimeout(1_500);
  if (process.env.PF_OLD !== "1") expect(await ls(page, PENDING)).toContain("liftgram.theme");
  await page.unroute(PUSH);

  await page.reload();
  await expect(page.getByTestId("theme")).toBeVisible({ timeout: 20_000 });
  await 표식_정리_대기(page);
  expect(await ls(page, "liftgram.theme")).toBe("light");
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe("light");

  await page.reload();
  await expect(page.getByTestId("theme")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1_000);
  expect(await ls(page, "liftgram.theme")).toBe("light");
});
