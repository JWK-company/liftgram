// @plm SRS-081 SRS-082  push 나눠 보내기(D-1) — ≤2000건 · 순서 유지 · 컬렉션 경계 무관 · 작은 동기는 그대로 한 번.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { countChangeRecords, PUSH_CHUNK_MAX, splitSyncChanges, type ChunkTableChanges } from '../../sync/pushChunks';

const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${i}`);

test('작은 변화분은 받은 객체 그대로 하나', () => {
  const c = { workouts: { created: ['a'], updated: [], deleted: [] } };
  const parts = splitSyncChanges(c);
  assert.equal(parts.length, 1);
  assert.equal(parts[0], c);
  assert.deepEqual(splitSyncChanges({}), [{}]);
});

test('가져오기 규모(1.6만 건) — 전부 ≤2000 · 합계·순서 보존', () => {
  const c: Record<string, ChunkTableChanges> = {
    import_batches: { created: ['b0'], updated: [], deleted: [] },
    exercises: { created: ids('cx', 30), updated: [], deleted: [] },
    workouts: { created: ids('w', 1000), updated: ids('wu', 5), deleted: [] },
    workout_exercises: { created: ids('we', 5000), updated: [], deleted: [] },
    set_logs: { created: ids('s', 10000), updated: [], deleted: ids('sd', 7) },
    import_aliases: { created: ids('ia', 30) },
  };
  const parts = splitSyncChanges(c);
  const total = countChangeRecords(c);
  assert.equal(parts.length, Math.ceil(total / PUSH_CHUNK_MAX));
  for (const p of parts) assert.ok(countChangeRecords(p) <= PUSH_CHUNK_MAX);
  assert.equal(parts.reduce((n, p) => n + countChangeRecords(p), 0), total);
  // 순서: 컬렉션 순 → created → updated → deleted
  const flat = (x: Record<string, ChunkTableChanges>) =>
    Object.entries(x).flatMap(([t, v]) => [
      ...(v.created ?? []).map((r) => `${t}:c:${r}`),
      ...(v.updated ?? []).map((r) => `${t}:u:${r}`),
      ...(v.deleted ?? []).map((r) => `${t}:d:${r}`),
    ]);
  assert.deepEqual(parts.flatMap(flat), flat(c));
  // 앞 묶음은 꽉 찬다(컬렉션 경계에서 끊지 않는다)
  for (const p of parts.slice(0, -1)) assert.equal(countChangeRecords(p), PUSH_CHUNK_MAX);
});

test('되돌리기·백업 가져오기 규모(삭제만·여러 표) — 같은 경로로 나뉜다', () => {
  const c: Record<string, ChunkTableChanges> = {
    set_logs: { deleted: ids('s', 4500) },
    workouts: { deleted: ids('w', 450) },
    routines: { created: ids('r', 120) },
  };
  const parts = splitSyncChanges(c, 2000);
  assert.deepEqual(parts.map(countChangeRecords), [2000, 2000, 1070]);
  assert.equal(parts[2].routines?.created?.length, 120);
});

test('max 는 1 이상', () => {
  assert.throws(() => splitSyncChanges({ a: { created: ['x', 'y'] } }, 0));
  assert.deepEqual(splitSyncChanges({ a: { created: ['x', 'y'] } }, 1).map(countChangeRecords), [1, 1]);
});
