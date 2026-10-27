// openGym 추천(SRS-073~082) e2e 공용 헬퍼 — 이 한 파일에만 둔다(스펙 충돌 방지 규칙 8).
//
// 로그인 없이 기기 안 저장소만으로 시작할 수 있게 하고, 동기가 필요한 검사만 가입·로그인한다.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";

type Page = import("@playwright/test").Page;
type Locator = import("@playwright/test").Locator;
type Browser = import("@playwright/test").Browser;
type BrowserContext = import("@playwright/test").BrowserContext;

export const 비밀번호 = "hunter22!";

export function 새_메일(tag: string): string {
  return `e2e-og-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

/** 카탈로그가 로컬에 심어질 때까지 — 종목이 없으면 운동을 시작할 수 없다. */
export async function 준비(page: Page): Promise<void> {
  await page.goto("/exercises");
  await expect(page.getByTestId("sync-state")).toHaveText("최신", { timeout: 30_000 });
}

export async function 가입(page: Page, email: string, name: string): Promise<void> {
  await page.goto("/account");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill(비밀번호);
  await page.getByTestId("auth-name-input").fill(name);
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

export async function 로그인(page: Page, email: string): Promise<void> {
  await page.goto("/account");
  await page.getByTestId("auth-email-input").fill(email);
  await page.getByTestId("auth-password-input").fill(비밀번호);
  await page.getByTestId("btn-auth-submit").click();
  await expect(page.getByTestId("auth-email")).toBeVisible({ timeout: 20_000 });
}

/** 「지금 동기」를 눌러 끝날 때까지 */
export async function 동기(page: Page): Promise<void> {
  await page.goto("/account");
  await expect(page.getByTestId("btn-sync-now")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("btn-sync-now").click();
  await expect(page.getByTestId("sync-status")).toHaveText("동기 완료", { timeout: 30_000 });
}

/** 저장소가 완전히 따로인 두 번째 기기 */
export async function 새_기기(browser: Browser): Promise<[BrowserContext, Page]> {
  const ctx = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: process.env.BASE ?? "http://127.0.0.1:3100",
          localStorage: [{ name: "onboarding_seen_v1", value: "yes" }],
        },
      ],
    },
  });
  return [ctx, await ctx.newPage()];
}

/** 프로필에서 「세트 힘든 정도 기록」 스위치를 원하는 상태로 */
export async function 힘든정도_설정(page: Page, on: boolean): Promise<void> {
  await page.goto("/profile");
  const sw = page.getByTestId("switch-effort-logging");
  await expect(sw).toBeVisible({ timeout: 20_000 });
  if ((await sw.getAttribute("aria-checked")) !== String(on)) await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", String(on));
}

export async function 빠른_운동_시작(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("btn-quick-start")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("btn-quick-start").click();
  await expect(page.getByTestId("btn-add-exercise")).toBeVisible({ timeout: 15_000 });
}

export async function 종목_추가(page: Page, 이름: string): Promise<void> {
  await page.getByTestId("btn-add-exercise").click();
  await page.getByTestId("picker-search").fill(이름);
  await page.getByTestId("picker-list").locator("button").first().click();
  await expect(page.getByTestId("exercise-picker")).toHaveCount(0);
  await expect(page.getByTestId("we-name").filter({ hasText: 이름 }).first()).toBeVisible({
    timeout: 15_000,
  });
}

/** n번째 블록 i번째 세트 줄 */
export function 세트_줄(page: Page, n = 0, i = 0): Locator {
  return page.getByTestId("set-list").nth(n).locator("> div").nth(i);
}

/** 세트 줄의 id(testid `set-<id>`) */
export async function 세트_id(row: Locator): Promise<string> {
  const tid = (await row.getAttribute("data-testid")) ?? "";
  return tid.replace(/^set-/, "");
}

export async function 세트_기록(page: Page, n: number, i: number, kg: number, reps: number): Promise<void> {
  const row = 세트_줄(page, n, i);
  await row.getByTestId("set-weight").fill(String(kg));
  await row.getByTestId("set-reps").fill(String(reps));
  await row.getByTestId("set-reps").blur();
  await row.getByTestId("set-done").click();
  await expect(row.getByTestId("set-done")).toHaveAttribute("aria-pressed", "true");
}

/** 운동을 마치고 홈으로 — 완료 시트 질문은 「저장 안 함/오늘만」. 완료한 운동 id 를 돌려준다(요약 전 주소에서). */
export async function 마치기(page: Page): Promise<void> {
  await page.getByTestId("btn-complete").click();
  await page.getByTestId("dialog-confirm").click();
  await expect(page.getByTestId("summary-volume")).toBeVisible({ timeout: 15_000 });
  for (const id of ["btn-finish-dont-save", "btn-finish-today"]) {
    const b = page.getByTestId(id);
    if (await b.isVisible()) await b.click();
  }
  await page.getByTestId("btn-summary-close").click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

/** 기록 목록의 맨 위(가장 최근) 운동 상세로 */
export async function 최근_기록_상세(page: Page): Promise<void> {
  await page.goto("/history");
  const first = page.getByTestId("history-list").locator('[data-testid^="history-"]').first();
  await expect(first).toBeVisible({ timeout: 20_000 });
  await first.click();
  await expect(page.getByTestId("detail-set").first()).toBeVisible({ timeout: 20_000 });
}

/** 안내 띠(「이 기기에만 저장」)를 닫는다 — 좌표 측정이 흔들리지 않게 */
export async function 안내_띠_닫기(page: Page): Promise<void> {
  const later = page.getByTestId("sync-localonly-banner").getByRole("button", { name: "나중에" });
  await later.waitFor({ state: "visible", timeout: 3_000 }).catch(() => {});
  if (await later.isVisible()) await later.click();
}

/** LokiJS 자동 저장(디바운스)이 IndexedDB 에 내려쓸 시간을 준다 — 주소를 옮기기 전에 */
export async function 내려쓰기_대기(page: Page): Promise<void> {
  await page.waitForTimeout(2_000);
}

/**
 * 앱을 띄우지 않는 같은 출처의 빈 문서 — IndexedDB 를 앱 없이 고치려고(앱이 열려 있으면 DB 를 붙잡고 다시 쓴다).
 * 주소는 가짜이고 응답은 이 테스트가 만든다.
 */
export async function 빈_문서(page: Page): Promise<void> {
  await page.route("**/__og_blank", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>blank</title>" }),
  );
  await page.goto("/__og_blank");
}

/**
 * 지금 IndexedDB `repset` 을 **v25 기기의 모양**으로 되돌린다 — v26 이 덧붙인 것을 걷어 낸다:
 *   · 새 표 3개(bodyweight_logs·import_batches·import_aliases)의 메타·청크 · loki 목록에서 이름
 *   · set_logs.rir · workouts.source·import_batch_id(+ 색인) · exercises.import_batch_id
 *   · local_storage 의 `_loki_schema_version` = 25 · localStorage 가드 키(v25 번들은 모른다)
 * 빈 문서(빈_문서)에서 부른다. 걷어 낸 세트 수를 돌려준다.
 */
export async function v25로_되돌리기(page: Page): Promise<{ sets: number; workouts: number }> {
  return page.evaluate(async () => {
    const NEW_TABLES = ["bodyweight_logs", "import_batches", "import_aliases"];
    const DROP: Record<string, string[]> = {
      set_logs: ["rir"],
      workouts: ["source", "import_batch_id"],
      exercises: ["import_batch_id"],
    };
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("repset", 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const tx = db.transaction(["LokiIncrementalData"], "readwrite");
    const store = tx.objectStore("LokiIncrementalData");
    const all: { key: string; value: string }[] = await new Promise((res, rej) => {
      const r = store.getAll();
      r.onsuccess = () => res(r.result as { key: string; value: string }[]);
      r.onerror = () => rej(r.error);
    });
    let sets = 0;
    let workouts = 0;
    for (const rec of all) {
      const [name, kind] = rec.key.split(".");
      if (rec.key === "loki") {
        const loki = JSON.parse(rec.value);
        loki.collections = loki.collections.filter((c: { name: string }) => !NEW_TABLES.includes(c.name));
        store.put({ key: "loki", value: JSON.stringify(loki) });
        continue;
      }
      if (NEW_TABLES.includes(name)) {
        store.delete(rec.key);
        continue;
      }
      if (kind === "metadata" && DROP[name]) {
        const meta = JSON.parse(rec.value);
        for (const col of DROP[name]) if (meta.binaryIndices) delete meta.binaryIndices[col];
        store.put({ key: rec.key, value: JSON.stringify(meta) });
        continue;
      }
      if (kind === "chunk" && (DROP[name] || name === "local_storage")) {
        const docs = JSON.parse(rec.value) as Record<string, unknown>[];
        for (const d of docs) {
          if (name === "local_storage") {
            if (d.key === "_loki_schema_version") d.value = "25";
            continue;
          }
          for (const col of DROP[name]) delete d[col];
          if (name === "set_logs") sets += 1;
          if (name === "workouts") workouts += 1;
        }
        store.put({ key: rec.key, value: JSON.stringify(docs) });
      }
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
    localStorage.removeItem("liftgram.maxSchemaSeen");
    localStorage.removeItem("liftgram.pagesCacheCleanedFor");
    return { sets, workouts };
  });
}

/** IndexedDB `repset` 에서 직접 읽는다 — 스키마 버전 · 세트/운동 수 · rir 칸이 있는 세트 수 · 새 표 유무 */
export async function idb_요약(page: Page): Promise<{
  version: string | null;
  sets: number;
  workouts: number;
  setsWithRirKey: number;
  newTables: string[];
}> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("repset", 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const tx = db.transaction(["LokiIncrementalData"], "readonly");
    const all: { key: string; value: string }[] = await new Promise((res, rej) => {
      const r = tx.objectStore("LokiIncrementalData").getAll();
      r.onsuccess = () => res(r.result as { key: string; value: string }[]);
      r.onerror = () => rej(r.error);
    });
    db.close();
    let version: string | null = null;
    let sets = 0;
    let workouts = 0;
    let setsWithRirKey = 0;
    let newTables: string[] = [];
    for (const rec of all) {
      const [name, kind] = rec.key.split(".");
      if (rec.key === "loki") {
        newTables = (JSON.parse(rec.value).collections as { name: string }[])
          .map((c) => c.name)
          .filter((n) => ["bodyweight_logs", "import_batches", "import_aliases"].includes(n));
        continue;
      }
      if (kind !== "chunk") continue;
      const docs = JSON.parse(rec.value) as Record<string, unknown>[];
      if (name === "local_storage") {
        for (const d of docs) if (d.key === "_loki_schema_version") version = String(d.value);
      }
      if (name === "set_logs") {
        sets += docs.length;
        setsWithRirKey += docs.filter((d) => "rir" in d).length;
      }
      if (name === "workouts") workouts += docs.length;
    }
    return { version, sets, workouts, setsWithRirKey, newTables };
  });
}

/**
 * IndexedDB `repset` 의 한 표 행을 앱 없이 고친다(빈_문서에서 부른다 · QA CU-12 ③ · CD-1).
 * edits: id 가 없으면 모든 행에 적용. set = 칸 덮어쓰기 · shiftUpdatedAt = updated_at 에 더할 ms(음수 = 과거로).
 * 고친 행 수를 돌려준다.
 */
export async function idb_행_고치기(
  page: Page,
  table: string,
  edits: { id?: string; set?: Record<string, unknown>; shiftUpdatedAt?: number }[],
): Promise<number> {
  return page.evaluate(
    async ({ table, edits }) => {
      const db: IDBDatabase = await new Promise((res, rej) => {
        const r = indexedDB.open("repset", 1);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const tx = db.transaction(["LokiIncrementalData"], "readwrite");
      const store = tx.objectStore("LokiIncrementalData");
      const all: { key: string; value: string }[] = await new Promise((res, rej) => {
        const r = store.getAll();
        r.onsuccess = () => res(r.result as { key: string; value: string }[]);
        r.onerror = () => rej(r.error);
      });
      let n = 0;
      for (const rec of all) {
        const [name, kind] = rec.key.split(".");
        if (name !== table || kind !== "chunk") continue;
        const docs = JSON.parse(rec.value) as Record<string, unknown>[];
        for (const d of docs)
          for (const e of edits) {
            if (e.id && d.id !== e.id) continue;
            if (e.set) Object.assign(d, e.set);
            if (e.shiftUpdatedAt) d.updated_at = Number(d.updated_at) + e.shiftUpdatedAt;
            n += 1;
          }
        store.put({ key: rec.key, value: JSON.stringify(docs) });
      }
      await new Promise<void>((res, rej) => {
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
      db.close();
      return n;
    },
    { table, edits },
  );
}

/** IndexedDB `repset` 의 한 표 행을 그대로 읽는다(빈_문서에서). */
export async function idb_행(page: Page, table: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(async (table) => {
    const db: IDBDatabase = await new Promise((res, rej) => {
      const r = indexedDB.open("repset", 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const tx = db.transaction(["LokiIncrementalData"], "readonly");
    const all: { key: string; value: string }[] = await new Promise((res, rej) => {
      const r = tx.objectStore("LokiIncrementalData").getAll();
      r.onsuccess = () => res(r.result as { key: string; value: string }[]);
      r.onerror = () => rej(r.error);
    });
    db.close();
    const out: Record<string, unknown>[] = [];
    for (const rec of all) {
      const [name, kind] = rec.key.split(".");
      if (name === table && kind === "chunk")
        out.push(...(JSON.parse(rec.value) as Record<string, unknown>[]));
    }
    return out;
  }, table);
}

// ── P5 가져오기(SRS-081·082) ─────────────────────────────────────────────────

/**
 * 큰 Strong 쉼표 파일(값은 전부 지어낸 것 · 결정적) — core `__tests__/fixtures/import/generateLarge.ts` 와 같은 규칙.
 * 기본 운동 1000 × 종목 5 × 세트 2 = 1만 세트.
 */
export function 큰_Strong_파일(opts: { workouts?: number; exercisesPer?: number; setsPer?: number } = {}): {
  text: string;
  workouts: number;
  sets: number;
} {
  const NAMES = [
    "Bench Press (Barbell)",
    "Squat (Barbell)",
    "Deadlift (Barbell)",
    "Lat Pulldown (Cable)",
    "Bicep Curl (Dumbbell)",
  ];
  const workouts = opts.workouts ?? 1000;
  const exercisesPer = opts.exercisesPer ?? 5;
  const setsPer = opts.setsPer ?? 2;
  const lines = [
    "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE",
  ];
  const day0 = Date.UTC(2023, 0, 1);
  let sets = 0;
  for (let w = 0; w < workouts; w++) {
    const d = new Date(day0 + w * 86_400_000);
    const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} 18:${String(w % 60).padStart(2, "0")}:00`;
    for (let e = 0; e < exercisesPer; e++)
      for (let s = 0; s < setsPer; s++) {
        sets++;
        lines.push(
          `${date},"Session ${w + 1}",1h 2m,"${NAMES[e % NAMES.length]}",${s + 1},${20 + ((w + e * 7 + s) % 80)},${5 + ((w + s) % 6)},,0,,,`,
        );
      }
  }
  return { text: `${lines.join("\n")}\n`, workouts, sets };
}

