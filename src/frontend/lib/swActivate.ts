// @plm SRS-085  기다리는 새 서비스워커를 확실히 활성화한다 — 크롬의 「load 직후 skip-waiting 멈춤」 대비(QA code M-1)
//
// ─────────────────────────────────────────────────────────────────────────────
// 실측(2026-10-27~28 · 크롬 · 로컬 운영 빌드 · 구현자·검토자 각각 재현):
//   · 문서 load 직후(~45ms) skip-waiting 을 보내면 새 워커가 「installed」 에 멈춰 **영영 활성화되지 않는다**(10/10).
//     300ms 이상 지나 보내면 정상(12/12). 경로·SWR 과 무관하다.
//   · 멈춘 뒤에는 다시 보내도, reg.update() 를 불러도 풀리지 않고, 그 탭을 새로고침하면 20초 넘게 끝나지 않는다.
//   · **같은 출처의 새 클라이언트(숨은 iframe 이나 새 탭)가 열리면 곧바로 활성화된다** — 크로미움이 놓친
//     「대기 워커 활성화 재시도」를 새 내비게이션이 일으키는 것으로 보인다.
// 그래서 ① 보내기 전에 load + 여유를 기다리고 ② 보낸 뒤 1.5초 안에 활성화가 안 되면 숨은 iframe 으로 찔러 풀어 준다.
// 프로필 「업데이트」(lib/appUpdate.ts)와 다운그레이드 가드의 새로고침(lib/schemaGuard.ts)이 같이 쓴다.
// ─────────────────────────────────────────────────────────────────────────────

/** load 뒤 이만큼 더 기다린 다음 보낸다(300ms 이상이면 정상이었다 — 여유를 둔다). */
export const AFTER_LOAD_MS = 800;
/** 보낸 뒤 이 안에 activating 이 안 되면 숨은 iframe 으로 찌른다. */
export const NUDGE_AFTER_MS = 1_500;
/** 찌르는 문서 — 아주 작은 정적 파일(앱 셸을 띄우지 않는다 · public/sw-nudge.html). */
export const NUDGE_URL = "/sw-nudge.html";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 문서가 load 를 마치고 여유 시간이 지날 때까지 기다린다(이미 오래 지났으면 곧바로). */
export async function waitForLoadSettled(extraMs = AFTER_LOAD_MS): Promise<void> {
  if (document.readyState !== "complete") {
    await new Promise<void>((r) => window.addEventListener("load", () => r(), { once: true }));
    await sleep(extraMs);
    return;
  }
  // 이미 load 됐다 — load 시각부터 여유가 지났는지 본다
  const nav = performance.getEntriesByType?.("navigation")?.[0] as PerformanceNavigationTiming | undefined;
  const loadedAt = nav?.loadEventEnd || 0;
  const wait = loadedAt + extraMs - performance.now();
  if (wait > 0) await sleep(wait);
}

/** 같은 출처의 숨은 iframe 을 잠깐 붙였다 뗀다 — 새 클라이언트의 내비게이션이 멈춘 활성화를 다시 일으킨다. */
export function nudgeActivation(timeoutMs = 4_000): Promise<void> {
  return new Promise<void>((resolve) => {
    const f = document.createElement("iframe");
    f.setAttribute("aria-hidden", "true");
    f.tabIndex = -1;
    f.dataset.swNudge = "";
    f.style.cssText = "position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;border:0;opacity:0";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      f.remove();
      resolve();
    };
    f.addEventListener("load", () => setTimeout(finish, 300));
    setTimeout(finish, timeoutMs);
    f.src = `${NUDGE_URL}?t=${Date.now()}`;
    document.body.appendChild(f);
  });
}

const isActivating = (w: ServiceWorker) => w.state === "activating" || w.state === "activated";

/**
 * 기다리는 워커에 skip-waiting 을 보내고 활성화(activating 이상)까지 기다린다.
 * load+여유 뒤에 보내고, 1.5초 안에 안 되면 숨은 iframe 으로 찌른다(최대 2번). 활성화되면 true · 시간 안에 못 하면 false.
 * 새로고침은 하지 않는다(부르는 쪽이 정한다).
 */
export async function activateWaiting(
  w: ServiceWorker,
  opts: { timeoutMs?: number; stillWanted?: () => boolean } = {},
): Promise<boolean> {
  const deadline = Date.now() + (opts.timeoutMs ?? 12_000);
  const wanted = opts.stillWanted ?? (() => true);
  if (isActivating(w)) return true;
  await waitForLoadSettled();
  if (!wanted()) return false;
  if (w.state === "redundant") return false;

  const activated = new Promise<boolean>((resolve) => {
    const on = () => {
      if (isActivating(w)) resolve(true);
      else if (w.state === "redundant") resolve(false);
    };
    w.addEventListener("statechange", on);
    navigator.serviceWorker?.addEventListener("controllerchange", () => resolve(true), { once: true });
  });
  w.postMessage("skip-waiting");

  for (let nudge = 0; ; nudge++) {
    const ok = await Promise.race([activated, sleep(NUDGE_AFTER_MS).then(() => null)]);
    if (ok !== null) return ok;
    if (isActivating(w)) return true;
    if (!wanted() || Date.now() > deadline) return false;
    if (nudge < 2) {
      await nudgeActivation();
      if (isActivating(w)) return true;
    } else {
      const rest = deadline - Date.now();
      if (rest <= 0) return false;
      const late = await Promise.race([activated, sleep(rest).then(() => false)]);
      return late;
    }
  }
}
