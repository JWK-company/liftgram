// @plm SRS-051 SRS-073  마이그레이션 직후 셸 덮어쓰기(CD-3) — 지우지 않고 바꿔 넣는다 · 오프라인이면 아무것도 안 한다.
// 대상은 frontend/lib/shellCache.ts(별칭 import 없음) — 가짜 CacheStorage·fetch 로 부른다. 서비스워커 템플릿과 셸 목록 대조도 여기서.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PAGES_CACHE_PREFIX, SW_SHELLS, refreshShellCaches, type ShellCacheDeps } from '../../../../frontend/lib/shellCache';

/** 이름 → (경로 → 본문) */
function fakeCaches(init: Record<string, Record<string, string>>) {
  const store = new Map(Object.entries(init).map(([k, v]) => [k, new Map(Object.entries(v))]));
  const api: NonNullable<ShellCacheDeps['caches']> = {
    keys: async () => [...store.keys()],
    open: async (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name) as Map<string, string>;
      return { put: async (u: string, r: Response) => void m.set(u, await r.text()) };
    },
  };
  return { api, store };
}

const okFetch = (body = 'v26-shell') => async (u: string) => new Response(`${body}${u}`, { status: 200 });

test('서비스워커 템플릿의 SHELLS 와 같은 목록이다(한쪽만 바꾸면 실패)', () => {
  const tpl = readFileSync(fileURLToPath(new URL('../../../../frontend/sw/sw.template.js', import.meta.url)), 'utf8');
  const m = tpl.match(/const SHELLS = (\[[^\]]*\]);/);
  assert.ok(m, 'sw.template.js 에 SHELLS 배열이 있어야 한다');
  assert.deepEqual(JSON.parse(m[1]), [...SW_SHELLS]);
  assert.ok(SW_SHELLS.includes('/offline'));
});

test('온라인 — 모든 liftgram-pages-* 캐시의 셸을 지금 셸로 덮어쓴다 · 캐시도 다른 항목도 지우지 않는다', async () => {
  const { api, store } = fakeCaches({
    'liftgram-pages-OLD': { '/workout': 'v25-shell', '/feed': 'v25-feed' },
    'liftgram-pages-NEW': { '/workout': 'v26-install' },
    'liftgram-static-NEW': { '/_next/x.js': 'js' },
  });
  const r = await refreshShellCaches({ caches: api, fetch: okFetch(), onLine: true });
  assert.equal(r.status, 'done');
  assert.equal(r.caches, 2);
  assert.deepEqual(r.refreshed, [...SW_SHELLS]);
  for (const name of ['liftgram-pages-OLD', 'liftgram-pages-NEW']) {
    const m = store.get(name) as Map<string, string>;
    for (const u of SW_SHELLS) assert.equal(m.get(u), `v26-shell${u}`, `${name} ${u}`);
  }
  assert.equal(store.get('liftgram-pages-OLD')?.get('/feed'), 'v25-feed', '목록 밖 항목은 그대로(지우지 않는다)');
  assert.equal(store.get('liftgram-static-NEW')?.get('/_next/x.js'), 'js');
  assert.ok([...store.keys()].every((k) => !k.startsWith(PAGES_CACHE_PREFIX) || store.get(k)?.has('/offline')));
});

test('오프라인 — 아무것도 받지도 지우지도 않는다(다음 온라인 부팅에 다시)', async () => {
  const { api, store } = fakeCaches({ 'liftgram-pages-OLD': { '/workout': 'v25-shell', '/offline': 'off' } });
  let calls = 0;
  const r = await refreshShellCaches({
    caches: api,
    fetch: async () => {
      calls++;
      throw new Error('offline');
    },
    onLine: false,
  });
  assert.equal(r.status, 'offline');
  assert.equal(calls, 0);
  assert.deepEqual(Object.fromEntries(store.get('liftgram-pages-OLD') ?? []), { '/workout': 'v25-shell', '/offline': 'off' });
});

test('받다 실패한 셸은 그대로 두고 partial(다시 시도) · 오류 응답·리다이렉트는 보관하지 않는다(skipped)', async () => {
  const { api, store } = fakeCaches({ 'liftgram-pages-OLD': { '/workout': 'v25', '/history': 'v25', '/stats': 'v25' } });
  const r = await refreshShellCaches({
    caches: api,
    onLine: true,
    fetch: async (u: string) => {
      if (u === '/workout') throw new Error('net');
      if (u === '/history') return new Response('err', { status: 500 });
      if (u === '/stats') {
        const res = new Response('login', { status: 200 });
        Object.defineProperty(res, 'redirected', { value: true });
        return res;
      }
      return new Response(`new${u}`, { status: 200 });
    },
  });
  assert.equal(r.status, 'partial');
  assert.deepEqual(r.failed, ['/workout']);
  assert.deepEqual(r.skipped, ['/history', '/stats']);
  const m = store.get('liftgram-pages-OLD') as Map<string, string>;
  assert.equal(m.get('/workout'), 'v25');
  assert.equal(m.get('/history'), 'v25');
  assert.equal(m.get('/offline'), 'new/offline');
});

test('페이지 캐시가 없으면(워커 설치 전) 할 일이 없다 — 받지 않는다', async () => {
  const { api } = fakeCaches({ 'liftgram-static-X': {} });
  let calls = 0;
  const r = await refreshShellCaches({
    caches: api,
    onLine: true,
    fetch: async (u: string) => {
      calls++;
      return new Response(u);
    },
  });
  assert.equal(r.status, 'no-cache');
  assert.equal(calls, 0);
});
