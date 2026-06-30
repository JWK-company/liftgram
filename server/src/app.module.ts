import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SyncModule } from './sync/sync.module';

// 모듈러 모놀리스 루트 (ADR-011/ADR-018). 도메인 모듈을 한 배포 단위로 묶는다.
// 현재(토대): health · auth · users · sync(오프라인-우선 동기).
// 후속: social(SAD-011) · media(SAD-012) · payments(SAD-013) · notifications(SRS-020).
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    SyncModule,
  ],
})
export class AppModule {}
