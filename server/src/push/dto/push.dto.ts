import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  token!: string;

  @IsOptional()
  @IsIn(['expo', 'web']) // fcm은 전용 프로바이더 없음 — 추가 시 확장
  platform?: string;
}

export class UnregisterTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  token!: string;
}
