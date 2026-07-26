// @plm SRS-048  코칭 모듈 (SAD-022) — 권한(grant)·감사·회원 리포트.
import { Module } from '@nestjs/common';
import { CoachingController } from './coaching.controller';
import { CoachingService } from './coaching.service';

@Module({
  controllers: [CoachingController],
  providers: [CoachingService],
})
export class CoachingModule {}
