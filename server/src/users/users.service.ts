// @plm SRS-006 @plm SRS-008  사용자 프로필 조회·수정(표시이름·아바타) + 관리자 역할 관리.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isRole } from '../auth/roles';

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

  // ── 관리자 전용(RolesGuard @Roles('admin')로 컨트롤러에서 보호) ──────────
  // 유저 목록 — 역할 관리용. 민감정보(passwordHash 등)는 PublicUser로 제외.
  async listUsers(): Promise<PublicUser[]> {
    const us = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return us.map((u) => this.toPublic(u));
  }

  // 역할 변경 — 화이트리스트 검증 + 마지막 admin 강등 방지(락아웃 예방).
  // count(admin)+update를 한 트랜잭션(Serializable)으로 원자화 — 동시 강등 레이스(TOCTOU)로
  // 마지막 admin이 0명 되는 것을 방지(refresh 회전과 동일한 원자성 원칙).
  async setRole(targetId: string, role: string): Promise<PublicUser> {
    if (!isRole(role)) throw new BadRequestException('invalid role');
    const updated = await this.prisma.$transaction(
      async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: targetId },
          select: { id: true, role: true },
        });
        if (!target) throw new NotFoundException('user not found');
        if (target.role === role) return null; // 변화 없음 — 멱등
        if (target.role === 'admin' && role !== 'admin') {
          const admins = await tx.user.count({ where: { role: 'admin' } });
          if (admins <= 1) throw new ConflictException('cannot demote the last admin');
        }
        return tx.user.update({ where: { id: targetId }, data: { role } });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return updated ? this.toPublic(updated) : this.findById(targetId);
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
