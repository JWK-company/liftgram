// 서버 API 클라이언트 — 인증(JWT) + 동기 raw 호출. @plm SRS-006
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
};
