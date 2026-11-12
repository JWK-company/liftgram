// 이달의 리프터 e2e(SPEC-063 · SRS-117). 시험 DB 에서만 돈다 — 시험 사용자·행을 그 안에서 만든다(운영 DB 에 쓰지 않는다).
//   E2E_PSQL_URL=postgres://app:app@127.0.0.1:55460/<시험 DB> BASE=http://127.0.0.1:3290 bunx playwright test e2e/awards.spec.ts
//
// 순서가 있다(serial): 먼저 「발표 없음 → 예시」를 보고, 마지막에 시험 DB 에 발표 달을 넣어 실제 수상자·쿠폰·알림을 본다.
import { execFileSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import {
  빠른_운동_시작,
  세트_기록,
  요약에서_멈추기,
  종목_추가,
  카탈로그_준비,
} from "./fixtures/declutter-seed";

const URL_ = process.env.E2E_PSQL_URL;
test.skip(!URL_, "E2E_PSQL_URL 이 없다 — 시험 DB 가 필요하다");
// 시험 DB 에서만 — 로컬 · dev DB(5434) 아님 · 이름에 e2e. 앱도 dev(3100)·운영 주소가 아니어야 한다(REV-155 보안 1)
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
    throw new Error("awards e2e 는 로컬 시험 DB·시험 서버에서만 돈다(E2E_PSQL_URL · BASE 확인)");
  }
}
test.describe.configure({ mode: "serial" });

/** 이 실행의 고유 접두어 — 같은 DB 에서 다시 돌려도 id 가 겹치지 않는다(REV-155 시험 1) */
const RUN = `e2e-aw-${Date.now()}`;

test.beforeAll(() => {
  // 전에 돌다 남은 이 시험의 행만 지운다(시험 DB 안)
  sql("delete from notifications where id like 'e2e-aw-%'");
  sql("delete from awards where id like 'e2e-aw-%'");
  sql("delete from award_months where seed like 'e2e-seed%'");
});

function sql(q: string): string {
  return execFileSync("psql", [URL_ as string, "-tAc", q])
    .toString()
    .trim();
}

