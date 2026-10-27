// @plm SRS-081 SRS-082  동기 멈춤·나눠 보내기 중간 실패 — 실제 WatermelonDB(LokiJS 메모리) + 가짜 전송 계층(CD-4 c·d · CD-6).
// 데코레이터 모델·IndexedDB 어댑터는 fixtures/wm/loader.mjs 가 바꿔 끼운다.
import './fixtures/wm/register.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { database } = await import('../../db/database');
const engine = await import('../../sync/syncEngine');
const { splitSyncChanges } = await import('../../sync/pushChunks');
const userRepo = await import('../../data/userRepository');

type Changes = Record<string, { created?: string[]; updated?: string[]; deleted?: string[] }>;

/** 가짜 서버 — push 는 실제 웹 전송 계층처럼 나눠 보낸다(max 건씩). failChunk 번째 묶음에서 한 번 실패한다. */
function fakeTransport(max: number) {
  const state = { pulls: 0, pushes: 0, chunksSent: 0, received: new Set<string>(), failChunk: -1 };
  const t = {
    isLoggedIn: async () => true,
    pull: async () => {
      state.pulls++;
      return { changes: {}, timestamp: Date.now() };
    },
    push: async (changes: Changes) => {
      state.pushes++;
      const parts = splitSyncChanges(changes, max);
      for (let i = 0; i < parts.length; i++) {
        if (i === state.failChunk) {
          state.failChunk = -1;
          throw new Error(`묶음 ${i + 1}/${parts.length} 실패`);
        }
        state.chunksSent++;
        for (const tbl of Object.values(parts[i]))
          for (const r of [...(tbl.created ?? []), ...(tbl.updated ?? [])]) state.received.add(JSON.parse(r).id);
      }
    },
  };
  return { t, state };
}

async function pendingRoutineIds(): Promise<string[]> {
  const rows = await database.get('routines').query().fetch();
  return rows.filter((r) => (r._raw as unknown as { _status: string })._status !== 'synced').map((r) => r.id);
}

test('나눠 보내기 — 3묶음 중 2번째가 실패하면 동기가 실패하고 로컬은 미동기 그대로 · 다음 회차에 전부 다시 보낸다', async () => {
  await userRepo.getOrCreateLocalUser();
  await database.write(async () => {
    for (let i = 0; i < 5; i++)
      await database.get('routines').create((r) => {
        (r as unknown as { _raw: Record<string, unknown> })._raw.name = `R${i}`;
      });
  });
  const before = await pendingRoutineIds();
  assert.equal(before.length, 5);

  const { t, state } = fakeTransport(2); // 프로필 1 + 루틴 5 = 6건 → 3묶음
  state.failChunk = 1;
  engine.installSyncTransport(t);
  await assert.rejects(engine.syncWithServer(), /묶음 2\/3 실패/);
  assert.deepEqual((await pendingRoutineIds()).sort(), before.sort(), '실패한 회차는 아무것도 synced 로 표시하지 않는다');
  assert.equal(state.chunksSent, 1);

  await engine.syncWithServer();
  assert.deepEqual(await pendingRoutineIds(), []);
  for (const id of before) assert.ok(state.received.has(id), `${id} 가 서버에 갔다`);
  assert.equal(state.chunksSent, 1 + 3, '두 번째 회차는 처음부터 전부(3묶음) 다시 보낸다');
  engine.installSyncTransport(null);
});

test('멈춘 동안 — 사람이 부른 동기는 곧바로 SyncPausedError · 배경 예약 여러 번은 재개 뒤 동기 한 번', async () => {
  const { t, state } = fakeTransport(2000);
  engine.installSyncTransport(t);
  const release = await engine.pauseSync();
  assert.equal(engine.isSyncPaused(), true);
  await assert.rejects(engine.syncWithServer(), (e: unknown) => e instanceof engine.SyncPausedError);
  engine.scheduleSync(0);
  engine.scheduleSync(0);
  engine.scheduleSync(0);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(state.pulls, 0, '멈춘 동안은 받지도 올리지도 않는다');
  release();
  release(); // 두 번 풀어도 한 번
  assert.equal(engine.isSyncPaused(), false);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(state.pulls, 1, '재개 뒤 한 번으로 합쳐진다');
  engine.installSyncTransport(null);
});

test('멈춘 채 두는 길(풀지 않음) — 사람이 부른 동기가 영원히 기다리지 않는다', async () => {
  const { t } = fakeTransport(2000);
  engine.installSyncTransport(t);
  await engine.pauseSync(); // 일부러 풀지 않는다(write_failed_reload)
  const r = await Promise.race([
    engine.syncWithServer().then(
      () => 'ok',
      (e: unknown) => (e instanceof engine.SyncPausedError ? 'paused' : 'other'),
    ),
    new Promise((res) => setTimeout(() => res('hang'), 500)),
  ]);
  assert.equal(r, 'paused');
  engine.installSyncTransport(null);
});
