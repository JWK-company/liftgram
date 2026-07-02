// @plm SRS-007 @plm SRS-008 @plm SRS-018  소셜 그래프·피드 (SAD-011).
// 크로스유저 공유 데이터 → 서버 관계형 권위 + REST(온라인). 오프라인-우선 개인 코어 위 옵트인 공개 레이어(ADR-014).
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/social.dto';

export interface PostView {
  id: string;
  author: { id: string; displayName: string | null };
  kind: string;
  caption: string | null;
  data: unknown;
  visibility: string;
  createdAt: string;
}
export interface PublicProfile {
  id: string;
  displayName: string | null;
  counts: { followers: number; following: number; posts: number };
  isFollowing: boolean;
  isSelf: boolean;
}
export interface DiscoverUser {
  id: string;
  displayName: string | null;
  isFollowing: boolean;
}
export interface StoryView {
  id: string;
  mediaUrl: string;
  caption: string | null;
  createdAt: string;
  expiresAt: string;
}
export interface StoryGroup {
  author: { id: string; displayName: string | null };
  stories: StoryView[];
}

const STORY_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

type PostWithAuthor = Prisma.PostGetPayload<{ include: { author: true } }>;

@Injectable()
export class SocialService {
  constructor(private readonly prisma: PrismaService) {}

  private toView(p: PostWithAuthor): PostView {
    return {
      id: p.id,
      author: { id: p.author.id, displayName: p.author.displayName },
      kind: p.kind,
      caption: p.caption,
      data: p.data,
      visibility: p.visibility,
      createdAt: p.createdAt.toISOString(),
    };
  }

  // 미디어 참조 검증 — /media/file/<key> 형태 + 해당 MediaAsset가 이 사용자 소유여야(외부 URL·무단 참조 차단).
  private async assertOwnedMedia(mediaUrl: string, ownerId: string): Promise<void> {
    const m = /\/media\/file\/([A-Za-z0-9._-]+)$/.exec(mediaUrl);
    if (!m) throw new BadRequestException('invalid media url');
    const asset = await this.prisma.mediaAsset.findUnique({ where: { key: m[1] } });
    if (!asset || asset.ownerId !== ownerId) {
      throw new BadRequestException('media not found or not owned');
    }
  }

  async follow(followerId: string, followeeId: string): Promise<{ ok: true }> {
    if (followerId === followeeId) throw new BadRequestException('cannot follow yourself');
    const target = await this.prisma.user.findUnique({ where: { id: followeeId } });
    if (!target) throw new NotFoundException('user not found');
    await this.prisma.follow.upsert({
      where: { followerId_followeeId: { followerId, followeeId } },
      create: { followerId, followeeId },
      update: {},
    });
    return { ok: true };
  }

  async unfollow(followerId: string, followeeId: string): Promise<{ ok: true }> {
    await this.prisma.follow.deleteMany({ where: { followerId, followeeId } });
    return { ok: true };
  }

  async createPost(authorId: string, dto: CreatePostDto): Promise<PostView> {
    if (dto.kind === 'image') {
      const imageUrl =
        dto.data && typeof dto.data === 'object'
          ? (dto.data as { imageUrl?: string }).imageUrl
          : undefined;
      if (!imageUrl) throw new BadRequestException('image post requires data.imageUrl');
      await this.assertOwnedMedia(imageUrl, authorId);
    }
    const post = await this.prisma.post.create({
      data: {
        authorId,
        kind: dto.kind ?? 'text',
        caption: dto.caption ?? null,
        data: dto.data ? (dto.data as Prisma.InputJsonValue) : undefined,
        visibility: dto.visibility ?? 'public',
      },
      include: { author: true },
    });
    return this.toView(post);
  }

