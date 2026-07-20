// @plm SRS-039  착용장비 클릭 집계 모듈 (SAD-020 · ADR-027 Phase 0).
import { Module } from '@nestjs/common';
import { GearController } from './gear.controller';
import { GearService } from './gear.service';
import { RolesGuard } from '../auth/roles.guard';

// 착용장비 Phase 0 — 클릭 집계·제휴 설정 조회·admin 통계.
// PrismaModule·ConfigModule은 @Global이라 주입 자동. RolesGuard는 DB role 대조로 providers 등록 필요.
@Module({
  controllers: [GearController],
  providers: [GearService, RolesGuard],
})
export class GearModule {}
