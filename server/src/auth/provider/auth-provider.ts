// @plm SRS-006  인증 제공자 포트 (ADR-018 — 매니지드 인증 어댑터 추상화).
// 세션(우리 JWT access + refresh 회전)은 AuthService가 소유. 이 포트는 "신원(identity)을 어떻게 확립하나"만 담당.
// 로컬(email/pw)이 기본 구현. 매니지드(Clerk/Keycloak/Supabase)는 verifyToken 구현으로 드롭인 → /auth/exchange.

export interface ExternalIdentity {
  provider: string; // 'local' | 'clerk' | 'keycloak' | 'supabase' ...
  subject: string; // 제공자의 사용자 식별자 (local: 우리 User.id)
  email: string | null;
  displayName?: string | null;
}

export interface AuthProvider {
  readonly name: string;
  // 로컬 자격증명 로그인 지원 여부. 매니지드는 호스팅된 로그인 사용 → false.
  readonly supportsPasswordAuth: boolean;
  // 로컬 자격증명 — 매니지드에선 미구현(throw).
  registerPassword(email: string, password: string, displayName?: string): Promise<ExternalIdentity>;
  verifyPassword(email: string, password: string): Promise<ExternalIdentity>;
  // 매니지드 토큰(클라이언트가 제공자에서 발급받은) 검증 → 신원. 로컬에선 미구현(throw).
  verifyToken(token: string): Promise<ExternalIdentity>;
}

// DI 토큰 — auth.module에서 config(AUTH_PROVIDER)에 따라 구현 바인딩.
export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');
