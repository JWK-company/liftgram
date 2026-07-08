// 서버 베이스 URL. 개발 기본값=로컬. 실기기·배포는 EXPO_PUBLIC_SERVER_URL로 지정.
// @plm SRS-006
export const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://localhost:3000/api';

// 배포 함정 방어 — 배포된 웹앱(localhost가 아닌 호스트에서 열림)인데 서버 주소가
// 여전히 localhost면, 모든 소셜 기능이 무증상 실패한다. 플래그로 노출해 UI 배너(ConfigBanner)로도
// 승격 → console을 안 보는 테스터도 "설정 문제"를 화면에서 바로 인지(무증상→가시).
export const isServerMisconfigured =
  typeof window !== 'undefined' &&
  !!window.location &&
  !/^(localhost|127\.0\.0\.1)/.test(window.location.hostname) &&
  /localhost|127\.0\.0\.1/.test(SERVER_URL);

if (isServerMisconfigured) {
  // eslint-disable-next-line no-console
  console.error(
    '[config] 배포 웹앱인데 SERVER_URL이 localhost입니다. ' +
      '빌드 시 EXPO_PUBLIC_SERVER_URL="https://<서버주소>/api"를 설정하세요. (소셜 기능 전부 실패)',
  );
}

// 미디어 URL 해소 — 상대경로(`/media/file/..`)는 SERVER_URL 접두, 절대(CDN) URL은 그대로.
// 서버가 호스트 없는 상대경로를 저장하므로 실기기/CDN 전환에도 관계형 행이 안전.
export function resolveMediaUrl(u: string): string {
  return /^https?:\/\//.test(u) ? u : `${SERVER_URL}${u}`;
}
