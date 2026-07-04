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

// 게시물 수정 (SRS-007) — 본인 캡션/가시성 편집. 미디어·kind는 불변.
export class UpdatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  caption?: string;

  @IsOptional()
  @IsIn(['public', 'followers', 'private'])
  visibility?: string;
}

export class CreateStoryDto {
  @IsString()
  mediaUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;
}

export class AddCommentDto {
  @IsString()
  @MaxLength(2000)
  body!: string;
}
