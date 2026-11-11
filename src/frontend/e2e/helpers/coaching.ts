// 코칭 e2e 공용 도우미(SPEC-059 · #T19) — 줄 ⋯ 가 없어지고 「코치 찾기」 검색이 없어진 뒤의 흐름.
//   끊기     줄의 🗑 → 확인창 → RevokeGrant 성공 · 그 줄이 목록에서 빠질 때까지
//   코치_시트 내 코치 줄 이름 → 시트(공유 범위 바꾸기 · 연결 이력)
//   프로필로_요청 상대 프로필 /u/<id> → 「코치로 요청」 → 범위 시트 확인
//   이름으로_요청 사람 찾기에서 이름 → 프로필 → 요청(옛 「코치 찾기」 검색 자리)
//   내_id    지금 로그인한 사람의 id(liftgram.me)
//   회원_화면 코치가 담당 회원 줄 → 회원 화면의 탭
// 여러 시험 파일이 같은 흐름을 따로 갖고 있어 화면이 바뀔 때마다 여러 곳이 깨졌다 — 이제 여기 한 곳.
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

type Section = "coaching-coaches" | "coaching-members";
const RPC = "**/api/coaching.v1.CoachingService";

function 줄(page: Page, section: Section, name: string) {
  return page.getByTestId(section).getByTestId("coaching-grant").filter({ hasText: name });
}

/** 줄의 🗑 → 확인창 「확인」. 확인창이 뜨는 것까지만 보고 싶으면 confirm=false. */
export async function 끊기(page: Page, section: Section, name: string, confirm = true): Promise<void> {
  await 줄(page, section, name).getByTestId("coaching-revoke").click();
  const dlg = page.getByTestId("coaching-revoke-confirm");
  await expect(dlg).toBeVisible();
  if (!confirm) return;
  // [원본] 확인창이 닫히는 것만 봤다 — 창은 RPC 전에 닫혀 늘 참이었다(REV-144 B2)
  // [개선] 서버가 받아들였는지 · 그 줄이 목록에서 빠졌는지까지
  const res = page.waitForResponse(`${RPC}/RevokeGrant`);
  await dlg.getByTestId("dialog-confirm").click();
  expect((await res).ok(), "RevokeGrant").toBe(true);
  await expect(줄(page, section, name)).toHaveCount(0, { timeout: 20_000 });
}

/** 내 코치 줄 이름 → 시트. 시트 안에 coaching-scope · coaching-history-link 가 있다. */
// 이름 시트는 회원 쪽 「내 코치」 줄에만 있다(코치 쪽 담당 회원 줄은 회원 화면 링크 — REV-144 B9)
export async function 코치_시트(page: Page, section: "coaching-coaches", name: string): Promise<void> {
  await 줄(page, section, name).getByTestId("coaching-coach-open").click();
  await expect(page.getByTestId("coaching-coach-sheet")).toBeVisible();
}

/** 지금 로그인한 사람의 id — 앱이 로그인 때 적어 두는 liftgram.me 에서. */
export async function 내_id(page: Page): Promise<string> {
  // liftgram.me 는 Me 응답 뒤 비동기로 적힌다 — 적힐 때까지 기다린다(REV-144 B6)
  const read = () =>
    page.evaluate(() => {
      const raw = localStorage.getItem("liftgram.me");
      return raw ? ((JSON.parse(raw) as { id?: string }).id ?? "") : "";
    });
  await expect.poll(read, { message: "내 id", timeout: 20_000 }).not.toBe("");
  return read();
}

/**
 * 상대 프로필에서 「코치로 요청」 → 범위 시트 확인(SPEC-059 — 「코치 찾기」 검색 대신).
 * 상대가 「코칭 요청 받기」(trainer_intent)를 켜 두어야 버튼이 있다.
 * pastRecords — 연결 전에 한 운동을 코치가 보게 「지난 기록도 보여 주기」를 켠다(기본은 끔).
 */
