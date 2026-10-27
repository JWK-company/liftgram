// @plm SRS-077 SRS-078  체중 저장소 수준 회귀(CD-1·CD-2·CD-4 b) — 실제 WatermelonDB(LokiJS 메모리)에서 프로필 입력 → 정리를 돌린다.
// 데코레이터 모델·IndexedDB 어댑터는 fixtures/wm/loader.mjs 가 바꿔 끼운다(메모리 「WatermelonDB 이관 node 검증」).
import './fixtures/wm/register.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { database } = await import('../../db/database');
const userRepo = await import('../../data/userRepository');
const bwRepo = await import('../../data/bodyweightRepository');
const engine = await import('../../sync/syncEngine');
const { BODYWEIGHT_PROFILE_LOG_PREFIX, isBodyweightClearMarker } = await import('../bodyweight');

type Raw = { id: string; measured_at: number | null; weight_kg: number | null; source: string | null };

async function rows(): Promise<Raw[]> {
  const all = await database.get('bodyweight_logs').query().fetch();
  return all.map((r) => r._raw as unknown as Raw);
}
async function mirror(): Promise<number | null> {
  const u = await userRepo.getOrCreateLocalUser();
  return u.bodyweightKg ?? null;
}
/** 줄을 1분 넘게 지난 것으로(연타 합치기 창 밖) — updated_at 을 되감는다 */
async function age(ms = 120_000): Promise<void> {
  await database.write(async () => {
    for (const r of await database.get('bodyweight_logs').query().fetch()) {
      const raw = r._raw as unknown as { updated_at: number };
      raw.updated_at -= ms;
      await database.adapter.batch([['update', 'bodyweight_logs', r._raw]]);
    }
  });
}
async function reset(): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}

test('80 → 82 → 80 — 프로필 입력마다 정리(동기 뒤·부팅)를 돌려도 80 이 유지된다 · 정리는 멱등', async () => {
  await reset();
  const me = await userRepo.getOrCreateLocalUser();
  await userRepo.updateUserSettings(me.id, { bodyweightKg: 80 });
  assert.equal(await mirror(), 80);
  assert.equal((await rows()).length, 1);
  assert.equal((await rows())[0].source, 'manual');
  assert.ok((await rows())[0].id.startsWith(BODYWEIGHT_PROFILE_LOG_PREFIX));
  assert.deepEqual(await bwRepo.reconcileBodyweightMirror(), { created: null, mirrorChanged: false, mirrorKg: 80 });

  await age();
  await userRepo.updateUserSettings(me.id, { bodyweightKg: 82 });
  await bwRepo.reconcileBodyweightMirror();
  assert.equal(await mirror(), 82);

  await age();
  await userRepo.updateUserSettings(me.id, { bodyweightKg: 80 });
  const r = await bwRepo.reconcileBodyweightMirror();
  assert.deepEqual(r, { created: null, mirrorChanged: false, mirrorKg: 80 });
  assert.equal(await mirror(), 80);
  assert.equal((await rows()).length, 3);
  // 두 번째 정리 — 쓰기 0
  assert.deepEqual(await bwRepo.reconcileBodyweightMirror(), { created: null, mirrorChanged: false, mirrorKg: 80 });
});

test('스테퍼 연타(1분 안) — 줄 하나를 고친다 · 같은 write 안에서 미러도 같은 값', async () => {
  await reset();
  const me = await userRepo.getOrCreateLocalUser();
  for (const kg of [80, 80.5, 81, 81.5]) await userRepo.updateUserSettings(me.id, { bodyweightKg: kg });
  const rs = await rows();
  assert.equal(rs.length, 1);
  assert.equal(rs[0].weight_kg, 81.5);
  assert.equal(await mirror(), 81.5);
});

test('0(설정 안 함) — 표식 한 줄 · 미러 null · 정리를 몇 번 돌려도 null 유지 · 다음 입력은 다시 값', async () => {
  await reset();
  const me = await userRepo.getOrCreateLocalUser();
  await userRepo.updateUserSettings(me.id, { bodyweightKg: 82 });
  await age();
  await userRepo.updateUserSettings(me.id, { bodyweightKg: null }); // 화면은 0 을 null 로 넘긴다
  assert.equal(await mirror(), null);
  const marker = (await rows()).find((r) =>
    isBodyweightClearMarker({ id: r.id, measuredAt: r.measured_at, weightKg: r.weight_kg, updatedAt: 0 }),
  );
  assert.ok(marker, '표식 줄이 있어야 한다');
  for (let i = 0; i < 3; i++)
    assert.deepEqual(await bwRepo.reconcileBodyweightMirror(), { created: null, mirrorChanged: false, mirrorKg: null });
  assert.equal(await mirror(), null);
  await age();
  await userRepo.updateUserSettings(me.id, { bodyweightKg: 79 });
  await bwRepo.reconcileBodyweightMirror();
  assert.equal(await mirror(), 79);
});

test('로그인 안 한 기기 — 첫 정리가 bw-init 을 심지 않는다(CD-5) · 미러는 프로필 값 그대로', async () => {
  await reset();
  engine.installSyncTransport(null);
  const me = await userRepo.getOrCreateLocalUser();
  await database.write(async () => {
    await me.update((p) => {
      p.bodyweightKg = 70;
    });
  });
  assert.deepEqual(await bwRepo.reconcileBodyweightMirror(), { created: null, mirrorChanged: false, mirrorKg: 70 });
  assert.equal((await rows()).length, 0);
});

test('이력 0 에서 첫 정리(로그인 기기) — 프로필 값을 bw-init 한 줄로 옮겨 심고, 두 번째는 쓰지 않는다', async () => {
  await reset();
  // 로그인 상태 흉내 — 정리는 isSyncLoggedIn 만 본다(받기·올리기는 부르지 않는다)
  engine.installSyncTransport({
    isLoggedIn: async () => true,
    pull: async () => ({ changes: {}, timestamp: Date.now() }),
    push: async () => {},
  });
  const me = await userRepo.getOrCreateLocalUser();
  // v25 시절 값(옛 경로 — 이력 없이 프로필 칸만)
  await database.write(async () => {
    await me.update((p) => {
      p.bodyweightKg = 75;
    });
  });
  const first = await bwRepo.reconcileBodyweightMirror();
  assert.equal(first.created, 'init');
  assert.deepEqual((await rows()).map((r) => r.id), [`bw-init-${me.id}`]);
  assert.deepEqual(await bwRepo.reconcileBodyweightMirror(), { created: null, mirrorChanged: false, mirrorKg: 75 });
  engine.installSyncTransport(null);
});

test('범위 밖 체중은 오류 — 아무것도 쓰지 않는다', async () => {
  await reset();
  const me = await userRepo.getOrCreateLocalUser();
  await assert.rejects(userRepo.updateUserSettings(me.id, { bodyweightKg: 400 }));
  assert.equal((await rows()).length, 0);
  assert.equal(await mirror(), null);
});
