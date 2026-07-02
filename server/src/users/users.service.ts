// @plm SRS-006 @plm SRS-008  사용자 프로필 조회·수정(표시이름·아바타).
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PublicUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  authProvider: string;
  role: string;
}

export interface UpdateProfileInput {
  displayName?: string;
  avatarUrl?: string; // '' 이면 제거
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private toPublic(u: {
    id: string;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    authProvider: string;
    role: string;
  }): PublicUser {
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      authProvider: u.authProvider,
      role: u.role,
    };
  }

  async findById(id: string): Promise<PublicUser> {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw new NotFoundException('user not found');
    return this.toPublic(u);
  }

  async updateProfile(id: string, input: UpdateProfileInput): Promise<PublicUser> {
    const data: { displayName?: string | null; avatarUrl?: string | null } = {};
    if (input.displayName !== undefined) {
      data.displayName = input.displayName.trim() || null;
    }
    if (input.avatarUrl !== undefined) {
      if (input.avatarUrl) await this.assertOwnedMedia(input.avatarUrl, id);
      data.avatarUrl = input.avatarUrl || null;
    }
    const u = await this.prisma.user.update({ where: { id }, data });
    return this.toPublic(u);
  }

  // 아바타는 업로더 소유 미디어만(외부 URL·무단 참조 차단).
  private async assertOwnedMedia(mediaUrl: string, ownerId: string): Promise<void> {
    const m = /^\/media\/file\/([A-Za-z0-9._-]+)$/.exec(mediaUrl); // ^앵커 — 외부 호스트 URL 차단
    if (!m) throw new BadRequestException('invalid media url');
    const asset = await this.prisma.mediaAsset.findUnique({ where: { key: m[1] } });
    if (!asset || asset.ownerId !== ownerId) {
      throw new BadRequestException('media not found or not owned');
    }
  }
}
