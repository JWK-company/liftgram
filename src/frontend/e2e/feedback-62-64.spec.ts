// 피드백 #62·#63·#64 (SRS-084 · 2026-10-27) — 스펙 .ouroboros/docs/spec/20261027_feedback-62-64/spec.md
//
//   #64 완료 직후 요약·완료 시트가 떠 있는 동안 새 버전을 자동 적용하지 않는다(가짜 waiting 워커 — 운영 빌드에서만 켜진다)
//       ※ 2026-10-27 SRS-085(수동 업데이트)로 정책이 바뀌었다 — 「홈으로 가면 적용」은 이제 **틀린 기대**다.
//         아무 화면에서도 저절로 적용·새로고침하지 않고, 프로필 「업데이트」를 누를 때만 skip-waiting 한다(아래 두 테스트의 끝부분).
//   #63 플레이트 머신은 기본이 한쪽(×2) · 입력 방식을 안 정한 종목은 한 번 묻고 기억한다 · 핀 스택이 흔한 머신은 묻지 않는다
//   #62 휴식·메모·순서는 ⋯ 메뉴 밖 블록 도구 줄(누르는 자리 44px · 빨강 없음)
//
// 모두 옛 코드(cab9bbe · v0.43.0)에서 한 번 돌려 실패하는 것을 확인했다(보고서 · 수정 전 실패 증거).
import { expect, test } from "@playwright/test";
import {
  블록,
  빠른_운동_시작,
  세트_기록,
  안내_띠_닫기,
  카탈로그_준비,
  종목_추가,
} from "./fixtures/declutter-seed";
import { idb_행_고치기, 내려쓰기_대기, 빈_문서 } from "./helpers/opengym";

type Page = import("@playwright/test").Page;

/** 서비스워커를 가짜로 — 등록은 가짜 registration, controller 는 있는 척. `__swMakeWaiting()` 으로 새 버전이 「기다림」이 된다. */
async function 가짜_서비스워커(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__swMsgs = [] as string[];
    w.__pageId = Math.random();
    const container = navigator.serviceWorker;
    if (!container) return;
    type L = () => void;
    const regListeners: L[] = [];
    const swListeners: L[] = [];
    const sw = {
      state: "installing",
      // 버전 묻기({type:"version"} · SRS-085)는 문자열 메시지가 아니다 — 적용 신호(skip-waiting)만 모은다
      postMessage: (m: unknown) => typeof m === "string" && (w.__swMsgs as string[]).push(m),
      addEventListener: (_t: string, fn: L) => swListeners.push(fn),
    };
    const reg = {
      waiting: null as unknown,
      installing: null as unknown,
      addEventListener: (_t: string, fn: L) => regListeners.push(fn),
      update: async () => {},
    };
    Object.defineProperty(container, "controller", { configurable: true, get: () => ({ postMessage() {} }) });
    (container as unknown as { register: () => Promise<unknown> }).register = async () => reg;
    w.__swMakeWaiting = () => {
      reg.installing = sw;
      for (const fn of regListeners) fn();
      sw.state = "installed";
      reg.waiting = sw;
      for (const fn of swListeners) fn();
    };
  });
}

const 메시지 = (page: Page) =>
  page.evaluate(() => (window as unknown as { __swMsgs?: string[] }).__swMsgs ?? []);

