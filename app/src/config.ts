// 서버 베이스 URL. 개발 기본값=로컬. 실기기는 EXPO_PUBLIC_SERVER_URL로 머신 LAN IP 지정.
// @plm SRS-006
export const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://localhost:3000/api';

// 미디어 URL 해소 — 상대경로(`/media/file/..`)는 SERVER_URL 접두, 절대(CDN) URL은 그대로.
// 서버가 호스트 없는 상대경로를 저장하므로 실기기/CDN 전환에도 관계형 행이 안전.
export function resolveMediaUrl(u: string): string {
  return /^https?:\/\//.test(u) ? u : `${SERVER_URL}${u}`;
}