export async function 프로필로_요청(
  page: Page,
  trainerId: string,
  opts: { note?: string; pastRecords?: boolean } = {},
): Promise<void> {
  await page.goto(`/u/${encodeURIComponent(trainerId)}`);
  const btn = page.getByTestId("profile-coaching-request");
  await expect(btn).toBeVisible({ timeout: 20_000 });
  await btn.click();
  await expect(page.getByTestId("scope-coach-card")).toBeVisible();
  if (opts.pastRecords) {
    const sw = page.getByTestId("scope-pastRecords");
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "true"); // 기본값이 바뀌어 거꾸로 꺼지지 않게(REV-145 B7)
  }
  if (opts.note !== undefined) await page.getByTestId("scope-note").fill(opts.note);
  const res = page.waitForResponse(`${RPC}/RequestCoaching`); // 서버가 받았는지(REV-144 B7)
  await page.getByTestId("scope-confirm").click();
  expect((await res).ok(), "RequestCoaching").toBe(true);
  await expect(page.getByTestId("scope-confirm")).toHaveCount(0, { timeout: 20_000 });
}

/** 사람 찾기(/people)에서 이름으로 그 사람 id 를 찾는다 — 피드·사람 찾기로 코치를 찾는 실제 길(SPEC-059 4a). */
export async function 이름으로_id(page: Page, name: string): Promise<string> {
  await page.goto("/people");
  await page.getByTestId("people-query").fill(name);
  // 부분 일치면 「코치X」가 「노출코치X」에도 걸린다 — 정확한 이름으로(REV-145 B7)
  const link = page
    .getByTestId("people-row")
    .filter({ has: page.getByText(name, { exact: true }) })
    .getByTestId("people-user");
  await expect(link).toHaveCount(1, { timeout: 20_000 });
  const href = (await link.getAttribute("href")) ?? "";
  const id = decodeURIComponent(href.replace(/^.*\/u\//, "").replace(/[?#].*$/, ""));
  expect(id, `${name} 의 id`).not.toBe("");
  return id;
}

/**
 * 회원이 이름으로 코치를 찾아 프로필에서 요청하고 「수락 대기」가 뜰 때까지(옛 「코치 찾기」 검색 도우미 자리).
 */
export async function 이름으로_요청(
  page: Page,
  name: string,
  opts: { note?: string; pastRecords?: boolean } = {},
): Promise<void> {
  await 프로필로_요청(page, await 이름으로_id(page, name), opts);
  await page.goto("/coaching");
  await expect(
    page.getByTestId("coaching-coaches").getByTestId("coaching-grant").filter({ hasText: name }),
  ).toContainText("수락 대기", { timeout: 20_000 });
}

/**
 * 코칭 화면에 「코치 찾기」 검색이 없다(SPEC-059) — 화면이 다 그려진 뒤(코드 칸이 보인 뒤) 재고,
 * testId 가 아니라 검색칸 문구·검색 RPC 로 잰다(다른 이름으로 되살아나도 잡히게 · REV-145 B1).
 */
export async function 검색_없음(page: Page): Promise<void> {
  let searched = 0;
  const on = (r: import("@playwright/test").Request) => {
    if (r.url().includes("/coaching.v1.CoachingService/SearchTrainers")) searched++;
  };
  page.on("request", on);
  await page.goto("/coaching");
  await expect(page.getByTestId("coaching-code-input")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByPlaceholder("표시 이름으로 검색")).toHaveCount(0);
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await expect(page.getByTestId("coaching-find-hint")).toBeVisible();
  page.off("request", on);
  expect(searched, "SearchTrainers 요청").toBe(0);
}

/**
 * 코치가 담당 회원 줄을 눌러 회원 코칭 화면(/coaching/m/<id>)의 탭으로(SPEC-059 — ⋯ 시트의 기록 요약·루틴을 옮김).
 * name 을 주지 않으면 첫 회원.
 */
export async function 회원_화면(
  page: Page,
  tab: "records" | "stats" | "routines",
  name?: string,
): Promise<void> {
  const rows = page.getByTestId("coaching-members").getByTestId("coaching-grant");
  const row = name ? rows.filter({ hasText: name }) : rows.first();
  await row.getByTestId("coaching-member-open").click();
  await expect(page).toHaveURL(/\/coaching\/m\/[^/?]+/, { timeout: 20_000 });
  await page.getByTestId(`member-tab-${tab}`).click();
  await expect(page.getByTestId(`member-panel-${tab}`)).toBeVisible({ timeout: 20_000 });
}