// [원본 제목] #64 완료 직후 요약·루틴 저장 시트가 떠 있는 동안은 새 버전을 적용하지 않고, 홈으로 가면 적용한다
test("#64 완료 직후 요약·루틴 저장 시트 위에서도, 요약을 닫고 홈으로 가도 새 버전을 저절로 적용·새로고침하지 않는다", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await 가짜_서비스워커(page);
  await 카탈로그_준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 안내_띠_닫기(page);
  await 세트_기록(page, 0, 0, 60, 8);

  // 운동 중에 새 버전이 도착한다 — 운동 중이니 적용하지 않는다(기존 동작)
  await page.evaluate(() => (window as unknown as { __swMakeWaiting: () => void }).__swMakeWaiting());
  await page.waitForTimeout(1_000);
  expect(await 메시지(page), "운동 중 skip-waiting").toEqual([]);
  const pageId = await page.evaluate(() => (window as unknown as { __pageId: number }).__pageId);

  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 15_000 });
  // 빠른 운동이라 「루틴으로 저장」 시트가 요약 위에 뜬다 — 사람이 고르는 동안 사라지면 안 된다
  await expect(page.getByTestId("finish-name")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(4_000);
  expect(await 메시지(page), "요약·완료 시트가 떠 있는 동안 skip-waiting").toEqual([]);
  await expect(page.getByTestId("finish-name")).toBeVisible();
  await expect(page.getByTestId("sw-update"), "요약 위 새 버전 띠").toHaveCount(0);

  // 다른 탭이 새 버전을 적용해 controllerchange 가 와도 요약 화면은 새로고침하지 않는다(떠날 때로 미룬다)
  await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event("controllerchange")));
  await page.waitForTimeout(1_500);
  expect(
    await page.evaluate(() => (window as unknown as { __pageId: number }).__pageId),
    "요약 화면이 새로고침되지 않았다",
  ).toBe(pageId);
  await expect(page.getByTestId("finish-name")).toBeVisible();

  // 시트를 닫고 요약을 닫으면 홈 — [원본] 그때 미뤄 둔 새로고침이 일어난다(새 문서 = 새 pageId)
  // [개선 SRS-085] 홈에 가도 새로고침하지 않는다 — 업데이트는 프로필 버튼으로만
  await page.getByTestId("btn-finish-dont-save").click();
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await page.waitForTimeout(5_000);
  expect(
    await page.evaluate(() => (window as unknown as { __pageId?: number }).__pageId),
    "홈에서도 저절로 새로고침하지 않는다",
  ).toBe(pageId);
  expect(await 메시지(page), "홈에서도 skip-waiting 없음").toEqual([]);
});

// [원본] test("#64 요약을 닫고 홈으로 가면 기다리던 새 버전을 적용한다(controllerchange 없이)", …)
// [개선 SRS-085] 홈에 가도 적용하지 않고, 프로필 「업데이트」를 눌러야 skip-waiting 한다
test("#64 요약을 닫고 홈으로 가도 새 버전을 저절로 적용하지 않는다 — 프로필 「업데이트」를 누를 때만", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await 가짜_서비스워커(page);
  await 카탈로그_준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 안내_띠_닫기(page);
  await 세트_기록(page, 0, 0, 60, 8);
  await page.evaluate(() => (window as unknown as { __swMakeWaiting: () => void }).__swMakeWaiting());
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("finish-name")).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(3_000);
  expect(await 메시지(page)).toEqual([]);
  await page.getByTestId("btn-finish-dont-save").click();
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  // [원본] await expect.poll(() => 메시지(page), { timeout: 15_000 }).toEqual(["skip-waiting"]);
  await page.waitForTimeout(5_000);
  expect(await 메시지(page), "홈에서 저절로 skip-waiting 하지 않는다").toEqual([]);
  // 프로필 탭(클라이언트 이동 — 가짜 워커 유지)의 「업데이트」를 누르면 그때 보낸다
  await expect(page.getByTestId("nav-profile-update-dot")).toBeVisible();
  await page.getByTestId("nav-profile").click();
  await page.getByTestId("app-update-btn").click();
  await expect(page.getByTestId("update-overlay")).toBeVisible();
  await expect.poll(() => 메시지(page), { timeout: 15_000 }).toEqual(["skip-waiting"]);
});

// ── #63 ──────────────────────────────────────────────────────────────────────

const 볼륨 = (page: Page, n: number) => 블록(page, n).getByTestId("ex-volume");

