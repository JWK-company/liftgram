// @plm SRS-006  계정·인증 — 세션(JWT access + refresh 회전) 소유. 신원 확립은 AuthProvider 어댑터에 위임(ADR-018).
import { Inject, Injectable, NotImplementedException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import type { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, SignUpDto } from './dto/auth.dto';
import { AUTH_PROVIDER, type AuthProvider, type ExternalIdentity } from './provider/auth-provider';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(AUTH_PROVIDER) private readonly provider: AuthProvider,
  ) {}

  async signUp(dto: SignUpDto): Promise<AuthTokens> {
    this.assertPasswordAuth();
    const identity = await this.provider.registerPassword(dto.email, dto.password, dto.displayName);
    const user = await this.mapToUser(identity);
    return this.issue(user.id, user.email);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    this.assertPasswordAuth();
    const identity = await this.provider.verifyPassword(dto.email, dto.password);
    const user = await this.mapToUser(identity);
    return this.issue(user.id, user.email);
  }

  // 매니지드 인증 확장 지점 — 클라이언트가 제공자에서 받은 토큰 → 검증 → 우리 세션 발급.
  // 로컬 제공자는 verifyToken 미구현(501). 매니지드 어댑터 바인딩 시 활성화.
  async exchange(providerToken: string): Promise<AuthTokens> {
    const identity = await this.provider.verifyToken(providerToken);
    const user = await this.mapToUser(identity);
    return this.issue(user.id, user.email);
  }

  private assertPasswordAuth(): void {
    if (!this.provider.supportsPasswordAuth) {
      throw new NotImplementedException(
        `auth provider '${this.provider.name}' uses hosted login — use POST /auth/exchange`,
      );
    }
  }

  // 신원 → 로컬 User. local: subject=우리 User.id. 매니지드: email 기준 find-or-create(프로비저닝).
  // (매니지드 실연동 시 provider subject 저장 필드 추가 예정 — 지금은 email 매핑.)
  private async mapToUser(identity: ExternalIdentity): Promise<User> {
    if (identity.provider === 'local') {
      const user = await this.prisma.user.findUnique({ where: { id: identity.subject } });
      if (!user) throw new UnauthorizedException('user not found');
      return user;
    }
    if (!identity.email) throw new UnauthorizedException('managed identity missing email');
    return this.prisma.user.upsert({
      where: { email: identity.email },
      create: {
        email: identity.email,
        displayName: identity.displayName ?? null,
        authProvider: identity.provider,
      },
      update: {},
    });
  }

  // 회전: 유효한 refresh 토큰 → 기존 것 폐기(revoke) + 새 토큰쌍 발급. 재사용/만료/폐기 토큰은 401.
  async refresh(rawToken: string): Promise<AuthTokens> {
    const rec = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
      include: { user: true },
    });
    if (!rec || rec.revokedAt || rec.expiresAt < new Date()) {
      throw new UnauthorizedException('invalid refresh token');
    }
    await this.prisma.refreshToken.update({
      where: { id: rec.id },
      data: { revokedAt: new Date() },
    });
    return this.issue(rec.userId, rec.user.email);
  }

  async logout(rawToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private async issue(userId: string, email: string | null): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: this.config.get<string>('JWT_SECRET', 'dev-change-me'),
        expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '15m'),
      },
    );
    const refreshToken = randomBytes(32).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return { accessToken, refreshToken, tokenType: 'Bearer' };
  }
}
