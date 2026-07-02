// @plm SRS-020  푸시 알림 등록 (SAD-011 · ADR-015). 네이티브=ExpoPushToken 등록, 웹=graceful skip.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { serverApi } from '../sync/serverApi';
import { savePushToken, loadPushToken, clearPushToken } from '../sync/tokenStore';

// 포그라운드에서도 알림 배너/목록 표시(SDK56).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let currentToken: string | null = null;

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const eas = (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig;
  return extra?.eas?.projectId ?? eas?.projectId;
}

// 로그인/앱시작 시 호출 — 권한 요청 → ExpoPushToken 서버 등록. 웹·미설정은 graceful no-op.
export async function registerPushToken(): Promise<void> {
  if (Platform.OS === 'web') return registerWebPush();
  try {
    let status = (await Notifications.getPermissionsAsync()).status;
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const pid = projectId();
    const res = await Notifications.getExpoPushTokenAsync(pid ? { projectId: pid } : undefined);
    currentToken = res.data;
    if (currentToken) {
      await savePushToken(currentToken); // 콜드스타트 후 언등록 폴백용 영속
      await serverApi.registerPushToken(currentToken, 'expo');
    }
  } catch {
    // EAS projectId 미설정 등 — graceful(네이티브 빌드/EAS 설정 후 동작).
  }
}

// 웹 푸시(VAPID) — 서비스워커 등록 + PushManager 구독 → 서버 등록(platform=web).
async function registerWebPush(): Promise<void> {
  try {
    if (
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator) ||
      typeof window === 'undefined' ||
      !('PushManager' in window)
    ) {
      return;
    }
    if (Notification.permission !== 'granted') {
      if ((await Notification.requestPermission()) !== 'granted') return;
    }
    const { publicKey } = await serverApi.getVapidPublicKey();
    if (!publicKey) return; // 서버 VAPID 미설정
    const reg = await navigator.serviceWorker.register('/sw.js');
    const want = urlBase64ToUint8Array(publicKey);
    let sub = await reg.pushManager.getSubscription();
    // 기존 구독이 현재 서버 VAPID 키와 다르면(키 회전 등) 재구독 — stale 구독 방지.
    if (sub && !sameKey(sub.options?.applicationServerKey ?? null, want)) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: want as BufferSource,
      });
    }
    const token = JSON.stringify(sub);
    currentToken = token;
    await savePushToken(token);
    await serverApi.registerPushToken(token, 'web');
  } catch {
    // graceful (권한 거부·미지원 등)
  }
}

// 구독의 applicationServerKey(ArrayBuffer)와 기대 키 바이트 비교.
function sameKey(current: ArrayBuffer | null, want: Uint8Array): boolean {
  if (!current) return false;
  const cur = new Uint8Array(current);
  if (cur.length !== want.length) return false;
  for (let i = 0; i < cur.length; i += 1) if (cur[i] !== want[i]) return false;
  return true;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

// 로그아웃 시 호출 — 서버에서 이 기기 토큰 제거(인증 유효할 때 먼저 호출).
// 인메모리 currentToken이 없으면(앱 재시작 후) 영속 저장분을 폴백으로 사용.
export async function unregisterPushToken(): Promise<void> {
  const token = currentToken ?? (await loadPushToken());
  currentToken = null;
  if (Platform.OS === 'web') {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      await sub?.unsubscribe();
    } catch {
      // 무시
    }
  }
  if (token) {
    try {
      await serverApi.unregisterPushToken(token);
    } catch {
      // 무시
    }
  }
  await clearPushToken();
}