test("#63 플레이트 머신은 기본이 한쪽(×2) — 한 번 묻고, 「양쪽 합·핀」 답은 이 블록을 ×1 로 바꾸고 다음엔 묻지 않는다", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await 카탈로그_준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "머신 체스트 프레스");
  await 안내_띠_닫기(page);

  const card = 블록(page, 0);
  await expect(card.getByTestId("plate-ask")).toBeVisible({ timeout: 15_000 });
  await expect(card.getByTestId("plate-ask-one")).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByTestId("head-weight")).toHaveAttribute("data-one-side", "1");
  // 옵션을 누르지 않아도 한쪽 40kg×10 = 볼륨 800kg
  await 세트_기록(page, 0, 0, 40, 10);
  await expect(볼륨(page, 0)).toContainText("800", { timeout: 10_000 });

  // 핀 머신을 쓰는 사람 — 「양쪽 합·핀」. 이미 체크한 세트도 숫자 그대로 ×1(적은 숫자의 뜻을 밝힌 것)
  await card.getByTestId("plate-ask-both").click();
  await expect(card.getByTestId("plate-ask")).toHaveCount(0);
  await expect(card.getByTestId("head-weight")).toHaveAttribute("data-one-side", "0");
  await expect(볼륨(page, 0)).toContainText("400", { timeout: 10_000 });
  await expect(card.getByTestId("set-list").locator("> div").first().getByTestId("set-weight")).toHaveValue(
    "40",
  );

  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toHaveText("400kg", { timeout: 15_000 });
  const skip = page.getByTestId("btn-finish-dont-save");
  if (await skip.isVisible()) await skip.click();
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

  // 다음 운동 — 묻지 않고 양쪽 합 그대로 · 프리필 40(명시 1 → 1, 환산 없음)
  await 빠른_운동_시작(page);
  await 종목_추가(page, "머신 체스트 프레스");
  await expect(블록(page, 0).getByTestId("head-weight")).toHaveAttribute("data-one-side", "0", {
    timeout: 15_000,
  });
  await page.waitForTimeout(1_500);
  await expect(블록(page, 0).getByTestId("plate-ask")).toHaveCount(0);
  await expect(
    블록(page, 0).getByTestId("set-list").locator("> div").first().getByTestId("set-weight"),
  ).toHaveValue("40");
});

test("#63 답하지 않고 완료하면 기본(한쪽)이 답 — 다음엔 묻지 않고 한쪽, 프리필은 적은 숫자 그대로", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await 카탈로그_준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "머신 하이 로우");
  await 안내_띠_닫기(page);
  await expect(블록(page, 0).getByTestId("plate-ask")).toBeVisible({ timeout: 15_000 });
  await 세트_기록(page, 0, 0, 30, 10);
  await expect(볼륨(page, 0)).toContainText("600", { timeout: 10_000 });
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toHaveText("600kg", { timeout: 15_000 });
  const skip = page.getByTestId("btn-finish-dont-save");
  if (await skip.isVisible()) await skip.click();
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

  await 빠른_운동_시작(page);
  await 종목_추가(page, "머신 하이 로우");
  await expect(블록(page, 0).getByTestId("head-weight")).toHaveAttribute("data-one-side", "1", {
    timeout: 15_000,
  });
  await page.waitForTimeout(1_500);
  await expect(블록(page, 0).getByTestId("plate-ask")).toHaveCount(0);
  await expect(
    블록(page, 0).getByTestId("set-list").locator("> div").first().getByTestId("set-weight"),
  ).toHaveValue("30");
});