const KST = 9 * 3600 * 1000;
function kstMonth(ms = Date.now()): string {
  const d = new Date(ms + KST);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthStart(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return Date.UTC(y, m - 1, 1) - KST;
}

let seq = 0;
function freshEmail(tag: string) {
  seq += 1;
  return `e2e-award-${tag}-${Date.now()}-${seq}@example.com`;
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
  // 앱과 psql 이 같은 DB 를 보는지 — 다르면 빈 값이다
  expect(id, "가입한 계정이 시험 DB 에 없다(E2E_PSQL_URL 과 BASE 가 다른 DB?)").toMatch(/\S/);
  return id;
}

/** 서버 동기 기록 한 줄 — 받은 시각 = 시작 시각(늦게 올린 기록이 아니다) */
function 기록(uid: string, tag: string, startMs: number, payload: Record<string, unknown>) {
  const id = `${RUN}-${uid}-${tag}`;
  const body = JSON.stringify({
    state: "completed",
    started_at: startMs,
    duration_seconds: 1800,
    source: null,
    ...payload,
  });
  sql(
    `insert into sync_records (id, user_id, collection, record_id, payload, created_at, updated_at) values ('${id}', '${uid}', 'workouts', '${id}', '${body}'::jsonb, to_timestamp(${startMs / 1000}), to_timestamp(${startMs / 1000}))`,
  );
}

/**
 * 이번 달 1·2일 10시(KST)에 센다 · 세지 않는 기록도 함께(REV-155 시험 3):
 * 같은 날 두 번째 · 9분 · 가져온 기록 · 미완료 · 지난달 말일 23:30(KST) → 여전히 2일
 */
function 운동_넣기(uid: string) {
  const from = monthStart(kstMonth());
  const d1 = from + 10 * 3600_000;
  const d2 = from + 86_400_000 + 10 * 3600_000;
  기록(uid, "d1", d1, {});
  기록(uid, "d2", d2, {});
  기록(uid, "d2b", d2 + 2 * 3600_000, {});
  기록(uid, "short", d1 + 3600_000 * 3, { duration_seconds: 540 });
  기록(uid, "import", from + 2 * 86_400_000, { source: "import" });
  기록(uid, "open", from + 2 * 86_400_000 + 3600_000, { state: "in_progress" });
  기록(uid, "prev", from - 30 * 60_000, {});
}

test("비로그인 — 발표 없음이면 「예시」 구역 · 링크 없음 · 규칙 · DB 에 수상 행 없음", async ({ page }) => {
  await page.goto("/awards");
  await expect(page.getByTestId("awards-screen")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("awards-signin")).toBeVisible();
  const ex = page.getByTestId("awards-example");
  await expect(ex).toBeVisible({ timeout: 15_000 });
  await expect(ex).toContainText("예시 — 실제 수상자가 아니에요");
  await expect(page.getByTestId("awards-example-card")).toHaveCount(3);
  await expect(ex.locator("a")).toHaveCount(0);
  for (const card of await page.getByTestId("awards-example-card").all()) {
    await expect(card).toHaveAttribute("aria-label", "예시 카드, 실제 수상자 아님");
    await expect(card).toContainText("예시 리프터");
  }
  await expect(page.getByTestId("nav-feed")).toHaveAttribute("aria-current", "page");
  await page.getByTestId("awards-rules").locator("summary").click();
  await expect(page.getByTestId("awards-rules")).toContainText("Apple과 Google은 이 행사의 후원사가 아니며");
  await expect(page.getByTestId("awards-seed-hash")).toContainText(/[0-9a-f]{64}/);
  expect(sql("select count(*) from awards")).toBe("0"); // 예시는 DB 행이 아니다
  expect(sql("select count(*) from users where display_name like '예시%'")).toBe("0");
});

test("로그인 — 내 현황(동기된 날 · 자격 이유) · 피드 띠는 닫으면 이 달에는 다시 안 보인다", async ({
  page,
}) => {
  const email = freshEmail("me");
  await 가입(page, email, "꾸준시험");
  const uid = userId(email);
  // 1·2일이 아직 오지 않은 때(1일 10시 전 · 2일)에는 미래 기록이 된다 — 그때는 건너뛴다
  test.skip(Date.now() < monthStart(kstMonth()) + 2 * 86_400_000 + 11 * 3600_000, "달 초에는 건너뛴다");
  운동_넣기(uid);
  await page.goto("/awards");
  await expect(page.getByTestId("awards-my-days")).toHaveText("2 / 12일", { timeout: 20_000 });
  await expect(page.getByTestId("awards-my-likes")).toHaveText("0개");
  // 메일 미확인이면 그 이유가 보인다(가입 7일은 「이달 말 기준」이라 월초~중순 가입은 걸리지 않는다)
  await expect(page.getByTestId("awards-my-reasons")).toContainText("메일 주소를 확인");
  // 이달 말 7일 안에 가입한 것처럼 → 「7일」 이유
  // KST 벽시계로 「다음 달 1일 − 2일」을 계산한 뒤 시각으로 바꾼다(세션 시간대와 무관 · REV-155 시험 5)
  sql(
    `update users set created_at = ((date_trunc('month', now() at time zone 'Asia/Seoul') + interval '1 month' - interval '2 days') at time zone 'Asia/Seoul') where id = '${uid}'`,
  );
  await page.reload();
  await expect(page.getByTestId("awards-my-reasons")).toContainText("가입한 지 7일", { timeout: 20_000 });
  sql(
    `update users set created_at = now() - interval '30 days', email_verified_at = now() where id = '${uid}'`,
  );
  await page.reload();
  await expect(page.getByTestId("awards-my-reasons")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByTestId("awards-example")).toBeVisible();

  await page.goto("/feed");
  const banner = page.getByTestId("awards-banner");
  await expect(banner).toContainText("이번 달 운동한 날 2일", { timeout: 20_000 });
  await page.getByTestId("awards-banner-close").click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("nav-feed")).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await expect(banner).toHaveCount(0);
  // 달 단위 열쇠 — 다른 달만 닫혀 있으면 다시 보인다(위 「없음」이 그리기 전 거짓 통과가 아님을 함께 증명)
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage))
      if (k.startsWith("awards-banner-dismissed:")) localStorage.removeItem(k);
    localStorage.setItem("awards-banner-dismissed:2000-01", "1");
  });
  await page.reload();
  await expect(banner).toBeVisible({ timeout: 20_000 });
});

