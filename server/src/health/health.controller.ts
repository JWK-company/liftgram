import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// 헬스체크 — DB 연결 포함. 배포/모니터링용.
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health(): Promise<{ status: string; db: string; ts: string }> {
    let db = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = 'up';
    } catch {
      db = 'down';
    }
    return { status: 'ok', db, ts: new Date().toISOString() };
  }
}
