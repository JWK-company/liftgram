// 역할 상수 — 단일 출처(SSOT). DB는 String 컬럼(User.role)이며 값은 이 집합으로 제한한다.
// 문자열 산개를 막고 DTO 검증(@IsIn)·가드·부트스트랩이 모두 이 배열을 참조한다.
//   user      = 일반 사용자(기본)
//   coworker  = 동료(팀 구성원)
//   moderator = 콘텐츠 모더레이션 권한(ADR-017 — moderation 엔드포인트가 사용)
//   admin     = 관리자(전권)
export const ROLES = ['user', 'coworker', 'moderator', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(v: unknown): v is Role {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v);
}
