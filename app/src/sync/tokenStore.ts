// 인증 토큰 저장 — 플랫폼 분기(웹=localStorage, 네이티브=expo-secure-store). @plm SRS-006
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'repset_auth_token';
const isWeb = Platform.OS === 'web';

export async function saveToken(token: string): Promise<void> {
  if (isWeb) {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, token);
    return;
  }
  await SecureStore.setItemAsync(KEY, token);
}

export async function loadToken(): Promise<string | null> {
  if (isWeb) {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  }
  return SecureStore.getItemAsync(KEY);
}

export async function clearToken(): Promise<void> {
  if (isWeb) {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY);
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}
