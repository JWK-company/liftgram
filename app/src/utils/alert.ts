// 크로스플랫폼 알림 — RN Alert.alert 호환 시그니처를 테마 모달 호스트(AlertHost)로 라우팅.
// 웹: react-native-web의 Alert.alert는 콜백을 호출하지 않는 no-op이므로 installWebAlert()로 대체.
// 네이티브: 기본 RN Alert 유지(showAlert를 직접 쓰면 호스트 모달로도 가능). @plm SRS-003 SRS-004
import { Alert, Platform } from 'react-native';
import { t } from '../i18n';

export type AlertButtonStyle = 'default' | 'cancel' | 'destructive';

export interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: AlertButtonStyle;
}

export interface AlertRequest {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

type Listener = (req: AlertRequest) => void;
let listener: Listener | null = null;

// AlertHost가 자신을 등록/해제한다(단일 호스트).
export function _setAlertListener(l: Listener | null): void {
  listener = l;
}

// RN Alert.alert 호환. 마운트된 AlertHost로 라우팅. 호스트 미마운트(부팅 직후) 시 웹 네이티브 폴백.
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  const btns: AlertButton[] = buttons && buttons.length ? buttons : [{ text: t('common.ok') }];
  if (listener) {
    listener({ title, message, buttons: btns });
    return;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const text = message ? `${title}\n\n${message}` : title;
    const confirmBtn = btns.find((b) => b.style !== 'cancel' && b.onPress);
    if (btns.length > 1 && confirmBtn) {
      if (window.confirm(text)) confirmBtn.onPress?.();
    } else {
      window.alert(text);
      btns[0]?.onPress?.();
    }
  }
}

// 웹에서 RN Alert.alert(no-op)를 showAlert로 대체 → 기존 호출부(Alert.alert) 전부 그대로 동작.
export function installWebAlert(): void {
  if (Platform.OS !== 'web') return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Alert as any).alert = (title: string, message?: string, buttons?: AlertButton[]) =>
    showAlert(title, message, buttons);
}