test("운동 끝 화면 — 이 기기 기준 「이번 달 운동한 날」 줄 · 누르면 /awards", async ({ page }) => {
  test.setTimeout(180_000);
  await page.clock.install();
  await 카탈로그_준비(page);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 세트_기록(page, 0, 0, 60, 10);
  await page.clock.fastForward("11:00"); // 10분 이상이어야 센다
  await 요약에서_멈추기(page); // 「루틴으로 저장할까요?」 창은 「저장 안 함」으로 닫는다
  const line = page.getByTestId("summary-awards-line");
  await expect(line).toContainText("이번 달 운동한 날 1일 · 꾸준상 문턱 12일", { timeout: 10_000 });
  await line.click();
  await expect(page).toHaveURL(/\/awards$/);
});

test("발표된 달 — 실제 수상자 · 예시는 사라짐 · 쿠폰(가림·받음·비공개) · 알림 → 쿠폰 화면", async ({
  page,
  browser,
}) => {
  const email = freshEmail("win");
  await 가입(page, email, "수상시험");
  const uid = userId(email);
  const other = freshEmail("pop");
  const popId = `${RUN}-pop`;
  sql(
    `insert into users (id, email, display_name, role) values ('${popId}', '${other}', '인기시험', 'user')`,
  );
  const m = "2026-10"; // 시험 DB 전용 발표 달(행사 첫 달 전이라 실제 달과 겹치지 않는다)
  const seed = `e2e-seed-${RUN}`;
  sql(
    `insert into award_months (month, seed, seed_hash, status, announced_at) values ('${m}', '${seed}', encode(sha256('${seed}'::bytea), 'hex'), 'announced', now()) on conflict (month) do update set seed = excluded.seed, seed_hash = excluded.seed_hash, status = 'announced', announced_at = now()`,
  );
  sql(`delete from awards where month = '${m}'`);
  const mine = `${RUN}-1`;
  const theirs = `${RUN}-2`;
  sql(
    `insert into awards (id, month, category, user_id, rank, days, likes, coupon_code, coupon_item, coupon_expires) values ('${mine}', '${m}', 'steady', '${uid}', 1, 14, 0, 'CHICKEN-1234-5678', '닭가슴살 1만원권', '2027-01-31')`,
  );
  sql(
    `insert into awards (id, month, category, user_id, rank, days, likes, coupon_code, coupon_item, coupon_expires) values ('${theirs}', '${m}', 'popular', '${popId}', 1, 3, 41, 'POP-SECRET-9999', '남의 상품', '2027-01-31')`,
  );
  sql(
    `insert into notifications (id, user_id, kind, actor_id, ref_id) values ('${RUN}-n1', '${uid}', 'award', '${uid}', '${mine}')`,
  );

  await page.goto("/awards");
  const winners = page.getByTestId("awards-winners");
  await expect(winners).toBeVisible({ timeout: 20_000 });
  await expect(winners).toContainText("수상시험");
  await expect(winners).toContainText("인기시험");
  await expect(winners).toContainText("인정 좋아요 41개");
  await expect(winners).toContainText(`추첨 씨앗: ${seed}`);
  await expect(page.getByTestId("awards-example")).toHaveCount(0);
  await expect(page.getByTestId("awards-mine")).toContainText("쿠폰 보기");

  // 알림 → 쿠폰 화면
  await page.goto("/notifications");
  const row = page.getByTestId("notif-row").filter({ hasText: "이달의 리프터에 뽑혔어요" });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByTestId("notif-award-icon")).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/awards/${mine}$`));

  // 번호는 가려 두고 눌러야 보인다
  await expect(page.getByTestId("award-coupon-item")).toHaveText("닭가슴살 1만원권", { timeout: 20_000 });
  await expect(page.getByTestId("award-coupon-code")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("CHICKEN-1234-5678");
  await page.getByTestId("award-coupon-reveal").click();
  await expect(page.getByTestId("award-coupon-code")).toHaveText("CHICKEN-1234-5678");

  await page.getByTestId("award-coupon-claim").click();
  await expect(page.getByTestId("award-coupon-claimed")).toBeVisible();
  await expect.poll(() => sql(`select claimed_at is not null from awards where id = '${mine}'`)).toBe("t");
  await page.reload(); // 화면만 바뀐 것이 아니라 서버 값이다
  await expect(page.getByTestId("award-coupon-claimed")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("award-coupon-unclaim").click();
  await expect(page.getByTestId("award-coupon-claimed")).toHaveCount(0);
  await expect(page.getByTestId("award-coupon-claim")).toBeVisible();
  await expect.poll(() => sql(`select claimed_at is null from awards where id = '${mine}'`)).toBe("t");

  // 비공개로 돌린다
  await page.getByTestId("award-coupon-public").uncheck();
  await expect.poll(() => sql(`select public from awards where id = '${mine}'`)).toBe("f");

  // 남의 수상 쿠폰 화면은 열리지 않는다 — 번호도 상품도 응답·화면에 없다
  const bodies: string[] = [];
  page.on("response", async (r) => {
    if (r.url().includes("award.v1.AwardService/")) bodies.push(await r.text().catch(() => ""));
  });
  await page.goto(`/awards/${theirs}`);
  await expect(page.getByTestId("award-coupon-missing")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("award-coupon-item")).toHaveCount(0);
  await expect(page.getByTestId("award-coupon-reveal")).toHaveCount(0);
  expect(bodies.join("\n")).not.toContain("POP-SECRET-9999");
  await page.close();

  // 다른 사람(비로그인) 눈으로 — 「비공개 수상자」 · 이름·id·링크 없음 · 응답에도 없음(REV-155 시험 7·보안 8)
  const anon = await browser.newPage();
  const seen: string[] = [];
  anon.on("response", async (r) => {
    if (r.url().includes("award.v1.AwardService/")) seen.push(await r.text().catch(() => ""));
  });
  await anon.goto("/awards");
  const list = anon.getByTestId("awards-winners");
  await expect(list).toContainText("비공개 수상자", { timeout: 20_000 });
  await expect(list).not.toContainText("수상시험");
  await expect(list.locator('a[data-testid="awards-winner"]')).toHaveCount(1); // 인기시험만 링크
  await expect(list.locator(`a[href*="${uid}"]`)).toHaveCount(0);
  expect(seen.join("\n")).not.toContain(uid);
  expect(seen.join("\n")).not.toContain("CHICKEN");

  // 프로필 배지 — 프로필은 로그인이 필요하니 제3의 계정으로 본다.
  // 인기시험은 보이고, 비공개로 돌린 수상시험은 없다(응답을 받은 뒤에 판단)
  await 가입(anon, freshEmail("viewer"), "구경시험");
  await anon.goto(`/u/${popId}`);
  await expect(anon.getByTestId("profile-award-badges")).toContainText("인기상", { timeout: 20_000 });
  const badges = anon.waitForResponse((r) => r.url().includes("AwardService/GetUserBadges"));
  await anon.goto(`/u/${uid}`);
  await badges;
  await expect(anon.getByTestId("profile-award-badges")).toHaveCount(0);
  await anon.close();
});
