// 그룹 챌린지 인증 카메라 e2e(SPEC-064 Phase 3a · SRS-119·121). 시험 DB 에서만 — 시각은 psql 로 시험 DB 값을 옮긴다.
//   E2E_PSQL_URL=… BASE=http://127.0.0.1:3290 bunx playwright test e2e/challenge-proof.spec.ts
//   서버: CHALLENGE_LOOP_INTERVAL_SEC=2. 가짜 카메라는 사용자마다 다른 y4m(ffmpeg 로 만든다) — 같은 화면이면 그룹 중복으로 읽힌다.
//
// 흐름: 둘이 챌린지(헬스장 사진) → a 가 운동 시작 → 인증(지시·남은 시간 · 파일 입력 없음) → 같은 사진 다시 → 거부
//   → 지시 만료(psql 로 발급 시각을 당김) → 거부 후 새 지시 → 세트 5 → 마치기 → 서버 동기 대기
//   → 기록·인증·챌린지 날짜를 이틀 앞으로 옮김 → 루프가 그날을 「완료」로 → b 가 출석표에서 a 의 사진을 본다(blob)
//   → 로그인 없이 사진 주소 404 · 운동하지 않는 화면에는 인증 줄이 없다.
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Browser, chromium, expect, type Page, test } from "@playwright/test";
import { 마치기, 빠른_운동_시작, 세트_기록, 종목_추가 } from "./fixtures/declutter-seed";

const URL_ = process.env.E2E_PSQL_URL;
const BASE = process.env.BASE ?? "";
test.skip(!URL_, "E2E_PSQL_URL 이 없다 — 시험 DB 가 필요하다");
if (URL_) {
  const u = new URL(URL_);
  if (
    !/^(127\.0\.0\.1|localhost)$/.test(u.hostname) ||
    u.port === "5434" ||
    !/e2e/.test(u.pathname) ||
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+/.test(BASE) ||
    /:3100\b/.test(BASE)
  ) {
    throw new Error("challenge-proof e2e 는 로컬 시험 DB·시험 서버에서만 돈다");
  }
}
test.describe.configure({ mode: "serial" });

function sql(q: string): string {
  return execFileSync("psql", [URL_ as string, "-tAc", q])
    .toString()
    .trim();
}

function hasFfmpeg(): boolean {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** 사용자별 가짜 카메라 화면 — 서로 dHash 가 멀다(그림이 전혀 다르다) */
function y4m(dir: string, name: string, source: string): string {
  const out = join(dir, `${name}.y4m`);
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    source,
    "-t",
    "1",
    "-pix_fmt",
    "yuv420p",
    out,
  ]);
  return out;
}