test("#63 핀 스택이 흔한 머신(레그 익스텐션)·핀 칸·어시스트 머신은 묻지 않고 ×1", async ({ page }) => {
  test.setTimeout(240_000);
  await 카탈로그_준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "레그 익스텐션");
  await 종목_추가(page, "어시스트 풀업");
  await 종목_추가(page, "머신 숄더 프레스");
  await 안내_띠_닫기(page);
  // 레그 익스텐션 — 흔한 적재 방식이 핀이라 묻지 않는다
  await expect(블록(page, 2).getByTestId("plate-ask")).toBeVisible({ timeout: 15_000 }); // 숄더 프레스는 묻는다(읽기 완료 표식)
  await expect(블록(page, 0).getByTestId("plate-ask")).toHaveCount(0);
  await expect(블록(page, 1).getByTestId("plate-ask")).toHaveCount(0);
  await 세트_기록(page, 0, 0, 50, 10);
  await expect(볼륨(page, 0)).toContainText("500", { timeout: 10_000 });
  // 숄더 프레스를 핀 칸으로 고르면 질문이 사라지고 ×1
  await page.getByTestId("variant-trigger").nth(2).click();
  await page.getByTestId("slot-load-pin").click();
  await expect(page.getByTestId("slot-plate-one-side")).toHaveCount(0);
  await page
    .getByTestId("variant-sheet")
    .locator("xpath=..")
    .locator('button[aria-label="닫기"]')
    .click({ position: { x: 5, y: 5 } });
  await expect(블록(page, 2).getByTestId("plate-ask")).toHaveCount(0);
  await expect(블록(page, 2).getByTestId("head-weight")).toHaveAttribute("data-one-side", "0");
  await 세트_기록(page, 2, 0, 30, 10);
  await expect(볼륨(page, 2)).toContainText("300", { timeout: 10_000 });
});

// ── #62 ──────────────────────────────────────────────────────────────────────

/** 요소와 자손의 브랜드색(글자·바탕·보이는 테두리·SVG) — 빈 배열이어야 한다(가드는 전 채널 · 메모리 style-guard). */
async function 빨강(page: Page, sel: string): Promise<string[]> {
  return page.evaluate((s) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-brand)";
    document.body.appendChild(probe);
    const brand = getComputedStyle(probe).color;
    probe.remove();
    const out: string[] = [];
    for (const root of Array.from(document.querySelectorAll(s))) {
      for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
        const cs = getComputedStyle(el);
        const hits: string[] = [];
        if (cs.color === brand) hits.push("text");
        if (cs.backgroundColor === brand) hits.push("bg");
        if (Number.parseFloat(cs.borderTopWidth) > 0 && cs.borderTopColor === brand) hits.push("border");
        if (el instanceof SVGElement && (cs.fill === brand || cs.stroke === brand)) hits.push("svg");
        if (hits.length) out.push(`${hits.join("+")}:${(el as HTMLElement).dataset?.testid ?? el.tagName}`);
      }
    }
    return out;
  }, sel);
}

