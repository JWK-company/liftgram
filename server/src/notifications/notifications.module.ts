import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

// 알림 (SRS-020). PrismaModule은 @Global.
@Module({
  providers: [NotificationsService],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
