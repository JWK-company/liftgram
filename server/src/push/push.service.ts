// @plm SRS-020  푸시 알림 서비스 (SAD-011 · ADR-015). 토큰 등록/해제 + best-effort 발송.
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PUSH_PROVIDER, type PushMessage, type PushProvider } from './provider/push-provider';

@Injectable()
export class PushService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
  ) {}

  async register(userId: string, token: string, platform: string): Promise<{ ok: true }> {
    // 토큰은 전역 unique — 기기 소유자 이전 시 userId 갱신(upsert).
    await this.prisma.pushToken.upsert({
      where: { token },
      update: { userId, platform },
      create: { userId, token, platform },
    });
    return { ok: true };
  }

  async unregister(userId: string, token: string): Promise<{ ok: true }> {
    await this.prisma.pushToken.deleteMany({ where: { token, userId } });
    return { ok: true };
  }

  async tokensOf(userId: string): Promise<string[]> {
    const rows = await this.prisma.pushToken.findMany({ where: { userId }, select: { token: true } });
    return rows.map((r) => r.token);
  }

  providerName(): string {
    return this.provider.name;
  }

  // best-effort fan-out — 실패해도 본 액션(알림/DM)을 깨지 않는다. 무효 토큰은 정리.
  async sendToUsers(userIds: string[], message: PushMessage): Promise<void> {
    try {
      const ids = [...new Set(userIds)];
      if (ids.length === 0) return;
      const rows = await this.prisma.pushToken.findMany({
        where: { userId: { in: ids } },
        select: { token: true, platform: true },
      });
      if (rows.length === 0) return;
      const result = await this.provider.send(rows, message);
      if (result.invalidTokens.length > 0) {
        await this.prisma.pushToken.deleteMany({ where: { token: { in: result.invalidTokens } } });
      }
    } catch {
      // 부수적 fan-out — 조용히 무시.
    }
  }
}
