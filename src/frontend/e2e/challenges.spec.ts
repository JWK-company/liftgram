// 그룹 챌린지 e2e(SPEC-064 Phase 2 · SRS-118~120). 시험 DB 에서만 돈다 — 시각은 psql 로 시험 DB 값을 옮겨 다룬다(시험 전용 RPC 없음).
//   E2E_PSQL_URL=postgres://app:app@127.0.0.1:55460/<e2e DB> BASE=http://127.0.0.1:3290 bunx playwright test e2e/challenges.spec.ts
//   서버는 CHALLENGE_LOOP_INTERVAL_SEC=2 로 띄운다(판정 루프가 2초마다).
//
// 순서가 있다(serial): 만들기 → 링크로 참가 → 규칙 고치기 → 토큰 바꿈 → 시작(starts_on 을 오늘로) → 출석표 → 정원·차단 → 나가기.
import { execFileSync } from "node:child_process";
import { type Browser, expect, type Page, test } from "@playwright/test";

const URL_ = process.env.E2E_PSQL_URL;
test.skip(!URL_, "E2E_PSQL_URL 이 없다 — 시험 DB 가 필요하다");
if (URL_) {
  const u = new URL(URL_);
  const base = process.env.BASE ?? "";
  if (
    !/^(127\.0\.0\.1|localhost)$/.test(u.hostname) ||
    u.port === "5434" ||
    !/e2e/.test(u.pathname) ||
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(base) ||
    /:3100\b/.test(base)
  ) {
    throw new Error("challenges e2e 는 로컬 시험 DB·시험 서버에서만 돈다(E2E_PSQL_URL · BASE 확인)");
  }
}
test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 390, height: 844 }, locale: "ko-KR" });

function sql(q: string): string {
  return execFileSync("psql", [URL_ as string, "-tAc", q])
    .toString()
    .trim();
}

let seq = 0;
function freshEmail(tag: string) {
  seq += 1;
  return `e2e-ch-${tag}-${Date.now()}-${seq}@example.com`;
}

async function 가입(page: Page, email: string, name: string) {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill(name);
  await page.getByTestId("age-confirm").check();
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

function userId(email: string): string {
  const id = sql(`select id from users where email = '${email}'`);
  expect(id, "가입한 계정이 시험 DB 에 없다").toMatch(/\S/);
  return id;
}

/** 챌린지 하루(04:00 KST 경계) — 서버 rules.go 와 같다 */
function challengeDay(ms = Date.now()): string {
  return new Date(ms + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

async function newUser(browser: Browser, tag: string, name: string) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ko-KR" });
  const page = await ctx.newPage();
  const email = freshEmail(tag);
  await 가입(page, email, name);
  return { ctx, page, email, id: userId(email) };
}

/** 글자만 있는 단추(테두리·바탕 없음)를 모은다 — 버튼 알아보기 가드(SPEC-061)의 간이판 */
async function bareButtons(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const clear = (c: string) => /rgba\([^)]*,\s*0\)|transparent|\/\s*0\)/.test(c);
    const out: string[] = [];
    for (const el of document.querySelectorAll("main button, [role='dialog'] button")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (el.closest('[role="tablist"],[data-testid="shell-nav"]')) continue;
      if (el.matches('[role="switch"],[role="tab"],[aria-pressed],:disabled')) continue;
      if (!el.textContent?.trim()) continue;
      const cs = getComputedStyle(el);
      const sides = [
        [cs.borderTopWidth, cs.borderTopColor],
        [cs.borderRightWidth, cs.borderRightColor],
        [cs.borderBottomWidth, cs.borderBottomColor],
        [cs.borderLeftWidth, cs.borderLeftColor],
      ].filter(([w, c]) => Number.parseFloat(w) > 0 && !clear(c)).length;
      if (sides >= 3 || !clear(cs.backgroundColor)) continue;
      out.push(`${el.getAttribute("data-testid") ?? ""} "${el.textContent.trim()}"`);
    }
    return out;
  });
}

