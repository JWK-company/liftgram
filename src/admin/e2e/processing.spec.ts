// 처리 화면(SPEC-033 Phase 4). 앱 시험 feedback, moderation 98·144, user-feedback 138, photo-scan 96 이후를 옮겼다.
// 데이터는 RPC·SQL 로 준비하고, 역할이 필요해도 건너뛰지 않는다.
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { accessToken, API, expect, logIn, makeAccount, PASSWORD, sql, test } from "./helpers/base";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==",
  "base64",
);
const tag = () => `${Date.now()}${Math.floor(Math.random() * 1e4)}`;

async function rpc<T>(path: string, token: string | null, body: unknown): Promise<T> {
  const res = await fetch(`${API}/api/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function tokenOf(email: string): Promise<string> {
  const r = await rpc<{ tokens: { accessToken: string } }>("auth.v1.AuthService/LogIn", null, {
    email,
    password: PASSWORD,
  });
  return r.tokens.accessToken;
}

const WEB = process.env.BASE ?? "http://localhost:3320";

function auditLines(): { rpc: string; userId: string; ip: string; status: string }[] {
  return readFileSync(process.env.ADMIN_LOG as string, "utf8")
    .split("\n")
    .filter((l) => l.includes('"admin_action"'))
    .map((l) => JSON.parse(l));
}
const auditMark = () => auditLines().length;
const auditFrom = (mark: number) => auditLines().slice(mark);

/** 사진 n장 달린 글을 올린다. 사진 주소를 돌려준다. */
async function postWithPhotos(text: string, photos: number): Promise<string[]> {
  return (await createPost(text, photos)).mediaUrls;
}

/** 사진 n장 달린 글을 올리고 다른 사람이 신고한다. 글 id 를 돌려준다. */
async function reportedPost(text: string, photos = 0): Promise<string> {
  const { id } = await createPost(text, photos);
  const reporter = await tokenOf(await makeAccount("user"));
  await rpc("moderation.v1.ModerationService/Report", reporter, {
    targetType: "TARGET_TYPE_POST",
    targetId: id,
    reason: "REASON_SPAM",
  });
  return id;
}

async function createPost(text: string, photos: number): Promise<{ id: string; mediaUrls: string[] }> {
  const author = await tokenOf(await makeAccount("user"));
  const mediaUrls: string[] = [];
  for (let i = 0; i < photos; i++) {
    const up = await rpc<{ media: { url: string } }>("media.v1.MediaService/UploadImage", author, {
      data: PNG.toString("base64"),
      contentType: "image/png",
    });
    mediaUrls.push(up.media.url);
  }
  const post = await rpc<{ post: { id: string } }>("feed.v1.FeedService/CreatePost", author, {
    caption: text,
    visibility: "VISIBILITY_PUBLIC",
    mediaUrls,
  });
  return { id: post.post.id, mediaUrls };
}

async function userFeedback(text: string): Promise<void> {
  const email = await makeAccount("user");
  sql(`update users set email_verified_at = now() where email = '${email}'`);
  await rpc("feedback.v1.FeedbackService/SubmitUserFeedback", await tokenOf(email), {
    body: text,
    appVersion: "9.9.9",
    platform: "web",
  });
}

async function goto(page: Page, role: "admin" | "moderator", path: string): Promise<string> {
  const email = await makeAccount(role);
  await logIn(page, email);
  await page.goto(path);
  return email;
}

const row = (page: Page, text: string, id = "fb-item") => page.getByTestId(id).filter({ hasText: text });

// ── 신고 ────────────────────────────────────────────────────────────────────

test("검토자는 줄을 승인·제거하고, 처리한 줄은 바로 사라지며 다시 읽어도 없다", async ({ page }) => {
  const t = tag();
  await reportedPost(`지울 글 ${t}`);
  await reportedPost(`풀어 줄 글 ${t}`);
  await goto(page, "moderator", "/moderation");
  const gone = row(page, `지울 글 ${t}`, "mod-item");
  await expect(gone).toContainText("스팸");
  await expect(gone).toContainText("신고");
  await gone.getByTestId("mod-remove").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("운영자 검토로 제거");
  await page.getByTestId("confirm-cancel").click();
  await expect(gone).toBeVisible();
  await gone.getByTestId("mod-remove").click();
  await page.getByTestId("confirm-ok").click();
  await expect(gone).toHaveCount(0);
  const kept = row(page, `풀어 줄 글 ${t}`, "mod-item");
  await kept.getByTestId("mod-approve").click();
  await expect(kept).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("mod-screen")).toBeVisible();
  await expect(row(page, t, "mod-item")).toHaveCount(0);
  expect(sql(`select moderation_status from posts where caption = '지울 글 ${t}'`)).toBe("removed");
  expect(sql(`select removed_at is not null from posts where caption = '지울 글 ${t}'`)).toBe("t");
});

test("사진은 blob 으로 실제 그려지고, 다 그려져야 승인할 수 있으며, 실패하면 다시 받는다", async ({
  page,
}) => {
  const t = tag();
  await reportedPost(`사진글 ${t}`, 2);
  let failOnce = true;
  await page.route("**/moderation.v1.ModerationService/GetReviewMedia", (route) => {
    if (failOnce) {
      failOnce = false;
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: '{"code":"internal","message":"x"}',
      });
    }
    return route.fallback();
  });
  await goto(page, "admin", "/moderation");
  const item = row(page, `사진글 ${t}`, "mod-item");
  await expect(item.getByTestId("mod-image-retry")).toBeVisible();
  await expect(item.getByTestId("mod-approve")).toBeDisabled();
  await item.getByTestId("mod-image-retry").click();
  await expect(item.getByTestId("mod-image")).toHaveCount(2);
  const first = item.getByTestId("mod-image").first();
  await expect(first).toHaveAttribute("src", /^blob:/);
  await expect.poll(() => first.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await first.click();
  await expect(page.getByTestId("mod-lightbox").locator("img")).toBeVisible();
  await page.getByTestId("mod-lightbox-close").click();
  await expect(item.getByTestId("mod-approve")).toBeEnabled();
  await item.getByTestId("mod-approve").click();
  await expect(item).toHaveCount(0);
});

test("사진 동시 요청은 3개를 넘지 않고, 열람·처리는 감사 줄에 남는다", async ({ page }) => {
  const t = tag();
  await reportedPost(`많은 사진 ${t}`, 6);
  let active = 0;
  let peak = 0;
  await page.route("**/moderation.v1.ModerationService/GetReviewMedia", async (route) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((d) => setTimeout(d, 150));
    await route.fallback();
    active--;
  });
  const mark = auditMark();
  const email = await goto(page, "admin", "/moderation");
  const item = row(page, `많은 사진 ${t}`, "mod-item");
  await expect(item.getByTestId("mod-image")).toHaveCount(6);
  expect(peak).toBe(3);
  await item.getByTestId("mod-approve").click();
  await expect(item).toHaveCount(0);
  const myId = sql(`select id from users where email = '${email}'`);
  const entries = auditFrom(mark);
  for (const rpc of ["GetReviewMedia", "Resolve"]) {
    expect(
      entries.some((x) => x.rpc === rpc && x.userId === myId && x.status === "200" && Boolean(x.ip)),
      rpc,
    ).toBe(true);
  }
});

test("위조 토큰과 grpc 형식으로는 남의 이름이 감사 줄에 찍히지 않는다", async () => {
  const forged = `x.${Buffer.from(JSON.stringify({ sub: "e2e-victim" })).toString("base64url")}.y`;
  const access = await accessToken();
  const send = (contentType: string) =>
    fetch(`${WEB}/api/moderation.v1.ModerationService/Resolve`, {
      method: "POST",
      headers: {
        "content-type": contentType,
        authorization: `Bearer ${forged}`,
        "cf-access-jwt-assertion": access,
      },
      body: JSON.stringify({ targetType: "TARGET_TYPE_POST", targetId: "x", action: "ACTION_APPROVE" }),
    });
  expect((await send("application/grpc-web+proto")).status).toBe(415);
  expect((await send("application/grpc+proto")).status).toBe(415);
  const mark = auditMark();
  expect((await send("application/json")).status).toBe(401);
  const entries = auditFrom(mark);
  expect(entries.at(-1)).toMatchObject({ rpc: "Resolve", status: "401", userId: "" });
});

test("역할마다 서버가 운영 프록시에서 거절하고, 옛 협업자 토큰도 막힌다", async () => {
  const access = await accessToken();
  const t = tag();
  await userFeedback(`원문 시험 ${t}`);
  const BODY: Record<string, unknown> = {
    ListEntries: { kind: "FEEDBACK_KIND_USER" },
    Resolve: { targetType: "TARGET_TYPE_POST", targetId: "no-such", action: "ACTION_APPROVE" },
    GetReviewMedia: { mediaUrl: "/media/file/no-such.jpg" },
    SetStatus: { id: "999999999", status: "FEEDBACK_STATUS_DONE" },
  };
  const call = async (token: string | null, path: string) => {
    const res = await fetch(`${WEB}/api/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-access-jwt-assertion": access,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(BODY[path.split("/")[1]] ?? {}),
    });
    return { status: res.status, body: await res.text() };
  };
  const tokens = {
    user: await tokenOf(await makeAccount("user")),
    coworker: await tokenOf(await makeAccount("coworker")),
    moderator: await tokenOf(await makeAccount("moderator")),
    admin: await tokenOf(await makeAccount("admin")),
  };
  const table: [string, number[]][] = [
    // 순서: 비로그인, 일반, 옛 협업자, 모더레이터, 관리자
    ["admin.v1.AdminService/GetSignupStats", [401, 403, 403, 403, 200]],
    ["ops.v1.OpsService/GetOpsStatus", [401, 403, 403, 403, 200]],
    ["moderation.v1.ModerationService/ListQueue", [401, 403, 403, 200, 200]],
    ["feedback.v1.FeedbackService/ListEntries", [401, 403, 403, 403, 200]],
    ["feedback.v1.FeedbackService/List", [401, 403, 403, 403, 200]],
    ["feedback.v1.FeedbackService/SetStatus", [401, 403, 403, 403, 404]],
    ["moderation.v1.ModerationService/Resolve", [401, 403, 403, 404, 404]],
    ["moderation.v1.ModerationService/GetReviewMedia", [401, 403, 403, 404, 404]],
  ];
  for (const [path, want] of table) {
    const got = [
      (await call(null, path)).status,
      (await call(tokens.user, path)).status,
      (await call(tokens.coworker, path)).status,
      (await call(tokens.moderator, path)).status,
      (await call(tokens.admin, path)).status,
    ];
    expect(got, path).toEqual(want);
  }
  const admin = await call(tokens.admin, "feedback.v1.FeedbackService/ListEntries");
  expect(admin.body).toContain(`원문 시험 ${t}`);
  expect(admin.body).toContain("authorName");
});

