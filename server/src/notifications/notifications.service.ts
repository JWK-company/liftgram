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

  async list(userId: string, limit: number): Promise<NotificationView[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
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

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markAllRead(userId: string): Promise<{ ok: true }> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
