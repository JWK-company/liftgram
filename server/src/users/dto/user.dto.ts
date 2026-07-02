import { IsOptional, IsString, MaxLength } from 'class-validator';

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
