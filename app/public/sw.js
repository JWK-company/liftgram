// Liftgram 서비스워커 — 웹푸시(SRS-020·ADR-015) + PWA 오프라인 앱셸.
const CACHE = 'liftgram-v1';
const PRECACHE = ['/', '/index.html', '/manifest.json', '/favicon.ico', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all(PRECACHE.map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 내비 셸과 그것이 참조하는 /_expo/static 자산을 함께 캐시 — 배포 후 오프라인 셸/번들 desync 방지.
async function cacheShellAndAssets(res) {
  const cache = await caches.open(CACHE);
  await cache.put('/', res.clone());
  let html = '';
  try {
    html = await res.text();
  } catch (e) {
    return;
  }
  const urls = [...html.matchAll(/["'](\/_expo\/static\/[^"']+?)["']/g)].map((m) => m[1]);
  await Promise.all([...new Set(urls)].map((u) => cache.add(u).catch(() => {})));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API·크로스오리진은 패스스루
  if (url.pathname.startsWith('/api')) return;

  // 내비게이션 → 네트워크 우선, 오프라인 시 캐시된 앱셸(/) 제공.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          // 정상 셸만 캐시(에러·리다이렉트 셸 오염 방지) + 참조 번들 동반 캐시(오프라인 일관성).
          if (res && res.ok && res.type === 'basic' && !res.redirected) {
            event.waitUntil(cacheShellAndAssets(res.clone()));
          }
          return res;
        } catch (e) {
          return (await caches.match('/')) || (await caches.match('/index.html'));
        }
      })(),
    );
    return;
  }

  // 정적 자산 → stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

// --- 웹 푸시 ---
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Liftgram';
  const options = {
    body: payload.body || '',
    data: payload.data || {},
    icon: '/icon-192.png',
    badge: '/favicon.ico',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = typeof data.url === 'string' ? data.url : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) {
          if (url !== '/' && 'navigate' in c) return c.navigate(url).then((cl) => (cl || c).focus());
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
