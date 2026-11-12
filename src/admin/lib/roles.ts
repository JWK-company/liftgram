// 메뉴와 화면을 역할에 맞춘다. 표시용이고 실제 경계는 서버가 매 요청 판정한다.
import { Role } from "@app/contracts";

export type MenuItem = { href: string; label: string; testid: string; roles: readonly Role[] };

// 협업자 역할은 쓰지 않는다. 운영 웹에는 관리자와 모더레이터만 들어온다(2026-11-05 결정).
const ALL_STAFF = [Role.ADMIN, Role.MODERATOR] as const;

export const MENU: readonly MenuItem[] = [
  { href: "/", label: "요약", testid: "menu-home", roles: ALL_STAFF },
  { href: "/moderation", label: "신고 검토", testid: "menu-moderation", roles: [Role.ADMIN, Role.MODERATOR] },
  { href: "/user-feedback", label: "사용자 의견", testid: "menu-user-feedback", roles: [Role.ADMIN] },
  { href: "/ops-feedback", label: "운영 피드백", testid: "menu-ops-feedback", roles: [Role.ADMIN] },
  { href: "/awards", label: "이달의 리프터", testid: "menu-awards", roles: [Role.ADMIN] },
  { href: "/stats", label: "통계", testid: "menu-stats", roles: [Role.ADMIN] },
  { href: "/ops", label: "운영 상태", testid: "menu-ops", roles: [Role.ADMIN] },
  { href: "/settings", label: "설정", testid: "menu-settings", roles: [Role.ADMIN] },
];

export function isStaff(role: Role): boolean {
  return (ALL_STAFF as readonly Role[]).includes(role);
}

export function roleLabel(role: Role): string {
  if (role === Role.ADMIN) return "관리자";
  if (role === Role.MODERATOR) return "모더레이터";
  return "일반 사용자";
}

/** 화면이 아닌 주소. 로그인 뒤 여기로 가면 폼에 머물거나 빈 글자만 보인다. */
const NOT_A_SCREEN = /^\/(login|api|healthz|readyz|_next)(\/|$)/;

/**
 * 로그인 뒤 돌아갈 주소. 정규식이 아니라 브라우저와 같은 URL 파서로 판정한다.
 * `/<탭>/host` 는 문자열로는 경로처럼 보이지만 파서가 공백류를 지워 `//host`, 즉 다른 사이트가 된다.
 */
export function safeNext(next: string | null, origin: string): string {
  if (!next) return "/";
  try {
    const u = new URL(next, origin);
    if (u.origin !== origin || NOT_A_SCREEN.test(u.pathname)) return "/";
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return "/";
  }
}