async function launch(file: string): Promise<Browser> {
  return chromium.launch({
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-video-capture=${file}`,
    ],
  });
}

let seq = 0;
async function 가입(browser: Browser, tag: string, name: string) {
  const ctx = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 390, height: 844 },
    locale: "ko-KR",
    permissions: ["camera"],
  });
  const page = await ctx.newPage();
  seq += 1;
  const email = `e2e-chp-${tag}-${Date.now()}-${seq}@example.com`;
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

function challengeDay(ms = Date.now()): string {
  return new Date(ms + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

async function 찍기(page: Page, chId: string) {
  await page.getByTestId(`proof-line-shoot-${chId}`).click();
  await expect(page.getByTestId("proof-camera")).toBeVisible();
  // 갤러리에서 고르는 입력은 없다
  await expect(page.getByTestId("proof-camera").locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByTestId("proof-video")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("proof-prompt")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("proof-timer")).toContainText(/남은 시간 [23]:\d\d/);
  await page.getByTestId("proof-shoot").click();
}

test("인증 카메라 — 지시 · 같은 사진 거부 · 만료 · 마치기 · 그날 완료 · 사진 비공개", async () => {
  test.skip(!hasFfmpeg(), "ffmpeg 가 없다(가짜 카메라 파일을 만들 수 없다)");
  test.setTimeout(240_000);
  const dir = mkdtempSync(join(tmpdir(), "chp-"));
  // a 는 멈춘 화면(색 막대) — 다시 찍어도 같은 사진이어야 「같은 사진」 거부를 본다(거부 거리 ≤2 · REV-162 M-7)
  const ba = await launch(y4m(dir, "a", "smptehdbars=size=640x480:rate=5"));
  const bb = await launch(y4m(dir, "b", "mandelbrot=size=640x480:rate=5"));
  const a = await 가입(ba, "a", "인증시험A");
  const b = await 가입(bb, "b", "인증시험B");

  // ── 챌린지(헬스장 사진) · b 참가 · 오늘 시작 ──
  await a.page.goto("/challenges");
  await a.page.getByTestId("challenges-new").click();
  await a.page.getByTestId("challenge-form-title").fill("e2e 인증");
  await a.page.getByTestId("challenge-form-submit").click();
  await a.page.waitForURL(/\/challenges\/[^/]+$/);
  const chId = decodeURIComponent(a.page.url().split("/").pop() ?? "");
  const link = (await a.page.getByTestId("challenge-invite-link").textContent())?.trim() ?? "";
  await b.page.goto(link);
  await b.page.getByTestId("join-submit").click();
  await b.page.waitForURL(new RegExp(`/challenges/${chId}$`));
  sql(`update challenges set starts_on = '${challengeDay()}' where id = '${chId}'`);
  await expect
    .poll(() => sql(`select status from challenges where id = '${chId}'`), { timeout: 20_000 })
    .toBe("active");

  // 운동하지 않는 화면(챌린지 상세)에는 인증 단추가 없다
  await a.page.goto(`/challenges/${chId}`);
  await expect(a.page.locator('[data-testid^="proof-line-shoot-"]')).toHaveCount(0);

  // ── a: 운동 시작 → 인증 ──
  await 빠른_운동_시작(a.page);
  await expect(a.page.getByTestId(`proof-line-${chId}`)).toBeVisible({ timeout: 15_000 });
  await 찍기(a.page, chId);
  await expect(a.page.getByTestId(`proof-line-done-${chId}`)).toBeVisible({ timeout: 15_000 });
  // 올린 뒤 창이 닫히고 카메라도 꺼졌다(보이는 video 가 없다)
  await expect(a.page.getByTestId("proof-camera")).toHaveCount(0);
  expect(sql(`select count(*) from challenge_proofs where user_id = '${a.id}' and status = 'ok'`)).toBe("1");

  // 같은 화면을 다시 → 본인 지난 사진과 같다 → 거부(지시는 새로 받는다)
  await 찍기(a.page, chId);
  await expect(a.page.getByText("전에 올린 사진과 같은 사진이에요")).toBeVisible({ timeout: 15_000 });
  expect(sql(`select count(*) from challenge_proofs where user_id = '${a.id}'`)).toBe("1");

  // 지시 만료 — 쓰지 않은 지시의 발급 시각을 4분 당긴다 → 거부
  await expect(a.page.getByTestId("proof-prompt")).toBeVisible({ timeout: 15_000 });
  sql(
    `update challenge_prompts set issued_at = issued_at - interval '4 minutes' where user_id = '${a.id}' and used_at is null`,
  );
  await a.page.getByTestId("proof-shoot").click();
  await expect(a.page.getByText("지시 시간이 지났어요")).toBeVisible({ timeout: 15_000 });
  await a.page.getByTestId("proof-cancel").click();

  // ── 세트 5 → 마치기(확인창에는 인증 안내가 없다 — 오늘 찍었다) ──
  await 종목_추가(a.page, "바벨 벤치프레스");
  const rows = a.page.getByTestId("set-list").nth(0).locator("> div");
  for (let i = 0; i < 5; i++) {
    if ((await rows.count()) <= i) {
      await a.page.getByTestId("btn-add-set").first().click();
      await expect(rows).toHaveCount(i + 1);
    }
    await 세트_기록(a.page, 0, i, 60, 8);
  }
  await 마치기(a.page);
  // 서버 동기 — 완료 운동 하나와 세트 5개가 올라올 때까지
  await expect
    .poll(
      () =>
        sql(
          `select count(*) from sync_records where user_id = '${a.id}' and collection = 'workouts' and payload->>'state' = 'completed'`,
        ),
      { timeout: 60_000 },
    )
    .toBe("1");
  await expect
    .poll(
      () =>
        sql(
          `select count(*) from sync_records where user_id = '${a.id}' and collection = 'set_logs' and deleted = false`,
        ),
      { timeout: 60_000 },
    )
    .not.toBe("0");

  // ── 이틀 앞으로: 기록·인증·지시·챌린지 시작을 같이 옮긴다 → 루프가 그날을 판정 ──
  const shiftMs = 2 * 86_400_000;
  sql(`update sync_records set payload = payload
           || CASE WHEN jsonb_typeof(payload->'started_at') = 'number' THEN jsonb_build_object('started_at', (payload->>'started_at')::bigint - ${shiftMs}) ELSE '{}'::jsonb END
           || CASE WHEN jsonb_typeof(payload->'completed_at') = 'number' THEN jsonb_build_object('completed_at', (payload->>'completed_at')::bigint - ${shiftMs}) ELSE '{}'::jsonb END
       where user_id = '${a.id}' and collection = 'workouts'`);
  sql(`update sync_records set created_at = created_at - interval '2 days' where user_id = '${a.id}'`);
  sql(
    `update challenge_proofs set issued_at = issued_at - interval '2 days', captured_at = captured_at - interval '2 days' where challenge_id = '${chId}'`,
  );
  sql(
    `update challenge_prompts set issued_at = issued_at - interval '2 days' where challenge_id = '${chId}'`,
  );
  const day = challengeDay(Date.now() - shiftMs);
  sql(`update challenges set starts_on = '${day}' where id = '${chId}'`);
  await expect
    .poll(
      () =>
        sql(
          `select result || ':' || final from challenge_days where challenge_id = '${chId}' and user_id = '${a.id}' and day = '${day}'`,
        ),
      {
        timeout: 30_000,
      },
    )
    .toBe("done:true");

  // ── b 가 출석표에서 a 의 그날 칸 → 사진(blob) · 이의 단추(확정 전 · 남의 인증) ──
  await b.page.goto(`/challenges/${chId}`);
  const cell = b.page.getByTestId(`challenge-cell-${a.id}-${day}`);
  await expect(cell).toHaveAttribute("data-result", "done");
  await cell.click();
  await expect(b.page.getByTestId("proof-photo")).toBeVisible({ timeout: 15_000 });
  expect(await b.page.getByTestId("proof-photo").getAttribute("src")).toMatch(/^blob:/);
  // 미리보기(3:4)에 보이던 만큼만 올라갔다 — 가짜 카메라 640×480 의 가운데 360×480(REV-162 H-1)
  await expect
    .poll(() =>
      b.page
        .getByTestId("proof-photo")
        .evaluate((img: HTMLImageElement) => img.naturalWidth / img.naturalHeight),
    )
    .toBeCloseTo(0.75, 2);
  const proofId = sql(`select id from challenge_proofs where user_id = '${a.id}'`);
  await expect(b.page.getByTestId(`proof-flag-${proofId}`)).toBeVisible();

  // ── 사진 주소는 로그인 없이 열리지 않는다(같은 404) · 공개 미디어 경로로도 없다 ──
  const anon = await bb.newContext({ baseURL: BASE });
  const r1 = await anon.request.get(`/api/challenge-proof/${proofId}`);
  expect(r1.status()).toBe(404);
  const key = sql(`select storage_key from challenge_proofs where id = '${proofId}'`);
  const r2 = await anon.request.get(`/api/media/file/${key}`);
  expect(r2.status()).toBe(404);
  await anon.close();

  await ba.close();
  await bb.close();
});
