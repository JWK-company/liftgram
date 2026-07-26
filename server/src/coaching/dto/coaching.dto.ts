// 코칭 권한 DTO (SRS-048 · SAD-022). @plm SRS-048
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// 코칭 요청 — 회원이 trainerId를, 트레이너가 memberId를 지정(정확히 하나만).
export class CreateCoachingRequestDto {
  @IsOptional()
  @IsUUID()
  trainerId?: string;

  @IsOptional()
  @IsUUID()
  memberId?: string;
}

export class SearchTrainersDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  q?: string;
}
