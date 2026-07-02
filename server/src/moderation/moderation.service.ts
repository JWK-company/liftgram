// @plm SRS-019 @plm SRS-020  신고·모더레이션 (SAD-012 · ADR-017).
// 사용자 신고 → 모더레이터 큐 → 콘텐츠 소프트 제거. 자동 스캔 보류(pending) 콘텐츠도 큐에 포함.
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto, ResolveDto } from './dto/moderation.dto';

interface Preview {
  kind?: string;
  caption?: string | null;
  body?: string | null;
  mediaUrl?: string | null;
}
interface TargetInfo {
  authorId: string;
  moderationStatus: string;
  author: { id: string; displayName: string | null };
  preview: Preview;
}

export interface QueueItem {
  targetType: string;
  targetId: string;
  source: 'report' | 'auto';
  reasons: string[];
  reportCount: number;
  author: { id: string; displayName: string | null } | null;
  preview: Preview | null;
  createdAt: string;
}

function imageUrlOf(data: Prisma.JsonValue | null): string | null {
  return data && typeof data === 'object' && !Array.isArray(data)
    ? ((data as { imageUrl?: string }).imageUrl ?? null)
    : null;
}

// /media/file/<key> → key (백킹 MediaAsset 조회용). 외부 URL은 null.
function mediaKeyOf(url?: string | null): string | null {
  if (!url) return null;
  const m = /^\/media\/file\/([A-Za-z0-9._-]+)$/.exec(url);
  return m ? m[1] : null;
}

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  // 다형 대상(post|story|comment) 로드 — 작성자·상태·미리보기.
  private async loadTarget(targetType: string, targetId: string): Promise<TargetInfo | null> {
    if (targetType === 'post') {
      const p = await this.prisma.post.findUnique({
        where: { id: targetId },
        select: {
          authorId: true,
          moderationStatus: true,
          kind: true,
          caption: true,
          data: true,
          author: { select: { id: true, displayName: true } },
        },
      });
      if (!p) return null;
      return {
        authorId: p.authorId,
        moderationStatus: p.moderationStatus,
        author: p.author,
        preview: { kind: p.kind, caption: p.caption, mediaUrl: imageUrlOf(p.data) },
      };
    }
    if (targetType === 'story') {
      const s = await this.prisma.story.findUnique({
        where: { id: targetId },
        select: {
          authorId: true,
          moderationStatus: true,
          mediaUrl: true,
          caption: true,
          author: { select: { id: true, displayName: true } },
        },
      });
      if (!s) return null;
      return {
        authorId: s.authorId,
        moderationStatus: s.moderationStatus,
        author: s.author,
        preview: { kind: 'story', caption: s.caption, mediaUrl: s.mediaUrl },
      };
    }
    if (targetType === 'comment') {
      const c = await this.prisma.comment.findUnique({
        where: { id: targetId },
        select: {
          authorId: true,
          moderationStatus: true,
          body: true,
          author: { select: { id: true, displayName: true } },
        },
      });
      if (!c) return null;
      return {
        authorId: c.authorId,
        moderationStatus: c.moderationStatus,
        author: c.author,
        preview: { kind: 'comment', body: c.body },
      };
    }
    return null;
  }

  // 신고 가능 = 신고자가 볼 수 있는 승인 콘텐츠. 비가시/제거/보류/미존재는 모두 generic 404로 마스킹(존재 오라클 차단).
  private async postVisibleTo(viewerId: string, postId: string): Promise<{ authorId: string } | null> {
    const p = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true, visibility: true, moderationStatus: true },
    });
    if (!p || p.moderationStatus !== 'approved') return null;
    if (p.authorId === viewerId || p.visibility === 'public') return { authorId: p.authorId };
    if (p.visibility === 'followers') {
      const f = await this.prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: viewerId, followeeId: p.authorId } },
      });
      if (f) return { authorId: p.authorId };
    }
    return null;
  }

  private async canReportView(
    viewerId: string,
    targetType: string,
    targetId: string,
  ): Promise<{ authorId: string } | null> {
    if (targetType === 'post') return this.postVisibleTo(viewerId, targetId);
    if (targetType === 'comment') {
      const c = await this.prisma.comment.findUnique({
        where: { id: targetId },
        select: { authorId: true, postId: true, moderationStatus: true },
      });
      if (!c || c.moderationStatus !== 'approved') return null;
      const parent = await this.postVisibleTo(viewerId, c.postId);
      return parent ? { authorId: c.authorId } : null;
    }
    if (targetType === 'story') {
      const s = await this.prisma.story.findUnique({
        where: { id: targetId },
        select: { authorId: true, moderationStatus: true, expiresAt: true },
      });
      if (!s || s.moderationStatus !== 'approved' || s.expiresAt <= new Date()) return null;
      if (s.authorId === viewerId) return { authorId: s.authorId };
      const f = await this.prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: viewerId, followeeId: s.authorId } },
      });
      return f ? { authorId: s.authorId } : null;
    }
    return null;
  }

  async report(reporterId: string, dto: CreateReportDto): Promise<{ ok: true }> {
    const target = await this.canReportView(reporterId, dto.targetType, dto.targetId);
    if (!target) throw new NotFoundException('target not found');
    if (target.authorId === reporterId) throw new BadRequestException('cannot report your own content');
    try {
      await this.prisma.report.create({
        data: {
          reporterId,
          targetType: dto.targetType,
          targetId: dto.targetId,
          reason: dto.reason,
          details: dto.details?.trim() || null,
        },
      });
    } catch (e) {
      // 동일 신고자·대상 재신고(unique 위반) → 멱등.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
    return { ok: true };
  }

  // 큐 = pending 신고(대상별 집계) + 자동보류 콘텐츠(post/story moderationStatus='pending'), 최신순.
  async queue(limit: number): Promise<QueueItem[]> {
    const reports = await this.prisma.report.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const byTarget = new Map<
      string,
      { targetType: string; targetId: string; reasons: Set<string>; count: number; latest: Date }
    >();
    for (const r of reports) {
      const key = `${r.targetType}:${r.targetId}`;
      let g = byTarget.get(key);
      if (!g) {
        g = { targetType: r.targetType, targetId: r.targetId, reasons: new Set(), count: 0, latest: r.createdAt };
        byTarget.set(key, g);
      }
      g.reasons.add(r.reason);
      g.count += 1;
      if (r.createdAt > g.latest) g.latest = r.createdAt;
    }

    const items: QueueItem[] = [];
    const seen = new Set<string>();
    for (const g of byTarget.values()) {
      const target = await this.loadTarget(g.targetType, g.targetId);
      if (!target || target.moderationStatus === 'removed') continue; // 이미 제거/소멸된 대상 스킵
      const key = `${g.targetType}:${g.targetId}`;
      seen.add(key);
      items.push({
        targetType: g.targetType,
        targetId: g.targetId,
        source: 'report',
        reasons: [...g.reasons],
        reportCount: g.count,
        author: target.author,
        preview: target.preview,
        createdAt: g.latest.toISOString(),
      });
    }

    // 자동 스캔으로 pending 처리된 콘텐츠(신고 없이도 검토 대상).
    const [pendingPosts, pendingStories] = await Promise.all([
      this.prisma.post.findMany({
        where: { moderationStatus: 'pending' },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: { id: true, kind: true, caption: true, data: true, createdAt: true, author: { select: { id: true, displayName: true } } },
      }),
      this.prisma.story.findMany({
        where: { moderationStatus: 'pending' },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: { id: true, mediaUrl: true, caption: true, createdAt: true, author: { select: { id: true, displayName: true } } },
      }),
    ]);
    for (const p of pendingPosts) {
      if (seen.has(`post:${p.id}`)) continue;
      items.push({
        targetType: 'post',
        targetId: p.id,
        source: 'auto',
        reasons: ['auto_scan'],
        reportCount: 0,
        author: p.author,
        preview: { kind: p.kind, caption: p.caption, mediaUrl: imageUrlOf(p.data) },
        createdAt: p.createdAt.toISOString(),
      });
    }
    for (const s of pendingStories) {
      if (seen.has(`story:${s.id}`)) continue;
      items.push({
        targetType: 'story',
        targetId: s.id,
        source: 'auto',
        reasons: ['auto_scan'],
        reportCount: 0,
        author: s.author,
        preview: { kind: 'story', caption: s.caption, mediaUrl: s.mediaUrl },
        createdAt: s.createdAt.toISOString(),
      });
    }

    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return items.slice(0, limit);
  }

  // 해소 — remove: 콘텐츠 소프트 제거(숨김) · approve: 승인(자동보류 해제·신고 기각). 신고 일괄 종결.
  async resolve(reviewerId: string, dto: ResolveDto): Promise<{ ok: true }> {
    const target = await this.loadTarget(dto.targetType, dto.targetId);
    if (!target) throw new NotFoundException('target not found');
    const now = new Date();
    const remove = dto.action === 'remove';
    const newStatus = remove ? 'removed' : 'approved';
    const mediaKey = mediaKeyOf(target.preview.mediaUrl); // 이미지/스토리 백킹 미디어

    await this.prisma.$transaction(async (tx) => {
      // 제거 시 백킹 미디어도 flagged=true → GET /media/file/:key가 404(바이트 서브 차단).
      // 승인 시 flagged=false → 재노출.
      if (mediaKey) {
        await tx.mediaAsset.updateMany({ where: { key: mediaKey }, data: { flagged: remove } });
      }
      if (dto.targetType === 'post') {
        await tx.post.update({
          where: { id: dto.targetId },
          data: { moderationStatus: newStatus, removedAt: remove ? now : null, removedReason: remove ? (dto.reason ?? null) : null },
        });
      } else if (dto.targetType === 'story') {
        await tx.story.update({
          where: { id: dto.targetId },
          data: { moderationStatus: newStatus, removedAt: remove ? now : null, removedReason: remove ? (dto.reason ?? null) : null },
        });
      } else if (dto.targetType === 'comment') {
        await tx.comment.update({
          where: { id: dto.targetId },
          data: { moderationStatus: newStatus, removedAt: remove ? now : null },
        });
      }
      await tx.report.updateMany({
        where: { targetType: dto.targetType, targetId: dto.targetId, status: 'pending' },
        data: {
          status: remove ? 'resolved' : 'dismissed',
          reviewedBy: reviewerId,
          reviewedAt: now,
          actionTaken: remove ? 'removed' : 'dismissed',
        },
      });
    });
    return { ok: true };
  }
}