test("챌린지 — 만들기 · 링크 참가 · 규칙 고치기 · 토큰 바꿈 · 시작 · 출석표 · 정원 · 차단 · 나가기", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const a = await newUser(browser, "a", "방장시험");
  const b = await newUser(browser, "b", "멤버시험");

  // ── 만들기 ──
  await a.page.goto("/challenges");
  await expect(a.page.getByTestId("challenges-empty")).toBeVisible();
  await a.page.getByTestId("challenges-new").click();
  await expect(a.page.getByTestId("challenge-form")).toBeVisible();
  // 이름이 비면 만들 수 없다
  await expect(a.page.getByTestId("challenge-form-submit")).toBeDisabled();
  await a.page.getByTestId("challenge-form-title").fill("e2e 아침 근력");
  await a.page.getByTestId("challenge-form-penalty").fill("커피 쏘기");
  await a.page.getByTestId("challenge-form-submit").click();
  await a.page.waitForURL(/\/challenges\/[^/]+$/);
  const chId = decodeURIComponent(a.page.url().split("/").pop() ?? "");
  await expect(a.page.getByTestId("challenge-detail")).toHaveAttribute("data-status", "recruiting");
  await expect(a.page.getByTestId("challenge-penalty")).toHaveText("커피 쏘기");
  const link = (await a.page.getByTestId("challenge-invite-link").textContent())?.trim() ?? "";
  expect(link).toMatch(/\/challenges\/join\/[A-Za-z0-9_-]{20,}$/);
  // 모집 화면의 단추는 모두 상자 모양
  expect(await bareButtons(a.page)).toEqual([]);

  // ── 비로그인 초대 요약(인원 수만) → 가입한 b 가 링크로 참가 ──
  const anon = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ko-KR" });
  const ap = await anon.newPage();
  const res = await ap.goto(link);
  expect(res?.headers()["referrer-policy"]).toBe("no-referrer");
  await expect(ap.getByTestId("join-title")).toHaveText("e2e 아침 근력");
  await expect(ap.getByTestId("join-count")).toContainText("1/10");
  await expect(ap.getByTestId("join-need-login")).toBeVisible();
  await expect(ap.getByText("방장시험")).toHaveCount(0); // 멤버 이름은 보이지 않는다
  await anon.close();

  await b.page.goto(link);
  // 지금 1명 — 2명 그룹 안내를 참가 전에 본다(REV-161 M-4)
  await expect(b.page.getByTestId("join-two-note")).toBeVisible();
  await b.page.getByTestId("join-submit").click();
  await b.page.waitForURL(new RegExp(`/challenges/${chId}$`));
  await expect(b.page.getByTestId(`challenge-member-${b.id}`)).toBeVisible();
  // 멤버는 규칙을 못 고치고 초대 링크도 못 본다
  await expect(b.page.getByTestId("challenge-edit")).toHaveCount(0);
  await expect(b.page.getByTestId("challenge-invite")).toHaveCount(0);
  // 같은 링크를 다시 열면 「이미 참가 중」
  await b.page.goto(link);
  await expect(b.page.getByTestId("join-open")).toBeVisible();

  // ── 방장이 규칙 고치기(시작 전) ──
  await a.page.reload();
  await expect(a.page.getByTestId(`challenge-member-${b.id}`)).toBeVisible();
  await expect(a.page.getByTestId("challenge-two-note")).toBeVisible();
  await a.page.getByTestId("challenge-edit").click();
  await a.page.getByTestId("challenge-form-minsets-plus").click(); // 5 → 6
  await a.page.getByTestId("challenge-form-submit").click();
  await expect(a.page.getByTestId("challenge-minsets")).toHaveText("6세트 이상");

  // ── 토큰 바꿈 → 옛 링크 무효 ──
  await a.page.getByTestId("challenge-invite-rotate").click();
  await a.page.getByTestId("dialog-confirm").click();
  await expect(a.page.getByTestId("challenge-invite-link")).not.toHaveText(link);
  const link2 = (await a.page.getByTestId("challenge-invite-link").textContent())?.trim() ?? "";
  const c = await newUser(browser, "c", "늦은시험");
  await c.page.goto(link);
  await expect(c.page.getByTestId("join-invalid")).toBeVisible();

  // ── 차단 — a 가 c 를 막았으면 c 는 참가할 수 없다 ──
  sql(`insert into blocks (blocker_id, blocked_id) values ('${a.id}', '${c.id}')`);
  await c.page.goto(link2);
  await c.page.getByTestId("join-submit").click();
  await expect(c.page.getByText("참가할 수 없는 챌린지예요")).toBeVisible();
  sql(`delete from blocks where blocker_id = '${a.id}'`);

  // ── 정원 — psql 로 멤버 8명을 더 넣어 10명 → c 는 참가 단추가 막힌다 ──
  const fill: string[] = [];
  for (let i = 0; i < 8; i++) {
    const id = `e2e-ch-fill-${Date.now()}-${i}`;
    fill.push(id);
    sql(
      `insert into users (id, email, display_name, role) values ('${id}', '${id}@example.com', '채움${i}', 'user')`,
    );
    sql(`insert into challenge_members (challenge_id, user_id) values ('${chId}', '${id}')`);
  }
  await c.page.goto(link2);
  await expect(c.page.getByTestId("join-count")).toContainText("10/10");
  await expect(c.page.getByTestId("join-submit")).toBeDisabled();
  await expect(c.page.getByTestId("join-full")).toHaveText("정원이 찼어요");
  sql(`delete from challenge_members where user_id like 'e2e-ch-fill-%'`);

  // ── 시작 — starts_on 을 오늘로 옮기면 루프(2초)가 진행 중으로 바꾼다 ──
  const today = challengeDay();
  sql(`update challenges set starts_on = '${today}' where id = '${chId}'`);
  await expect
    .poll(() => sql(`select status from challenges where id = '${chId}'`), { timeout: 20_000 })
    .toBe("active");
  await a.page.reload();
  await expect(a.page.getByTestId("challenge-detail")).toHaveAttribute("data-status", "active");
  await expect(a.page.getByTestId("challenge-week")).toBeVisible();
  // 줄 = 멤버 · 오늘 칸은 「오늘」(이름 + 날짜 + 상태로 읽힌다)
  const todayCell = a.page.getByTestId(`challenge-cell-${a.id}-${today}`);
  await expect(todayCell).toHaveAttribute("data-result", "today");
  await expect(todayCell).toHaveAttribute("aria-label", /방장시험 · .+ · 오늘/);
  await expect(a.page.getByTestId(`challenge-week-row-${b.id}`)).toBeVisible();
  await expect(a.page.getByTestId("challenge-legend")).toBeVisible();
  // [원본] toContainText("오늘") · toContainText("1") — 상태와 상관없이 늘 통과했다(REV-161 L-17)
  await expect(a.page.getByTestId("challenge-my-today")).toHaveText("내 오늘: 아직 안 함");
  await expect(a.page.getByTestId("challenge-passes-left")).toHaveText("이번 주 남은 면제권 1개");
  // 시작한 뒤에는 규칙을 못 고치고 초대 링크도 없다
  await expect(a.page.getByTestId("challenge-edit")).toHaveCount(0);
  await expect(a.page.getByTestId("challenge-invite")).toHaveCount(0);
  // 오늘 칸을 누르면 그날 인증 시트(아직 없음)
  await todayCell.click();
  await expect(a.page.getByTestId("challenge-day-sheet")).toBeVisible();
  await expect(a.page.getByTestId("day-sheet-empty")).toBeVisible();
  expect(await bareButtons(a.page)).toEqual([]);
  await a.page.keyboard.press("Escape");
  await expect(a.page.getByTestId("challenge-day-sheet")).toHaveCount(0);
  // 진행 화면의 단추도 모두 상자 모양(출석표 칸 포함)
  expect(await bareButtons(a.page)).toEqual([]);

  // ── 진입점 — 프로필 줄 · 운동 홈 줄 · 피드 카드 ──
  await a.page.goto("/profile");
  await expect(a.page.getByTestId("btn-challenges")).toBeVisible();
  await a.page.goto("/");
  await expect(a.page.getByTestId(`challenge-home-${chId}`)).toHaveText("e2e 아침 근력 · 오늘 아직 안 함");
  await a.page.goto("/feed");
  await expect(a.page.getByTestId("challenge-feed-card")).toContainText("e2e 아침 근력");
  await expect(a.page.getByTestId("challenge-feed-card")).toContainText("오늘: 아직 안 함");
  // 목록 — 진행 중 줄에 오늘 상태
  await a.page.goto("/challenges");
  await expect(a.page.getByTestId(`challenge-row-${chId}`)).toContainText("진행 중");

  // ── 방장은 넘기기 전엔 못 나간다 → b 에게 넘기고 나간다 ──
  await a.page.goto(`/challenges/${chId}`);
  await expect(a.page.getByTestId("challenge-leave")).toBeDisabled();
  await a.page.getByTestId("challenge-transfer").click();
  await a.page.getByTestId(`challenge-transfer-to-${b.id}`).click();
  await a.page.getByTestId("dialog-confirm").click();
  await expect(a.page.getByTestId("challenge-transfer")).toHaveCount(0);
  await a.page.getByTestId("challenge-leave").click();
  await a.page.getByTestId("dialog-confirm").click();
  await a.page.waitForURL(/\/challenges$/);
  // 나간 사람은 상세를 못 본다(멤버가 아니면 NotFound)
  await a.page.goto(`/challenges/${chId}`);
  await expect(a.page.getByTestId("challenge-error")).toBeVisible();
  // b 화면에는 a 가 나간 사람으로(줄은 남는다)
  await b.page.goto(`/challenges/${chId}`);
  await expect(b.page.getByTestId(`challenge-week-row-${a.id}`)).toBeVisible();
  await expect(b.page.getByTestId("challenge-transfer")).toHaveCount(0); // 남은 멤버가 b 하나

  // ── 알림 — 모집 중 방장이 해산하면 멤버에게 「취소」 알림, 누르면 그 챌린지로 ──
  await a.page.goto("/challenges");
  await a.page.getByTestId("challenges-new").click();
  await a.page.getByTestId("challenge-form-title").fill("e2e 해산");
  await a.page.getByTestId("challenge-form-submit").click();
  await a.page.waitForURL(/\/challenges\/[^/]+$/);
  const ch2 = decodeURIComponent(a.page.url().split("/").pop() ?? "");
  const link3 = (await a.page.getByTestId("challenge-invite-link").textContent())?.trim() ?? "";
  await c.page.goto(link3);
  await c.page.getByTestId("join-submit").click();
  await c.page.waitForURL(new RegExp(`/challenges/${ch2}$`));
  await a.page.getByTestId("challenge-leave").click();
  await a.page.getByTestId("dialog-confirm").click();
  await a.page.waitForURL(/\/challenges$/);
  await c.page.goto("/notifications");
  const note = c.page.getByText("챌린지가 취소됐어요");
  await expect(note).toBeVisible();
  await expect(c.page.getByTestId("notif-challenge-icon").first()).toBeVisible();
  await note.click();
  await c.page.waitForURL(new RegExp(`/challenges/${ch2}$`));
  await expect(c.page.getByTestId("challenge-detail")).toHaveAttribute("data-status", "cancelled");

  await a.ctx.close();
  await b.ctx.close();
  await c.ctx.close();
});
