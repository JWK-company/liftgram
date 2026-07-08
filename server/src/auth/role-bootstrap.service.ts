// @plm SRS-006  역할 부트스트랩 — 배포 시작 시 env로 지정된 계정 role을 멱등 시딩.
// ADMIN_EMAIL(단일)→admin, COWORKER_EMAILS(콤마 구분)→coworker. 코드에 이메일 하드코딩 없이
// 운영 설정(Render env)으로 배정 → 첫 admin(치킨-에그) 부트스트랩. 이후 상시 변경은
// PATCH /users/:id/role(admin 전용). 계정이 아직 없으면 스킵(다음 부팅 반영). 비차단·graceful.
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RoleBootstrapService implements OnModuleInit {
  private readonly logger = new Logger('RoleBootstrap');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.apply();
    } catch (e) {
      // 부팅을 절대 막지 않는다 — 경고만.
      this.logger.warn(`role bootstrap 스킵: ${String((e as Error)?.message ?? e)}`);
    }
  }

  // onlyIfDefault=true면 현재 role이 'user'일 때만 변경(기존 admin/moderator 강등 방지).
  private async setRoleByEmail(email: string, role: string, onlyIfDefault: boolean): Promise<void> {
    const e = email.trim().toLowerCase();
    if (!e) return;
    // 대소문자 변형 중복행 방어 — insensitive 매칭이 2건 이상이면 어느 행을 승격할지
    // 비결정적이 되어 권한상승 위험(공격자가 admin 이메일 대소문자 변형으로 가입) → 경고 후 스킵.
    const matches = await this.prisma.user.findMany({
      where: { email: { equals: e, mode: 'insensitive' } },
      select: { id: true, role: true, email: true },
    });
    if (matches.length === 0) {
      this.logger.log(`'${e}' 계정 없음 — 스킵(가입 후 다음 부팅에 반영)`);
      return;
    }
    if (matches.length > 1) {
      this.logger.warn(`'${e}' 대소문자 변형 계정 ${matches.length}건 감지 — 모호하여 승격 스킵(임의 승격 금지)`);
      return;
    }
    const user = matches[0];
    if (user.role === role) return; // 멱등 — 이미 목표 role
    if (onlyIfDefault && user.role !== 'user') {
      this.logger.log(`'${user.email}' 이미 '${user.role}' — 강등 안 함(스킵)`);
      return;
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { role } });
    this.logger.log(`'${user.email}' role '${user.role}' → '${role}'`);
  }

  private async apply(): Promise<void> {
    const adminEmail = this.config.get<string>('ADMIN_EMAIL');
    if (adminEmail) await this.setRoleByEmail(adminEmail, 'admin', false);

    const coworkers = (this.config.get<string>('COWORKER_EMAILS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const email of coworkers) {
      await this.setRoleByEmail(email, 'coworker', true);
    }
  }
}
