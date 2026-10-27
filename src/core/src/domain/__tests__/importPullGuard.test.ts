// @plm SRS-082  pull 보호(P5-2) — 원격 삭제 표시 중 가져온 id(imp-/cx-/ia-)이면서 로컬 행이 created 인 것만 적용하지 않는다.
// 실제 WatermelonDB(LokiJS 메모리) + 가짜 전송 계층. 다른 id·synced 행에 대한 기존 동작(원격 삭제 적용)은 그대로인지 같이 본다.
import './fixtures/wm/register.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { database } = await import('../../db/database');
const engine = await import('../../sync/syncEngine');
const guard = await import('../../sync/importPullGuard');
const userRepo = await import('../../data/userRepository');

type Changes = Record<string, { created?: string[]; updated?: string[]; deleted?: string[] }>;

function fakeTransport() {
  const state = { nextPull: {} as Changes, pushed: new Set<string>() };
  const t = {
    isLoggedIn: async () => true,
    pull: async () => {
      const changes = state.nextPull;
      state.nextPull = {};
      return { changes, timestamp: Date.now() };
    },
    push: async (changes: Changes) => {
      for (const [table, tbl] of Object.entries(changes))
        for (const r of [...(tbl.created ?? []), ...(tbl.updated ?? [])]) state.pushed.add(`${table}:${JSON.parse(r).id}`);
    },
  };
  return { t, state };
}

const workout = (id: string) => ({ id, state: 'completed', started_at: 1, completed_at: 2, created_at: 1, updated_at: 1 });
const status = async (table: string, id: string): Promise<string | null> => {
  const rows = await database.get(table).query().fetch();
  const m = rows.find((r) => r.id === id);
  return m ? ((m._raw as unknown as { _status: string })._status ?? null) : null;
};

test('순수 함수 — 가져온 id 판정 · keep 에 든 삭제만 뺀다', () => {
  assert.ok(guard.isImportedId('imp-strong-abc'));
  assert.ok(guard.isImportedId('imp-strong-abc-e0-s1'));
  assert.ok(guard.isImportedId('cx-hevy-abc'));
  assert.ok(guard.isImportedId('ia-hevy-abc'));
  assert.ok(!guard.isImportedId('seed-barbell-squat'));
  assert.ok(!guard.isImportedId('0f3c9d2a'));
  const changes = { workouts: { created: [], updated: [], deleted: ['imp-a', 'imp-b', 'x'] }, routines: { created: [], updated: [], deleted: ['imp-z'] } };
  const out = guard.dropDeletesOfLocallyCreated(changes as never, new Map([['workouts', new Set(['imp-a'])]])) as unknown as typeof changes;
  assert.deepEqual(out.workouts.deleted, ['imp-b', 'x']);
  assert.deepEqual(out.routines.deleted, ['imp-z'], '보호 표가 아닌 표는 그대로');
  assert.deepEqual([...guard.importedDeletedIds(changes as never).keys()], ['workouts'], 'routines 는 후보가 아니다');
});

test('pull — 가져온 created 행은 원격 삭제를 적용하지 않고 같은 동기의 push 로 되살린다 · synced 행과 다른 id 는 지금처럼 지운다', async () => {
  await userRepo.getOrCreateLocalUser();
  const { t, state } = fakeTransport();
  engine.installSyncTransport(t);

  // ① 이미 올린(synced) 가져온 운동 + 앱 운동
  await database.write(async () => {
    await database.batch(
      database.get('workouts').prepareCreateFromDirtyRaw(workout('imp-strong-old')),
      database.get('workouts').prepareCreateFromDirtyRaw(workout('app-synced-1')),
    );
  });
  await engine.syncWithServer();
  assert.equal(await status('workouts', 'imp-strong-old'), 'synced');
  assert.equal(await status('workouts', 'app-synced-1'), 'synced');

  // ② 아직 안 올린(created) 가져온 행(운동·종목 줄·세트·커스텀 종목·별칭) + 앱이 만든 created 운동
  await database.write(async () => {
    await database.batch(
      database.get('workouts').prepareCreateFromDirtyRaw(workout('imp-strong-new')),
      database.get('workout_exercises').prepareCreateFromDirtyRaw({ id: 'imp-strong-new-e0', workout_id: 'imp-strong-new', exercise_id: 'cx-strong-c1', sort_order: 0 }),
      database.get('set_logs').prepareCreateFromDirtyRaw({ id: 'imp-strong-new-e0-s0', workout_exercise_id: 'imp-strong-new-e0', set_number: 1, weight_kg: 50, reps: 5, done: true }),
      database.get('exercises').prepareCreateFromDirtyRaw({ id: 'cx-strong-c1', name_ko: '내 종목', equipment: 'other', is_custom: true }),
      database.get('import_aliases').prepareCreateFromDirtyRaw({ id: 'ia-strong-a1', source: 'strong', source_name: 'X', exercise_id: 'cx-strong-c1' }),
      database.get('workouts').prepareCreateFromDirtyRaw(workout('app-created-1')),
    );
  });

  // ③ 서버가 이 모든 id 의 삭제 표시를 보낸다(되돌린 묶음 · 겹침 재전송 등)
  state.pushed.clear();
  state.nextPull = {
    workouts: { deleted: ['imp-strong-new', 'imp-strong-old', 'app-synced-1', 'app-created-1'] },
    workout_exercises: { deleted: ['imp-strong-new-e0'] },
    set_logs: { deleted: ['imp-strong-new-e0-s0'] },
    exercises: { deleted: ['cx-strong-c1'] },
    import_aliases: { deleted: ['ia-strong-a1'] },
  };
  await engine.syncWithServer();

  // 가져온 created 행 — 남고, 같은 동기의 push 로 올라간다(서버가 deleted=false 로 되살린다)
  for (const [table, id] of [
    ['workouts', 'imp-strong-new'],
    ['workout_exercises', 'imp-strong-new-e0'],
    ['set_logs', 'imp-strong-new-e0-s0'],
    ['exercises', 'cx-strong-c1'],
    ['import_aliases', 'ia-strong-a1'],
  ] as const) {
    assert.equal(await status(table, id), 'synced', `${table}:${id} 는 남고 올라갔다`);
    assert.ok(state.pushed.has(`${table}:${id}`), `${table}:${id} 를 push 했다`);
  }
  // 기존 동작 불변 — synced 인 가져온 행, 앱 행(synced·created 모두)은 원격 삭제를 그대로 적용한다
  assert.equal(await status('workouts', 'imp-strong-old'), null, 'synced 가져온 행은 지워진다');
  assert.equal(await status('workouts', 'app-synced-1'), null, '앱 행(synced)은 지워진다');
  assert.equal(await status('workouts', 'app-created-1'), null, '앱 행(created)도 지금처럼 지워진다 — 가져온 id 만 보호');
  engine.installSyncTransport(null);
});
