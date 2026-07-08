import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { PublicUser, UsersService } from './users.service';
import { SetRoleDto, UpdateProfileDto } from './dto/user.dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<PublicUser> {
    return this.users.findById(user.userId);
  }

  @Patch('me')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto): Promise<PublicUser> {
    return this.users.updateProfile(user.userId, dto);
  }

  // ── 관리자 전용 (admin 역할만) ──────────────────────────────────────
  // 클래스 JwtAuthGuard(req.user 주입) 이후 RolesGuard가 DB role을 대조.
  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get()
  list(): Promise<PublicUser[]> {
    return this.users.listUsers();
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Patch(':id/role')
  setRole(@Param('id') id: string, @Body() dto: SetRoleDto): Promise<PublicUser> {
    return this.users.setRole(id, dto.role);
  }
}
