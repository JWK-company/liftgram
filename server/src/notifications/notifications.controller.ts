// @plm SRS-020  알림 REST (Bearer 인증) — SAD-011.
import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { NotificationsService, NotificationView } from './notifications.service';

const clampLimit = (v: string | undefined, def: number, max: number): number => {
  const n = v ? parseInt(v, 10) : def;
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), max) : def;
};

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('limit') limit?: string): Promise<NotificationView[]> {
    return this.notifications.list(user.userId, clampLimit(limit, 50, 100));
  }

  @Get('unread-count')
  async unread(@CurrentUser() user: AuthUser): Promise<{ count: number }> {
    return { count: await this.notifications.unreadCount(user.userId) };
  }

  @Post('read')
  read(@CurrentUser() user: AuthUser): Promise<{ ok: true }> {
    return this.notifications.markAllRead(user.userId);
  }
}
