// @plm SRS-006  로컬 저장소 flush — 쓴 것이 실제로 디스크에 남게 한다
//
// ─────────────────────────────────────────────────────────────────────────────
// 왜 필요한가: 웹 어댑터(LokiJS)는 메모리에 쓰고 **주기적으로**(기본 500ms) IndexedDB에 내려쓴다.
// 그래서 기록한 직후 탭을 닫거나 새로고침하면 마지막 변경이 사라질 수 있다.
// 실측: 카탈로그를 받아 놓고 곧바로 새로고침하니 로컬이 **0종**으로 돌아왔다.
//
// 운동 기록 앱에서 "방금 저장한 세트가 사라진다"는 받아들일 수 없다(SRS-006).
// 그래서 ① 큰 쓰기 뒤에 ② 화면이 사라질 때, 명시적으로 내려쓴다.
//
// WatermelonDB가 공개 API로 flush를 주지 않아 어댑터 내부를 통해 부른다.
// 내부 구조가 바뀌면 조용히 실패하지 않도록 **닿지 못하면 false를 돌려주고**,
// 자가진단(/diag/db)이 그것을 검사한다.
// ─────────────────────────────────────────────────────────────────────────────

type LokiLike = { saveDatabase?: (cb?: (err?: unknown) => void) => void };

/** 어댑터 내부의 Loki 인스턴스를 찾는다. 못 찾으면 null. */
async function findLoki(): Promise<LokiLike | null> {
  const { database } = await import("@app/core/db");
  const adapter = database.adapter as unknown as {
    underlyingAdapter?: { _driver?: { loki?: LokiLike } };
    _driver?: { loki?: LokiLike };
  };
  const driver = adapter.underlyingAdapter?._driver ?? adapter._driver;
  return driver?.loki ?? null;
}

/**
 * 메모리에 있는 변경을 IndexedDB로 내려쓴다.
 *
 * @returns 실제로 내려썼으면 true. 어댑터 내부에 닿지 못했으면 false(호출부는 그래도 진행한다 —
 *          자동 저장이 결국 처리하므로 막을 이유는 없다).
 */
export async function flushLocalDb(): Promise<boolean> {
  const loki = await findLoki();
  if (!loki?.saveDatabase) return false;
  await new Promise<void>((resolve) => {
    try {
      loki.saveDatabase?.(() => resolve());
    } catch {
      resolve();
    }
  });
  return true;
}

/**
 * 화면이 사라질 때 내려쓰도록 걸어 둔다. 정리 함수를 돌려준다.
 *
 * `visibilitychange`(탭 전환·홈 버튼)와 `pagehide`(닫기·이동)를 함께 본다 —
 * 모바일 브라우저는 `beforeunload`를 믿을 수 없어 이 둘이 권장 경로다.
 */
export function flushOnHide(): () => void {
  const onHide = () => {
    if (document.visibilityState === "hidden") void flushLocalDb();
  };
  const onPageHide = () => void flushLocalDb();
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onPageHide);
  return () => {
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onPageHide);
  };
}

/**
 * "곧 내려써 달라"고 예약한다 — 짧게 몰아서 한 번만 쓴다.
 *
 * 스테퍼처럼 값이 연달아 바뀌는 자리에서 매번 내려쓰면 낭비다. 반대로 아예 안 하면 화면을
 * 옮기는 순간 마지막 변경이 사라진다(LokiJS의 자동 저장은 500ms라 그보다 빨리 이동할 수 있다).
 * 그래서 마지막 호출로부터 150ms 뒤에 한 번 내려쓴다.
 */
let flushTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushLocalDb();
  }, 150);
}

/**
 * 로컬에 쓴 뒤 **다른 주소로 이동**할 때 쓴다.
 *
 * 웹에서 화면 전환은 자바스크립트 컨텍스트를 통째로 갈아치운다 — 아직 메모리에만 있던 변경은
 * 그 순간 사라진다(실측: 루틴을 만들고 목록으로 갔더니 없었다). 그래서 이동 직전에 내려쓴다.
 */
export async function navigateAfterFlush(href: string): Promise<void> {
  await flushLocalDb();
  location.href = href;
}