test("#62 휴식·메모·순서는 ⋯ 메뉴 밖 도구 줄 — 44px · 빨강 없음 · 첫/끝 비활성 · 메뉴엔 나머지만", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await 카탈로그_준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "케이블 푸시다운");
  // 종목 하나 — 순서 버튼은 없다
  await expect(블록(page, 0).getByTestId("btn-move-up")).toHaveCount(0);
  await expect(블록(page, 0).getByTestId("btn-rest-setting")).toBeVisible();
  await 종목_추가(page, "바벨 벤치프레스");
  await 종목_추가(page, "덤벨 플라이");
  await 안내_띠_닫기(page);

  // 첫 블록 ⌃ 비활성 · 마지막 블록 ⌄ 비활성 · 가운데는 둘 다
  await expect(블록(page, 0).getByTestId("btn-move-up")).toBeDisabled();
  await expect(블록(page, 0).getByTestId("btn-move-down")).toBeEnabled();
  await expect(블록(page, 1).getByTestId("btn-move-up")).toBeEnabled();
  await expect(블록(page, 2).getByTestId("btn-move-down")).toBeDisabled();

  // 누르는 자리 44px 이상
  for (const id of ["btn-move-up", "btn-move-down", "btn-rest-setting", "btn-note-open"]) {
    const box = await 블록(page, 1).getByTestId(id).boundingBox();
    expect(box?.height ?? 0, `${id} 높이`).toBeGreaterThanOrEqual(44);
    // [원본] 너비도 44 — 2026-10-28 피드백으로 두 버튼을 붙였다(폭 36 · 높이 44 · 사이 0)
    // if (id.startsWith("btn-move")) expect(box?.width ?? 0, `${id} 너비`).toBeGreaterThanOrEqual(44);
    if (id.startsWith("btn-move")) expect(box?.width ?? 0, `${id} 너비`).toBeGreaterThanOrEqual(36);
  }
  // 도구 줄은 세트 표 뒤(머리를 늘리지 않는다)
  const after = await 블록(page, 0).evaluate((card) => {
    const list = card.querySelector('[data-testid="set-list"]');
    const tools = card.querySelector('[data-testid="block-tools"]');
    return !!list && !!tools && !!(list.compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(after, "도구 줄이 세트 표 뒤").toBe(true);
  expect(await 빨강(page, '[data-testid="block-tools"]'), "도구 줄 빨강").toEqual([]);

  // ⋯ 메뉴에는 휴식·메모·순서가 없다
  await 블록(page, 1).getByTestId("btn-we-menu").click();
  await expect(page.getByTestId("btn-remove-exercise")).toBeVisible();
  await expect(page.getByTestId("btn-swap")).toBeVisible();
  // 메뉴가 열린 동안에도 화면의 이 버튼들은 블록마다 하나씩뿐이다(메뉴 안에는 없다)
  for (const id of ["btn-move-up", "btn-move-down", "btn-rest-setting", "btn-note-open"])
    await expect(page.getByTestId(id), `메뉴 밖에만 ${id}`).toHaveCount(3);
  await page.getByRole("button", { name: "취소" }).last().click();
  await expect(page.getByTestId("btn-remove-exercise")).toHaveCount(0);

  // 순서 — 메뉴 없이 ⌄ 한 번
  await 블록(page, 0).getByTestId("btn-move-down").click();
  await expect(블록(page, 0).getByTestId("we-name")).toContainText("벤치프레스", { timeout: 10_000 });
  await expect(블록(page, 1).getByTestId("we-name")).toContainText("푸시다운");

  // 휴식 — 값과 함께(기본 2:00) · 누르면 시트
  await expect(블록(page, 0).getByTestId("btn-rest-setting")).toContainText(/휴식 \d+:\d\d/);
  await 블록(page, 0).getByTestId("btn-rest-setting").click();
  await expect(page.getByTestId("rest-sheet")).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(page.getByTestId("rest-sheet")).toHaveCount(0, { timeout: 5_000 });

  // 메모 — 없으면 「메모」, 누르면 입력칸(포커스), 벗어나면 저장 후 첫 줄 미리보기
  const note = 블록(page, 0).getByTestId("btn-note-open");
  await expect(note).toHaveAttribute("data-has-note", "0");
  await note.click();
  const area = 블록(page, 0).getByTestId("we-note");
  await expect(area).toBeFocused();
  await area.fill("팔꿈치 고정\n다음엔 2.5kg 올리기");
  await area.blur();
  await expect(area).toHaveCount(0);
  await expect(note).toHaveAttribute("data-has-note", "1");
  await expect(note).toContainText("팔꿈치 고정");
  await expect(note).not.toContainText("다음엔");
  expect(await 빨강(page, '[data-testid="block-tools"]'), "메모 있는 도구 줄 빨강").toEqual([]);
});

// ── /qa code M-1 — 아직 안 정한 종목에서 칸 시트로 정해도 숫자는 그대로(질문 답과 같다) ─────────────────────

async function 칸_시트_닫기(page: Page): Promise<void> {
  await page
    .getByTestId("variant-sheet")
    .locator("xpath=..")
    .locator('button[aria-label="닫기"]')
    .click({ position: { x: 5, y: 5 } });
  await expect(page.getByTestId("variant-sheet")).toHaveCount(0);
}

const 첫_무게 = (page: Page, n: number) =>
  블록(page, n).getByTestId("set-list").locator("> div").first().getByTestId("set-weight");

test("M-1 미정 종목에서 칸 시트로 「핀」 — 프리필 20 이 20 그대로 · 「양쪽 합·핀」으로 기억 · 「한쪽」 끄기도 숫자 그대로", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await 카탈로그_준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "머신 체스트 프레스");
  await 종목_추가(page, "머신 하이 로우");
  await 안내_띠_닫기(page);
  await expect(블록(page, 0).getByTestId("plate-ask")).toBeVisible({ timeout: 15_000 });
  await expect(첫_무게(page, 0)).toHaveValue("20");

  // ① 체스트 프레스 — 적재 칸 「핀」
  await page.getByTestId("variant-trigger").nth(0).click();
  await page.getByTestId("slot-load-pin").click();
  await 칸_시트_닫기(page);
  await expect(블록(page, 0).getByTestId("plate-ask")).toHaveCount(0);
  await expect(블록(page, 0).getByTestId("head-weight")).toHaveAttribute("data-one-side", "0");
  await page.waitForTimeout(1_500);
  await expect(첫_무게(page, 0), "핀을 골라도 숫자 그대로(옛: 40)").toHaveValue("20");

  // ② 하이 로우 — 「한쪽 무게로 입력」 끄기
  await expect(블록(page, 1).getByTestId("plate-ask")).toBeVisible();
  await page.getByTestId("variant-trigger").nth(1).click();
  await page.getByTestId("slot-plate-one-side-input").uncheck();
  await 칸_시트_닫기(page);
  await expect(블록(page, 1).getByTestId("plate-ask")).toHaveCount(0);
  await page.waitForTimeout(1_500);
  await expect(첫_무게(page, 1), "끄기도 숫자 그대로(옛: 40)").toHaveValue("20");
  await 세트_기록(page, 1, 0, 30, 10);
  await expect(볼륨(page, 1)).toContainText("300", { timeout: 10_000 });

  const skipDone = async () => {
    const skip = page.getByTestId("btn-finish-dont-save");
    if (await skip.isVisible()) await skip.click();
  };
  await 세트_기록(page, 0, 0, 20, 10);
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toHaveText("500kg", { timeout: 15_000 });
  await skipDone();
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

  // 다음 운동 — 하이 로우는 「양쪽 합」으로 기억돼 묻지 않는다
  await 빠른_운동_시작(page);
  await 종목_추가(page, "머신 하이 로우");
  await expect(블록(page, 0).getByTestId("head-weight")).toHaveAttribute("data-one-side", "0", {
    timeout: 15_000,
  });
  await page.waitForTimeout(1_500);
  await expect(블록(page, 0).getByTestId("plate-ask")).toHaveCount(0);
  await expect(첫_무게(page, 0)).toHaveValue("30");
});

