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

  // 피드 = 내가 팔로우하는 사람 + 나의 게시물(공개/팔로워), 최신순 커서 페이지네이션.
  async getFeed(userId: string, limit: number, before?: string): Promise<PostView[]> {
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followeeId: true },
    });
    const authorIds = [...follows.map((f) => f.followeeId), userId];
    const posts = await this.prisma.post.findMany({
      where: {
        authorId: { in: authorIds },
        visibility: { in: ['public', 'followers'] },
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
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
        ...(q
          ? {
              OR: [
                { displayName: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
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
}
