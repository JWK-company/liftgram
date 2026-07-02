// @plm SRS-020  신고·모더레이션 API (SAD-012 · ADR-017).
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { ModerationService, QueueItem } from './moderation.service';
import { CreateReportDto, ResolveDto } from './dto/moderation.dto';

@UseGuards(JwtAuthGuard)
@Controller('moderation')
export class ModerationController {
  constructor(private readonly mod: ModerationService) {}

  // 신고 — 로그인 사용자 누구나.
  @Post('reports')
  report(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto): Promise<{ ok: true }> {
    return this.mod.report(user.userId, dto);
  }

  // 큐 조회 — 모더레이터/관리자만(RolesGuard).
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin')
  @Get('queue')
  queue(): Promise<QueueItem[]> {
    return this.mod.queue(50);
  }

  // 해소(제거/승인) — 모더레이터/관리자만.
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin')
  @Post('resolve')
  resolve(@CurrentUser() user: AuthUser, @Body() dto: ResolveDto): Promise<{ ok: true }> {
    return this.mod.resolve(user.userId, dto);
  }
}
