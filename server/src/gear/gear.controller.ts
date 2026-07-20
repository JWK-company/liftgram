// @plm SRS-039  착용장비 API — 클릭 기록 · 제휴 설정 조회 · admin 통계 (SAD-020 · ADR-027).
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { GearAffiliateConfigView, GearService, GearStats } from './gear.service';
import { CreateGearClickDto } from './dto/gear.dto';

// 클래스 레벨 JwtAuthGuard — 장비 태그는 피드 위에서만 노출되고 피드 조회 자체가 인증 필수라
// 미인증 접근 경로가 애초에 없다. 클릭 기록은 사용자 식별이 있어야 중복 억제가 성립한다.
@UseGuards(JwtAuthGuard)
@Controller('gear')
export class GearController {
  constructor(private readonly gear: GearService) {}

  // 클릭 1건 기록. 앱은 링크를 먼저 연 뒤 비차단(fire-and-forget)으로 이 엔드포인트를 호출한다 —
  // 순서가 뒤집혀 집계를 await 하면 react-native-web 에서 사용자 제스처 컨텍스트가 끊겨
  // 팝업 차단에 걸린다(ADR-027 D8). 그래서 응답은 최소 형태로만 돌려준다.
  @Post('clicks')
  click(@CurrentUser() user: AuthUser, @Body() dto: CreateGearClickDto): Promise<{ ok: true }> {
    return this.gear.recordClick(user.userId, dto);
  }

  // 제휴 설정 조회 — { enabled, links? }. 로그인 사용자 누구나(역할 제한 없음).
  // 딥링크는 비밀이 아니다(결국 사용자 브라우저에서 열리는 URL이다). 서버 전용으로 두는 목적은
  // 은닉이 아니라 앱 번들 하드코딩을 막아 앱 재배포 없이 링크를 교체·회수할 수 있게 하는 것이다.
  @Get('config')
  config(): GearAffiliateConfigView {
    return this.gear.getConfig();
  }

  // 카테고리별·기간별 클릭 집계 — admin 전용(RolesGuard가 매 요청 DB role 대조).
  // days=집계 창(기본 30·최대 365), top=상위 사용자 수(기본 10). 잘못된 값은 서비스에서 범위로 수렴.
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get('stats')
  stats(@Query('days') days?: string, @Query('top') top?: string): Promise<GearStats> {
    return this.gear.stats(days, top);
  }
}