test("막힌 사진은 주소로 열리지 않고, 승인하면 모든 장이 풀리며 자동 감지로 거를 수 있다", async ({
  page,
}) => {
  const t = tag();
  const urls = await postWithPhotos(`막힌 글 ${t}`, 2);
  // 자동 스캔이 걸러 낸 상태: 글은 보류, 파일은 막힘(HoldWithMediaBlocked 와 같은 상태).
  sql(`update posts set moderation_status = 'pending' where caption = '막힌 글 ${t}'`);
  for (const u of urls) {
    sql(`update media_assets set flagged = true where url = '${u}'`);
    expect((await fetch(`${API}${u}`)).status).toBe(404);
  }
  await goto(page, "admin", "/moderation");
  const item = row(page, `막힌 글 ${t}`, "mod-item");
  await expect(item).toContainText("자동 감지");
  await page.getByTestId("mod-filter-source").selectOption("report");
  await expect(item).toHaveCount(0);
  await page.getByTestId("mod-filter-source").selectOption("auto");
  await expect(item.getByTestId("mod-image")).toHaveCount(2);
  await expect(item.getByTestId("mod-approve")).toBeEnabled();
  await item.getByTestId("mod-approve").click();
  await expect(item).toHaveCount(0);
  for (const u of urls) expect((await fetch(`${API}${u}`)).status).toBe(200);
});

