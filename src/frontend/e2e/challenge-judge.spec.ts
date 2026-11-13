// 그룹 챌린지 판정 e2e(SPEC-064 Phase 3b · SRS-120). 시험 DB 에서만 — 날짜·기록은 psql 로 시험 DB 에 넣는다.
//   E2E_PSQL_URL=… BASE=http://127.0.0.1:3290 bunx playwright test e2e/challenge-judge.spec.ts
//   서버: CHALLENGE_LOOP_INTERVAL_SEC=2(판정 루프가 2초마다).
//
// 1) 기록만 챌린지(a·b) — 9일 전 시작 · 1주 → 루프가 7일을 모두 확정하고 끝낸다:
//      a: D0 완료 · D1 빠짐 → D2 10세트로 만회 · D3 면제권 · D4 면제권 없음 → 빠짐 + 벌칙 1 · D5·D6 완료
//      b: 아무것도 안 함 → D0 면제 · 나머지 빠짐 + 벌칙 6
//    → 끝 화면 결과표 · a 가 자기 벌칙을 이행 체크
// 2) 사진 챌린지(a·b·c) — a 의 D0 인증에 b·c 두 명이 이의 → 무효 → 다시 판정(아직 확정 전이라 「못 함」)
// 3) 카메라 권한을 주지 않으면 설정 안내 · 옛 안드로이드 앱(카메라 권한 없는 1.8.0 전)이면 업데이트 안내
import { execFileSync } from "node:child_process";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { 빠른_운동_시작 } from "./fixtures/declutter-seed";

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
    throw new Error("challenge-judge e2e 는 로컬 시험 DB·시험 서버에서만 돈다(E2E_PSQL_URL · BASE 확인)");
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
async function 가입(browser: Browser, tag: string, name: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  seq += 1;
  const email = `e2e-chj-${tag}-${Date.now()}-${seq}@example.com`;
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill("hunter22!");
  await page.getByTestId("auth-name-input").fill(name);
  await page.getByTestId("age-confirm").check();
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
  const id = sql(`select id from users where email = '${email}'`);
  expect(id).toMatch(/\S/);
  return { ctx, page, id };
}

const H = 3_600_000;
/** 챌린지 하루(04:00 KST 경계) — 서버 rules.go 와 같다 */
function challengeDay(ms = Date.now()): string {
  return new Date(ms + 5 * H).toISOString().slice(0, 10);
}
function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 24 * H).toISOString().slice(0, 10);
}
/** 그날 04:00 KST 의 ms */
function dayStart(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) - 5 * H;
}

let rec = 0;
/** 완료 운동 하나 + 세트 n 개를 서버 동기 기록으로 넣는다 — 그날 14시에 하고 끝난 시각에 서버로 올라온 것으로 */
function 운동(user: string, day: string, sets: number): { wid: string; start: number; end: number } {
  rec += 1;
  const wid = `e2e-chj-w${Date.now()}-${rec}`;
  const start = dayStart(day) + 10 * H;
  const end = start + H;
  const at = `to_timestamp(${end / 1000})`;
  const row = (coll: string, rid: string, payload: string) =>
    `('${rid}-r', '${user}', '${coll}', '${rid}', '${payload}'::jsonb, false, ${at})`;
  const rows = [
    row("workouts", wid, JSON.stringify({ state: "completed", started_at: start, completed_at: end })),
    row("workout_exercises", `${wid}-b`, JSON.stringify({ workout_id: wid })),
  ];
  for (let i = 0; i < sets; i++)
    rows.push(
      row(
        "set_logs",
        `${wid}-s${i}`,
        JSON.stringify({ workout_exercise_id: `${wid}-b`, is_warmup: false, done: true, reps: 8 }),
      ),
    );
  sql(
    `insert into sync_records (id, user_id, collection, record_id, payload, deleted, created_at) values ${rows.join(", ")}`,
  );
  return { wid, start, end };
}

async function 새_챌린지(page: Page, title: string): Promise<string> {
  await page.goto("/challenges");
  await page.getByTestId("challenges-new").click();
  await page.getByTestId("challenge-form-title").fill(title);
  await page.getByTestId("challenge-form-penalty").fill("팔굽혀펴기 50개");
  await page.getByTestId("challenge-form-submit").click();
  await page.waitForURL(/\/challenges\/[^/]+$/);
  return decodeURIComponent(page.url().split("/").pop() ?? "");
}

function 결과(ch: string, user: string): string {
  return sql(
    `select string_agg(result || (case when final then '' else '?' end), ',' order by day) from challenge_days where challenge_id = '${ch}' and user_id = '${user}'`,
  );
}

