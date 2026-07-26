// @plm SRS-003  휴식 종료 네이티브 알림(잠금화면·백그라운드) — 예약형 로컬 알림.
// 잠금 시 네이티브 JS/타이머가 정지하므로, 휴식 '시작' 때 OS에 N초 뒤 발화를 예약한다(조기종료·재시작 시 취소).
// 잠금화면 발화는 OS가 담당하므로 화면이 꺼져 있어도 소리·진동이 난다(웹 경로는 sound.ts).
//
// 주의: setNotificationHandler는 push.ts가 전역 1개로 소유(마지막 등록이 이김). 여기서 재정의하면
//       푸시 알림의 소리 설정을 덮어쓰므로 등록하지 않는다.
// 빌드 주의: 예약형 로컬 알림은 expo-notifications 네이티브 모듈이 컴파일된 dev/prod 빌드에서 발화한다
//       (이 앱은 Expo Go 대상이 아니라 커스텀 네이티브 빌드 — push.ts가 이미 expo-notifications 사용).
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const REST_CHANNEL_ID = 'rest-timer';
const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

let granted = false;

// 앱 시작 시 1회: Android 채널 생성(권한 불필요) + 현재 알림 권한 상태 반영.
// 권한 '요청'은 push.ts가 이미 수행 → 여기선 재요청하지 않는다(앱시작 프롬프트·이중요청 방지).
export async function initRestAlarm(): Promise<boolean> {
  if (!isNative) return false;
  try {
    if (Platform.OS === 'android') {
      // Android 8+는 채널이 소리/중요도를 결정. MAX = 잠금화면 heads-up + 소리.
      await Notifications.setNotificationChannelAsync(REST_CHANNEL_ID, {
        name: '휴식 종료 알림',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }
    granted = (await Notifications.getPermissionsAsync()).granted;
    return granted;
  } catch {
    return false; // 네이티브 모듈 미컴파일/권한 오류 등 — 포그라운드 Vibration 폴백으로 degrade
  }
}

// 휴식 시작 시 호출 — N초 뒤 발화 예약. 반환 id는 취소용으로 보관.
export async function scheduleRestAlarm(seconds: number): Promise<string | null> {
  if (!isNative || seconds <= 0) return null;
  try {
    if (!granted) granted = (await Notifications.getPermissionsAsync()).granted; // 늦게 승인됐을 수 있어 재확인(프롬프트 없음)
    if (!granted) return null;
    const secs = Math.max(1, Math.round(seconds));
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: '휴식 종료',
        body: '다음 세트를 시작하세요',
        sound: 'default', // iOS + Android<8 기본음(Android 8+는 채널이 담당)
        vibrate: [0, 250, 250, 250],
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: secs, // "N초 뒤" — SDK52+ 정확한 트리거 형태(type 필수)
        repeats: false,
        channelId: REST_CHANNEL_ID,
      },
    });
  } catch {
    return null;
  }
}

// 조기 종료 / 리셋 / +15s 재예약 시 예약 취소.
export async function cancelRestAlarm(id: string | null): Promise<void> {
  if (!isNative || !id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    /* no-op */
  }
}
