// @plm SRS-054  화면 이동 한 곳 — 클라이언트 이동(문서를 새로 받지 않는다)을 코드에서도 쓰게
//
// 셸의 LinkInterceptor 가 Next 라우터를 여기 꽂아 둔다. 꽂히기 전(아주 이른 순간)이나 라우터가 없는 곳에서는
// 예전처럼 문서 이동으로 떨어진다 — 이동 자체가 막히는 일은 없다.
import { runAfterOverlays } from "./useBackToClose";

type Router = { push: (href: string) => void; replace: (href: string) => void };
let router: Router | null = null;

export function setNavRouter(r: Router | null): void {
  router = r;
}

export function navigate(href: string, opts?: { replace?: boolean }): void {
  // [개선] 창(시트·확인창)이 닫히며 기록 칸을 걷는 중이면 그 뒤에 이동한다 — 걷기가 진행 중 이동을 버리지 않게(SPEC-042 · REV-077)
  runAfterOverlays(() => navigateNow(href, opts));
}

function navigateNow(href: string, opts?: { replace?: boolean }): void {
  if (router) {
    if (opts?.replace) router.replace(href);
    else router.push(href);
    return;
  }
  if (opts?.replace) location.replace(href);
  else location.href = href;
}

// ── 뒤로 가기(2026-11-09 화면 지도 「길이 이상한 곳」) ─────────────────────────────────────────────
// 하위 화면의 ← 가 정해 둔 한 곳(/feed·/profile)으로만 가서, 다른 곳에서 들어오면 엉뚱한 탭으로 튀었다.
// 앱 안에서 들어왔으면 들어온 곳으로 되돌아가고, 공유 링크·새 탭처럼 앱 안 이전 화면이 없으면 정해 둔 곳으로 간다.
// 앱 안 깊이를 기록 칸(history.state)에 적는다 — 「한 번이라도 옮겨 다녔나」만으로는 첫 칸으로 되돌아온 뒤 ← 가 먹통이 되거나
// 앱 밖으로 나갔다(REV 화면 이동 검토 중간). 뒤로·앞으로 오면 그 칸에 적힌 깊이를 그대로 쓴다.
const DEPTH_KEY = "liftgramDepth";
let curDepth = 0;

function stateDepth(): number | null {
  const d = (window.history.state as Record<string, unknown> | null)?.[DEPTH_KEY];
  return typeof d === "number" ? d : null;
}

/** 셸(LinkInterceptor)이 화면 주소가 바뀔 때마다 부른다. first = 문서를 처음 연 화면 */
export function noteRoute(first: boolean): void {
  if (typeof window === "undefined") return;
  const d = stateDepth();
  if (d != null) {
    curDepth = d; // 뒤로·앞으로·새로고침 — 그 칸의 깊이
    return;
  }
  curDepth = first ? 0 : curDepth + 1;
  try {
    window.history.replaceState({ ...(window.history.state ?? {}), [DEPTH_KEY]: curDepth }, "");
  } catch {
    // 못 적으면 이 문서 안의 값으로만 판단한다
  }
}

/** 브라우저 뒤로가 앱 안 이전 화면으로 가는가 — 깊이 1 이상이거나, 첫 칸인데 같은 출처에서 문서째 넘어왔을 때 */
export function canGoBackInApp(): boolean {
  if (typeof window === "undefined" || window.history.length <= 1) return false;
  const d = stateDepth() ?? curDepth;
  if (d >= 1) return true;
  try {
    return document.referrer !== "" && new URL(document.referrer).origin === location.origin;
  } catch {
    return false;
  }
}
