import { Module } from '@nestjs/common';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { RolesGuard } from '../auth/roles.guard';

// 개발 피드백 → PLM 아이디어보드 브릿지 (SRS-006 · coworker/admin 전용).
// PrismaModule·ConfigModule은 @Global이라 주입 자동. RolesGuard는 DB role 대조로 providers 등록 필요.
@Module({
  controllers: [FeedbackController],
  providers: [FeedbackService, RolesGuard],
})
export class FeedbackModule {}
