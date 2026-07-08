import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

// 이메일 정규화 — trim + 소문자. Postgres @unique는 대소문자 구분이므로 정규화 없으면
// 'A@x.com'/'a@x.com'이 별개 계정으로 공존 → 역할 부트스트랩의 비결정적 매칭(권한상승) 원인.
// ValidationPipe(transform:true)에서 @IsEmail 검증 전에 적용된다.
const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class SignUpDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsString()
  displayName?: string;
}

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class ExchangeDto {
  @IsString()
  providerToken!: string;
}
