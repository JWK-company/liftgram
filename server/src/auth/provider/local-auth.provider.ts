// @plm SRS-006  로컬 인증 제공자 (email/password + bcrypt) — 기본 구현. ADR-018 어댑터.
import {
  ConflictException,
  Injectable,
  NotImplementedException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthProvider, ExternalIdentity } from './auth-provider';

@Injectable()
export class LocalAuthProvider implements AuthProvider {
  readonly name = 'local';
  readonly supportsPasswordAuth = true;

  constructor(private readonly prisma: PrismaService) {}

  // 이메일 정규화(권위) — DTO 정규화가 우회돼도 저장·조회 케이스 일관 보장(대소문자 중복행 방지).
  private norm(email: string): string {
    return email.trim().toLowerCase();
  }

  async registerPassword(email: string, password: string, displayName?: string): Promise<ExternalIdentity> {
    const mail = this.norm(email);
    const existing = await this.prisma.user.findUnique({ where: { email: mail } });
    if (existing) throw new ConflictException('email already registered');
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { email: mail, passwordHash, displayName: displayName ?? null, authProvider: 'email' },
    });
    return { provider: 'local', subject: user.id, email: user.email, displayName: user.displayName };
  }

  async verifyPassword(email: string, password: string): Promise<ExternalIdentity> {
    const user = await this.prisma.user.findUnique({ where: { email: this.norm(email) } });
    if (!user || !user.passwordHash) throw new UnauthorizedException('invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('invalid credentials');
    return { provider: 'local', subject: user.id, email: user.email, displayName: user.displayName };
  }

  verifyToken(): Promise<ExternalIdentity> {
    throw new NotImplementedException('local provider does not verify external tokens');
  }
}
