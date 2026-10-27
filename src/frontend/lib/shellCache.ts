// @plm SRS-051 SRS-073  오프라인 셸 덮어쓰기 — 마이그레이션 직후 옛 세대 셸을 **지우지 않고** 지금 셸로 바꿔 넣는다(CD-3)
//
// 왜: 옛 세대 페이지 캐시(`liftgram-pages-*`)의 셸 HTML 은 옛 번들(v25)을 부른다. 옛 번들은 다운그레이드 가드를 모르므로
// 새 스키마 DB 를 열면 전부 지운다 — 그래서 옛 셸이 다시 나올 길을 없애야 한다. 첫 판은 캐시를 통째로 지웠는데, 그러면
// 지금 세대 셸과 `/offline` 까지 사라져 체육관(오프라인)에서 탭을 열면 「offline」 글자만 나왔다(QA CD-3).
// 그래서: 온라인이면 서비스워커가 설치 때 받는 셸 목록(SW_SHELLS)을 네트워크에서 새로 받아 **모든** `liftgram-pages-*` 캐시에
// 덮어쓴다 → 옛 셸은 지금 셸로 바뀌고 오프라인 열기는 그대로 된다. 오프라인이면 아무것도 건드리지 않는다(다음 온라인 부팅에 다시).
//
// 이 파일은 별칭 import 가 없다 — core node 테스트(core/src/domain/__tests__/shellCache.test.ts)가 가짜 캐시로 바로 부른다.

/**
 * 서비스워커가 설치 때 받아 두는 탭 셸 — frontend/sw/sw.template.js 의 `SHELLS` 와 **같은 목록**이어야 한다
 * (shellCache.test.ts 가 템플릿을 읽어 대조한다 — 한쪽만 바꾸면 테스트가 실패한다).
 */
export const SW_SHELLS = [
  "/",
  "/workout",
  "/history",
  "/calendar",
  "/stats",
  "/stats/summary", // 성과 요약 — 오프라인 첫 진입(P4U-18 · SRS-080)
  "/exercises",
  "/profile",
  "/offline",
] as const;

export const PAGES_CACHE_PREFIX = "liftgram-pages-";

/** 한 셸 받기 상한(ms) — 느린 망에서 부팅 정리가 끝없이 붙잡지 않게 */
const FETCH_TIMEOUT_MS = 8000;

type CacheLike = { put(request: string, response: Response): Promise<void> };
export interface ShellCacheDeps {
  caches: { keys(): Promise<string[]>; open(name: string): Promise<CacheLike> } | undefined;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  onLine: boolean;
}

export interface ShellRefreshResult {
  /**
   * offline = 아무것도 안 함(다음 부팅에 다시) · no-cache = 덮어쓸 페이지 캐시가 없음(워커 설치 전 — 할 일 없음)
   * done = 전부 받음(또는 서버가 셸로 보관하지 않을 응답을 줌) · partial = 받다 실패한 셸이 있음(다음 부팅에 다시)
   */
  status: "offline" | "no-cache" | "done" | "partial";
  refreshed: string[];
  /** 망 오류·시간 초과 — 다음 온라인 부팅에 다시 한다 */
  failed: string[];
  /** 오류 응답·리다이렉트 — 서비스워커 규칙처럼 셸로 보관하지 않는다(다시 시도하지 않는다) */
  skipped: string[];
  caches: number;
}

async function fetchWithTimeout(deps: ShellCacheDeps, url: string): Promise<Response> {
  const ctl = typeof AbortController === "undefined" ? null : new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctl?.abort();
      reject(new Error("timeout"));
    }, FETCH_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      deps.fetch(url, { cache: "reload", credentials: "same-origin", signal: ctl?.signal }),
      limit,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 온라인이면 SW_SHELLS 를 새로 받아 모든 `liftgram-pages-*` 캐시에 덮어쓴다. **지우지 않는다.** */
export async function refreshShellCaches(deps: ShellCacheDeps): Promise<ShellRefreshResult> {
  const res: ShellRefreshResult = { status: "done", refreshed: [], failed: [], skipped: [], caches: 0 };
  if (!deps.onLine) return { ...res, status: "offline" };
  if (!deps.caches) return { ...res, status: "no-cache" };
  const names = (await deps.caches.keys()).filter((k) => k.startsWith(PAGES_CACHE_PREFIX));
  res.caches = names.length;
  if (!names.length) return { ...res, status: "no-cache" };
  const opened = await Promise.all(
    names.map((n) => (deps.caches as NonNullable<ShellCacheDeps["caches"]>).open(n)),
  );
  for (const url of SW_SHELLS) {
    let r: Response;
    try {
      r = await fetchWithTimeout(deps, url);
    } catch {
      res.failed.push(url);
      continue;
    }
    // 서비스워커와 같은 규칙 — 오류·리다이렉트 화면은 셸로 보관하지 않는다.
    if (!r.ok || r.redirected) {
      res.skipped.push(url);
      continue;
    }
    try {
      await Promise.all(opened.map((c) => c.put(url, r.clone())));
      res.refreshed.push(url);
    } catch {
      res.failed.push(url);
    }
  }
  res.status = res.failed.length ? "partial" : "done";
  return res;
}
