import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { PushModule } from '../push/push.module';

// 소셜 그래프·피드 (SAD-011). PrismaModule은 @Global. 알림 → best-effort 푸시(PushModule).
@Module({
  imports: [PushModule],
  providers: [SocialService],
  controllers: [SocialController],
})
export class SocialModule {}
