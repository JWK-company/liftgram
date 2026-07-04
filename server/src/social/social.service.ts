// @plm SRS-007 @plm SRS-008 @plm SRS-018  소셜 그래프·피드 (SAD-011).
// 크로스유저 공유 데이터 → 서버 관계형 권위 + REST(온라인). 오프라인-우선 개인 코어 위 옵트인 공개 레이어(ADR-014).
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/social.dto';
import { PushService } from '../push/push.service';

export interface PostView {
  id: string;
  author: { id: string; displayName: string | null; avatarUrl: string | null };
  kind: string;
  caption: string | null;
  data: unknown;
  visibility: string;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
}
export interface CommentView {
  id: string;
  author: { id: string; displayName: string | null };
  body: string;
  createdAt: string;
}
export interface PublicProfile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  counts: { followers: number; following: number; posts: number };
  isFollowing: boolean;
  isSelf: boolean;
  isBlocked: boolean; // 내가 이 사용자를 차단했는가(해제 UI용)
}
export interface DiscoverUser {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  isFollowing: boolean;
  followerCount?: number; // 추천(suggestions)에서 채움
}
export interface TrendingTag {
  tag: string;
  count: number;
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

type PostRow = {
  id: string;
  kind: string;
  caption: string | null;
  data: Prisma.JsonValue | null;
  visibility: string;
  createdAt: Date;
  author: { id: string; displayName: string | null; avatarUrl: string | null };
  _count: { likes: number; comments: number };
  likes: { id: string }[];
};

// 포스트 조회 include — 작성자 + 좋아요/댓글 수 + 뷰어의 좋아요 여부.
const postInclude = (viewerId: string) =>
  ({
    author: { select: { id: true, displayName: true, avatarUrl: true } },
    _count: { select: { likes: true, comments: { where: { moderationStatus: 'approved' } } } },
    likes: { where: { userId: viewerId }, select: { id: true } },
  }) satisfies Prisma.PostInclude;

// 캡션에서 #해시태그 추출(소문자·중복제거·최대 10개). 유니코드 글자/숫자/밑줄.
function extractHashtags(caption: string | null | undefined): string[] {
  if (!caption) return [];
  const tags = new Set<string>();
  for (const m of caption.matchAll(/#([\p{L}\p{N}_]{1,50})/gu)) {
    tags.add(m[1].toLowerCase());
    if (tags.size >= 10) break;
  }
  return [...tags];
}

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  private toView(p: PostRow): PostView {
    return {
      id: p.id,
      author: { id: p.author.id, displayName: p.author.displayName, avatarUrl: p.author.avatarUrl },
      kind: p.kind,
      caption: p.caption,
      data: p.data,
      visibility: p.visibility,
      createdAt: p.createdAt.toISOString(),
      likeCount: p._count.likes,
      commentCount: p._count.comments,
      likedByMe: p.likes.length > 0,
    };
  }

  // 미디어 참조 검증 — /media/file/<key> 형태 + 해당 MediaAsset가 이 사용자 소유여야(외부 URL·무단 참조 차단).
  private async assertOwnedMedia(mediaUrl: string, ownerId: string): Promise<{ flagged: boolean }> {
    const m = /^\/media\/file\/([A-Za-z0-9._-]+)$/.exec(mediaUrl); // ^앵커 — 외부 호스트 URL 차단
    if (!m) throw new BadRequestException('invalid media url');
    const asset = await this.prisma.mediaAsset.findUnique({ where: { key: m[1] } });
    if (!asset || asset.ownerId !== ownerId) {
      throw new BadRequestException('media not found or not owned');
    }
    return { flagged: asset.flagged };
  }

  // 알림 생성 (SRS-020) — 팔로우/좋아요/댓글. best-effort: 실패해도 본 액션(like/follow/comment)을 깨지 않음.
  private async notify(userId: string, actorId: string, type: string, postId?: string): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: { userId, actorId, type, postId: postId ?? null },
      });
    } catch {
      // 알림은 부수적 fan-out — 조용히 무시.
    }
    void this.dispatchPush(userId, actorId, type); // best-effort 푸시(비차단)
  }

  // 알림 이벤트를 수신자 기기로 푸시(best-effort). 표시 텍스트는 KO 기본(서버는 수신자 언어 미보유).
  private async dispatchPush(userId: string, actorId: string, type: string): Promise<void> {
    try {
      const actor = await this.prisma.user.findUnique({
        where: { id: actorId },
        select: { displayName: true },
      });
      const name = actor?.displayName ?? '누군가';
      const bodyByType: Record<string, string> = {
        follow: `${name}님이 회원님을 팔로우했어요`,
        like: `${name}님이 회원님의 게시물을 좋아해요`,
        comment: `${name}님이 회원님의 게시물에 댓글을 남겼어요`,
      };
      await this.push.sendToUsers([userId], {
        title: 'Liftgram',
        body: bodyByType[type] ?? '새 알림',
        data: { type },
      });
    } catch {
      // 무시
    }
  }

  async follow(followerId: string, followeeId: string): Promise<{ ok: true }> {
    if (followerId === followeeId) throw new BadRequestException('cannot follow yourself');
    const target = await this.prisma.user.findUnique({ where: { id: followeeId } });
    if (!target) throw new NotFoundException('user not found');
    if (await this.isBlockedBetween(followerId, followeeId)) {
      throw new ForbiddenException('cannot follow — blocked');
    }
    try {
      await this.prisma.follow.create({ data: { followerId, followeeId } });
      await this.notify(followeeId, followerId, 'follow');
    } catch (e) {
      // 이미 팔로우 중(unique 위반)이면 알림 재생성 안 함.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
    return { ok: true };
  }

  async unfollow(followerId: string, followeeId: string): Promise<{ ok: true }> {
    await this.prisma.follow.deleteMany({ where: { followerId, followeeId } });
    return { ok: true };
  }

  // 차단 — 상호 불가시 + 상호작용 차단. 차단 시 양방향 팔로우 해제.
  async block(blockerId: string, blockedId: string): Promise<{ ok: true }> {
    if (blockerId === blockedId) throw new BadRequestException('cannot block yourself');
    const target = await this.prisma.user.findUnique({ where: { id: blockedId }, select: { id: true } });
    if (!target) throw new NotFoundException('user not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.block.upsert({
        where: { blockerId_blockedId: { blockerId, blockedId } },
        update: {},
        create: { blockerId, blockedId },
      });
      await tx.follow.deleteMany({
        where: {
          OR: [
            { followerId: blockerId, followeeId: blockedId },
            { followerId: blockedId, followeeId: blockerId },
          ],
        },
      });
      // 양방향 알림 삭제(차단 흔적 정리).
      await tx.notification.deleteMany({
        where: {
          OR: [
            { userId: blockerId, actorId: blockedId },
            { userId: blockedId, actorId: blockerId },
          ],
        },
      });
    });
    return { ok: true };
  }

  async unblock(blockerId: string, blockedId: string): Promise<{ ok: true }> {
    await this.prisma.block.deleteMany({ where: { blockerId, blockedId } });
    return { ok: true };
  }

  // viewer와 차단 관계(양방향)인 유저 id — 목록에서 상호 제외.
  private async hiddenUserIds(viewerId: string): Promise<string[]> {
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    });
    const ids = new Set<string>();
    for (const r of rows) ids.add(r.blockerId === viewerId ? r.blockedId : r.blockerId);
    return [...ids];
  }

  // a↔b 사이 차단(어느 방향이든) 존재 여부.
  private async isBlockedBetween(a: string, b: string): Promise<boolean> {
    if (a === b) return false;
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

  async createPost(authorId: string, dto: CreatePostDto): Promise<PostView> {
    let flagged = false;
    if (dto.kind === 'image') {
      const imageUrl =
        dto.data && typeof dto.data === 'object'
          ? (dto.data as { imageUrl?: string }).imageUrl
          : undefined;
      if (!imageUrl) throw new BadRequestException('image post requires data.imageUrl');
      ({ flagged } = await this.assertOwnedMedia(imageUrl, authorId));
    }
    const post = await this.prisma.post.create({
      data: {
        authorId,
        kind: dto.kind ?? 'text',
        caption: dto.caption ?? null,
        data: dto.data ? (dto.data as Prisma.InputJsonValue) : undefined,
        visibility: dto.visibility ?? 'public',
        // 자동 스캔 위반 미디어는 pending(숨김) — 모더레이터 승인 시 노출(ADR-017).
        moderationStatus: flagged ? 'pending' : 'approved',
      },
      include: postInclude(authorId),
    });
    // 캡션의 #해시태그 추출·인덱싱(발견/트렌딩).
    const tags = extractHashtags(dto.caption);
    if (tags.length > 0) {
      await this.prisma.postHashtag.createMany({
        data: tags.map((tag) => ({ postId: post.id, tag })),
        skipDuplicates: true,
      });
    }
    return this.toView(post);
  }

  // 피드 = 내 게시물(공개범위 무관 전부) + 팔로우한 사람의 공개/팔로워 게시물, 최신순(id 타이브레이크).
  async getFeed(userId: string, limit: number, before?: string): Promise<PostView[]> {
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followeeId: true },
    });
    const followeeIds = follows.map((f) => f.followeeId);
    const hidden = await this.hiddenUserIds(userId);
    const beforeDate = before ? new Date(before) : undefined;
    const validBefore = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : undefined;
    const posts = await this.prisma.post.findMany({
      where: {
        moderationStatus: 'approved', // 제거/자동보류 콘텐츠 숨김
        authorId: { notIn: hidden }, // 차단 상호 제외
        OR: [
          { authorId: userId },
          { authorId: { in: followeeIds }, visibility: { in: ['public', 'followers'] } },
        ],
        ...(validBefore ? { createdAt: { lt: validBefore } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: postInclude(userId),
    });
    return posts.map((p) => this.toView(p));
  }

  // 특정 사용자 게시물 — 관계에 따른 공개범위 필터(본인=전체, 팔로워=공개+팔로워, 그 외=공개).
  // 뷰어↔대상 관계에 따른 열람 가능 공개범위 (게시물 목록·카운트 공통).
  private visibilityFor(isSelf: boolean, isFollowing: boolean): string[] {
    return isSelf
      ? ['public', 'followers', 'private']
      : isFollowing
        ? ['public', 'followers']
        : ['public'];
  }

  async getUserPosts(viewerId: string, targetId: string, limit: number): Promise<PostView[]> {
    if (await this.isBlockedBetween(viewerId, targetId)) return [];
    const isSelf = viewerId === targetId;
    const isFollowing =
      isSelf ||
      !!(await this.prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: viewerId, followeeId: targetId } },
      }));
    const allowed = this.visibilityFor(isSelf, isFollowing);
    const posts = await this.prisma.post.findMany({
      where: { authorId: targetId, visibility: { in: allowed }, moderationStatus: 'approved' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: postInclude(viewerId),
    });
    return posts.map((p) => this.toView(p));
  }

  async getProfile(viewerId: string, targetId: string): Promise<PublicProfile> {
    const u = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!u) throw new NotFoundException('user not found');
    const isSelf = viewerId === targetId;
    let iBlocked = false;
    if (!isSelf) {
      const [me2them, them2me] = await Promise.all([
        this.prisma.block.count({ where: { blockerId: viewerId, blockedId: targetId } }),
        this.prisma.block.count({ where: { blockerId: targetId, blockedId: viewerId } }),
      ]);
      if (them2me > 0) throw new NotFoundException('user not found'); // 나를 차단한 상대는 볼 수 없음
      iBlocked = me2them > 0; // 내가 차단한 상대는 최소 프로필+해제 UI
    }
    const followRec = isSelf
      ? null
      : await this.prisma.follow.findUnique({
          where: { followerId_followeeId: { followerId: viewerId, followeeId: targetId } },
        });
    const isFollowing = !!followRec;
    const allowed = this.visibilityFor(isSelf, isFollowing);
    const [followers, following, posts] = await Promise.all([
      this.prisma.follow.count({ where: { followeeId: targetId } }),
      this.prisma.follow.count({ where: { followerId: targetId } }),
      // 게시물 수도 뷰어가 볼 수 있는 범위로 스코프 — 숨은 글 개수 누출 방지. 차단 시 0.
      iBlocked
        ? Promise.resolve(0)
        : this.prisma.post.count({ where: { authorId: targetId, visibility: { in: allowed }, moderationStatus: 'approved' } }),
    ]);
    return {
      id: u.id,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      counts: { followers, following, posts },
      isFollowing,
      isSelf,
      isBlocked: iBlocked,
    };
  }

  // 발견 — 나 제외 사용자 목록(선택 검색어), 팔로우 여부 포함.
  async discover(viewerId: string, q: string | undefined, limit: number): Promise<DiscoverUser[]> {
    const hidden = await this.hiddenUserIds(viewerId);
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: viewerId, notIn: hidden }, // 나·차단 상호 제외
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
      avatarUrl: u.avatarUrl,
      isFollowing: followingSet.has(u.id),
    }));
  }

  // 인기 공개 포스트 발견 — 참여도(좋아요·댓글) + 최신 순. 팔로우 무관 공개 레이어.
  async getExplore(viewerId: string, limit: number): Promise<PostView[]> {
    const hidden = await this.hiddenUserIds(viewerId);
    const posts = await this.prisma.post.findMany({
      where: { visibility: 'public', moderationStatus: 'approved', authorId: { notIn: hidden } },
      // 좋아요 수(모더레이션 상태 없음=정확) + 최신순. 댓글 _count는 orderBy에서 필터 불가라 제외(제거 댓글 오염 방지).
      orderBy: [{ likes: { _count: 'desc' } }, { createdAt: 'desc' }],
      take: limit,
      include: postInclude(viewerId),
    });
    return posts.map((p) => this.toView(p));
  }

  // 트렌딩 해시태그 — 공개·승인 포스트의 태그 빈도 상위.
  async getTrendingHashtags(viewerId: string, limit: number): Promise<TrendingTag[]> {
    const hidden = await this.hiddenUserIds(viewerId);
    const rows = await this.prisma.postHashtag.groupBy({
      by: ['tag'],
      where: { post: { visibility: 'public', moderationStatus: 'approved', authorId: { notIn: hidden } } },
      _count: { tag: true },
      orderBy: { _count: { tag: 'desc' } },
      take: limit,
    });
    return rows.map((r) => ({ tag: r.tag, count: r._count.tag }));
  }

  // 특정 해시태그의 공개 포스트(최신순).
  async getHashtagPosts(viewerId: string, tag: string, limit: number): Promise<PostView[]> {
    const hidden = await this.hiddenUserIds(viewerId);
    const posts = await this.prisma.post.findMany({
      where: {
        visibility: 'public',
        moderationStatus: 'approved',
        authorId: { notIn: hidden },
        hashtags: { some: { tag: tag.toLowerCase() } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: postInclude(viewerId),
    });
    return posts.map((p) => this.toView(p));
  }

  // 추천 유저 — 내가 아직 팔로우하지 않은 사용자, 팔로워 많은 순.
  async getSuggestions(viewerId: string, limit: number): Promise<DiscoverUser[]> {
    const hidden = await this.hiddenUserIds(viewerId);
    const users = await this.prisma.user.findMany({
      where: { id: { not: viewerId, notIn: hidden }, followers: { none: { followerId: viewerId } } },
      orderBy: { followers: { _count: 'desc' } },
      take: limit,
      include: { _count: { select: { followers: true } } },
    });
    return users.map((u) => ({
      id: u.id,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      isFollowing: false,
      followerCount: u._count.followers,
    }));
  }

  // 스토리 생성 — 24h 후 만료. 미디어는 사전 업로드된 mediaUrl 참조(SRS-019 · SAD-012).
  async createStory(authorId: string, mediaUrl: string, caption?: string): Promise<StoryView> {
    const { flagged } = await this.assertOwnedMedia(mediaUrl, authorId);
    const story = await this.prisma.story.create({
      data: {
        authorId,
        mediaUrl,
        caption: caption ?? null,
        // 자동 스캔 위반 미디어는 pending(숨김) — createPost와 동일(ADR-017).
        moderationStatus: flagged ? 'pending' : 'approved',
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
    const hidden = new Set(await this.hiddenUserIds(userId));
    const authorIds = [...follows.map((f) => f.followeeId), userId].filter((id) => !hidden.has(id));
    const stories = await this.prisma.story.findMany({
      where: { authorId: { in: authorIds }, expiresAt: { gt: new Date() }, moderationStatus: 'approved' },
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

  // 포스트 가시성 검증 — 좋아요/댓글은 볼 수 있는 포스트(본인·공개·팔로워)에만.
  private async assertCanViewPost(postId: string, viewerId: string): Promise<{ authorId: string }> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true, visibility: true, moderationStatus: true },
    });
    if (!post) throw new NotFoundException('post not found');
    // 제거/자동보류 포스트는 미존재로 취급 — 가시성 누출·좋아요/댓글 차단.
    if (post.moderationStatus !== 'approved') throw new NotFoundException('post not found');
    if (await this.isBlockedBetween(viewerId, post.authorId)) throw new NotFoundException('post not found');
    if (post.authorId === viewerId || post.visibility === 'public') return { authorId: post.authorId };
    if (post.visibility === 'followers') {
      const f = await this.prisma.follow.findUnique({
        where: { followerId_followeeId: { followerId: viewerId, followeeId: post.authorId } },
      });
      if (f) return { authorId: post.authorId };
    }
    throw new ForbiddenException('cannot access this post');
  }

  async likePost(userId: string, postId: string): Promise<{ ok: true; likeCount: number }> {
    const { authorId } = await this.assertCanViewPost(postId, userId);
    try {
      await this.prisma.postLike.create({ data: { postId, userId } });
      if (authorId !== userId) await this.notify(authorId, userId, 'like', postId);
    } catch (e) {
      // 이미 좋아요(unique 위반)면 알림 재생성 안 함.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }
    const likeCount = await this.prisma.postLike.count({ where: { postId } });
    return { ok: true, likeCount };
  }

  async unlikePost(userId: string, postId: string): Promise<{ ok: true; likeCount: number }> {
    await this.assertCanViewPost(postId, userId);
    await this.prisma.postLike.deleteMany({ where: { postId, userId } });
    const likeCount = await this.prisma.postLike.count({ where: { postId } });
    return { ok: true, likeCount };
  }

  async listComments(userId: string, postId: string, limit: number): Promise<CommentView[]> {
    await this.assertCanViewPost(postId, userId);
    const hidden = await this.hiddenUserIds(userId);
    const comments = await this.prisma.comment.findMany({
      where: { postId, moderationStatus: 'approved', authorId: { notIn: hidden } }, // 차단 작성자 댓글 숨김
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      include: { author: { select: { id: true, displayName: true } } },
    });
    return comments.map((c) => ({
      id: c.id,
      author: { id: c.author.id, displayName: c.author.displayName },
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async addComment(userId: string, postId: string, body: string): Promise<CommentView> {
    const { authorId } = await this.assertCanViewPost(postId, userId);
    const text = body.trim();
    if (!text) throw new BadRequestException('empty comment');
    const c = await this.prisma.comment.create({
      data: { postId, authorId: userId, body: text },
      include: { author: { select: { id: true, displayName: true } } },
    });
    if (authorId !== userId) await this.notify(authorId, userId, 'comment', postId);
    return {
      id: c.id,
      author: { id: c.author.id, displayName: c.author.displayName },
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    };
  }

  async deleteComment(userId: string, commentId: string): Promise<{ ok: true }> {
    const c = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { authorId: true },
    });
    if (!c) throw new NotFoundException('comment not found');
    if (c.authorId !== userId) throw new ForbiddenException('not your comment');
    await this.prisma.comment.delete({ where: { id: commentId } });
    return { ok: true };
  }
}
