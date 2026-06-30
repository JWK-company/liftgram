import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// 보호 라우트용 가드 — Authorization: Bearer <accessToken>
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
