import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ROLES } from '../../auth/roles';

// 내 프로필 수정 (SRS-008). avatarUrl='' 이면 아바타 제거.
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatarUrl?: string;
}

// 관리자 역할 변경 — 허용 역할 집합(ROLES)만 통과. 화이트리스트 검증(엄격).
export class SetRoleDto {
  @IsIn([...ROLES])
  role!: string;
}
