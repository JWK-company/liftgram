import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  token!: string;

  @IsOptional()
  @IsIn(['expo', 'web', 'fcm'])
  platform?: string;
}

export class UnregisterTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  token!: string;
}
