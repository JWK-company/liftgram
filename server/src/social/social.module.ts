import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';

// 소셜 그래프·피드 (SAD-011). PrismaModule은 @Global.
@Module({
  providers: [SocialService],
  controllers: [SocialController],
})
export class SocialModule {}
