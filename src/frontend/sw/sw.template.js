// @plm SRS-051  오프라인 앱 셸 — 서비스워커 원본(빌드 때 scripts/build-sw.mjs가 public/sw.js로 찍어낸다)
//
// 운동 기록은 이미 기기 안 DB(IndexedDB)에 쓴다. 오프라인에서 모자란 것은 **화면을 여는 것** 하나다.
// 그래서 이 워커는 화면 셸과 정적 파일만 기기에 보관한다. 요청마다 규칙이 다르다:
//
//   /_next/static/*      설치 때 전부 미리 받기 → 캐시 우선(파일명에 해시가 있어 내용이 안 바뀐다)
//   화면 이동(HTML)       탭 셸(SWR_SHELLS)은 **기기에 있는 것을 곧바로** 주고 뒤에서 새로 받아 둔다(stale-while-revalidate ·
//                        SRS-054 — 운영 경로 왕복 ≈0.6s 를 첫 칠하기에서 뺀다). 그 밖은 네트워크 우선(3초) → 캐시 → /offline
//   ?_rsc / RSC: 1        네트워크만 — 실패하면 Next가 전체 페이지 이동으로 넘어가고 위 줄이 받는다
//   /api/*                절대 캐시하지 않는다(인증된 응답이 기기에 남으면 안 된다)
//   /fonts/*              캐시 우선(정적 캐시 — Pretendard 서브셋은 그 글자를 처음 쓸 때 받는다)
//   /media/file/*         캐시 우선 · 최대 200장 · 7일(키가 무작위라 내용이 안 바뀐다)
//
// ⚠ 새 워커는 **스스로 활성화하지 않는다**(skipWaiting 없음). [원본] 화면이 "새 버전" 띠를 띄우고,
//   운동 중이 아닐 때 사람이 누르면 그때 바꾼다 — 세트를 적는 도중 새로고침되지 않게.
//   [개선 2026-10-27 · SRS-085] 사람이 **프로필 「업데이트」** 를 누를 때만 "skip-waiting" 을 받는다(띠·자동 적용 없음).
//   앱을 완전히 닫았다 열면 브라우저가 알아서 이 워커를 활성화한다 — 그건 허용(새 문서가 처음부터 새 워커).
//   화면이 새 버전 번호를 보여 주도록 {type:"version"} 메시지에 APP_VERSION·BUILD_ID 를 답한다.
// ⚠ 옛 정적 캐시는 **한 세대 남긴다**. 바로 지우면 열려 있던 옛 탭이 화면 조각을 못 찾아 깨진다.

const BUILD_ID = "__BUILD_ID__";
// 앱 버전(frontend/package.json) — 기다리는 동안 화면이 물어 「새 버전 vX.Y.Z」 로 보인다 @plm SRS-085
const APP_VERSION = "__APP_VERSION__";
const STATIC = `liftgram-static-${BUILD_ID}`;
const PAGES = `liftgram-pages-${BUILD_ID}`;
const MEDIA = "liftgram-media";
const PRECACHE = __PRECACHE__;
// 주요 탭 셸 — 설치 때 받아 두면 한 번도 안 연 탭도 오프라인에서 열린다.
// /stats/summary(성과 요약)는 탭이 아니지만 계산이 전부 기기에서 되고 대기열이 있다 — 체육관(오프라인)에서 처음 열어
// 「보내기 → 연결되면 감」이 되게 미리 받는다(P4 /qa code P4U-18 · @plm SRS-080). 탭 셸이 아니라 SWR_SHELLS 에는 넣지 않는다.
// biome-ignore format: 셸 대조 테스트(shellCache.test.ts)가 이 줄을 한 줄 JSON 으로 읽는다
const SHELLS = ["/", "/workout", "/history", "/calendar", "/stats", "/stats/summary", "/exercises", "/profile", "/offline"];
// 곧바로 내줘도 되는 셸 — 쿠키를 읽지 않는 클라이언트 화면만(데이터는 기기 DB·API 에서 따로 온다).
// signin·signup·account 는 서버가 쿠키(「최근」 배지)를 읽어 그린다 — 여기 넣지 않는다.
// 캐시는 **이 빌드의 PAGES** 뿐이다: 셸 HTML 이 가리키는 정적 조각이 같은 워커의 STATIC 에 들어 있다(버전 어긋남 없음).
// 새 배포는 새 워커가 기다리다 사람이 프로필 「업데이트」로 바꾼다(ServiceWorker.tsx · SRS-085) — 그때 새 셸로 넘어간다.
const SWR_SHELLS = new Set([
  "/",
  "/workout",
  "/history",
  "/calendar",
  "/stats",
  "/exercises",
  "/profile",
  "/feed",
]);
const NAV_TIMEOUT_MS = 3000;
const MEDIA_MAX = 200;
const MEDIA_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const s = await caches.open(STATIC);
      await s.addAll(PRECACHE);
      const p = await caches.open(PAGES);
      // 셸 하나가 실패해도 설치는 이어 간다 — 그 탭만 첫 방문 때 채워진다.
      await Promise.all(SHELLS.map((u) => p.add(new Request(u, { cache: "reload" })).catch(() => {})));
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 지금 것과 **바로 앞 세대**만 남긴다. 앞 세대를 아는 방법 = 남은 것 중 가장 최근에 만든 캐시.
      const keys = (await caches.keys()).filter(
        (k) => k.startsWith("liftgram-static-") || k.startsWith("liftgram-pages-"),
      );
      const prev = await previousBuild(keys);
      await Promise.all(
        keys
          .filter((k) => !k.endsWith(BUILD_ID) && (prev === null || !k.endsWith(prev)))
          .map((k) => caches.delete(k)),
      );
      await rememberBuild();
      await self.clients.claim();
    })(),
  );
});

