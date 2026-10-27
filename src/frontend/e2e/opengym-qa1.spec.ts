// @plm SRS-073 SRS-074 SRS-077 SRS-051  openGym 첫 배포 /qa code 1회차 클라이언트 조치 회귀(CD-1·CD-2·CD-3·CU-5~7·CU-12)
//
// 확인 목록:
//   · 체중(CD-1·CD-2): 프로필 80 → 82 → 80 — 입력 사이 줄을 1분 넘게 되감고(연타 합치기 밖) 다시 열어도(부팅 정리) 80 · 0 은 다시 열어도 0
//   · RIR 경합(CU-7 · CU-12 ①): 횟수 입력 직후 곧바로 칩 → 「3」 → 3초 동안 「3」 유지 · 다시 열면 스테퍼도 3 에서
//   · 설정 즉시 반영(CU-12 ②): 운동 화면을 연 채 다른 탭에서 켜면 그 화면에 칩이 생긴다(새로 읽지 않음)
//   · 접근 이름(CU-5): 칩 이름이 보이는 글자로 시작하고 세트 번호를 담는다
//   · rpe 만 있는 세트(CU-12 ③): 기록 상세 「≈RIR 2.5」 · 분포 칸(0.5 → 「0.5~1개」 · 3.5 → 「3.5개 이상」) · 진척 막대 줄 높이(④)
//   · 가드(CU-6 · CU-12 ⑤): 초점이 새로고침 버튼 · 뒤 화면 inert · 누르면 흐려지고 다시 연다
//   · 오프라인 셸(CD-3): 마이그레이션 직후 정리는 페이지 캐시를 지우지 않고 지금 셸로 덮어쓴다 · 오프라인이면 아무것도 안 한다
import { expect, test } from "@playwright/test";
import {
  idb_행,
  idb_행_고치기,
  내려쓰기_대기,
  마치기,
  빈_문서,
  빠른_운동_시작,
  세트_기록,
  세트_id,
  세트_줄,
  안내_띠_닫기,
  준비,
  종목_추가,
  최근_기록_상세,
  힘든정도_설정,
} from "./helpers/opengym";

type Page = import("@playwright/test").Page;

/** 값이 ms 동안 그대로인지 — 250ms 마다 본다(고정 대기 대신 · CU-12 ⑥) */
async function 유지(read: () => Promise<string | null>, want: string, ms = 3_000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    expect(await read()).toBe(want);
    await new Promise((r) => setTimeout(r, 250));
  }
}

test.describe("체중 입력 되돌림 없음(CD-1·CD-2)", () => {
  test.use({ serviceWorkers: "block" });

  async function 체중_입력(page: Page, kg: string): Promise<void> {
    await page.goto("/profile");
    await expect(page.getByTestId("bodyweight")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("bodyweight-value").click();
    await page.getByTestId("bodyweight-input").fill(kg);
    await page.getByTestId("bodyweight-input").press("Enter");
    await expect(page.getByTestId("bodyweight-value")).toHaveText(`${kg}kg`);
    await 내려쓰기_대기(page);
  }
  /** 다시 열어(부팅 정리 · 1분 넘게 지난 것으로 되감은 뒤) 보이는 값 */
  async function 되감고_다시_열기(page: Page): Promise<string | null> {
    await 빈_문서(page);
    await idb_행_고치기(page, "bodyweight_logs", [{ shiftUpdatedAt: -120_000 }]);
    await page.goto("/profile");
    await expect(page.getByTestId("bodyweight")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1_500); // 부팅 정리가 미러를 고칠 시간
    await page.reload();
    await expect(page.getByTestId("bodyweight")).toBeVisible({ timeout: 20_000 });
    return page.getByTestId("bodyweight-value").textContent();
  }

  test("80 → 82 → 80 은 다시 열어도 80 · 0(설정 안 함)은 다시 열어도 0 · 이력은 줄로 남는다", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await 준비(page);
    await 체중_입력(page, "80");
    expect(await 되감고_다시_열기(page)).toBe("80kg");
    await 체중_입력(page, "82");
    expect(await 되감고_다시_열기(page)).toBe("82kg");
    await 체중_입력(page, "80");
    expect(await 되감고_다시_열기(page)).toBe("80kg");
    expect(await 되감고_다시_열기(page)).toBe("80kg"); // 한 번 더(멱등)

    await 체중_입력(page, "0");
    expect(await 되감고_다시_열기(page)).toBe("0kg");
    expect(await 되감고_다시_열기(page)).toBe("0kg");

    await 빈_문서(page);
    const rows = await idb_행(page, "bodyweight_logs");
    test.info().annotations.push({
      type: "체중 이력",
      description: JSON.stringify(rows.map((r) => ({ id: r.id, kg: r.weight_kg, src: r.source }))),
    });
    expect(rows.map((r) => r.weight_kg)).toEqual([80, 82, 80, 0]);
    expect(rows.every((r) => String(r.id).startsWith("bw-profile-") && r.source === "manual")).toBe(true);
    const profiles = await idb_행(page, "user_profiles");
    expect(profiles[0]?.bodyweight_kg ?? null).toBeNull();
  });
});

