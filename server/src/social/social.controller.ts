// @plm SRS-007 @plm SRS-018  소셜 REST 엔드포인트 (Bearer 인증) — SAD-011.
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { AddCommentDto, CreatePostDto, CreateStoryDto, UpdatePostDto } from './dto/social.dto';
import {
  CommentView,
  DiscoverUser,
  PostView,
  PublicProfile,
  SearchResult,
  SocialService,
  StoryGroup,
  StoryView,
  TrendingTag,
} from './social.service';

const clampLimit = (v: string | undefined, def: number, max: number): number => {
  const n = v ? parseInt(v, 10) : def;
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), max) : def;
};

@UseGuards(JwtAuthGuard)
@Controller('social')
export class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get('feed')
  feed(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('beforeId') beforeId?: string,
  ): Promise<PostView[]> {
    return this.social.getFeed(user.userId, clampLimit(limit, 30, 100), before, beforeId);
  }

  @Post('posts')
  createPost(@CurrentUser() user: AuthUser, @Body() dto: CreatePostDto): Promise<PostView> {
    return this.social.createPost(user.userId, dto);
  }

  @Patch('posts/:id')
  updatePost(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePostDto,
  ): Promise<PostView> {
    return this.social.updatePost(user.userId, id, dto);
  }

  @Delete('posts/:id')
  deletePost(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.social.deletePost(user.userId, id);
  }

  @Post('posts/:id/like')
  like(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true; likeCount: number }> {
    return this.social.likePost(user.userId, id);
  }

  @Delete('posts/:id/like')
  unlike(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true; likeCount: number }> {
    return this.social.unlikePost(user.userId, id);
  }

  @Get('posts/:id/comments')
  comments(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ): Promise<CommentView[]> {
    return this.social.listComments(user.userId, id, clampLimit(limit, 50, 100));
  }

  @Post('posts/:id/comments')
  addComment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AddCommentDto,
  ): Promise<CommentView> {
    return this.social.addComment(user.userId, id, dto.body);
  }

  @Delete('comments/:id')
  deleteComment(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.social.deleteComment(user.userId, id);
  }

  @Post('stories')
  createStory(@CurrentUser() user: AuthUser, @Body() dto: CreateStoryDto): Promise<StoryView> {
    return this.social.createStory(user.userId, dto.mediaUrl, dto.caption);
  }

  @Get('stories')
  stories(@CurrentUser() user: AuthUser): Promise<StoryGroup[]> {
    return this.social.getActiveStories(user.userId);
  }

  // 발견 — 인기 공개 포스트(Explore).
  @Get('explore')
  explore(@CurrentUser() user: AuthUser, @Query('limit') limit?: string): Promise<PostView[]> {
    return this.social.getExplore(user.userId, clampLimit(limit, 30, 100));
  }

  // 트렌딩 해시태그.
  @Get('hashtags')
  trending(@CurrentUser() user: AuthUser, @Query('limit') limit?: string): Promise<TrendingTag[]> {
    return this.social.getTrendingHashtags(user.userId, clampLimit(limit, 20, 50));
  }

  // 특정 해시태그의 공개 포스트.
  @Get('hashtags/:tag/posts')
  hashtagPosts(
    @CurrentUser() user: AuthUser,
    @Param('tag') tag: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('beforeId') beforeId?: string,
  ): Promise<PostView[]> {
    return this.social.getHashtagPosts(user.userId, tag, clampLimit(limit, 30, 100), before, beforeId);
  }

  // 추천 유저(팔로워 많은 순, 미팔로우).
  @Get('suggestions')
  suggestions(@CurrentUser() user: AuthUser, @Query('limit') limit?: string): Promise<DiscoverUser[]> {
    return this.social.getSuggestions(user.userId, clampLimit(limit, 20, 50));
  }

  // 통합 검색 — 유저 + 해시태그 + 포스트.
  @Get('search')
  search(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ): Promise<SearchResult> {
    return this.social.search(user.userId, q ?? '', clampLimit(limit, 20, 50));
  }

  @Get('users')
  discover(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ): Promise<DiscoverUser[]> {
    return this.social.discover(user.userId, q, clampLimit(limit, 30, 100));
  }

  @Get('users/:id')
  profile(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<PublicProfile> {
    return this.social.getProfile(user.userId, id);
  }

  @Get('users/:id/posts')
  userPosts(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
    @Query('beforeId') beforeId?: string,
  ): Promise<PostView[]> {
    return this.social.getUserPosts(user.userId, id, clampLimit(limit, 30, 100), before, beforeId);
  }

  @Post('follow/:id')
  follow(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.social.follow(user.userId, id);
  }

  @Delete('follow/:id')
  unfollow(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.social.unfollow(user.userId, id);
  }

  @Post('block/:id')
  block(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.social.block(user.userId, id);
  }

  @Delete('block/:id')
  unblock(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.social.unblock(user.userId, id);
  }
}
