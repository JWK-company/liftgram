import { Module } from '@nestjs/common';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { RolesGuard } from '../auth/roles.guard';

// 신고·모더레이션 (SAD-012 · ADR-017). PrismaModule은 @Global. RolesGuard는 DB role 대조.
@Module({
  controllers: [ModerationController],
  providers: [ModerationService, RolesGuard],
})
export class ModerationModule {}