test("RIR 칩 — 횟수 입력 직후 곧바로 고른 값이 유지되고(경합) · 다시 열면 그 값에서 · 접근 이름은 보이는 글자로 시작", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await 준비(page);
  await 힘든정도_설정(page, true);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await 안내_띠_닫기(page);
  const row = 세트_줄(page, 0, 0);
  const chip = row.getByTestId(`set-rir-${await 세트_id(row)}`);
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("aria-label", /^힘든 정도 — 세트 1 /);

  // 무게·횟수를 적고 blur 없이 곧바로 칩 → 앞선 쓰기(blur 저장)가 대기열에 있는 채로 고른다
  await row.getByTestId("set-weight").fill("60");
  await row.getByTestId("set-reps").fill("8");
  await chip.click();
  await page.getByTestId("rir-opt-3").click();
  await expect(chip).toHaveText("3");
  await 유지(() => chip.textContent(), "3");
  await expect(chip).toHaveAttribute("data-rir", "3");
  await expect(chip).toHaveAttribute("aria-label", /^3 — 세트 1 힘든 정도 바꾸기, 여유 3개$/);
  // 다시 열면 스테퍼가 저장값(3)에서 시작한다
  await chip.click();
  await expect(page.getByTestId("rir-step-value")).toHaveText("3");
  await page.getByTestId("rir-step-minus").click();
  await expect(page.getByTestId("rir-step-value")).toHaveText("2.5");
  await page.getByTestId("rir-close").click();
  await expect(chip).toHaveText("2.5");
  await 유지(() => chip.textContent(), "2.5");
  // 입력값도 잃지 않았다
  await expect(row.getByTestId("set-weight")).toHaveValue("60");
  await expect(row.getByTestId("set-reps")).toHaveValue("8");
});

test("설정 즉시 반영 — 운동 화면을 연 채 다른 탭에서 켜고 끄면 그 화면이 따라간다", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await 준비(page);
  await 힘든정도_설정(page, false);
  await 빠른_운동_시작(page);
  await 종목_추가(page, "바벨 벤치프레스");
  await expect(세트_줄(page)).toBeVisible();
  await expect(page.locator('[data-testid^="set-rir-"]')).toHaveCount(0);

  const other = await context.newPage();
  try {
    await 힘든정도_설정(other, true);
    await expect(page.locator('[data-testid^="set-rir-"]').first()).toBeVisible({ timeout: 10_000 });
    await 힘든정도_설정(other, false);
    await expect(page.locator('[data-testid^="set-rir-"]')).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await other.close();
  }
});