test("처리한 글이 다시 신고되면 새로고침 때 큐에 돌아온다", async ({ page }) => {
  const t = tag();
  const id = await reportedPost(`재신고 글 ${t}`);
  await goto(page, "moderator", "/moderation");
  const item = row(page, `재신고 글 ${t}`, "mod-item");
  await item.getByTestId("mod-approve").click();
  await expect(item).toHaveCount(0);
  await rpc("moderation.v1.ModerationService/Report", await tokenOf(await makeAccount("user")), {
    targetType: "TARGET_TYPE_POST",
    targetId: id,
    reason: "REASON_SPAM",
  });
  await page.getByTestId("refresh").click();
  await expect(item).toBeVisible();
});

test("이미지가 아닌 형식은 그리지 않고 승인도 막는다", async ({ page }) => {
  const t = tag();
  await reportedPost(`형식 시험 ${t}`, 1);
  await page.route("**/moderation.v1.ModerationService/GetReviewMedia", async (route) => {
    // 바이너리 전송이라 실제 응답을 받아 형식만 바꾸지 못한다. 형식 필드를 가진 proto 를 손으로 만든다.
    const type = Buffer.from("image/svg+xml");
    const data = Buffer.from("<svg/>");
    const body = Buffer.concat([
      Buffer.from([0x0a, type.length]),
      type,
      Buffer.from([0x12, data.length]),
      data,
    ]);
    await route.fulfill({ status: 200, contentType: "application/proto", body });
  });
  await goto(page, "admin", "/moderation");
  const item = row(page, `형식 시험 ${t}`, "mod-item");
  await expect(item.getByTestId("mod-image-retry")).toContainText("지원하지 않는 형식");
  await expect(item.getByTestId("mod-approve")).toBeDisabled();
});

