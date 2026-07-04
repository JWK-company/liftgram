// @plm SRS-020  알림 조회·읽음 (SAD-011). 생성은 SocialService 이벤트에서 fan-out.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface NotificationView {
  id: string;
  type: string; // follow | like | comment
  actor: { id: string; displayName: string | null };
  postId: string | null;
  read: boolean;
  createdAt: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // viewer와 차단 관계(양방향)인 유저 id — 알림에서 차단 actor 제외(방어적).
  private async hiddenUserIds(viewerId: string): Promise<string[]> {
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    });
    const ids = new Set<string>();
    for (const r of rows) ids.add(r.blockerId === viewerId ? r.blockedId : r.blockerId);
    return [...ids];
  }

  async list(userId: string, limit: number): Promise<NotificationView[]> {
    const hidden = await this.hiddenUserIds(userId);
    const rows = await this.prisma.notification.findMany({
      where: { userId, actorId: { notIn: hidden } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { actor: { select: { id: true, displayName: true } } },
    });
    return rows.map((n) => ({
      id: n.id,
      type: n.type,
      actor: { id: n.actor.id, displayName: n.actor.displayName },
      postId: n.postId,
      read: n.readAt !== null,
      createdAt: n.createdAt.toISOString(),
    }));
  }

  async unreadCount(userId: string): Promise<number> {
    const hidden = await this.hiddenUserIds(userId);
    return this.prisma.notification.count({ where: { userId, readAt: null, actorId: { notIn: hidden } } });
  }

  async markAllRead(userId: string): Promise<{ ok: true }> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
