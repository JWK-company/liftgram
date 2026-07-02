// @plm SRS-007 @plm SRS-018  소셜 REST 엔드포인트 (Bearer 인증) — SAD-011.
import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt.strategy';
import { CreatePostDto, CreateStoryDto } from './dto/social.dto';
import {
  DiscoverUser,
  PostView,
  PublicProfile,
  SocialService,
  StoryGroup,
  StoryView,
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
  ): Promise<PostView[]> {
    return this.social.getFeed(user.userId, clampLimit(limit, 30, 100), before);
  }

  @Post('posts')
  createPost(@CurrentUser() user: AuthUser, @Body() dto: CreatePostDto): Promise<PostView> {
    return this.social.createPost(user.userId, dto);
  }

  @Post('stories')
  createStory(@CurrentUser() user: AuthUser, @Body() dto: CreateStoryDto): Promise<StoryView> {
    return this.social.createStory(user.userId, dto.mediaUrl, dto.caption);
  }

  @Get('stories')
  stories(@CurrentUser() user: AuthUser): Promise<StoryGroup[]> {
    return this.social.getActiveStories(user.userId);
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
  ): Promise<PostView[]> {
    return this.social.getUserPosts(user.userId, id, clampLimit(limit, 30, 100));
  }

  @Post('follow/:id')
  follow(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.social.follow(user.userId, id);
  }

  @Delete('follow/:id')
  unfollow(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ ok: true }> {
    return this.social.unfollow(user.userId, id);
  }
}