test("거르기는 주소에 남는다", async ({ page }) => {
  const t = tag();
  await reportedPost(`거르기 글 ${t}`);
  await goto(page, "moderator", "/moderation");
  await expect(row(page, t, "mod-item")).toBeVisible();
  await page.getByTestId("mod-filter-kind").selectOption("story");
  await expect(page).toHaveURL(/kind=story/);
  await expect(row(page, t, "mod-item")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("mod-filter-kind")).toHaveValue("story");
  await page.getByTestId("mod-filter-kind").selectOption("post");
  await expect(row(page, t, "mod-item")).toBeVisible();
});

// ── 사용자 의견 ─────────────────────────────────────────────────────────────

test("관리자는 의견을 처리한다: 승인은 메모 필수, 완료는 확인, 미처리가 먼저, HTML 은 글자로", async ({
  page,
}) => {
  const t = tag();
  const text = `상태 시험 <b>${t}</b>`;
  await userFeedback(text);
  await userFeedback(`둘째 ${t}`);
  await goto(page, "admin", "/user-feedback");
  const item = row(page, text);
  await expect(item.locator("b")).toHaveCount(0);
  await expect(item).toContainText("9.9.9");
  await expect(item).toContainText("web");
  await expect(item).toContainText(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
  await expect(item).toContainText("운영시험 user");

  await item.getByTestId("fb-approve").click();
  await expect(page.getByTestId("confirm-ok")).toBeDisabled();
  await page.getByTestId("fb-note").fill("이번 주에 고칩니다");
  await page.getByTestId("confirm-ok").click();
  await expect(item.getByTestId("fb-status")).toHaveText("승인");
  await expect(item).toContainText("이번 주에 고칩니다");
  const lit = text.replace(/'/g, "''");
  expect(
    sql(
      `select status, length(approved_body_sha256), approved_instruction from feedback_items where body = '${lit}'`,
    ),
  ).toBe("approved|64|이번 주에 고칩니다");
  await expect(item.getByTestId("fb-approve")).toHaveCount(0);

  await item.getByTestId("fb-done").click();
  await expect(page.getByTestId("confirm-dialog")).toContainText("다시 바꿀 수 없습니다");
  await page.getByTestId("confirm-ok").click();
  await expect(item.getByTestId("fb-status")).toHaveText("완료");
  await expect(item.getByRole("button")).toHaveCount(0);
  expect(
    sql(
      `select count(*) from feedback_events e join feedback_items f on f.id = e.item_id where f.body = '${lit}'`,
    ),
  ).toBe("2");

  // 끝난 글은 미처리 뒤로 간다.
  const order = await page.getByTestId("fb-item").allInnerTexts();
  expect(order.findIndex((x) => x.includes(`둘째 ${t}`))).toBeLessThan(
    order.findIndex((x) => x.includes(`상태 시험`)),
  );

  await page.getByTestId("filter-status").selectOption("done");
  await expect(page).toHaveURL(/status=done/);
  await expect(row(page, `둘째 ${t}`)).toHaveCount(0);
  await page.getByTestId("filter-search").fill(`없는말${t}`);
  await expect(page.getByTestId("fb-filter-empty")).toBeVisible();
  await page.getByTestId("filter-clear").click();
  await expect(row(page, `둘째 ${t}`)).toBeVisible();
});

test("다른 운영자가 먼저 처리해 충돌하면 안내하고 표를 다시 읽는다", async ({ page }) => {
  const t = tag();
  await userFeedback(`충돌 ${t}`);
  await goto(page, "admin", "/user-feedback");
  const item = row(page, `충돌 ${t}`);
  await expect(item.getByTestId("fb-reject")).toBeVisible();
  sql(`update feedback_items set status = 'done' where body = '충돌 ${t}'`);
  await item.getByTestId("fb-reject").click();
  await page.getByTestId("confirm-ok").click();
  // 다시 눌러도 소용없는 실패라 창을 닫고, 표는 이미 새 상태다.
  await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
  await expect(page.getByTestId("fb-notice")).toContainText("먼저 처리");
  await expect(item.getByTestId("fb-status")).toHaveText("완료");
  await expect(item.getByRole("button")).toHaveCount(0);
});

test("관리자의 역할을 회수하면 다음 호출부터 막힌다", async ({ page }) => {
  const t = tag();
  await userFeedback(`회수 시험 ${t}`);
  const email = await goto(page, "admin", "/user-feedback");
  await expect(row(page, `회수 시험 ${t}`)).toBeVisible();

  sql(`update users set role = 'user' where email = '${email}'`);
  await page.getByTestId("refresh").click();
  await expect(page.getByTestId("session-denied")).toBeVisible();
});

test("모더레이터에게는 의견 메뉴가 없고 호출도 하지 않는다", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("ListEntries")) calls.push(r.url());
  });
  await goto(page, "moderator", "/user-feedback");
  await expect(page.getByTestId("role-denied")).toBeVisible();
  await expect(page.getByTestId("menu-user-feedback")).toHaveCount(0);
  await expect(page.getByTestId("menu-ops-feedback")).toHaveCount(0);
  await page.goto("/ops-feedback");
  await expect(page.getByTestId("role-denied")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(calls).toEqual([]);
});

