import { Module } from '@nestjs/common';
import { DmController } from './dm.controller';
import { DmService } from './dm.service';

// 다이렉트 메시지 (SRS-017 · SAD-011). PrismaModule은 @Global.
@Module({
  providers: [DmService],
  controllers: [DmController],
})
export class DmModule {}
