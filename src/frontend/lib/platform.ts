// @plm SRS-095 [ADR-046]  앱 안 판정
// 스토어 앱 껍데기(src/mobile)는 웹앱을 그대로 띄우고 user-agent 끝에 `LiftgramApp/<버전>` 을 붙인다
// (iOS 는 ` (ios)` 를 더). 웹과 앱이 같은 화면을 쓰되 **길만** 갈린다 — 로그인(시스템 인증 창) · 잠금화면 · 위젯.
// import 0 — 서버(요청 헤더)와 클라이언트(navigator) 양쪽에서 쓴다. 북타래 lib/platform.ts 와 같은 모양.

export const APP_UA_TAG = "LiftgramApp/";

export type AppPlatform = "web" | "app";

/** user-agent 문자열 하나로 판정. 서버는 요청 헤더를, 클라이언트는 navigator.userAgent 를 넘긴다. */
export function platformOf(userAgent: string | null | undefined): AppPlatform {
  return userAgent?.includes(APP_UA_TAG) ? "app" : "web";
}

/** 앱 껍데기 버전(「1.0.0」) — 웹이 낡은 앱에 새 기능을 내밀지 않게. 앱이 아니면 null. */
export function appVersionOf(userAgent: string | null | undefined): string | null {
  const m = userAgent?.match(/LiftgramApp\/([0-9][0-9A-Za-z.-]*)/);
  return m ? m[1] : null;
}

/** iOS 스토어 앱인가 — Apple 네이티브 로그인 시트를 쓸지 가른다(심사 4.8). */
export function isIOSAppUA(userAgent: string | null | undefined): boolean {
  return !!userAgent && /LiftgramApp\/[0-9][0-9A-Za-z.-]* \(ios\)/.test(userAgent);
}
