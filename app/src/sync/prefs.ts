// 비밀 아닌 로컬 설정 플래그 저장(온보딩 완료 등) — 웹=localStorage, 네이티브=expo-secure-store.
// 토큰(tokenStore)과 분리 — 민감정보 아님. 키는 영숫자·._- 만(SecureStore 제약).
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';

export async function getPref(key: string): Promise<string | null> {
  if (isWeb) return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setPref(key: string, value: string): Promise<void> {
  if (isWeb) {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // 저장 실패는 무시(플래그성 — 실패해도 앱 동작엔 영향 없음)
  }
}