test("페이지는 50줄씩이고 처리해도 페이지가 유지된다", async ({ page }) => {
  const t = tag();
  sql(`insert into feedback_items (kind, body, status, created_at)
       select 'user', '페이지 ${t} ' || g, 'new', now() - (g || ' minutes')::interval from generate_series(1, 55) g`);
  try {
    await goto(page, "admin", `/user-feedback?q=${encodeURIComponent(`페이지 ${t}`)}`);
    await expect(page.getByTestId("fb-count")).toContainText("55건");
    await expect(page.getByTestId("fb-item")).toHaveCount(50);
    await page.getByTestId("pager").getByRole("button", { name: "다음" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId("fb-item")).toHaveCount(5);
    await page.getByTestId("fb-item").first().getByTestId("fb-reject").click();
    await page.getByTestId("confirm-ok").click();
    await expect(page.getByTestId("confirm-dialog")).toHaveCount(0);
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId("pager-label")).toContainText("2 / 2");
  } finally {
    sql(`delete from feedback_items where body like '페이지 ${t}%'`);
  }
});

// ── 운영 피드백 ─────────────────────────────────────────────────────────────

test("관리자가 적어 올리고 내가 쓴 글을 보며, 다른 관리자가 처리한다", async ({ page, context }) => {
  const t = tag();
  const title = `버튼이 안 눌려요 ${t}`;
  await goto(page, "admin", "/ops-feedback");
  await page.getByTestId("ops-fb-title").fill("가");
  await page.getByTestId("ops-fb-detail").fill("자세한 내용을 적었습니다.");
  await expect(page.getByTestId("ops-fb-submit")).toBeDisabled();
  await page.getByTestId("ops-fb-title").fill(title);
  await page.getByTestId("ops-fb-detail").fill("넷글자임");
  await expect(page.getByTestId("ops-fb-submit")).toBeDisabled();
  await page.getByTestId("ops-fb-detail").fill("자세한 내용을 적었습니다.");
  await page.getByTestId("ops-fb-submit").click();
  const item = row(page, title);
  await expect(item).toContainText("버그·문제");
  await expect(item).toContainText("내가 쓴 글");
  await expect(page.getByTestId("ops-fb-title")).toHaveValue("");

  const second = `이런 기능 ${t}`;
  await page.getByTestId("ops-fb-cat-improvement").click();
  await expect(page.getByTestId("ops-fb-cat-improvement")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("ops-fb-title").fill(second);
  await page.getByTestId("ops-fb-detail").fill("이런 화면이 있으면 좋겠습니다.");
  await page.getByTestId("ops-fb-submit").click();
  await expect(row(page, second)).toContainText("개선 제안");
  await page.reload();
  await expect(row(page, title)).toBeVisible();
  await expect(row(page, title)).toContainText("내가 쓴 글");

  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await goto(page, "admin", "/ops-feedback");
  const seen = row(page, title);
  await expect(seen).not.toContainText("내가 쓴 글");
  await seen.getByTestId("fb-start").click();
  await page.getByTestId("confirm-ok").click();
  await expect(seen.getByTestId("fb-status")).toHaveText("진행 중");
});

test("앱 사용자 의견과 운영 피드백은 섞이지 않는다", async ({ page }) => {
  const t = tag();
  await userFeedback(`섞임 시험 ${t}`);
  await goto(page, "admin", "/ops-feedback");
  await expect(page.getByTestId("ops-feedback-screen")).toBeVisible();
  await expect(page.getByTestId("ops-fb-compose")).toBeVisible();
  await expect(row(page, `섞임 시험 ${t}`)).toHaveCount(0);
});

for (const [name, width] of [
  ["PC", 1440],
  ["휴대폰", 390],
] as const) {
  test(`${name} 폭에서 페이지가 가로로 넘치지 않고 동작 열이 보인다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const t = tag();
    await userFeedback(`폭 시험 ${"긴내용 ".repeat(40)} ${t}`);
    await reportedPost(`폭 신고 ${t}`, 1);
    await goto(page, "admin", "/user-feedback");
    await expect(row(page, t)).toBeVisible();
    const check = async () => {
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(over).toBeLessThanOrEqual(0);
    };
    await check();
    await expect(row(page, t).getByTestId("fb-reject")).toBeInViewport();
    if (process.env.SHOT_DIR)
      await page.screenshot({ path: `${process.env.SHOT_DIR}/user-feedback-${width}.png` });
    for (const p of ["/moderation", "/stats", "/ops-feedback", "/ops", "/"]) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      await check();
      if (process.env.SHOT_DIR)
        await page.screenshot({
          path: `${process.env.SHOT_DIR}${p === "/" ? "/home" : p}-${width}.png`,
          fullPage: true,
        });
    }
  });
}

test("페이지를 오가 사진이 사라지면 다시 그려질 때까지 승인이 잠긴다", async ({ page }) => {
  const t = tag();
  await reportedPost(`왕복 글 ${t}`, 1);
  await goto(page, "admin", "/moderation");
  const item = row(page, `왕복 글 ${t}`, "mod-item");
  await expect(item.getByTestId("mod-approve")).toBeEnabled();
  await page.route("**/moderation.v1.ModerationService/GetReviewMedia", () => {}); // 응답하지 않는다
  await page.getByTestId("mod-filter-kind").selectOption("comment");
  await expect(item).toHaveCount(0);
  await page.getByTestId("mod-filter-kind").selectOption("");
  await expect(item.getByTestId("mod-approve")).toBeDisabled();
  await expect(item.getByTestId("mod-unseen")).toHaveText("사진 1장 확인 전");
});

test("응답 없는 사진은 시간이 지나면 끊기고 재시도 버튼이 뜬다", async ({ page }) => {
  test.setTimeout(60_000);
  const t = tag();
  await reportedPost(`무응답 ${t}`, 1);
  await page.route("**/moderation.v1.ModerationService/GetReviewMedia", () => {});
  await goto(page, "admin", "/moderation");
  const item = row(page, `무응답 ${t}`, "mod-item");
  await expect(item.getByTestId("mod-approve")).toBeDisabled();
  await expect(item.getByTestId("mod-image-retry")).toBeVisible({ timeout: 30_000 });
  await page.unroute("**/moderation.v1.ModerationService/GetReviewMedia");
  await item.getByTestId("mod-image-retry").click();
  await expect(item.getByTestId("mod-approve")).toBeEnabled();
});

test("마지막 줄을 처리해도 다시 읽기 전에는 「처리할 일 없음」이라고 하지 않는다", async ({ page }) => {
  const t = tag();
  sql(`update reports set status = 'dismissed' where status = 'pending'`);
  sql(`update posts set moderation_status = 'approved' where moderation_status = 'pending'`);
  await reportedPost(`마지막 ${t}`);
  await goto(page, "admin", "/moderation");
  const item = row(page, `마지막 ${t}`, "mod-item");
  await expect(item).toBeVisible();
  await page.route("**/moderation.v1.ModerationService/ListQueue", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: '{"code":"unavailable"}' }),
  );
  await item.getByTestId("mod-approve").click();
  await expect(page.getByTestId("mod-rechecking")).toContainText("확인하지 못했습니다");
  await expect(page.getByTestId("mod-empty")).toHaveCount(0);
  await page.unroute("**/moderation.v1.ModerationService/ListQueue");
  await page.getByTestId("refresh").click();
  await expect(page.getByTestId("mod-empty")).toBeVisible();
});

test("큐에 있던 글이 지워졌으면 이미 없어졌다고 알리고 다시 읽는다", async ({ page }) => {
  const t = tag();
  await reportedPost(`지워진 글 ${t}`);
  await goto(page, "admin", "/moderation");
  const item = row(page, `지워진 글 ${t}`, "mod-item");
  await expect(item).toBeVisible();
  sql(`delete from posts where caption = '지워진 글 ${t}'`);
  await item.getByTestId("mod-approve").click();
  await expect(page.getByTestId("mod-action-error")).toContainText("이미 없어진");
  await expect(item).toHaveCount(0);
});

test("의견을 처리하면 다시 읽기가 실패해도 표가 새 상태이고 메모가 유지된다", async ({ page }) => {
  const t = tag();
  await userFeedback(`즉시 반영 ${t}`);
  await goto(page, "admin", "/user-feedback");
  const item = row(page, `즉시 반영 ${t}`);
  await item.getByTestId("fb-start").click();
  await page.getByTestId("fb-note").fill("처음 메모");
  await page.getByTestId("confirm-ok").click();
  await expect(item.getByTestId("fb-status")).toHaveText("진행 중");
  await page.route("**/feedback.v1.FeedbackService/ListEntries", (route) =>
    route.fulfill({ status: 503, contentType: "application/json", body: '{"code":"unavailable"}' }),
  );
  await item.getByTestId("fb-done").click();
  await page.getByTestId("confirm-ok").click();
  await expect(item.getByTestId("fb-status")).toHaveText("완료");
  await expect(item.getByRole("button")).toHaveCount(0);
  await expect(item).toContainText("처음 메모");
});

test("요청 제한이면 창을 유지하고 다시 읽지 않는다", async ({ page }) => {
  const t = tag();
  await userFeedback(`제한 ${t}`);
  await goto(page, "admin", "/user-feedback");
  const item = row(page, `제한 ${t}`);
  await item.getByTestId("fb-start").click();
  await page.route("**/feedback.v1.FeedbackService/SetStatus", (route) =>
    route.fulfill({ status: 429, contentType: "application/json", body: '{"code":"resource_exhausted"}' }),
  );
  let reads = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/ListEntries")) reads++;
  });
  await page.getByTestId("confirm-ok").click();
  await expect(page.getByTestId("fb-action-error")).toContainText("요청이 너무 많습니다");
  await expect(page.getByTestId("confirm-dialog")).toBeVisible();
  expect(reads).toBe(0);
});

test("대화상자를 닫으면 연 버튼으로, 줄이 사라지면 다음 줄로 포커스가 간다", async ({ page }) => {
  const t = tag();
  await reportedPost(`포커스 A ${t}`);
  await reportedPost(`포커스 B ${t}`);
  await goto(page, "admin", "/moderation");
  const a = row(page, `포커스 B ${t}`, "mod-item");
  await a.getByTestId("mod-remove").click();
  await expect(page.getByRole("dialog", { name: /제거\(숨김\)할까요/ })).toBeVisible();
  await page.getByTestId("confirm-cancel").click();
  await expect(a.getByTestId("mod-remove")).toBeFocused();
  await a.getByTestId("mod-approve").click();
  await expect(a).toHaveCount(0);
  await expect(page.locator("[data-testid=mod-item] button:focus")).toHaveCount(1);
});

test("휴대폰 폭에서도 내용이 먼저 보이고 승인이 잠긴 이유를 글로 알린다", async ({ page }) => {
  const t = tag();
  await reportedPost(`좁은 폭 ${t}`, 1);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.route("**/moderation.v1.ModerationService/GetReviewMedia", () => {});
  await goto(page, "admin", "/moderation");
  const item = row(page, `좁은 폭 ${t}`, "mod-item");
  await expect(item.getByTestId("mod-unseen")).toBeVisible();
  await page.unroute("**/moderation.v1.ModerationService/GetReviewMedia");
  await page.reload();
  await expect(item.getByTestId("mod-image")).toBeVisible();
  await expect(item.getByTestId("mod-approve")).toBeEnabled();
});

test("주소에 남은 분류 값은 분류 없는 사용자 의견을 비우지 않는다", async ({ page }) => {
  const t = tag();
  await userFeedback(`분류 없음 ${t}`);
  await goto(page, "admin", "/user-feedback?category=bug");
  await expect(row(page, `분류 없음 ${t}`)).toBeVisible();
});

test("이모지 제목은 글자 수로 세어 서버와 같은 기준으로 막는다", async ({ page }) => {
  await goto(page, "admin", "/ops-feedback");
  await page.getByTestId("ops-fb-title").fill("😀😀");
  await page.getByTestId("ops-fb-detail").fill("다섯 글자 넘는 내용");
  await expect(page.getByTestId("ops-fb-submit")).toBeDisabled();
  await page.getByTestId("ops-fb-title").fill("😀😀😀");
  await expect(page.getByTestId("ops-fb-submit")).toBeEnabled();
});
