// 운영진 역할 판정 — 탭바(모든 화면의 공용 묶음)가 쓰므로 화면 컴포넌트와 분리한다(#T2 · REV-023 L5)
// 안내일 뿐 경계가 아니다 — 각 화면의 권한은 서버가 다시 판정한다.
import { Role } from "@app/contracts";

/** 개발 피드백을 쓸 수 있는 역할. 서버의 판단과 **같은 목록**이어야 한다. */
export function isInsider(role: Role | undefined): boolean {
  return role === Role.COWORKER || role === Role.ADMIN;
}

/** 운영 탭을 볼 역할 — 피드백(내부 사람)과 모더레이션(모더레이터·관리자) 중 하나라도 쓸 수 있는 사람. */
export function canSeeStaffTab(role: Role | undefined): boolean {
  return isInsider(role) || role === Role.MODERATOR;
}