/** core 시험 파일 읽기(`core/src/domain/__tests__/fixtures/import/<name>`) */
export function 시험_파일(name: string): string {
  // 저장소 안 상대 경로(e2e/helpers → src/core)
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, "../../../core/src/domain/__tests__/fixtures/import", name), "utf8");
}

/** /account/import 에서 파일을 골라 「확인」 단계까지 */
export async function 가져오기_파일(page: Page, name: string, text: string): Promise<void> {
  if (!page.url().endsWith("/account/import")) await page.goto("/account/import");
  await expect(page.getByTestId("btn-import-pick")).toBeEnabled({ timeout: 30_000 });
  await page
    .getByTestId("import-file-input")
    .setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(text, "utf8") });
  await expect(page.getByTestId("import-step-summary")).toBeVisible({ timeout: 60_000 });
}

/** 확인 → (단위) → 맞추기 → 가져오기 → 끝. 끝 화면의 운동 수 글자를 돌려준다. */
export async function 가져오기_끝까지(
  page: Page,
  unit: "kg" | "lb" | null = "kg",
  timeout = 120_000,
): Promise<void> {
  if (unit && (await page.getByTestId("import-unit-select").count()) > 0)
    await page.getByTestId(`import-unit-${unit}`).click();
  await page.getByTestId("btn-import-to-match").click();
  await expect(page.getByTestId("import-match-head")).toBeVisible();
  await 가져오기_시작(page);
  await expect(page.getByTestId("import-step-done")).toBeVisible({ timeout });
}

