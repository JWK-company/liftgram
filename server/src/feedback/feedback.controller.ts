// @plm SRS-006  개발 피드백 API — coworker/admin 전용(RolesGuard).
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { FeedbackItem, FeedbackService } from './feedback.service';
import { CreateFeedbackDto } from './dto/feedback.dto';

// 클래스 레벨 가드: JwtAuthGuard(req.user 주입) → RolesGuard(DB role 대조).
// @Roles가 클래스에 있으므로 모든 핸들러가 coworker/admin만 허용된다.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('coworker', 'admin')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  // 자연어 문제/개선 → PLM 아이디어보드 등록.
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFeedbackDto): Promise<{ id: number }> {
    return this.feedback.create(user, dto);
  }

  // 등록된 인앱 피드백 목록(상태·채택 포함, 내 항목 표시).
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<FeedbackItem[]> {
    return this.feedback.list(user);
  }
}
