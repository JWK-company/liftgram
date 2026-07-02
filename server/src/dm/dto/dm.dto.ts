import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// 1:1 대화 시작/조회 (SRS-017). 그룹은 후속.
export class CreateConversationDto {
  @IsUUID()
  userId!: string;
}

export class CreateGroupDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50) // 서비스 캡과 정합 — 대용량 IN() 쿼리 전에 차단
  @IsUUID('all', { each: true })
  userIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  title?: string;
}

export class SendMessageDto {
  @IsOptional()
  @IsIn(['text', 'image'])
  kind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string;
}
