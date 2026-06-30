import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { PullResult, PushResult, SyncService } from './sync.service';
import { PushDto } from './dto/sync.dto';

@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('pull')
  pull(@CurrentUser() user: AuthUser, @Query('since') since?: string): Promise<PullResult> {
    return this.sync.pull(user.userId, since ? new Date(since) : undefined);
  }

  @Post('push')
  push(@CurrentUser() user: AuthUser, @Body() dto: PushDto): Promise<PushResult> {
    return this.sync.push(user.userId, dto.changes);
  }
}
