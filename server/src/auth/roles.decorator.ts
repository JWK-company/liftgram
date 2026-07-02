import { SetMetadata } from '@nestjs/common';

// 핸들러/컨트롤러에 요구 역할 부착 — RolesGuard가 읽어 검사 (ADR-017).
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