/** 「가져오기」를 누른다 — 확인 안 한 종목이 있으면 뜨는 확인창(P5-4)을 받아들인다 */
export async function 가져오기_시작(page: Page): Promise<void> {
  const unconfirmed = await page.getByTestId("import-unconfirmed").count();
  await page.getByTestId("btn-import-start").click();
  if (unconfirmed > 0) {
    const dlg = page.getByTestId("import-unconfirmed-dialog");
    await expect(dlg).toBeVisible();
    await dlg.getByTestId("dialog-confirm").click();
  }
}

/** IndexedDB 에서 표별 「살아 있는」 행 수(삭제 표시 제외) — prefix 로 id 를 거른다(빈_문서에서). */
export async function idb_행_수(page: Page, tables: string[], prefix = ""): Promise<Record<string, number>> {
  return page.evaluate(
    async ({ tables, prefix }) => {
      const db: IDBDatabase = await new Promise((res, rej) => {
        const r = indexedDB.open("repset", 1);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const tx = db.transaction(["LokiIncrementalData"], "readonly");
      const all: { key: string; value: string }[] = await new Promise((res, rej) => {
        const r = tx.objectStore("LokiIncrementalData").getAll();
        r.onsuccess = () => res(r.result as { key: string; value: string }[]);
        r.onerror = () => rej(r.error);
      });
      db.close();
      const out: Record<string, number> = {};
      for (const t of tables) out[t] = 0;
      for (const rec of all) {
        const [name, kind] = rec.key.split(".");
        if (kind !== "chunk" || !(name in out)) continue;
        for (const d of JSON.parse(rec.value) as { id: string; _status?: string }[])
          if (d.id.startsWith(prefix) && d._status !== "deleted") out[name] += 1;
      }
      return out;
    },
    { tables, prefix },
  );
}

/** 서버 DB 에 직접 묻는다(docker 공유 db · `E2E_DB` 가 없으면 null) — 숫자 하나를 돌려주는 SQL */
export function 서버_숫자(sql: string): number | null {
  const db = process.env.E2E_DB;
  if (!db) return null;
  const out = execFileSync(
    "docker",
    ["exec", "-i", "liftgram-db-1", "psql", "-U", "app", "-d", db, "-tAc", sql],
    {
      encoding: "utf8",
    },
  );
  return Number(out.trim());
}

/** 서버 sync_records 에서 이 사람의 가져온(imp-) 살아 있는 레코드 수 */
export function 서버_가져온_수(email: string, collection: string): number | null {
  const safe = email.replace(/'/g, "''");
  return 서버_숫자(
    `select count(*) from sync_records s join users u on u.id = s.user_id where u.email = '${safe}' and s.collection = '${collection}' and s.record_id like 'imp-%' and not s.deleted`,
  );
}
