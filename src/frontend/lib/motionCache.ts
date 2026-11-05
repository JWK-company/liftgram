// SPEC-034 운동 영상 저장소 — Cache API(전용 liftgram-motion) + 바이트 LRU.
//
// 서비스워커를 거치지 않는다: 영상은 파일 이름에 해시가 있어 바뀌지 않으므로 이 모듈이 통째로 받아 저장하고
// Blob 으로 재생한다(iOS 는 캐시된 응답의 Range 재생이 불안정하다). 상한을 넘으면 오래 안 본 것부터 지우되,
// 내 루틴 종목(pinned)은 끝까지 남긴다. 저장이 실패해도 재생 주소는 돌려준다(그림이 멈추지 않게).
const CACHE = "liftgram-motion";
const INDEX_KEY = "liftgram-motion-index-v1";
export const MOTION_CACHE_LIMIT = 64 * 1024 * 1024;

export interface MotionEntry {
  bytes: number;
  used: number;
  pinned?: boolean;
}
type Index = Record<string, MotionEntry>;

export const motionVideoUrl = (clip: string) => `/motion/${clip}.mp4`;
export const motionThumbUrl = (clip: string) => `/motion/${clip}.webp`;

function readIndex(): Index {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function writeIndex(ix: Index): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(ix));
  } catch {
    /* 저장 못 해도 재생에는 문제없다 */
  }
}

/** 상한을 넘겼을 때 지울 파일 — 순수 함수(시험용). 고정 항목은 고르지 않는다. */
export function pickEvictions(ix: Index, limit: number): string[] {
  let total = Object.values(ix).reduce((s, e) => s + e.bytes, 0);
  const out: string[] = [];
  const order = Object.entries(ix)
    .filter(([, e]) => !e.pinned)
    .sort((a, b) => a[1].used - b[1].used);
  for (const [k, e] of order) {
    if (total <= limit) break;
    out.push(k);
    total -= e.bytes;
  }
  return out;
}

/** 받은 파일이 정말 그 영상인가 — 200 으로 온 안내 페이지·잘린 파일을 저장하지 않는다. */
async function validClip(clip: string, blob: Blob): Promise<boolean> {
  if (!blob.type.startsWith("video/") || blob.size === 0) return false;
  const want = clip.split(".").pop();
  if (!want || typeof crypto === "undefined" || !crypto.subtle) return true; // 비보안 문맥: 형식 검사까지만
  const sum = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const hex = [...new Uint8Array(sum).slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === want;
}

async function store(clip: string, res: Response, pinned: boolean): Promise<Blob> {
  const blob = await res.clone().blob();
  if (!(await validClip(clip, blob))) throw new Error("bad clip");
  const cache = await caches.open(CACHE);
  try {
    await cache.put(motionVideoUrl(clip), res.clone());
  } catch {
    // 할당 초과: 오래 안 본 것을 지워 이 파일만큼 비우고 한 번 더. 그래도 안 되면 저장 없이 재생한다.
    const ix0 = readIndex();
    const total = Object.values(ix0).reduce((n, e) => n + e.bytes, 0);
    for (const k of pickEvictions(ix0, Math.max(0, total - blob.size))) {
      await cache.delete(motionVideoUrl(k));
      delete ix0[k];
    }
    writeIndex(ix0);
    try {
      await cache.put(motionVideoUrl(clip), res);
    } catch {
      return blob;
    }
  }
  // 인덱스는 저장이 끝난 뒤에 읽어 바로 쓴다 — 동시에 받는 다른 영상의 기록을 덮지 않게.
  const ix = readIndex();
  ix[clip] = { bytes: blob.size, used: Date.now(), pinned: pinned || ix[clip]?.pinned };
  const evict = pickEvictions(ix, MOTION_CACHE_LIMIT);
  for (const k of evict) delete ix[k];
  writeIndex(ix);
  for (const k of evict) await cache.delete(motionVideoUrl(k));
  return blob;
}

/** 재생에 실패한 저장본을 지운다 — 다음에 새로 받게. */
export async function forgetMotion(clip: string): Promise<void> {
  const ix = readIndex();
  delete ix[clip];
  writeIndex(ix);
  try {
    await (await caches.open(CACHE)).delete(motionVideoUrl(clip));
  } catch {
    /* 저장소를 못 쓰는 환경 */
  }
}

/**
 * 재생할 주소. 저장돼 있으면 Blob URL, 아니면 받아서 저장한 뒤 Blob URL.
 * 저장소를 못 쓰는 환경이면 파일 주소를 그대로 돌려준다.
 * Blob URL 이면 revoke 는 호출한 쪽 몫이다.
 */
export async function motionSource(clip: string, signal?: AbortSignal): Promise<string> {
  const url = motionVideoUrl(clip);
  if (typeof caches === "undefined") return url;
  try {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) {
      const ix = readIndex();
      if (ix[clip]) {
        ix[clip].used = Date.now();
        writeIndex(ix);
      }
      return URL.createObjectURL(await hit.blob());
    }
    const res = await fetch(url, { signal });
    if (!res.ok) return url;
    return URL.createObjectURL(await store(clip, res, false));
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    return url;
  }
}

/** 미리 받아도 되는 때인가 — 데이터 절약·오프라인이면 받지 않는다. 운동 중 화면은 부르지 않는다. */
export function canPrefetch(): boolean {
  try {
    const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    return navigator.onLine && !c?.saveData && typeof caches !== "undefined";
  } catch {
    return false;
  }
}

let prefetchRun: AbortController | null = null;

/** 내 루틴 종목을 미리 받고 고정한다. 한 번에 하나씩 천천히. 예전 고정은 풀어 LRU 로 돌린다. 새 호출은 이전 받기를 멈춘다. */
export async function pinMotionClips(clips: string[], signal?: AbortSignal): Promise<void> {
  prefetchRun?.abort();
  const run = new AbortController();
  prefetchRun = run;
  const stop = () => run.abort();
  signal?.addEventListener("abort", stop, { once: true });
  try {
    if (typeof caches === "undefined") return;
    const cache = await caches.open(CACHE);
    // 브라우저가 파일만 지웠을 수 있다 — 실제 저장본으로 인덱스를 맞춘다.
    const real = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
    const want = new Set(clips);
    const ix = readIndex();
    for (const k of Object.keys(ix)) if (!real.has(motionVideoUrl(k))) delete ix[k];
    for (const [k, e] of Object.entries(ix)) e.pinned = want.has(k);
    writeIndex(ix);
    if (!canPrefetch()) return;
    for (const clip of want) {
      if (run.signal.aborted || !canPrefetch()) return;
      if (readIndex()[clip]) continue;
      // 한 클립이 망가져도 뒤 종목은 받는다. 멈춤 신호면 위쪽 검사에서 끝난다.
      try {
        const res = await fetch(motionVideoUrl(clip), { signal: run.signal });
        if (res.ok) await store(clip, res, true);
      } catch {
        /* 다음 클립으로 */
      }
    }
  } catch {
    /* 망이 끊겼거나 멈췄다 — 다음 기회에 */
  } finally {
    signal?.removeEventListener("abort", stop);
    if (prefetchRun === run) prefetchRun = null;
  }
}