test("M-1 옛 기록(배수 null)이 있는 플레이트 머신 — 프리필은 옛 숫자, 칸 시트로 「핀」을 골라도 그대로(이번 사용자 사례)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await 카탈로그_준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "머신 체스트 서포티드 로우");
  await 안내_띠_닫기(page);
  await 세트_기록(page, 0, 0, 50, 10);
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 15_000 });
  const skip = page.getByTestId("btn-finish-dont-save");
  if (await skip.isVisible()) await skip.click();
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });

  // 옛 기기 모양으로 — 세트 배수 null · 입력 방식 선택 없음(피드백 #63 전의 기록)
  await 내려쓰기_대기(page);
  await 빈_문서(page);
  expect(await idb_행_고치기(page, "set_logs", [{ set: { load_multiplier: null } }])).toBeGreaterThan(0);
  await idb_행_고치기(page, "exercise_user_prefs", [{ set: { plate_one_side: null } }]);

  await 빠른_운동_시작(page);
  await 종목_추가(page, "머신 체스트 서포티드 로우");
  await expect(블록(page, 0).getByTestId("plate-ask")).toBeVisible({ timeout: 15_000 });
  await expect(첫_무게(page, 0), "옛 50 은 50 으로(절반 환산 없음)").toHaveValue("50");
  await page.getByTestId("variant-trigger").nth(0).click();
  await page.getByTestId("slot-load-pin").click();
  await 칸_시트_닫기(page);
  await page.waitForTimeout(1_500);
  await expect(첫_무게(page, 0), "핀을 골라도 50(옛: 100)").toHaveValue("50");
});
