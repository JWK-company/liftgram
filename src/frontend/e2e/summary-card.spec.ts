// 이미 보낸 요약 카드가 남는지(SRS-101 · ADR-051) — 보내기 화면은 없어졌지만 서버·DM 카드·코치 리포트는 그대로다.
// 카드는 서버 API 로 직접 보내 만든다(옛 앱에서 보낸 것과 같은 상태).
import { expect, test } from "@playwright/test";
import {
  가입,
  동기,
  마치기,
  빠른_운동_시작,
  새_기기,
  새_메일,
  세트_기록,
  종목_추가,
  준비,
} from "./helpers/opengym";

type Page = import("@playwright/test").Page;

const RPC = "/api/coaching.v1.CoachingService";

/** 앱이 쓰는 인증 머리글을 그대로 받아 서버 API 를 부른다. */
async function 호출<T>(page: Page, auth: string, method: string, body: unknown): Promise<T> {
  return page.evaluate(
    async ({ url, body, auth }) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { authorization: auth, "content-type": "application/json", "connect-protocol-version": "1" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      return res.json();
    },
    { url: `${RPC}/${method}`, body, auth },
  ) as Promise<T>;
}

test("보낸 요약 카드는 DM·알림에서 열리고, 코치 리포트도 열리며, 해지하면 거부된다", async ({
  page,
  browser,
}) => {
  test.setTimeout(300_000);
  const tag = Date.now().toString(36);
  const 트레이너 = `코치c${tag}`;
  const 회원 = `회원c${tag}`;
  await 준비(page);
  await 가입(page, 새_메일("m-card"), 회원);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 세트_기록(page, 0, 0, 60, 10);
  await 마치기(page);
  await 동기(page);

  const [ctxT, pageT] = await 새_기기(browser);
  try {
    await 가입(pageT, 새_메일("t-card"), 트레이너);
    await pageT.goto("/profile");
    await pageT.getByTestId("btn-edit-experience").click();
    await pageT.getByTestId("trainer-intent").click();
    await expect(pageT.getByTestId("trainer-intent")).toHaveAttribute("aria-pressed", "true", {
      timeout: 20_000,
    });

    const grantsReq = page.waitForRequest(`**${RPC}/ListGrants`);
    await page.goto("/coaching");
    const auth = (await grantsReq).headers().authorization ?? "";
    expect(auth).not.toBe("");
    await page.getByTestId("coaching-query").fill(트레이너);
    await page.getByTestId("coaching-search").click();
    await expect(page.getByTestId("coaching-results")).toContainText(트레이너, { timeout: 20_000 });
    await page.getByTestId("coaching-request").first().click();
    await expect(page.getByTestId("coaching-coaches")).toContainText("수락 대기", { timeout: 20_000 });
    const grantsReqT = pageT.waitForRequest(`**${RPC}/ListGrants`);
    await pageT.goto("/coaching");
    const authT = (await grantsReqT).headers().authorization ?? "";
    await pageT.getByTestId("coaching-accept").click();
    await expect(pageT.getByTestId("coaching-members")).toContainText("코칭 중", { timeout: 20_000 });

    const { grants } = await 호출<{ grants: { peer: { id?: string; userId?: string } }[] }>(
      page,
      auth,
      "ListGrants",
      {},
    );
    const trainerId = grants[0].peer.id ?? grants[0].peer.userId ?? "";
    expect(trainerId).not.toBe("");
    const end = Date.now();
    const start = end - 28 * 86_400_000;
    const snapshot = {
      schemaVersion: 1,
      range: { startMs: start, endMs: end, tz: "Asia/Seoul" },
      counts: { workouts: 1, durationSec: 600, volumeKg: 600, perWeek: 0.3 },
    };
    await 호출(page, auth, "SendProgressSummary", {
      trainerId,
      periodStart: String(start),
      periodEnd: String(end),
      schemaVersion: 1,
      snapshotJson: JSON.stringify(snapshot),
      clientId: crypto.randomUUID(),
    });
    const 트레이너쪽 = await 호출<{ grants: { peer: { id: string } }[] }>(pageT, authT, "ListGrants", {});
    const 회원id = 트레이너쪽.grants[0].peer.id;
    expect(회원id).not.toBe("");
    const 대기_항목 = {
      trainerId,
      periodStart: start,
      periodEnd: end,
      schemaVersion: 1,
      snapshotJson: JSON.stringify(snapshot),
    };
    const 대기_심기 = () =>
      page.evaluate(
        ({ owner, item }) =>
          localStorage.setItem(
            `liftgram.summaryOutbox:${owner}`,
            JSON.stringify({
              pending: [{ ...item, clientId: crypto.randomUUID(), ownerUserId: owner, queuedAt: Date.now() }],
              failed: [],
            }),
          ),
        { owner: 회원id, item: 대기_항목 },
      );
    let sends = 0;
    page.on("request", (r) => {
      if (r.url().includes("SendProgressSummary")) sends++;
    });

    // 옛 앱에서 쌓인 대기 항목은 앱을 열면 한 번만 간다(화면은 없어도 대기열은 돈다)
    await 대기_심기();
    await page.reload();
    await expect.poll(() => sends, { timeout: 20_000 }).toBe(1);
    await page.reload();
    await page.waitForTimeout(2_000);
    expect(sends).toBe(1);

    // 트레이너: 대화 → 카드 → 열기
    await pageT.goto("/messages");
    const row = pageT.getByTestId("dm-row").filter({ hasText: 회원 });
    await expect(row).toContainText("성과 요약", { timeout: 20_000 });
    await row.click();
    // 직접 보낸 것 + 대기열로 간 것 = 카드 2장
    await expect(pageT.getByTestId("conv-summary-card")).toHaveCount(2, { timeout: 20_000 });
    const card = pageT.getByTestId("conv-summary-card").first();
    await expect(card).toHaveText(/성과 요약 · 눌러서 보기/, { timeout: 20_000 });
    await card.click();
    const open = pageT.getByTestId("ps-open");
    await expect(open.getByTestId("ps-workouts")).toHaveText("1회", { timeout: 20_000 });
    await expect(open.getByTestId("ps-volume")).toHaveText("600kg");
    await open.getByTestId("ps-prescribe").click();
    await expect(pageT.getByTestId("coaching-routines-view")).toBeVisible({ timeout: 20_000 });
    await pageT.keyboard.press("Escape");

    // 알림 → 그 대화(카드 강조)
    await pageT.goto("/notifications");
    const n = pageT.getByTestId("notif-row").filter({ hasText: "성과 요약을 보냈어요" }).first();
    await expect(n).toBeVisible({ timeout: 20_000 });
    await n.click();
    await expect(pageT).toHaveURL(/\/messages\/.+\?highlight=summary/, { timeout: 20_000 });
    await expect(pageT.getByTestId("conv-summary-card").last()).toHaveAttribute("data-highlight", "1", {
      timeout: 20_000,
    });

    // 코치 리포트
    await pageT.goto("/coaching");
    await pageT.getByTestId("coaching-report").click();
    const ready = pageT.getByTestId("report-ready");
    await expect(ready).toBeVisible({ timeout: 20_000 });
    await expect(ready.getByTestId("ps-volume")).toHaveText("600kg");
    await pageT.getByTestId("coaching-report-view").getByRole("button", { name: "확인" }).click();

    // 해지 → 거부
    await page.goto("/coaching");
    await page.getByTestId("coaching-revoke").first().click();
    await expect(page.getByTestId("coaching-coaches")).toHaveCount(0, { timeout: 20_000 });
    await pageT.goto("/messages");
    await pageT.getByTestId("dm-row").filter({ hasText: 회원 }).click();
    await pageT.getByTestId("conv-summary-card").first().click();
    await expect(pageT.getByTestId("ps-open-ended")).toHaveText("코칭이 끝나 볼 수 없어요", {
      timeout: 20_000,
    });

    // 계정 전환 — A 가 못 보낸 항목이 남은 채 로그아웃 → B 로그인: 보내지 않고 대기열도 비운다
    await page.route(`**${RPC}/SendProgressSummary`, (r) => r.abort("internetdisconnected"));
    await 대기_심기();
    await page.goto("/account");
    await page.getByTestId("btn-logout").click();
    await expect(page.getByTestId("auth-email-input")).toBeVisible({ timeout: 20_000 });
    await page.unroute(`**${RPC}/SendProgressSummary`);
    sends = 0;
    await 가입(page, 새_메일("b-card"), `다른사람${tag}`);
    await page.waitForTimeout(3_000);
    expect(sends).toBe(0);
    const 남은것 = await page.evaluate(() =>
      Object.keys(localStorage).filter(
        (k) => k.startsWith("liftgram.summaryOutbox:") && localStorage.getItem(k)?.includes("clientId"),
      ),
    );
    expect(남은것).toEqual([]);
  } finally {
    await ctxT.close();
  }
});