// 바로 앞 세대의 빌드 ID — 활성화할 때마다 적어 둔다(캐시 이름만으로는 순서를 모른다).
async function previousBuild() {
  const c = await caches.open("liftgram-meta");
  const r = await c.match("/__current_build");
  const prev = r ? await r.text() : null;
  return prev && prev !== BUILD_ID ? prev : null;
}
async function rememberBuild() {
  const c = await caches.open("liftgram-meta");
  await c.put("/__current_build", new Response(BUILD_ID));
}

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
  // 버전 묻기 — 포트로 답한다(옛 워커는 답하지 않으니 화면은 짧게 기다리고 넘어간다) @plm SRS-085
  if (event.data && event.data.type === "version")
    event.ports?.[0]?.postMessage({ version: APP_VERSION, build: BUILD_ID });
  // 로그아웃하면 본 사진을 기기에서 지운다(다음 사람이 이 기기를 쓸 수 있다).
  if (event.data === "clear-media") event.waitUntil(caches.delete(MEDIA));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;
  if (url.pathname.startsWith("/_next/static/")) return event.respondWith(cacheFirst(req, STATIC));
  if (url.pathname.startsWith("/fonts/")) return event.respondWith(cacheFirst(req, STATIC));
  if (url.pathname.startsWith("/media/file/")) return event.respondWith(media(req));
  // 화면 사이 이동 데이터는 캐시하지 않는다 — 오래된 화면 조각이 섞인다.
  if (url.searchParams.has("_rsc") || req.headers.get("RSC") === "1") return;
  if (req.mode === "navigate") return event.respondWith(page(req, event));
  if (PRECACHE.includes(url.pathname)) return event.respondWith(cacheFirst(req, STATIC));
});

async function cacheFirst(req, name) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(name)).put(req, res.clone());
  return res;
}

async function page(req, event) {
  const cache = await caches.open(PAGES);
  if (SWR_SHELLS.has(new URL(req.url).pathname)) {
    const hit = await cache.match(stripQuery(req));
    if (hit) {
      // 뒤에서 새로 받아 다음 열기에 쓴다 — 리다이렉트·오류는 셸로 보관하지 않는다.
      event.waitUntil(
        fetch(req)
          .then((res) => {
            if (res.ok && res.type === "basic" && !res.redirected) return cache.put(stripQuery(req), res);
          })
          .catch(() => {}),
      );
      return hit;
    }
  }
  try {
    const res = await withTimeout(fetch(req), NAV_TIMEOUT_MS);
    // 리다이렉트·오류 화면은 셸로 보관하지 않는다.
    if (res.ok && res.type === "basic" && !res.redirected) cache.put(stripQuery(req), res.clone());
    return res;
  } catch {
    return (
      (await cache.match(stripQuery(req))) ??
      (await caches.match(stripQuery(req))) ?? // 앞 세대 셸이라도 없는 것보단 낫다
      (await caches.match("/offline")) ??
      new Response("offline", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } })
    );
  }
}

async function media(req) {
  const cache = await caches.open(MEDIA);
  const hit = await cache.match(req);
  if (hit && Date.now() - Number(hit.headers.get("sw-cached-at") ?? 0) < MEDIA_MAX_AGE_MS) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const headers = new Headers(res.headers);
      headers.set("sw-cached-at", String(Date.now()));
      const body = await res.clone().blob();
      await cache.put(req, new Response(body, { status: res.status, headers }));
      trimMedia(cache);
    } else if (res.status === 404) {
      // 내려간 사진은 기기에서도 지운다.
      await cache.delete(req);
    }
    return res;
  } catch (e) {
    if (hit) return hit; // 오프라인이면 기한이 지났어도 보여 준다
    throw e;
  }
}

// 가장 오래 담아 둔 것부터 덜어낸다(keys()는 넣은 순서다).
async function trimMedia(cache) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MEDIA_MAX))) await cache.delete(k);
}

function stripQuery(req) {
  const u = new URL(req.url);
  return u.origin + u.pathname;
}

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}
