import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from './jwt.strategy';
import { ROLES_KEY } from './roles.decorator';

// 역할 기반 인가 — @Roles(...) 메타데이터가 있으면 DB의 현재 role을 대조.
// 역할은 JWT에 넣지 않고 매 요청 DB 조회(토큰 무효화 없이 즉시 반영, 모더레이션 엔드포인트에만 적용).
// JwtAuthGuard 이후에 배치해야 req.user가 채워진 상태로 동작한다.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const userId = req.user?.userId;
    if (!userId) throw new ForbiddenException('unauthenticated');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user || !roles.includes(user.role)) throw new ForbiddenException('insufficient role');
    return true;
  }
}
