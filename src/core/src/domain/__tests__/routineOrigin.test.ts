// SPEC-050 P3a 루틴 출처 — 순수 판정(잠금·표시·출처 칸 빼기) + 백업 파일이 출처 칸을 싣지도 받지도 않는다(실제 WatermelonDB).
import './fixtures/wm/register.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isCoachLockedOrigin,
  routineOriginBadge,
  routineOriginOf,
  stripRoutineOriginFields,
} from '../routineOrigin';

const { database } = await import('../../db/database');
const backup = await import('../../sync/backup');

test('잠금은 coach 하나 — 끝난 코칭·가져옴·내 것·모르는 값은 풀림', () => {
  assert.equal(isCoachLockedOrigin('coach'), true);
  for (const v of ['coach_ended', 'import', null, undefined, '', 'COACH', 'trainer', 3]) {
    assert.equal(isCoachLockedOrigin(v), false, String(v));
  }
  assert.equal(routineOriginOf('weird'), null);
});

test('표시 — 코치는 이름(공백 정리·없으면 null) · 끝남 · 가져옴 · 내 것은 없음', () => {
  assert.deepEqual(routineOriginBadge({ origin: 'coach', coachName: '  김코치 ' }), { kind: 'coach', coachName: '김코치' });
  assert.deepEqual(routineOriginBadge({ origin: 'coach', coachName: '  ' }), { kind: 'coach', coachName: null });
  assert.deepEqual(routineOriginBadge({ origin: 'coach_ended', coachName: '김코치' }), { kind: 'coachEnded' });
  assert.deepEqual(routineOriginBadge({ origin: 'import' }), { kind: 'import' });
  assert.equal(routineOriginBadge({ origin: null }), null);
});

test('출처 칸 빼기 — 네 칸만 빠지고 원본은 그대로', () => {
  const raw = { id: 'r1', name: '상체', origin: 'coach', coach_id: 'u', coach_name: '김', coach_for: null, folder: 'A' };
  assert.deepEqual(stripRoutineOriginFields(raw), { id: 'r1', name: '상체', folder: 'A' });
  assert.equal(raw.origin, 'coach');
});

async function reset(): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}

test('백업 — 내보낼 때 루틴 출처 칸을 빼고, 가져올 때도 파일의 출처 칸을 쓰지 않는다', async () => {
  await reset();
  await database.write(async () => {
    await database.get('routines').create((r) => {
      Object.assign(r._raw as unknown as Record<string, unknown>, {
        id: 'coach-1',
        name: '코치 상체',
        sort_order: 0,
        is_archived: false,
        origin: 'coach',
        coach_id: 'u-coach',
        coach_name: '김코치',
        updated_at: 100,
      });
    });
  });
  const file = await backup.exportBackup(null);
  const row = file.tables.routines.find((r) => r.id === 'coach-1');
  assert.ok(row);
  for (const k of ['origin', 'coach_id', 'coach_name', 'coach_for']) assert.equal(Object.hasOwn(row, k), false, k);

  // 손댄 파일 — 다른 계정에 「코치 ○○」 루틴을 심으려 해도 내 것으로 들어온다
  await reset();
  const forged = {
    format: 'liftgram-backup',
    version: 1,
    exportedAt: '',
    schemaVersion: 30,
    owner: null,
    tables: {
      routines: [
        { id: 'fake-1', name: '가짜 코치', sort_order: 0, is_archived: false, origin: 'coach', coach_name: '유명 코치', updated_at: 5 },
      ],
    },
  };
  await backup.importBackup(forged);
  const got = (await database.get('routines').find('fake-1'))._raw as unknown as Record<string, unknown>;
  assert.deepEqual([got.name, got.origin, got.coach_name], ['가짜 코치', null, null]);
});