test.describe("rpe 만 있는 세트·분포 칸·진척 막대(CU-12 ③④) · 가드(CU-6)", () => {
  test.use({ serviceWorkers: "block" });

  test("≈RIR 2.5 · 0.5 → 「0.5~1개」 · 3.5 → 「3.5개 이상」 · 막대 가운데 줄 높이 = 평균 여유", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await 준비(page);
    await 힘든정도_설정(page, false);
    await 빠른_운동_시작(page);
    await 종목_추가(page, "바벨 벤치프레스");
    await 세트_기록(page, 0, 0, 60, 10);
    for (let i = 1; i < 3; i++) {
      await page.getByTestId("btn-add-set").first().click();
      await 세트_기록(page, 0, i, 60, 10);
    }
    await 마치기(page);
    await 내려쓰기_대기(page);

    // 앱 없이 세트 칸을 심는다: 1세트 = rpe 7.5 만(→ ≈RIR 2.5) · 2세트 rir 0.5 · 3세트 rir 3.5
    await 빈_문서(page);
    const sets = (await idb_행(page, "set_logs")).sort((a, b) => Number(a.set_number) - Number(b.set_number));
    expect(sets.length).toBe(3);
    await idb_행_고치기(page, "set_logs", [
      { id: String(sets[0].id), set: { rir: null, rpe: 7.5 } },
      { id: String(sets[1].id), set: { rir: 0.5, rpe: null } },
      { id: String(sets[2].id), set: { rir: 3.5, rpe: null } },
    ]);

    await 최근_기록_상세(page);
    const cells = page.getByTestId("detail-set-rir");
    await expect(cells).toHaveCount(3);
    await expect(cells.nth(0)).toHaveText("≈RIR 2.5");
    await expect(cells.nth(1)).toHaveText("0.5");
    await expect(cells.nth(2)).toHaveText("3.5");

    await page.goto("/stats");
    await expect(page.getByTestId("effort-card")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("effort-coverage")).toContainText("기록한 세트 3/3");
    await expect(page.getByTestId("effort-coverage")).toContainText("RPE 로 적은 1세트 포함");
    // 평균 (2.5 + 0.5 + 3.5) / 3 = 2.2 · 3개 이하 2/3 = 67%
    await expect(page.getByTestId("effort-head")).toHaveText("평균 여유 2.2개 · 여유 3개 이하 67%");
    const buckets = await page
      .getByTestId("effort-buckets")
      .evaluate((el) =>
        Array.from(el.querySelectorAll(":scope > div > div")).map(
          (d) => d.querySelector("div")?.textContent ?? "",
        ),
      );
    test.info().annotations.push({ type: "분포 칸", description: JSON.stringify(buckets) });
    expect(buckets).toEqual([
      "여유 0개0세트",
      "여유 0.5~1개1세트",
      "여유 1.5~2개0세트",
      "여유 2.5~3개1세트",
      "여유 3.5개 이상1세트",
    ]);
    // 노력 카드는 Epley 주석 뒤에 온다(CU-1) — 주석(「추정치」)이 카드보다 위
    const order = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="effort-card"]');
      const cap = Array.from(document.querySelectorAll("span,p")).find((n) =>
        n.textContent?.includes("실측값 아님"),
      );
      return card && cap ? card.compareDocumentPosition(cap) & Node.DOCUMENT_POSITION_PRECEDING : -1;
    });
    expect(order).toBeGreaterThan(0);

    // 종목 진척 막대 — 가운데 줄 높이 = (4 − 2.17)/4 ≈ 0.46 of 막대
    await page.getByTestId("stats-1rm").locator("a").first().click();
    const fill = page.getByTestId("progress-effort-fill");
    await expect(fill).toHaveCount(1, { timeout: 20_000 });
    const ratio = await fill.evaluate(
      (el) => el.getBoundingClientRect().height / (el.parentElement?.getBoundingClientRect().height ?? 1),
    );
    test.info().annotations.push({ type: "막대 줄 비율", description: String(ratio) });
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.52);
    expect(await fill.evaluate((el) => el.getBoundingClientRect().width)).toBeCloseTo(3, 0);
  });

  test("가드 화면 — 초점이 새로고침 · 뒤 화면 inert · 누르면 흐려지고 다시 연다", async ({ page }) => {
    test.setTimeout(90_000);
    await 준비(page);
    await page.evaluate(() => localStorage.setItem("liftgram.maxSchemaSeen", "27"));
    await page.goto("/");
    const guard = page.getByTestId("schema-guard");
    await expect(guard).toBeVisible({ timeout: 20_000 });
    await expect(guard).toContainText("기록은 이 기기에 그대로 있어요");
    await expect
      .poll(() =>
        page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset?.testid ?? null),
      )
      .toBe("schema-guard-reload");
    const inert = await page.evaluate(() =>
      Array.from(document.body.children).map((c) => ({
        guard: c.querySelector('[data-testid="schema-guard"]') != null,
        inert: c.hasAttribute("inert"),
      })),
    );
    expect(inert.filter((c) => c.guard)).toEqual([{ guard: true, inert: false }]);
    expect(inert.filter((c) => !c.guard).every((c) => c.inert)).toBe(true);
    // Tab 을 눌러도 뒤 화면으로 초점이 나가지 않는다
    await page.keyboard.press("Tab");
    const inGuard = await page.evaluate(() => {
      const a = document.activeElement;
      return a === document.body || !!a?.closest('[data-testid="schema-guard"]');
    });
    expect(inGuard).toBe(true);
    // 누르면 흐려지고 다시 연다(저장값이 그대로라 다시 가드)
    const nav = page.waitForEvent("framenavigated");
    await page.getByTestId("schema-guard-reload").click();
    await nav;
    await expect(page.getByTestId("schema-guard")).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("오프라인 셸 보존(CD-3)", () => {
  async function 워커_제어(page: Page): Promise<boolean> {
    await page.goto("/");
    const ok = await page
      .waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 })
      .then(() => true)
      .catch(async () => {
        await page.reload();
        return page
          .waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 15_000 })
          .then(() => true)
          .catch(() => false);
      });
    return ok;
  }
  /** 옛 세대 흉내 — `liftgram-pages-OLDGEN` 에 옛 셸 글자를 넣고 정리 표시를 지운다 */
  async function 옛_세대_심기(page: Page): Promise<void> {
    await page.evaluate(async () => {
      const c = await caches.open("liftgram-pages-OLDGEN");
      for (const u of ["/workout", "/history"])
        await c.put(u, new Response("v25-shell", { headers: { "content-type": "text/html" } }));
      localStorage.removeItem("liftgram.pagesCacheCleanedFor");
    });
  }
  const 캐시_상태 = (page: Page) =>
    page.evaluate(async () => {
      const names = (await caches.keys()).filter((k) => k.startsWith("liftgram-pages-"));
      const out: Record<string, Record<string, string | null>> = {};
      for (const n of names) {
        const c = await caches.open(n);
        out[n] = {};
        for (const u of ["/workout", "/history", "/offline"]) {
          const r = await c.match(u);
          if (!r) {
            out[n][u] = null;
            continue;
          }
          const body = await r.text();
          out[n][u] = body.includes("<html") ? "html" : body;
        }
      }
      return { out, cleaned: localStorage.getItem("liftgram.pagesCacheCleanedFor") };
    });

  test("오프라인 부팅은 아무것도 지우지 않고 · 온라인 부팅은 모든 페이지 캐시의 셸을 덮어쓴다(지우지 않음) · 그 뒤 오프라인 탭이 열린다", async ({
    page,
    context,
  }) => {
    test.setTimeout(150_000);
    test.skip(
      !(await 워커_제어(page)),
      "서비스워커가 등록되지 않는 대상(개발 서버) — 운영 빌드에 대고 돌린다",
    );
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("liftgram.pagesCacheCleanedFor")), {
        timeout: 20_000,
      })
      .toBe("26");
    await 옛_세대_심기(page);

    // 오프라인으로 다시 연다 — 정리는 아무것도 하지 않는다(표시도 남기지 않는다)
    await context.setOffline(true);
    await page.goto("/");
    await expect(page.locator("nav")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2_000);
    const off = await 캐시_상태(page);
    test.info().annotations.push({ type: "오프라인 부팅 뒤", description: JSON.stringify(off) });
    expect(off.cleaned).toBeNull();
    expect(off.out["liftgram-pages-OLDGEN"]?.["/workout"]).toBe("v25-shell");

    // 온라인으로 다시 연다 — 덮어쓴다
    await context.setOffline(false);
    await page.goto("/");
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("liftgram.pagesCacheCleanedFor")), {
        timeout: 30_000,
      })
      .toBe("26");
    const on = await 캐시_상태(page);
    test.info().annotations.push({ type: "온라인 부팅 뒤", description: JSON.stringify(on) });
    expect(Object.keys(on.out).length).toBeGreaterThanOrEqual(2); // 지금 세대 + OLDGEN — 지우지 않았다
    for (const [name, m] of Object.entries(on.out))
      expect(m, name).toEqual({ "/workout": "html", "/history": "html", "/offline": "html" });

    // 그 뒤 오프라인에서 탭이 열린다(「offline」 글자가 아니다)
    await context.setOffline(true);
    for (const path of ["/history", "/stats"]) {
      await page.goto(path);
      await expect(page.getByTestId("offline-page")).toHaveCount(0);
      await expect(page.locator("nav")).toBeVisible({ timeout: 15_000 });
    }
    await context.setOffline(false);
  });
});
