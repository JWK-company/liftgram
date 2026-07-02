// 웹 푸시 구독 검증 (SSRF 방지) — 등록·발송 양쪽에서 사용.
// 엔드포인트는 https + 알려진 푸시 서비스 호스트만 허용(내부망·메타데이터·임의 호스트 차단).
const DEFAULT_ALLOWED_SUFFIXES = [
  'fcm.googleapis.com', // Chrome/Android
  'push.services.mozilla.com', // Firefox
  'notify.windows.com', // Edge/Windows(WNS)
  'push.apple.com', // Safari/Apple
];

export interface ParsedSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// PushSubscription JSON 파싱 + 형태 검증. 불량이면 null.
export function parseWebSubscription(token: string): ParsedSubscription | null {
  try {
    const o = JSON.parse(token) as {
      endpoint?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
    };
    if (
      o &&
      typeof o.endpoint === 'string' &&
      o.keys &&
      typeof o.keys.p256dh === 'string' &&
      typeof o.keys.auth === 'string'
    ) {
      return { endpoint: o.endpoint, keys: { p256dh: o.keys.p256dh, auth: o.keys.auth } };
    }
  } catch {
    // 무시
  }
  return null;
}

// 엔드포인트 허용 여부 — https + 호스트 allowlist(접미 일치). extraHosts는 테스트용(env WEB_PUSH_EXTRA_HOSTS).
export function isAllowedPushEndpoint(endpoint: string, extraHosts: string[] = []): boolean {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  const suffixes = [...DEFAULT_ALLOWED_SUFFIXES, ...extraHosts.map((h) => h.toLowerCase())];
  return suffixes.some((s) => host === s || host.endsWith('.' + s));
}
