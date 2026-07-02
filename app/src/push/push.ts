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
  if (Platform.OS === 'web') return; // 웹 푸시(VAPID)는 후속 드롭인
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

// 로그아웃 시 호출 — 서버에서 이 기기 토큰 제거(인증 유효할 때 먼저 호출).
// 인메모리 currentToken이 없으면(앱 재시작 후) 영속 저장분을 폴백으로 사용.
export async function unregisterPushToken(): Promise<void> {
  const token = currentToken ?? (await loadPushToken());
  currentToken = null;
  if (!token) return;
  try {
    await serverApi.unregisterPushToken(token);
  } catch {
    // 무시
  }
  await clearPushToken();
}
