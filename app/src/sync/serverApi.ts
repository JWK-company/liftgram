// 서버 API 클라이언트 — 인증(JWT + refresh 회전) + 동기 + 소셜(SAD-011) + 미디어(SAD-012). @plm SRS-006 @plm SRS-007 @plm SRS-019
import type { SyncDatabaseChangeSet } from '@nozbe/watermelondb/sync';
import { Platform } from 'react-native';
import { SERVER_URL } from '../config';
import { clearTokens, loadRefreshToken, loadToken, saveTokens } from './tokenStore';
import { disconnectRealtime } from './realtime';

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

// refresh 토큰으로 새 토큰쌍 획득. 실패(만료/폐기) 시 저장 토큰 정리. request() 재귀 방지 위해 직접 fetch.
async function tryRefresh(): Promise<boolean> {
  const refreshToken = await loadRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${SERVER_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      await clearTokens();
      return false;
    }
    const { accessToken, refreshToken: next } = (await res.json()) as AuthTokens;
    await saveTokens(accessToken, next);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const headers: Record<string, string> = isForm ? {} : { 'content-type': 'application/json' };
  if (opts.auth) {
    const token = await loadToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body != null ? (isForm ? (opts.body as FormData) : JSON.stringify(opts.body)) : undefined,
  });
  // access 토큰 만료 → refresh로 1회 자동 재시도(투명).
  if (res.status === 401 && opts.auth && !retried && (await tryRefresh())) {
    return request<T>(path, opts, true);
  }
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (res.status === 204 ? (undefined as T) : ((await res.json()) as T));
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
export interface PullResponse {
  changes: SyncDatabaseChangeSet;
  timestamp: number;
}

