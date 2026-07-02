import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

// 게시물 작성 (SRS-007). 첫 슬라이스는 텍스트/운동 — 미디어(SAD-012)는 후속.
export class CreatePostDto {
  @IsOptional()
  @IsIn(['text', 'workout', 'image'])
  kind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  caption?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['public', 'followers', 'private'])
  visibility?: string;
}
