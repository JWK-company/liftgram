// 서버 API 클라이언트 — 인증(JWT + refresh 회전) + 동기 + 소셜(SAD-011). @plm SRS-006 @plm SRS-007
import type { SyncDatabaseChangeSet } from '@nozbe/watermelondb/sync';
import { SERVER_URL } from '../config';
import { clearTokens, loadRefreshToken, loadToken, saveTokens } from './tokenStore';

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
