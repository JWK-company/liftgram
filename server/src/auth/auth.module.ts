import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { RoleBootstrapService } from './role-bootstrap.service';
import { AUTH_PROVIDER, type AuthProvider } from './provider/auth-provider';
import { LocalAuthProvider } from './provider/local-auth.provider';

// 인증 제공자 바인딩 (ADR-018) — config AUTH_PROVIDER로 선택, 기본 local.
// 매니지드 추가 시: 어댑터 클래스 작성 → providers 등록 → 아래 switch에 case 추가.
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RoleBootstrapService,
    LocalAuthProvider,
    {
      provide: AUTH_PROVIDER,
      inject: [ConfigService, LocalAuthProvider],
      useFactory: (config: ConfigService, local: LocalAuthProvider): AuthProvider => {
        const name = config.get<string>('AUTH_PROVIDER', 'local');
        switch (name) {
          // case 'clerk': return clerk;   // 매니지드 어댑터 드롭인 지점
          // case 'keycloak': return keycloak;
          case 'local':
          default:
            return local;
        }
      },
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
