// @plm SRS-020  푸시 토큰 등록/해제 + VAPID 공개키 API (SAD-011 · ADR-015).
import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { PushService } from './push.service';
import { RegisterTokenDto, UnregisterTokenDto } from './dto/push.dto';
import { drainOutbox, type CapturedPush } from './provider/memory-push.provider';

@Controller('push')
export class PushController {
  constructor(
    private readonly push: PushService,
    private readonly config: ConfigService,
  ) {}

  // 공개 — 웹 클라이언트가 pushManager.subscribe에 쓸 VAPID 공개키(비밀 아님). 미설정 시 빈 문자열.
  @Get('vapid-public-key')
  vapid(): { publicKey: string } {
    return { publicKey: this.config.get<string>('VAPID_PUBLIC_KEY', '') };
  }

  @UseGuards(JwtAuthGuard)
  @Post('tokens')
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterTokenDto): Promise<{ ok: true }> {
    return this.push.register(user.userId, dto.token, dto.platform ?? 'expo');
  }

  @UseGuards(JwtAuthGuard)
  @Delete('tokens')
  unregister(@CurrentUser() user: AuthUser, @Body() dto: UnregisterTokenDto): Promise<{ ok: true }> {
    return this.push.unregister(user.userId, dto.token);
  }

  // 테스트/디버그 — memory 프로바이더에서만 데이터. 호출자 본인 토큰으로 캡처된 푸시 반환(+비움).
  @UseGuards(JwtAuthGuard)
  @Get('outbox')
  async outbox(@CurrentUser() user: AuthUser): Promise<CapturedPush[]> {
    if (this.push.providerName() !== 'memory') return [];
    const tokens = await this.push.tokensOf(user.userId);
    return drainOutbox(tokens);
  }
}
