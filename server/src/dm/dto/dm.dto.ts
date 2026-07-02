import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

// 1:1 대화 시작/조회 (SRS-017). 그룹은 후속.
export class CreateConversationDto {
  @IsUUID()
  userId!: string;
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
