// Liftgram 웹 푸시 서비스워커 (SRS-020 · ADR-015).
// push 이벤트 → 알림 표시, 클릭 → 앱 창 포커스/오픈.
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
    icon: '/favicon.png',
    badge: '/favicon.png',
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
