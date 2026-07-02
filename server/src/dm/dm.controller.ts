// @plm SRS-017  DM REST 엔드포인트 (Bearer 인증, 참여자 authz) — SAD-011.
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { CreateConversationDto, CreateGroupDto, SendMessageDto } from './dto/dm.dto';
import { ConversationView, DmService, MessageView } from './dm.service';

const clampLimit = (v: string | undefined, def: number, max: number): number => {
  const n = v ? parseInt(v, 10) : def;
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), max) : def;
};

@UseGuards(JwtAuthGuard)
@Controller('dm')
export class DmController {
  constructor(private readonly dm: DmService) {}

  @Post('conversations')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateConversationDto): Promise<ConversationView> {
    return this.dm.getOrCreateDirect(user.userId, dto.userId);
  }

  @Post('groups')
  createGroup(@CurrentUser() user: AuthUser, @Body() dto: CreateGroupDto): Promise<ConversationView> {
    return this.dm.createGroup(user.userId, dto.userIds, dto.title);
  }

  @Get('conversations')
  list(@CurrentUser() user: AuthUser): Promise<ConversationView[]> {
    return this.dm.listConversations(user.userId);
  }

  @Get('conversations/:id/messages')
  messages(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ): Promise<MessageView[]> {
    return this.dm.getMessages(user.userId, id, clampLimit(limit, 50, 100), before);
  }

  @Post('conversations/:id/messages')
  send(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ): Promise<MessageView> {
    return this.dm.sendMessage(user.userId, id, dto);
  }

  @Post('conversations/:id/read')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.dm.markRead(user.userId, id);
  }

  @Post('conversations/:id/leave')
  leave(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.dm.leaveConversation(user.userId, id);
  }
}