test("판정 — 만회 · 면제권 · 빠짐과 벌칙 · 이행 체크 · 끝 결과표 · 이의 과반 무효 · 권한·옛 앱 안내", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const a = await 가입(browser, "a", "판정A");
  const b = await 가입(browser, "b", "판정B");
  const c = await 가입(browser, "c", "판정C");

  // ── 1) 기록만 · 매일 5세트 · 면제권 주 1 · 1주 · 9일 전 시작 ──
  const x = await 새_챌린지(a.page, "e2e 판정");
  const s0 = addDays(challengeDay(), -9);
  sql(`insert into challenge_members (challenge_id, user_id) values ('${x}', '${b.id}')`);
  운동(a.id, s0, 5); // D0 완료
  운동(a.id, addDays(s0, 2), 10); // D1 만회 · D2 완료
  운동(a.id, addDays(s0, 5), 5); // D5
  운동(a.id, addDays(s0, 6), 5); // D6
  sql(
    `update challenges set starts_on = '${s0}', weeks = 1, proof_mode = 'record', min_sets = 5, pass_per_week = 1 where id = '${x}'`,
  );
  await expect
    .poll(() => sql(`select status from challenges where id = '${x}'`), { timeout: 30_000 })
    .toBe("ended");
  expect(결과(x, a.id)).toBe("done,made_up,done,pass,missed,done,done");
  expect(결과(x, b.id)).toBe("pass,missed,missed,missed,missed,missed,missed");
  expect(
    sql(`select count(*) from challenge_debts where challenge_id = '${x}' and user_id = '${a.id}'`),
  ).toBe("1");
  expect(
    sql(`select count(*) from challenge_debts where challenge_id = '${x}' and user_id = '${b.id}'`),
  ).toBe("6");

  // 끝 화면 — 결과표(완료 · 만회 · 면제 · 빠짐 · 벌칙 이행/전체)
  await a.page.goto(`/challenges/${x}`);
  await expect(a.page.getByTestId("challenge-detail")).toHaveAttribute("data-status", "ended");
  const rowA = a.page.getByTestId(`challenge-tally-${a.id}`).locator("td");
  await expect(rowA).toHaveText(["판정A", "4", "1", "1", "1", "0/1"]);
  await expect(a.page.getByTestId(`challenge-tally-${b.id}`).locator("td")).toHaveText([
    "판정B",
    "0",
    "0",
    "1",
    "6",
    "0/6",
  ]);
  // 벌칙 — 본인은 자기 것을 이행 체크한다(스위치)
  const d4 = addDays(s0, 4);
  const toggle = a.page.getByTestId(`challenge-debt-toggle-${a.id}-${d4}`);
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(rowA).toHaveText(["판정A", "4", "1", "1", "1", "1/1"]);
  expect(sql(`select paid_by from challenge_debts where challenge_id = '${x}' and user_id = '${a.id}'`)).toBe(
    a.id,
  );
  // 남(b)의 벌칙은 방장(a)도 체크할 수 있지만 b 는 a 의 것을 못 한다
  await b.page.goto(`/challenges/${x}`);
  await expect(b.page.getByTestId(`challenge-debt-${a.id}-${d4}`)).toBeVisible();
  await expect(b.page.getByTestId(`challenge-debt-toggle-${a.id}-${d4}`)).toHaveCount(0);

  // ── 2) 사진 챌린지(a·b·c) — 그날 첫 판정 뒤 · 확정 전이 되도록 시작일을 고른다 ──
  //   하루 시작 + 36시간 ≤ 지금 < 하루 시작 + 60시간. 오늘 04:00 뒤 12시간 전이면 이틀 전, 아니면 어제.
  const today = challengeDay();
  const h = (Date.now() - dayStart(today)) / H;
  // 오늘 04:00 + 12시간(16:00 KST) 근처 15분은 첫 판정·확정 시각이 코앞이라 건너뛴다(REV-163 M-4)
  test.skip(Math.abs(h - 12) < 0.25, "16:00 KST 근처 — 판정 시각 경계라 건너뛴다");
  const y0 = Date.now() - dayStart(today) < 12 * H ? addDays(today, -2) : addDays(today, -1);
  const y = await 새_챌린지(a.page, "e2e 이의");
  sql(
    `insert into challenge_members (challenge_id, user_id) values ('${y}', '${b.id}'), ('${y}', '${c.id}')`,
  );
  const w = 운동(a.id, y0, 5);
  const proofId = `e2e-chj-p${Date.now()}`;
  sql(`insert into challenge_proofs (id, challenge_id, user_id, workout_id, prompt_id, prompt_code, issued_at, captured_at, dhash, source)
       values ('${proofId}', '${y}', '${a.id}', '${w.wid}', '${proofId}-q', 'thumb:rack', to_timestamp(${(w.start + 5 * 60_000) / 1000}),
               to_timestamp(${(w.start + 6 * 60_000) / 1000}), 12345, 'app')`);
  sql(
    `update challenges set starts_on = '${y0}', weeks = 1, proof_mode = 'any_photo', min_sets = 5 where id = '${y}'`,
  );
  await expect.poll(() => 결과(y, a.id), { timeout: 30_000 }).toMatch(/^done/);

  // b 와 c 가 그날 칸 → 인증 → 이의(남은 멤버 2명 중 과반 = 2)
  for (const v of [b, c]) {
    await v.page.goto(`/challenges/${y}`);
    const cell = v.page.getByTestId(`challenge-cell-${a.id}-${y0}`);
    await expect(cell).toHaveAttribute("data-result", "done");
    await cell.click();
    await expect(v.page.getByTestId(`proof-flag-${proofId}`)).toBeVisible({ timeout: 15_000 });
    await v.page.getByTestId(`proof-flag-${proofId}`).click();
    if (v === b) {
      await expect(v.page.getByTestId(`proof-flag-${proofId}`)).toHaveText("이의 취소", { timeout: 15_000 });
    } else {
      // 두 번째 이의로 과반 → 무효 — 무효가 된 인증에는 이의 단추가 없다(철회할 수 없다)
      await expect(v.page.getByTestId(`proof-${proofId}`)).toContainText("무효", { timeout: 15_000 });
      await expect(v.page.getByTestId(`proof-flag-${proofId}`)).toHaveCount(0);
    }
    await v.page.keyboard.press("Escape");
  }
  await expect
    .poll(() => sql(`select status from challenge_proofs where id = '${proofId}'`), { timeout: 20_000 })
    .toBe("invalid");
  // 다시 판정 — 인증이 없으니 완료가 아니다(확정 전이라 「못 함(만회 가능)」)
  await expect.poll(() => 결과(y, a.id), { timeout: 30_000 }).toMatch(/^missed_open\?/);
  await a.page.goto(`/challenges/${y}`);
  await expect(a.page.getByTestId(`challenge-cell-${a.id}-${y0}`)).toHaveAttribute(
    "data-result",
    "missed_open",
  );

  // ── 3) 카메라 권한을 주지 않은 브라우저 → 설정 안내(파일 고르기로 넘기지 않는다) ──
  //   (헤드리스 기본 브라우저에는 카메라 장치가 없어 권한 거부를 만들 수 없다 — 브라우저가 거부했을 때 내는 오류를 흉내)
  await a.ctx.addInitScript(() => {
    if (navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
  });
  await 빠른_운동_시작(a.page);
  await expect(a.page.getByTestId(`proof-line-${y}`)).toBeVisible({ timeout: 15_000 });
  await a.page.getByTestId(`proof-line-shoot-${y}`).click();
  await expect(a.page.getByTestId("proof-cam-denied")).toContainText("카메라 권한이 막혀 있어요", {
    timeout: 15_000,
  });
  await expect(a.page.getByTestId("proof-camera").locator('input[type="file"]')).toHaveCount(0);
  await expect(a.page.getByTestId("proof-shoot")).toBeDisabled();
  await a.page.getByTestId("proof-cancel").click();

  // 옛 안드로이드 앱(다리 없음 = 1.8.0 전) 흉내 → 업데이트 안내
  await a.ctx.addInitScript(() => {
    (window as unknown as { Capacitor: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "android",
      isPluginAvailable: () => false,
      Plugins: {},
    };
  });
  await a.page.reload();
  await expect(a.page.getByTestId(`proof-line-${y}`)).toBeVisible({ timeout: 20_000 });
  await a.page.getByTestId(`proof-line-shoot-${y}`).click();
  await expect(a.page.getByTestId("proof-cam-oldapp")).toContainText("1.8.0 이상으로 업데이트", {
    timeout: 15_000,
  });

  await a.ctx.close();
  await b.ctx.close();
  await c.ctx.close();
  // 이 시험이 넣은 행만 지운다(같은 시험 DB 를 다시 써도 쌓이지 않게 · REV-163 M-4)
  sql(`delete from challenges where id in ('${x}', '${y}')`);
  sql(`delete from sync_records where record_id like 'e2e-chj-%'`);
});
