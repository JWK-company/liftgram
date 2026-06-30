import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// 전역 모듈 — 모든 도메인 모듈이 PrismaService 주입 가능.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
