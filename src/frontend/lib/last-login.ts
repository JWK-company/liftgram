// @plm SRS-052  「마지막 로그인 수단」 — 이 기기에서 마지막으로 로그인한 방법(로그인 화면의 「최근」 배지)
//
// 세션을 여는 순간 /api/session(POST)이 HttpOnly 쿠키 `lg_last` 로 남긴다(1년 · 로그아웃해도 남는다).
// 로그인 화면은 **서버에서** 읽어 내려보낸다 — 클라이언트 JS 는 이 쿠키를 못 읽는다(일부러).
// 이메일 주소로 서버에 묻지 않고 이 기기의 기록만 쓰므로, 남의 주소가 어느 수단으로 가입됐는지
// 알아내는 조회기가 되지 않는다(booktarae d8790329 와 같은 원칙).
export const LAST_LOGIN_COOKIE = "lg_last";

export type LastLogin = "email" | "google" | "kakao" | "naver";

// 그 밖의 값은 없는 것으로 친다(쿠키를 손으로 고친 경우 등).
const KNOWN: readonly LastLogin[] = ["email", "google", "kakao", "naver"];

export function parseLastLogin(v: string | undefined | null): LastLogin | null {
  return v && (KNOWN as readonly string[]).includes(v) ? (v as LastLogin) : null;
}