  // 피드 = 내 게시물(공개범위 무관 전부) + 팔로우한 사람의 공개/팔로워 게시물, 최신순(id 타이브레이크).
  async getFeed(userId: string, limit: number, before?: string): Promise<PostView[]> {
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followeeId: true },
    });
    const followeeIds = follows.map((f) => f.followeeId);
    const beforeDate = before ? new Date(before) : undefined;
    const validBefore = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : undefined;
    const posts = await this.prisma.post.findMany({
      where: {
        OR: [
          { authorId: userId },
          { authorId: { in: followeeIds }, visibility: { in: ['public', 'followers'] } },
        ],
        ...(validBefore ? { createdAt: { lt: validBefore } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { author: true },
    });
    return posts.map((p) => this.toView(p));
  }

  // 특정 사용자 게시물 — 관계에 따른 공개범위 필터(본인=전체, 팔로워=공개+팔로워, 그 외=공개).
  async getUserPosts(viewerId: string, targetId: string, limit: number): Promise<PostView[]> {
    const isSelf = viewerId === targetId;
    const following =
      isSelf ||
      !!(await this.prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: viewerId, followeeId: targetId } },
      }));
    const allowed = isSelf
      ? ['public', 'followers', 'private']
      : following
        ? ['public', 'followers']
        : ['public'];
    const posts = await this.prisma.post.findMany({
      where: { authorId: targetId, visibility: { in: allowed } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { author: true },
    });
    return posts.map((p) => this.toView(p));
  }

  async getProfile(viewerId: string, targetId: string): Promise<PublicProfile> {
    const u = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!u) throw new NotFoundException('user not found');
    const isSelf = viewerId === targetId;
    const [followers, following, posts, followRec] = await Promise.all([
      this.prisma.follow.count({ where: { followeeId: targetId } }),
      this.prisma.follow.count({ where: { followerId: targetId } }),
      this.prisma.post.count({ where: { authorId: targetId } }),
      isSelf
        ? Promise.resolve(null)
        : this.prisma.follow.findUnique({
            where: { followerId_followeeId: { followerId: viewerId, followeeId: targetId } },
          }),
    ]);
    return {
      id: u.id,
      displayName: u.displayName,
      counts: { followers, following, posts },
      isFollowing: !!followRec,
      isSelf,
    };
  }

  // 발견 — 나 제외 사용자 목록(선택 검색어), 팔로우 여부 포함.
  async discover(viewerId: string, q: string | undefined, limit: number): Promise<DiscoverUser[]> {
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: viewerId },
        // 공개 식별자(displayName)만 검색 — 이메일 substring 매칭은 계정 열거 위험이라 제외.
        ...(q ? { displayName: { contains: q, mode: 'insensitive' } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const following = await this.prisma.follow.findMany({
      where: { followerId: viewerId },
      select: { followeeId: true },
    });
    const followingSet = new Set(following.map((f) => f.followeeId));
    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      isFollowing: followingSet.has(u.id),
    }));
  }

  // 스토리 생성 — 24h 후 만료. 미디어는 사전 업로드된 mediaUrl 참조(SRS-019 · SAD-012).
  async createStory(authorId: string, mediaUrl: string, caption?: string): Promise<StoryView> {
    await this.assertOwnedMedia(mediaUrl, authorId);
    const story = await this.prisma.story.create({
      data: {
        authorId,
        mediaUrl,
        caption: caption ?? null,
        expiresAt: new Date(Date.now() + STORY_TTL_MS),
      },
    });
    return {
      id: story.id,
      mediaUrl: story.mediaUrl,
      caption: story.caption,
      createdAt: story.createdAt.toISOString(),
      expiresAt: story.expiresAt.toISOString(),
    };
  }

  // 활성 스토리 — 팔로우한 사람 + 나, 만료 전(expiresAt > now). 작성자별 그룹(내 그룹 먼저).
  async getActiveStories(userId: string): Promise<StoryGroup[]> {
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followeeId: true },
    });
    const authorIds = [...follows.map((f) => f.followeeId), userId];
    const stories = await this.prisma.story.findMany({
      where: { authorId: { in: authorIds }, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
      include: { author: true },
    });
    const groups = new Map<string, StoryGroup>();
    for (const s of stories) {
      let g = groups.get(s.authorId);
      if (!g) {
        g = { author: { id: s.author.id, displayName: s.author.displayName }, stories: [] };
        groups.set(s.authorId, g);
      }
      g.stories.push({
        id: s.id,
        mediaUrl: s.mediaUrl,
        caption: s.caption,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      });
    }
    const arr = [...groups.values()];
    arr.sort((a, b) => (a.author.id === userId ? -1 : b.author.id === userId ? 1 : 0));
    return arr;
  }
}
