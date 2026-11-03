// SPEC-018 §7  웹 → 앱 로그인 넘기기 — 화면·다리가 같이 쓰는 순수 규칙(DOM·네트워크 없음).

/** 앱 스킴 — 서버 oauth.AppScheme · auth.AppContinueScheme · AndroidManifest 와 같은 값 */
export const APP_SCHEME = "liftgram";

/** challenge = base64url(sha256(v)) — 43자(서버 validChallenge 와 같은 규칙) */
export function isChallenge(ac: string | null | undefined): ac is string {
  return typeof ac === "string" && /^[A-Za-z0-9_-]{43}$/.test(ac);
}

export type AppLinkKind = "auth" | "workout" | "start";

/**
 * 앱 스킴 주소의 갈래 — `liftgram://auth?code=` · `liftgram://workout` · `liftgram://start`(PWA 에서 바꾸기).
 * 다른 스킴·모르는 갈래는 null(디스패처가 버린다).
 */
export function appLinkKind(url: string | null | undefined): AppLinkKind | null {
  if (typeof url !== "string") return null;
  const m = /^liftgram:\/\/([a-z]+)(?:[/?#]|$)/i.exec(url);
  if (!m) return null;
  const k = m[1]!.toLowerCase();
  return k === "auth" || k === "workout" || k === "start" ? k : null;
}

/**
 * 확인 화면에 보일 주소 — 앞 한 글자와 도메인만(`a••••@gmail.com`). 남이 화면을 봐도 계정 전체가 드러나지 않게.
 * 주소가 없거나 모양이 이상하면 "".
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return "";
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return "";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local[0]}${"•".repeat(Math.min(Math.max(local.length - 1, 3), 6))}@${domain}`;
}

/**
 * 착지 /auth/complete?via=continue 를 받았을 때 — 이미 세션이 있는 앱이면 교환하지 않고 버린다(SPEC-018 §7 방어).
 * 넘기기가 아니면(소셜 로그인 등) 언제나 교환한다.
 */
export function shouldExchange(via: string, hasSession: boolean): boolean {
  return !(via === "continue" && hasSession);
}
