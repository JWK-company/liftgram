import { Body, Controller, Post } from '@nestjs/common';
import { AuthService, AuthTokens } from './auth.service';
import { LoginDto, SignUpDto } from './dto/auth.dto';

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
}
