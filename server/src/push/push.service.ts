// @plm SRS-020  푸시 알림 서비스 (SAD-011 · ADR-015). 토큰 등록/해제 + best-effort 발송.
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PUSH_PROVIDER, type PushMessage, type PushProvider } from './provider/push-provider';
import { isAllowedPushEndpoint, parseWebSubscription } from './provider/web-push.util';

@Injectable()
export class PushService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_PROVIDER) private readonly provider: PushProvider,
    private readonly config: ConfigService,
  ) {}

  private extraHosts(): string[] {
    return (this.config.get<string>('WEB_PUSH_EXTRA_HOSTS', '') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async register(userId: string, token: string, platform: string): Promise<{ ok: true }> {
    // 웹 구독은 SSRF 방지 — 형태 + https + 푸시서비스 호스트 allowlist 검증(불량은 저장 자체 차단).
    if (platform === 'web') {
      const sub = parseWebSubscription(token);
      if (!sub || !isAllowedPushEndpoint(sub.endpoint, this.extraHosts())) {
        throw new BadRequestException('invalid web push subscription');
      }
    }
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
