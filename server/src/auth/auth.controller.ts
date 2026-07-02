import { Body, Controller, Post } from '@nestjs/common';
import { AuthService, AuthTokens } from './auth.service';
import { ExchangeDto, LoginDto, RefreshDto, SignUpDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  signUp(@Body() dto: SignUpDto): Promise<AuthTokens> {
    return this.auth.signUp(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthTokens> {
    return this.auth.login(dto);
  }

  // 매니지드 인증 확장 지점 — 제공자 토큰 → 우리 세션 발급 (로컬 제공자는 501).
  @Post('exchange')
  exchange(@Body() dto: ExchangeDto): Promise<AuthTokens> {
    return this.auth.exchange(dto.providerToken);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto): Promise<AuthTokens> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  async logout(@Body() dto: RefreshDto): Promise<{ ok: true }> {
    await this.auth.logout(dto.refreshToken);
    return { ok: true };
  }
}
