// 이달의 리프터 운영(SPEC-063 Phase 3). scripts/e2e-admin.sh 가 띄운 새 시험 DB 에서만 돈다(helpers/base 가 로컬만 받는다).
// 시험 계정·운동 기록·발표 달은 전부 이 시험 DB 안에 만든다 — 운영 DB 에는 쓰지 않는다.
//
// 확정은 「다음 달 3일 0시 이후」에만 된다. 시험 날짜로는 끝난 달을 만들 수 없어,
//   · 후보·미리보기·검색·확정 버튼 잠김은 실제 백엔드로
//   · 화면 안 확인 단계(요약 → 정말 확정 → 결과)는 Candidates·Confirm 응답만 바꿔서(확정 규칙 자체는 Go 시험 · REV-154)
//   · 쿠폰 등록은 시험 DB 에서 그 달을 발표 상태로 둔 뒤 실제 백엔드로 → 앱 API 에서 그 사람에게 번호가 보이는지까지
import { API, expect, logIn, makeAccount, PASSWORD, sql, test } from "./helpers/base";

test.describe.configure({ mode: "serial" });

const KST = 9 * 3600_000;
function kstMonth(ms = Date.now()): string {
  const d = new Date(ms + KST);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const MONTH = kstMonth();
const monthStart = (() => {
  const [y, m] = MONTH.split("-").map(Number);
  return Date.UTC(y, m - 1, 1) - KST;
})();
const RUN = `e2e-aw-admin-${Date.now()}`;
/** 고유 이름 꼬리 — 검색이 다른 시험 계정과 겹치지 않게(REV-156 경계 8) */
const TAG = RUN.slice(-6);
/** 달 12일 1시 전 — 12일치 기록이 미래가 되어 날짜 시험만 건너뛴다(모더레이터 시험은 늘 돈다 · REV-156 경계 5) */
const EARLY = Date.now() < monthStart + 11 * 86_400_000 + 3600_000;

/** 이번 달 1일부터 n일, 날마다 30분 완료 운동(받은 시각 = 시작 시각). late 면 2일에 5일 늦게 올라온 기록 하나를 더한다. */
function 운동(uid: string, n: number, opts: { lateOne?: boolean } = {}) {
  const put = (tag: string, st: number, got: number) => {
    const id = `${RUN}-${uid}-${tag}`;
    sql(
      `insert into sync_records (id, user_id, collection, record_id, payload, created_at, updated_at) values ('${id}', '${uid}', 'workouts', '${id}', '{"state":"completed","started_at":${st},"duration_seconds":1800,"source":null}'::jsonb, to_timestamp(${got / 1000}), to_timestamp(${got / 1000}))`,
    );
  };
  for (let i = 0; i < n; i++) {
    const st = monthStart + i * 86_400_000 + 30 * 60_000; // 그날 0시 30분(KST)
    put(String(i), st, st);
  }
  if (opts.lateOne) {
    const st = monthStart + 86_400_000 + 3 * 3600_000;
    put("late", st, st + 5 * 86_400_000);
  }
}

function uidOf(email: string): string {
  return sql(`select id from users where email = '${email}'`);
}

async function appToken(email: string): Promise<string> {
  const r = await fetch(`${API}/api/auth.v1.AuthService/LogIn`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`앱 로그인 실패 ${r.status}`);
  return (await r.json()).tokens.accessToken;
}

let steadyEmail = "";
let steadyId = "";
let lateId = "";

test.beforeAll(async () => {
  steadyEmail = await makeAccount("user");
  steadyId = uidOf(steadyEmail);
  const lateEmail = await makeAccount("user");
  lateId = uidOf(lateEmail);
  // 자격: 메일 확인 · 가입 30일(이달 말 기준 7일)
  sql(
    `update users set email_verified_at = now() - interval '29 days', created_at = now() - interval '30 days', display_name = '꾸준운영시험${TAG}' where id = '${steadyId}'`,
  );
  // 메일 미확인 · 12일 + 5일 늦게 올라온 기록 하나 → 12일 · late 1
  sql(
    `update users set email_verified_at = null, created_at = now() - interval '30 days', display_name = '늦은운영시험${TAG}' where id = '${lateId}'`,
  );
  // 1일 0시 30분부터 12일치 — 12일 0시 30분이 지나야 미래 기록이 아니다. 그 전이면 기록을 깔지 않는다(그 시험들만 건너뜀)
  if (!EARLY) {
    운동(steadyId, 12);
    운동(lateId, 12, { lateOne: true });
  }
});

test("모더레이터는 메뉴도 화면도 없다 · RPC 를 부르지 않는다 · 직접 불러도 6개 모두 거절", async ({
  page,
}) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("AwardAdminService")) calls.push(r.url());
  });
  await logIn(page, await makeAccount("moderator"));
  await expect(page.getByTestId("home")).toBeVisible();
  await expect(page.getByTestId("menu-awards")).toHaveCount(0);
  await page.goto("/awards");
  await expect(page.getByTestId("role-denied")).toBeVisible();
  expect(calls).toEqual([]);
  // 백엔드가 직접 막는다 — 화면 문만 닫은 것이 아니다(REV-156 경계 4)
  const tok = await appToken(await makeAccount("moderator"));
  for (const m of ["Candidates", "DrawPreview", "Confirm", "ListAwards", "SetCoupon", "SearchAwardUsers"]) {
    const r = await fetch(`${API}/api/award.v1.AwardAdminService/${m}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
      body: JSON.stringify({ month: MONTH, query: "운영", awardId: "x", couponCode: "x", couponItem: "x" }),
    });
    expect(r.status, m).toBe(403);
  }
});

test("관리자 — 후보(날·늦은 기록·자격 이유) · 미리보기 · 픽 검색 · 끝나지 않은 달은 확정 잠김", async ({
  page,
}) => {
  test.skip(EARLY, "달 12일 1시 전에는 건너뛴다(12일치 기록이 미래가 된다)");
  await logIn(page, await makeAccount("admin"));
  await page.getByTestId("menu-awards").click();
  await expect(page).toHaveURL(/\/awards$/);
  await page.getByTestId("award-month").selectOption(MONTH);
  await expect(page.getByTestId("award-status")).toContainText(/[0-9a-f]{64}/, { timeout: 15_000 });
  await expect(page.getByTestId("award-status")).toContainText("발표 전");

  const rows = page.getByTestId("award-steady-row");
  const steady = rows.filter({ hasText: `꾸준운영시험${TAG}` });
  await expect(steady).toContainText("12일");
  await expect(steady).toContainText("대상");
  const late = rows.filter({ hasText: `늦은운영시험${TAG}` });
  await expect(late).toContainText("12일"); // 늦게 올라온 1개는 날 수에 없다
  await expect(late).toContainText("1건");
  await expect(late.getByTestId("award-reasons")).toContainText("메일 미확인");
  await expect(page.getByTestId("award-popular-empty")).toBeVisible();

  // 끝나지 않은 달 — 미리보기는 되지만 확정은 잠김
  await expect(page.getByTestId("award-not-confirmable")).toBeVisible();
  await page.getByTestId("award-preview").click();
  const preview = page.getByTestId("award-preview-result");
  await expect(preview).toContainText("추첨 대상 1명"); // 자격 없는 사람은 추첨에 들지 않는다
  await expect(page.getByTestId("award-preview-row")).toHaveText(/꾸준운영시험/);
  await expect(page.getByTestId("award-confirm")).toBeDisabled();

  // 운영진 픽 — 검색 · 자격 없는 사람은 고를 수 없다 · 고르면 미리보기에서 빠진다
  await page.getByTestId("award-pick-query").fill(TAG);
  await page.getByTestId("award-pick-search").click();
  const res = page.getByTestId("award-pick-results");
  await expect(
    res
      .locator("li")
      .filter({ hasText: `늦은운영시험${TAG}` })
      .getByTestId("award-pick-choose"),
  ).toBeDisabled();
  await res
    .locator("li")
    .filter({ hasText: `꾸준운영시험${TAG}` })
    .getByTestId("award-pick-choose")
    .click();
  await expect(page.getByTestId("award-pick-chosen")).toContainText("꾸준운영시험");
  await expect(page.getByTestId("award-preview-result")).toHaveCount(0); // 고른 사람이 바뀌면 미리보기를 다시
  await page.getByTestId("award-preview").click();
  await expect(page.getByTestId("award-preview-result")).toContainText("추첨 대상 0명");
  expect(sql(`select count(*) from awards where month = '${MONTH}'`)).toBe("0");
});

test("확정 — 화면 안 확인 단계(요약 · 취소 · 정말 확정) · 이유 없으면 잠김", async ({ page }) => {
  test.skip(EARLY, "달 12일 1시 전에는 건너뛴다(12일치 기록이 미래가 된다)");
  await logIn(page, await makeAccount("admin"));
  // 확정할 수 있는 달인 것처럼 Candidates 의 confirmable 만 켠다(나머지는 실제 응답)
  await page.route("**/award.v1.AwardAdminService/Candidates", async (r) => {
    // 달을 바꾸면 앞 요청은 버려진다 — 그 응답이 이미 닫혔으면 그냥 둔다(전체 회귀에서 실측)
    try {
      const real = await r.fetch();
      const body = await real.json();
      await r.fulfill({ response: real, json: { ...body, confirmable: true } });
    } catch {
      await r.abort().catch(() => {});
    }
  });
  let confirmBody: Record<string, unknown> | null = null;
  await page.route("**/award.v1.AwardAdminService/Confirm", async (r) => {
    confirmBody = r.request().postDataJSON();
    await r.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ alreadyConfirmed: false, awards: [{ id: "x1" }, { id: "x2" }] }),
    });
  });
  await page.goto("/awards");
  await page.getByTestId("award-month").selectOption(MONTH);
  await expect(page.getByTestId("award-steady-row").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("award-confirm")).toBeDisabled(); // 미리보기 전
  await page.getByTestId("award-pick-query").fill(`꾸준운영시험${TAG}`);
  await page.getByTestId("award-pick-search").click();
  await page.getByTestId("award-pick-choose").first().click();
  await page.getByTestId("award-preview").click();
  await expect(page.getByTestId("award-preview-result")).toBeVisible();
  await expect(page.getByTestId("award-confirm")).toBeDisabled(); // 픽 이유가 없다
  await page.getByTestId("award-pick-reason").fill("매일 새벽 인증으로 분위기를 만들었어요");
  await expect(page.getByTestId("award-confirm")).toBeEnabled();

  await page.getByTestId("award-confirm").click();
  const dlg = page.getByTestId("confirm-dialog");
  await expect(dlg).toBeVisible();
  await expect(page.getByTestId("award-confirm-summary")).toContainText(
    `운영진 픽: 꾸준운영시험${TAG} — 매일 새벽 인증`,
  );
  await page.getByTestId("confirm-cancel").click();
  await expect(dlg).toHaveCount(0);
  expect(confirmBody).toBeNull();

  await page.getByTestId("award-confirm").click();
  await page.getByTestId("confirm-ok").click();
  await expect(page.getByTestId("award-notice")).toContainText("확정했습니다. 수상 2건");
  expect(confirmBody).toMatchObject({
    month: MONTH,
    pickUserId: steadyId,
    pickReason: "매일 새벽 인증으로 분위기를 만들었어요",
  });
});

test("확정된 달 — 수상 표 · 쿠폰 등록(뒤 4자리만) → 앱에서 그 사람에게만 번호", async ({ page }) => {
  test.skip(EARLY, "달 12일 1시 전에는 건너뛴다(12일치 기록이 미래가 된다)");
  // 시험 DB 안에서만: 이 달을 발표 상태로 두고 꾸준상 한 줄을 넣는다(확정 규칙은 Go 시험이 본다)
  // 앞 시험의 Candidates 가 이 달 행을 만들었어야 한다 — 0건이면 엉뚱한 곳에서 깨지지 않게 여기서 멈춘다(REV-156 경계 7)
  expect(
    sql(
      `update award_months set status = 'announced', announced_at = now() where month = '${MONTH}' returning month`,
    ).split("\n")[0], // psql 은 결과 줄 뒤에 「UPDATE n」 을 붙인다
  ).toBe(MONTH);
  sql(
    `insert into awards (id, month, category, user_id, rank, days) values ('${RUN}-1', '${MONTH}', 'steady', '${steadyId}', 1, 12)`,
  );
  await logIn(page, await makeAccount("admin"));
  await page.goto("/awards");
  await page.getByTestId("award-month").selectOption(MONTH);
  const row = page.getByTestId("award-result-row").filter({ hasText: `꾸준운영시험${TAG}` });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText("미등록");
  await expect(page.getByTestId("award-draw")).toHaveCount(0); // 발표된 달에는 확정 칸이 없다

  const bodies: string[] = [];
  page.on("response", async (r) => {
    if (r.url().includes("AwardAdminService")) bodies.push(await r.text().catch(() => ""));
  });
  await row.getByTestId("award-coupon-code").fill("ADMIN-COUPON-4321");
  await row.getByTestId("award-coupon-item").fill("닭가슴살 1만원권");
  await row.getByTestId("award-coupon-expires").fill("2027-01-31");
  await row.getByTestId("award-coupon-save").click();
  await expect(row.getByTestId("award-coupon-state")).toHaveText("…4321 · 닭가슴살 1만원권 · 2027-01-31");
  await expect(row.getByTestId("award-coupon-code")).toHaveValue("");
  expect(bodies.join("\n")).not.toContain("ADMIN-COUPON-4321"); // 응답에도 전체 번호가 없다

  // 이미 등록된 번호를 바꾸면 확인 창 — 취소하면 그대로
  await row.getByTestId("award-coupon-code").fill("ADMIN-COUPON-9999");
  await row.getByTestId("award-coupon-save").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("…4321 → …9999");
  await page.getByTestId("confirm-cancel").click();
  await expect(row.getByTestId("award-coupon-state")).toHaveText("…4321 · 닭가슴살 1만원권 · 2027-01-31");
  await expect(page.locator("body")).not.toContainText("ADMIN-COUPON-4321"); // 운영 화면엔 뒤 4자리만

  // 앱 API — 그 사람은 번호를 받고, 다른 사람은 not found
  const tok = await appToken(steadyEmail);
  const mine = await fetch(`${API}/api/award.v1.AwardService/GetMyAward`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
    body: JSON.stringify({ id: `${RUN}-1` }),
  });
  expect(mine.status).toBe(200);
  const got = (await mine.json()).award;
  expect(got.couponCode).toBe("ADMIN-COUPON-4321");
  expect(got.couponItem).toBe("닭가슴살 1만원권");
  const other = await fetch(`${API}/api/award.v1.AwardService/GetMyAward`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${await appToken(await makeAccount("user"))}`,
    },
    body: JSON.stringify({ id: `${RUN}-1` }),
  });
  expect(other.status).toBe(404);
});
