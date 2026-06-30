import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PublicUser {
  id: string;
  email: string | null;
  displayName: string | null;
  authProvider: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<PublicUser> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('user not found');
    return { id: u.id, email: u.email, displayName: u.displayName, authProvider: u.authProvider };
  }
}
