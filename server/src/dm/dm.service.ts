// @plm SRS-017  다이렉트 메시지 (SAD-011). 크로스유저 관계형 + REST(현재). 실시간 전송은 ADR-015(후속).
// 모든 대화 접근은 참여자(participant) 검증 필수. 미디어 메시지는 업로더 소유 자산만.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SendMessageDto } from './dto/dm.dto';
import { DmGateway } from './dm.gateway';
import { PushService } from '../push/push.service';

export interface MessageView {
  id: string;
  conversationId: string;
  sender: { id: string; displayName: string | null };
  kind: string;
  body: string | null;
  mediaUrl: string | null;
  createdAt: string;
}
export interface ConversationView {
  id: string;
  isGroup: boolean;
  title: string | null;
  participants: { id: string; displayName: string | null }[];
  lastMessage: MessageView | null;
  unreadCount: number;
  updatedAt: string;
}

type MessageWithSender = Prisma.MessageGetPayload<{ include: { sender: true } }>;

@Injectable()
export class DmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: DmGateway,
    private readonly push: PushService,
  ) {}

  // 새 메시지를 발신자 제외 참여자 기기로 푸시(best-effort·비차단).
  private async dispatchDmPush(
    senderId: string,
    conversationId: string,
    participantIds: string[],
    kind: string,
    body: string | null,
  ): Promise<void> {
    try {
      const others = participantIds.filter((id) => id !== senderId);
      if (others.length === 0) return;
      const sender = await this.prisma.user.findUnique({
        where: { id: senderId },
        select: { displayName: true },
      });
      await this.push.sendToUsers(others, {
        title: sender?.displayName ?? 'Liftgram',
        body: kind === 'image' ? '사진을 보냈어요' : (body ?? '새 메시지'),
        data: { type: 'dm', conversationId },
      });
    } catch {
      // 무시
    }
  }

  private toMessageView(m: MessageWithSender): MessageView {
    return {
      id: m.id,
      conversationId: m.conversationId,
      sender: { id: m.sender.id, displayName: m.sender.displayName },
      kind: m.kind,
      body: m.body,
      mediaUrl: m.mediaUrl,
      createdAt: m.createdAt.toISOString(),
    };
  }

  // 미디어 참조 검증 — /media/file/<key> + 이 사용자 소유 MediaAsset(외부 URL·무단 참조 차단).
  private async assertOwnedMedia(mediaUrl: string, ownerId: string): Promise<void> {
    const m = /^\/media\/file\/([A-Za-z0-9._-]+)$/.exec(mediaUrl); // ^앵커 — 외부 호스트 URL 차단
    if (!m) throw new BadRequestException('invalid media url');
    const asset = await this.prisma.mediaAsset.findUnique({ where: { key: m[1] } });
    if (!asset || asset.ownerId !== ownerId) {
      throw new BadRequestException('media not found or not owned');
    }
  }

  private async assertParticipant(userId: string, conversationId: string): Promise<void> {
    const p = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!p) throw new ForbiddenException('not a participant');
  }

  private async toConversationView(
    userId: string,
    conversationId: string,
    hidden?: Set<string>,
  ): Promise<ConversationView> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: { include: { user: true } } },
    });
    if (!conv) throw new NotFoundException('conversation not found');
    const h = hidden ?? new Set(await this.hiddenUserIds(userId));
    const me = conv.participants.find((p) => p.userId === userId);
    const lastMsg = await this.prisma.message.findFirst({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      include: { sender: true },
    });
    const unreadCount = await this.prisma.message.count({
      where: {
        conversationId,
        senderId: { not: userId },
        ...(me?.lastReadAt ? { createdAt: { gt: me.lastReadAt } } : {}),
      },
    });
    return {
      id: conv.id,
      isGroup: conv.isGroup,
      title: conv.title,
      participants: conv.participants
        .filter((p) => p.userId === userId || !h.has(p.userId)) // 차단 참여자 숨김(그룹)
        .map((p) => ({ id: p.user.id, displayName: p.user.displayName })),
      lastMessage: lastMsg ? this.toMessageView(lastMsg) : null,
      unreadCount,
      updatedAt: conv.updatedAt.toISOString(),
    };
  }

  // a↔b 차단(어느 방향이든) 여부.
  private async isBlocked(a: string, b: string): Promise<boolean> {
    const n = await this.prisma.block.count({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
    });
    return n > 0;
  }

  // viewer와 차단 관계(양방향)인 유저 id — 메시지/참여자/목록에서 상호 제외.
  private async hiddenUserIds(viewerId: string): Promise<string[]> {
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    });
    const ids = new Set<string>();
    for (const r of rows) ids.add(r.blockerId === viewerId ? r.blockedId : r.blockerId);
    return [...ids];
  }

  // 1:1 대화 find-or-create.
  async getOrCreateDirect(userId: string, otherUserId: string): Promise<ConversationView> {
    if (userId === otherUserId) throw new BadRequestException('cannot message yourself');
    const other = await this.prisma.user.findUnique({ where: { id: otherUserId } });
    if (!other) throw new NotFoundException('user not found');
    // 차단 관계면 새 1:1 대화 불가(그룹은 팔로우 게이트가 이미 차단 안전).
    if (await this.isBlocked(userId, otherUserId)) throw new ForbiddenException('cannot message this user');
    // 정규화 키(정렬된 유저쌍) + directKey @unique → 동시 생성 시 중복 대화 방지.
    const directKey = [userId, otherUserId].sort().join(':');
    let conv = await this.prisma.conversation.findUnique({ where: { directKey }, select: { id: true } });
    if (!conv) {
      try {
        conv = await this.prisma.conversation.create({
          data: {
            isGroup: false,
            directKey,
            participants: { create: [{ userId }, { userId: otherUserId }] },
          },
          select: { id: true },
        });
      } catch (e) {
        // 경합으로 다른 요청이 먼저 생성 → unique 위반이면 재조회.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          conv = await this.prisma.conversation.findUniqueOrThrow({
            where: { directKey },
            select: { id: true },
          });
        } else {
          throw e;
        }
      }
    }
    return this.toConversationView(userId, conv.id);
  }

  // 그룹 대화 생성 — 생성자 + 지정 멤버. 1:1과 달리 directKey 없음.
  // 프라이버시: 그룹은 "내가 팔로우한 사람"만 추가 가능(낯선 사람 대량 강제 편입 차단).
  // 1:1(getOrCreateDirect)은 PT 문의 등 열린 접점이라 게이트하지 않음 — 그룹만 팔로우 요구.
  async createGroup(userId: string, userIds: string[], title?: string): Promise<ConversationView> {
    const others = [...new Set(userIds)].filter((id) => id !== userId);
    if (others.length === 0) throw new BadRequestException('group needs at least one other member');
    if (others.length > 50) throw new BadRequestException('too many members');
    const found = await this.prisma.user.count({ where: { id: { in: others } } });
    if (found !== others.length) throw new NotFoundException('some users not found');
    const followed = await this.prisma.follow.count({
      where: { followerId: userId, followeeId: { in: others } },
    });
    if (followed !== others.length) {
      throw new ForbiddenException('can only add users you follow');
    }
    const conv = await this.prisma.conversation.create({
      data: {
        isGroup: true,
        title: title?.trim() || null,
        participants: { create: [userId, ...others].map((uid) => ({ userId: uid })) },
      },
      select: { id: true },
    });
    return this.toConversationView(userId, conv.id);
  }

  // 그룹 나가기 — 내 참여자 행 삭제(1:1 대화는 나갈 수 없음).
  async leaveConversation(userId: string, conversationId: string): Promise<{ ok: true }> {
    await this.assertParticipant(userId, conversationId);
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { isGroup: true },
    });
    if (!conv?.isGroup) throw new BadRequestException('cannot leave a direct conversation');
    // 내 참여자 행 삭제 후, 남은 멤버가 0이면 대화 자체 삭제(메시지는 onDelete:Cascade로 정리).
    // 단일 트랜잭션 — 동시 마지막-나가기 경합에서 대화 고아/이중삭제 방지.
    await this.prisma.$transaction(async (tx) => {
      await tx.conversationParticipant.deleteMany({ where: { conversationId, userId } });
      const remaining = await tx.conversationParticipant.count({ where: { conversationId } });
      if (remaining === 0) {
        await tx.conversation.delete({ where: { id: conversationId } });
      }
    });
    return { ok: true };
  }

  async listConversations(userId: string): Promise<ConversationView[]> {
    const convs = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: { id: true, isGroup: true, participants: { select: { userId: true } } },
    });
    const hidden = new Set(await this.hiddenUserIds(userId));
    // 1:1 차단 상대 대화는 목록에서 제외. 그룹은 유지(참여자에서 차단 숨김).
    const visible = convs.filter((c) => {
      if (c.isGroup) return true;
      const other = c.participants.find((p) => p.userId !== userId);
      return !other || !hidden.has(other.userId);
    });
    return Promise.all(visible.map((c) => this.toConversationView(userId, c.id, hidden)));
  }

  async getMessages(userId: string, conversationId: string, limit: number, before?: string): Promise<MessageView[]> {
    await this.assertParticipant(userId, conversationId);
    const hidden = await this.hiddenUserIds(userId);
    const beforeDate = before ? new Date(before) : undefined;
    const validBefore = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : undefined;
    const msgs = await this.prisma.message.findMany({
      // 차단 관계 발신자 메시지 숨김(1:1 차단→상대 메시지 제외, 그룹→차단 멤버 메시지 제외).
      where: { conversationId, senderId: { notIn: hidden }, ...(validBefore ? { createdAt: { lt: validBefore } } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { sender: true },
    });
    return msgs.map((m) => this.toMessageView(m)).reverse(); // 오래된→최신(표시 순서)
  }

  async sendMessage(userId: string, conversationId: string, dto: SendMessageDto): Promise<MessageView> {
    await this.assertParticipant(userId, conversationId);
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { isGroup: true, participants: { select: { userId: true } } },
    });
    if (!conv) throw new NotFoundException('conversation not found');
    const otherIds = conv.participants.map((p) => p.userId).filter((id) => id !== userId);
    // 1:1: 차단 상대에게 전송 불가.
    if (!conv.isGroup && otherIds[0] && (await this.isBlocked(userId, otherIds[0]))) {
      throw new ForbiddenException('cannot message this user');
    }
    const kind = dto.kind ?? 'text';
    if (kind === 'text' && !dto.body?.trim()) throw new BadRequestException('empty message');
    if (kind === 'image') {
      if (!dto.mediaUrl) throw new BadRequestException('image message requires mediaUrl');
      await this.assertOwnedMedia(dto.mediaUrl, userId);
    }
    const [msg] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          kind,
          body: dto.body ?? null,
          mediaUrl: dto.mediaUrl ?? null,
        },
        include: { sender: true },
      }),
      this.prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
    ]);
    const view = this.toMessageView(msg);
    // 실시간 push — 참여자 전원(발신자 포함·id dedupe). 그룹은 차단 관계 참여자 제외(상호 격리).
    let recipients = [userId, ...otherIds];
    if (conv.isGroup) {
      const hidden = new Set(await this.hiddenUserIds(userId));
      recipients = recipients.filter((id) => id === userId || !hidden.has(id));
    }
    this.gateway.emitMessage(recipients, view);
    void this.dispatchDmPush(userId, conversationId, recipients, kind, dto.body ?? null); // best-effort 푸시
    return view;
  }

  async markRead(userId: string, conversationId: string): Promise<{ ok: true }> {
    await this.assertParticipant(userId, conversationId);
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });
    return { ok: true };
  }
}
