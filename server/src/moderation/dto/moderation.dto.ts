import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// 신고 대상·사유 (SAD-012 · ADR-017). 건강·미성년 안전 사유 포함.
export const TARGET_TYPES = ['post', 'story', 'comment'] as const;
export const REPORT_REASONS = [
  'spam',
  'nudity',
  'harassment',
  'violence',
  'self_harm',
  'minor_safety',
  'misinformation',
  'other',
] as const;

export class CreateReportDto {
  @IsIn(TARGET_TYPES)
  targetType!: string;

  @IsUUID()
  targetId!: string;

  @IsIn(REPORT_REASONS)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  details?: string;
}

export class ResolveDto {
  @IsIn(TARGET_TYPES)
  targetType!: string;

  @IsUUID()
  targetId!: string;

  @IsIn(['remove', 'approve'])
  action!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
