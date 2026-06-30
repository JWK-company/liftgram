import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { PullResult, SyncService } from './sync.service';
import { PushDto } from './dto/sync.dto';

// WatermelonDB synchronize() 대상 엔드포인트 (Bearer 인증).
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('pull')
  pull(
    @CurrentUser() user: AuthUser,
    @Query('lastPulledAt') lastPulledAt?: string,
  ): Promise<PullResult> {
    return this.sync.pull(user.userId, lastPulledAt ? Number(lastPulledAt) : 0);
  }

  @Post('push')
  async push(@CurrentUser() user: AuthUser, @Body() dto: PushDto): Promise<{ ok: true }> {
    await this.sync.push(user.userId, dto.changes);
    return { ok: true };
  }
}
