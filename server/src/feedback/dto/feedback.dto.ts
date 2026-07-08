import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

// 개발 피드백 분류 — 앱 테스트 중 발견한 문제(bug)·개선 제안(improvement).
// PLM 아이디어 제목 접두([버그]/[개선])와 body 마커로 왕복 매핑된다.
export const FEEDBACK_CATEGORIES = ['bug', 'improvement'] as const;

export class CreateFeedbackDto {
  @IsIn(FEEDBACK_CATEGORIES)
  category!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(4000)
  detail!: string;
}
