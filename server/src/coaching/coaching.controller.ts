// @plm SRS-048  코칭 API — 요청/수락/해지·트레이너 탐색·회원 리포트·감사 로그 (Bearer 인증).
// 모든 접근은 CoachingService의 grant 가드(active+scope)를 경유 — 우회 경로 없음(SAD-022).
import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { CoachingService, GrantView, CoachingPeer, MemberReport } from './coaching.service';
import { CreateCoachingRequestDto, SearchTrainersDto, SetPrescriptionDto } from './dto/coaching.dto';

@UseGuards(JwtAuthGuard)
@Controller('coaching')
export class CoachingController {
  constructor(private readonly coaching: CoachingService) {}

  @Get('trainers')
  searchTrainers(@CurrentUser() user: AuthUser, @Query() q: SearchTrainersDto): Promise<CoachingPeer[]> {
    return this.coaching.searchTrainers(user.userId, q.q);
  }

  @Post('requests')
  createRequest(@CurrentUser() user: AuthUser, @Body() dto: CreateCoachingRequestDto): Promise<GrantView> {
    return this.coaching.createRequest(user.userId, dto);
  }

  @Get('grants')
  listGrants(@CurrentUser() user: AuthUser): Promise<GrantView[]> {
    return this.coaching.listGrants(user.userId);
  }

  @Post('grants/:id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<GrantView> {
    return this.coaching.accept(user.userId, id);
  }

  @Post('grants/:id/revoke')
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<GrantView> {
    return this.coaching.revoke(user.userId, id);
  }

  @Get('members/:memberId/report')
  memberReport(@CurrentUser() user: AuthUser, @Param('memberId') memberId: string): Promise<MemberReport> {
    return this.coaching.memberReport(user.userId, memberId);
  }

  // 슬라이스2: 회원 루틴 열람·처방 저장 (scope=routineEdit 가드 — 서비스에서 검증). @plm SRS-048
  @Get('members/:memberId/routines')
  memberRoutines(@CurrentUser() user: AuthUser, @Param('memberId') memberId: string) {
    return this.coaching.memberRoutines(user.userId, memberId);
  }

  @Put('members/:memberId/routines/:routineId/exercises/:reId/prescription')
  setPrescription(
    @CurrentUser() user: AuthUser,
    @Param('memberId') memberId: string,
    @Param('routineId') routineId: string,
    @Param('reId') reId: string,
    @Body() body: SetPrescriptionDto,
  ) {
    return this.coaching.setMemberPrescription(user.userId, memberId, routineId, reId, body.prescription ?? null);
  }

  @Get('grants/:id/audit')
  listAudit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.coaching.listAudit(user.userId, id);
  }
}
