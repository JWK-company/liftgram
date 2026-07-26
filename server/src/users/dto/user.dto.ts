import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
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

  // 운동 경력·코칭 의향(SRS-045 서버 반영 — 트레이너 탐색·프로필 표시). null=경력 제거. @plm SRS-045 SRS-048
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsIn(['beginner', 'intermediate', 'advanced'])
  experienceLevel?: string | null;

  @IsOptional()
  @IsBoolean()
  trainerIntent?: boolean;
}

// 관리자 역할 변경 — 허용 역할 집합(ROLES)만 통과. 화이트리스트 검증(엄격).
export class SetRoleDto {
  @IsIn([...ROLES])
  role!: string;
}