// --- 소셜 (SAD-011) ---
export interface FeedPost {
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
export interface Comment {
  id: string;
  author: { id: string; displayName: string | null };
  body: string;
  createdAt: string;
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
export interface SearchResult {
  users: DiscoverUser[];
  tags: TrendingTag[];
  posts: FeedPost[];
}
export interface SocialProfile {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  counts: { followers: number; following: number; posts: number };
  isFollowing: boolean;
  isSelf: boolean;
  isBlocked: boolean; // 내가 이 사용자를 차단했는가
}
export interface NotificationItem {
  id: string;
  type: string; // follow | like | comment
  actor: { id: string; displayName: string | null };
  postId: string | null;
  read: boolean;
  createdAt: string;
}
export interface CreatePostInput {
  kind?: string;
  caption?: string;
  data?: unknown;
  visibility?: string;
}

// --- 미디어 (SAD-012) ---
export interface MediaUpload {
  id: string;
  url: string;
  kind: string;
  contentType: string;
}
export interface PickedImage {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
}
export interface StoryItem {
  id: string;
  mediaUrl: string;
  caption: string | null;
  createdAt: string;
  expiresAt: string;
}
export interface StoryGroup {
  author: { id: string; displayName: string | null };
  stories: StoryItem[];
}

// --- 유저 / DM (SRS-017) ---
export interface PublicUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  role: string; // user | moderator | admin (모더레이션 권한)
}

// --- 모더레이션 (SAD-012 · ADR-017) ---
export interface ModerationQueueItem {
  targetType: string; // post | story | comment
  targetId: string;
  source: string; // report | auto
  reasons: string[];
  reportCount: number;
  author: { id: string; displayName: string | null } | null;
  preview: { kind?: string; caption?: string | null; body?: string | null; mediaUrl?: string | null } | null;
  createdAt: string;
}
export interface DmMessage {
  id: string;
  conversationId: string;
  sender: { id: string; displayName: string | null };
  kind: string;
  body: string | null;
  mediaUrl: string | null;
  createdAt: string;
}
export interface DmConversation {
  id: string;
  isGroup: boolean;
  title: string | null;
  participants: { id: string; displayName: string | null }[];
  lastMessage: DmMessage | null;
  unreadCount: number;
  updatedAt: string;
}
export interface SendMessageInput {
  kind?: string;
  body?: string;
  mediaUrl?: string;
}

// 키셋 커서 쿼리스트링 — 마지막 항목의 createdAt(+id)로 다음 페이지 요청.
// 서버 orderBy [createdAt desc, id desc]와 일치시켜 같은 타임스탬프 경계 누락 방지.
function cursorQuery(before?: string, beforeId?: string): string {
  if (!before) return '';
  const base = `?before=${encodeURIComponent(before)}`;
  return beforeId ? `${base}&beforeId=${encodeURIComponent(beforeId)}` : base;
}

export const serverApi = {
  async signUp(email: string, password: string, displayName?: string): Promise<void> {
    const { accessToken, refreshToken } = await request<AuthTokens>('/auth/signup', {
      method: 'POST',
      body: { email, password, displayName },
    });
    await saveTokens(accessToken, refreshToken);
  },
  async login(email: string, password: string): Promise<void> {
    const { accessToken, refreshToken } = await request<AuthTokens>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    await saveTokens(accessToken, refreshToken);
  },
  async logout(): Promise<void> {
    const refreshToken = await loadRefreshToken();
    if (refreshToken) {
      try {
        await request('/auth/logout', { method: 'POST', body: { refreshToken } });
      } catch {
        // best-effort — 서버 실패해도 로컬 토큰은 정리
      }
    }
    await clearTokens();
    disconnectRealtime(); // 실시간 소켓 정리
  },
  async isLoggedIn(): Promise<boolean> {
    return (await loadToken()) != null;
  },
  pull(lastPulledAt: number): Promise<PullResponse> {
    return request<PullResponse>(`/sync/pull?lastPulledAt=${lastPulledAt}`, { auth: true });
  },
  push(changes: SyncDatabaseChangeSet): Promise<{ ok: true }> {
    return request<{ ok: true }>('/sync/push', { method: 'POST', body: { changes }, auth: true });
  },
  // --- 소셜 ---
  feed(before?: string, beforeId?: string): Promise<FeedPost[]> {
    return request<FeedPost[]>(`/social/feed${cursorQuery(before, beforeId)}`, {
      auth: true,
    });
  },
  createPost(input: CreatePostInput): Promise<FeedPost> {
    return request<FeedPost>('/social/posts', { method: 'POST', body: input, auth: true });
  },
  likePost(postId: string): Promise<{ ok: true; likeCount: number }> {
    return request<{ ok: true; likeCount: number }>(`/social/posts/${postId}/like`, { method: 'POST', auth: true });
  },
  unlikePost(postId: string): Promise<{ ok: true; likeCount: number }> {
    return request<{ ok: true; likeCount: number }>(`/social/posts/${postId}/like`, { method: 'DELETE', auth: true });
  },
  comments(postId: string): Promise<Comment[]> {
    return request<Comment[]>(`/social/posts/${postId}/comments`, { auth: true });
  },
  addComment(postId: string, body: string): Promise<Comment> {
    return request<Comment>(`/social/posts/${postId}/comments`, { method: 'POST', body: { body }, auth: true });
  },
  deleteComment(commentId: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/social/comments/${commentId}`, { method: 'DELETE', auth: true });
  },
  discover(q?: string): Promise<DiscoverUser[]> {
    return request<DiscoverUser[]>(`/social/users${q ? `?q=${encodeURIComponent(q)}` : ''}`, {
      auth: true,
    });
  },
  // --- 발견 고도화 (SRS-018) ---
  explore(): Promise<FeedPost[]> {
    return request<FeedPost[]>('/social/explore', { auth: true });
  },
  trendingHashtags(): Promise<TrendingTag[]> {
    return request<TrendingTag[]>('/social/hashtags', { auth: true });
  },
  hashtagPosts(tag: string, before?: string, beforeId?: string): Promise<FeedPost[]> {
    return request<FeedPost[]>(
      `/social/hashtags/${encodeURIComponent(tag)}/posts${cursorQuery(before, beforeId)}`,
      { auth: true },
    );
  },
  suggestions(): Promise<DiscoverUser[]> {
    return request<DiscoverUser[]>('/social/suggestions', { auth: true });
  },
  search(q: string): Promise<SearchResult> {
    return request<SearchResult>(`/social/search?q=${encodeURIComponent(q)}`, { auth: true });
  },
  followUser(id: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/social/follow/${id}`, { method: 'POST', auth: true });
  },
  unfollowUser(id: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/social/follow/${id}`, { method: 'DELETE', auth: true });
  },
  blockUser(id: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/social/block/${id}`, { method: 'POST', auth: true });
  },
  unblockUser(id: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/social/block/${id}`, { method: 'DELETE', auth: true });
  },
  profile(userId: string): Promise<SocialProfile> {
    return request<SocialProfile>(`/social/users/${userId}`, { auth: true });
  },
  userPosts(userId: string, before?: string, beforeId?: string): Promise<FeedPost[]> {
    return request<FeedPost[]>(
      `/social/users/${userId}/posts${cursorQuery(before, beforeId)}`,
      { auth: true },
    );
  },
  // --- 알림 (SRS-020) ---
  notifications(): Promise<NotificationItem[]> {
    return request<NotificationItem[]>('/notifications', { auth: true });
  },
  notificationsUnread(): Promise<{ count: number }> {
    return request<{ count: number }>('/notifications/unread-count', { auth: true });
  },
  markNotificationsRead(): Promise<{ ok: true }> {
    return request<{ ok: true }>('/notifications/read', { method: 'POST', auth: true });
  },
  // --- 미디어 ---
  async uploadImage(image: PickedImage): Promise<MediaUpload> {
    const type = image.mimeType ?? 'image/jpeg';
    const name = image.fileName ?? `photo.${type.split('/')[1] ?? 'jpg'}`;
    const form = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(image.uri)).blob();
      form.append('file', blob, name);
    } else {
      // RN FormData는 {uri,name,type} 형태를 파일로 처리.
      form.append('file', { uri: image.uri, name, type } as unknown as Blob);
    }
    return request<MediaUpload>('/media/upload', { method: 'POST', body: form, auth: true });
  },
  // --- 스토리 (SAD-012) ---
  stories(): Promise<StoryGroup[]> {
    return request<StoryGroup[]>('/social/stories', { auth: true });
  },
  createStory(mediaUrl: string, caption?: string): Promise<StoryItem> {
    return request<StoryItem>('/social/stories', { method: 'POST', body: { mediaUrl, caption }, auth: true });
  },
  // --- 유저 ---
  me(): Promise<PublicUser> {
    return request<PublicUser>('/users/me', { auth: true });
  },
  updateProfile(input: { displayName?: string; avatarUrl?: string }): Promise<PublicUser> {
    return request<PublicUser>('/users/me', { method: 'PATCH', body: input, auth: true });
  },
  // --- DM ---
  conversations(): Promise<DmConversation[]> {
    return request<DmConversation[]>('/dm/conversations', { auth: true });
  },
  createConversation(userId: string): Promise<DmConversation> {
    return request<DmConversation>('/dm/conversations', { method: 'POST', body: { userId }, auth: true });
  },
  createGroup(userIds: string[], title?: string): Promise<DmConversation> {
    return request<DmConversation>('/dm/groups', { method: 'POST', body: { userIds, title }, auth: true });
  },
  leaveConversation(conversationId: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/dm/conversations/${conversationId}/leave`, { method: 'POST', auth: true });
  },
  dmMessages(conversationId: string, before?: string): Promise<DmMessage[]> {
    return request<DmMessage[]>(
      `/dm/conversations/${conversationId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
      { auth: true },
    );
  },
  sendMessage(conversationId: string, input: SendMessageInput): Promise<DmMessage> {
    return request<DmMessage>(`/dm/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: input,
      auth: true,
    });
  },
  markRead(conversationId: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/dm/conversations/${conversationId}/read`, { method: 'POST', auth: true });
  },
  // --- 모더레이션 (SAD-012 · ADR-017) ---
  report(targetType: string, targetId: string, reason: string, details?: string): Promise<{ ok: true }> {
    return request<{ ok: true }>('/moderation/reports', {
      method: 'POST',
      body: { targetType, targetId, reason, details },
      auth: true,
    });
  },
  moderationQueue(): Promise<ModerationQueueItem[]> {
    return request<ModerationQueueItem[]>('/moderation/queue', { auth: true });
  },
  resolveReport(targetType: string, targetId: string, action: 'remove' | 'approve', reason?: string): Promise<{ ok: true }> {
    return request<{ ok: true }>('/moderation/resolve', {
      method: 'POST',
      body: { targetType, targetId, action, reason },
      auth: true,
    });
  },
  // --- 푸시 알림 (SRS-020 · ADR-015) ---
  getVapidPublicKey(): Promise<{ publicKey: string }> {
    return request<{ publicKey: string }>('/push/vapid-public-key', {});
  },
  registerPushToken(token: string, platform: string): Promise<{ ok: true }> {
    return request<{ ok: true }>('/push/tokens', { method: 'POST', body: { token, platform }, auth: true });
  },
  unregisterPushToken(token: string): Promise<{ ok: true }> {
    return request<{ ok: true }>('/push/tokens', { method: 'DELETE', body: { token }, auth: true });
  },
};
