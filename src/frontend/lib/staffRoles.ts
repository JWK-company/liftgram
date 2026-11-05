// 운영진 역할 판정 — 잠금화면 진단처럼 기기 안에만 있는 정보를 볼 사람을 가른다.
// 안내일 뿐 경계가 아니다 — 각 화면의 권한은 서버가 다시 판정한다.
import { Role } from "@app/contracts";

/** 관리자. 서버의 내부 역할 목록과 같아야 한다. */
export function isInsider(role: Role | undefined): boolean {
  return role === Role.ADMIN;
}
