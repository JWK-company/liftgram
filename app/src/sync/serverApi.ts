// 서버 API 클라이언트 — 인증(JWT) + 동기 raw 호출 + 소셜(SAD-011). @plm SRS-006 @plm SRS-007
import type { SyncDatabaseChangeSet } from '@nozbe/watermelondb/sync';
import { SERVER_URL } from '../config';
import { clearToken, loadToken, saveToken } from './tokenStore';

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.auth) {
    const token = await loadToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (res.status === 204 ? (undefined as T) : ((await res.json()) as T));
}

export interface AuthTokens {
  accessToken: string;
}
export interface PullResponse {
  changes: SyncDatabaseChangeSet;
  timestamp: number;
}

// --- 소셜 (SAD-011) ---
export interface FeedPost {
  id: string;
  author: { id: string; displayName: string | null };
  kind: string;
  caption: string | null;
  data: unknown;
  visibility: string;
  createdAt: string;
}
export interface DiscoverUser {
  id: string;
  displayName: string | null;
  isFollowing: boolean;
}
export interface CreatePostInput {
  kind?: string;
  caption?: string;
  data?: unknown;
  visibility?: string;
}

export const serverApi = {
  async signUp(email: string, password: string, displayName?: string): Promise<void> {
    const { accessToken } = await request<AuthTokens>('/auth/signup', {
      method: 'POST',
      body: { email, password, displayName },
    });
    await saveToken(accessToken);
  },
  async login(email: string, password: string): Promise<void> {
    const { accessToken } = await request<AuthTokens>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    await saveToken(accessToken);
  },
  async logout(): Promise<void> {
    await clearToken();
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
  feed(before?: string): Promise<FeedPost[]> {
    return request<FeedPost[]>(`/social/feed${before ? `?before=${encodeURIComponent(before)}` : ''}`, {
      auth: true,
    });
  },
  createPost(input: CreatePostInput): Promise<FeedPost> {
    return request<FeedPost>('/social/posts', { method: 'POST', body: input, auth: true });
  },
  discover(q?: string): Promise<DiscoverUser[]> {
    return request<DiscoverUser[]>(`/social/users${q ? `?q=${encodeURIComponent(q)}` : ''}`, {
      auth: true,
    });
  },
  followUser(id: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/social/follow/${id}`, { method: 'POST', auth: true });
  },
  unfollowUser(id: string): Promise<{ ok: true }> {
    return request<{ ok: true }>(`/social/follow/${id}`, { method: 'DELETE', auth: true });
  },
};
