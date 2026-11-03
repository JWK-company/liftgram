// 잠금 조작 적용기(SPEC-017 Phase 3 §5·§6) — 실제 WatermelonDB(LokiJS 메모리)에서 drain 의 판정·비교·워터마크·재실행을 고정한다.
// 데코레이터 모델·IndexedDB 어댑터는 fixtures/wm/loader.mjs 가 바꿔 끼운다.
import './fixtures/wm/register.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { database } = await import('../../db/database');
const repo = await import('../../data/workoutRepository');
const { drainLockActions, LockDrainKilled } = await import('../lockDrain');
const lock = await import('../lockScreen');

type Raw = Record<string, unknown>;

async function reset(): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}

async function create(table: string, raw: Raw): Promise<string> {
  let id = '';
  await database.write(async () => {
    const rec = await database.get(table).create((r) => {
      Object.assign(r._raw as unknown as Raw, raw);
    });
    id = rec.id;
  });
  return id;
}

/** 처방 블록 하나 — sets: [kg, reps, setType][] */
async function makeBlock(
  workoutId: string,
  order: number,
  name: string,
  rx: unknown[] | null,
  sets: [number, number, string | null][],
  group: string | null = null,
  opt: { unit?: 'kg' | 'lb'; mult?: number | null; source?: string; equipment?: string } = {},
): Promise<{ weId: string; setIds: string[] }> {
  const exId = await create('exercises', {
    name_ko: name,
    equipment: opt.equipment ?? 'barbell',
    kind: 'strength',
    is_custom: true,
    is_archived: false,
    primary_muscles: '[]',
    secondary_muscles: '[]',
    substitute_ids: '[]',
    aliases: '[]',
    similar: '[]',
  });
  const weId = await create('workout_exercises', {
    workout_id: workoutId,
    exercise_id: exId,
    sort_order: order,
    rest_seconds: 100,
    weight_unit: opt.unit ?? 'kg',
    superset_group: group,
    prescription: rx ? JSON.stringify(rx) : null,
  });
  const setIds: string[] = [];
  for (let i = 0; i < sets.length; i++) {
    const [kg, reps, type] = sets[i];
    setIds.push(
      await create('set_logs', {
        workout_exercise_id: weId,
        set_number: i + 1,
        weight_kg: kg,
        reps,
        is_warmup: type === 'warmup',
        is_failed: false,
        set_type: type,
        user_edited: false,
        value_source: opt.source ?? 'default',
        load_multiplier: opt.mult ?? null,
        done: false,
        completed_at: null,
      }),
    );
  }
  return { weId, setIds };
}

const rxTopBackoff = [
  { setType: 'top', targetRir: null, repMin: 5, repMax: 5, loadHint: null },
  { setType: 'backoff', targetRir: null, repMin: 5, repMax: 5, loadHint: null, loadBasis: 'pctTop', loadPct: 90 },
  { setType: 'backoff', targetRir: null, repMin: 5, repMax: 5, loadHint: null, loadBasis: 'pctTop', loadPct: 80 },
];

async function stored(id: string) {
  const s = (await database.get('set_logs').find(id))._raw as unknown as Raw;
  return { weightKg: s.weight_kg as number, reps: s.reps as number, done: s.done as boolean, completedAt: s.completed_at as number | null, source: s.value_source as string | null, userEdited: s.user_edited as boolean | null };
}


async function epoch(): Promise<string> {
  return (await repo.getLockDbEpoch()).epoch;
}

let seqN = 0;
function action(sessionId: string, dbEpoch: string, setIds: string[], expect: { setId: string; weightKg: number | null; reps: number | null }[] = [], over: Record<string, unknown> = {}) {
  seqN += 1;
  return {
    id: `a${seqN}`,
    storeId: 'S1',
    dbEpoch,
    seq: seqN,
    kind: 'complete' as const,
    sessionId,
    setIds,
    expect: expect.map((e) => ({ ...e, seconds: null })),
    at: 5000,
    ...over,
  };
}

test('drain — 완료·워터마크·같은 조작 재실행은 noop(완료 시각 그대로)·해제 뒤 옛 조작은 다시 완료하지 않는다', async () => {
  await reset();
  const w = await create('workouts', { state: 'active', started_at: 1000, name: 't' });
  const A = await makeBlock(w, 0, '스쿼트', null, [[100, 5, null], [100, 5, null]]);
  const e = await epoch();
  const a1 = action(w, e, [A.setIds[0]], [{ setId: A.setIds[0], weightKg: 100, reps: 5 }]);
  const r1 = await drainLockActions(repo, { actions: [a1], dbEpoch: e, now: 9000 });
  assert.equal(r1.applied, 1);
  assert.deepEqual(r1.handled, [a1.id]);
  assert.equal(r1.mismatches.length, 0);
  const s1 = await stored(A.setIds[0]);
  assert.equal(s1.done, true);
  assert.equal(s1.completedAt, 5000, '잠금 중 누른 시각');
  assert.deepEqual(await repo.getLockWatermark(), { storeId: 'S1', dbEpoch: e, seq: a1.seq });
  // 같은 조작이 다시 와도(ack 전에 앱이 죽음) 건너뛴다
  const r2 = await drainLockActions(repo, { actions: [a1], dbEpoch: e, now: 9500 });
  assert.equal(r2.applied + r2.noop, 0);
  assert.deepEqual(r2.handled, [a1.id]);
  // 앱에서 해제 → 옛 조작이 또 와도 다시 완료하지 않는다(H-3 해제 보존)
  await repo.setSetDone(A.setIds[0], false);
  await drainLockActions(repo, { actions: [a1], dbEpoch: e, now: 9600 });
  assert.equal((await stored(A.setIds[0])).done, false);
});

test('drain — 세트는 남고 워터마크 없음(kill) → 다시 drain 하면 noop · 완료 시각 그대로 · 워터마크 기록', async () => {
  await reset();
  const w = await create('workouts', { state: 'active', started_at: 1000, name: 't' });
  const A = await makeBlock(w, 0, '벤치', null, [[60, 8, null]]);
  const e = await epoch();
  const a = action(w, e, [A.setIds[0]], [], { at: 4000 });
  await assert.rejects(drainLockActions(repo, { actions: [a], dbEpoch: e, now: 9000, fault: 'kill-before-watermark' }), LockDrainKilled);
  assert.equal((await stored(A.setIds[0])).done, true);
  assert.equal(await repo.getLockWatermark(), null, '워터마크는 아직 없다');
  const r = await drainLockActions(repo, { actions: [a], dbEpoch: e, now: 9999 });
  assert.equal(r.noop, 1);
  assert.equal((await stored(A.setIds[0])).completedAt, 4000, 'noop 은 시각을 덮지 않는다');
  assert.equal((await repo.getLockWatermark())?.seq, a.seq);
});

test('drain — 버림: 다른 세션 · 다른 dbEpoch · 없는 세트 · 끝난 세션 / 묶음 일부만 없으면 남은 세트만 완료', async () => {
  await reset();
  const w = await create('workouts', { state: 'active', started_at: 1000, name: 't' });
  const A = await makeBlock(w, 0, '풀업', null, [[0, 8, null], [0, 8, null]], 'g');
  const B = await makeBlock(w, 1, '딥스', null, [[0, 10, null], [0, 10, null]], 'g');
  const e = await epoch();
  const r = await drainLockActions(repo, {
    actions: [action('other', e, [A.setIds[0]]), action(w, 'e-old', [A.setIds[0]]), action(w, e, ['nope'])],
    dbEpoch: e,
  });
  assert.equal(r.discarded, 3);
  assert.equal((await stored(A.setIds[0])).done, false);
  // 묶음 조작 중 한 세트가 지워졌다 — 남은 세트만 완료(REV-005 도메인 M-6)
  const ok = await drainLockActions(repo, { actions: [action(w, e, [A.setIds[1], 'gone'])], dbEpoch: e });
  assert.equal(ok.applied, 1);
  assert.equal((await stored(A.setIds[1])).done, true);
  // 끝난 세션
  await database.write(async () => {
    const rec = await database.get('workouts').find(w);
    await rec.update((x) => {
      (x._raw as unknown as Raw).state = 'completed';
    });
  });
  const done = await drainLockActions(repo, { actions: [action(w, e, [B.setIds[0]])], dbEpoch: e });
  assert.equal(done.discarded, 1);
  assert.equal((await stored(B.setIds[0])).done, false);
});

test('drain — 기대값과 저장값이 다르면 완료는 하고 두 값을 돌려준다 · lb 반올림 차이는 같다로 본다', async () => {
  await reset();
  const w = await create('workouts', { state: 'active', started_at: 1000, name: 't' });
  const A = await makeBlock(w, 0, '벤치', null, [[82.5, 8, null], [45.359237 * 2, 5, null]], null, { unit: 'lb' });
  const e = await epoch();
  const r = await drainLockActions(repo, {
    actions: [
      action(w, e, [A.setIds[0]], [{ setId: A.setIds[0], weightKg: 80, reps: 8 }]),
      // 200lb 를 kg 로 바꿀 때의 0.0001kg 차이 — 거짓 「다름」이 아니어야 한다
      action(w, e, [A.setIds[1]], [{ setId: A.setIds[1], weightKg: 90.7185, reps: 5 }]),
    ],
    dbEpoch: e,
  });
  assert.equal(r.applied, 2);
  assert.equal(r.mismatches.length, 1);
  assert.equal(r.mismatches[0].setId, A.setIds[0]);
  assert.equal(r.mismatches[0].seen.weightKg, 80);
  assert.equal(r.mismatches[0].saved.weightKg, 82.5);
  assert.equal(r.mismatches[0].unit, 'lb');
  assert.equal((await stored(A.setIds[0])).weightKg, 82.5, 'drain 은 값을 덮지 않는다');
  await repo.applyLockSeenValues([{ setId: A.setIds[0], seen: r.mismatches[0].seen }]);
  const after = await stored(A.setIds[0]);
  assert.equal(after.weightKg, 80);
  assert.equal(after.userEdited, true);
});

test('drain — 탑셋 조작 뒤 백오프가 처방대로 채워진다(시뮬레이션과 같음)', async () => {
  await reset();
  const w = await create('workouts', { state: 'active', started_at: 1000, name: 't' });
  const A = await makeBlock(w, 0, '벤치', rxTopBackoff, [[100, 5, 'top'], [20, 5, 'backoff'], [20, 5, 'backoff']]);
  const e = await epoch();
  const blocks = await repo.loadSimBlocks([A.weId]);
  const steps = lock.buildLockSteps([{ kind: 'single', block: { weId: A.weId, sets: blocks[0].sets } }]);
  const expect = lock.planLockQueueValues(blocks, steps);
  const acts = steps.map((st) => action(w, e, st.setIds, st.setIds.map((id) => ({ setId: id, weightKg: expect.get(id)?.weightKg ?? null, reps: expect.get(id)?.reps ?? null }))));
  const r = await drainLockActions(repo, { actions: acts, dbEpoch: e });
  assert.equal(r.applied, 3);
  assert.equal(r.mismatches.length, 0, '카드에 보인 값 = 저장값');
  assert.equal((await stored(A.setIds[1])).weightKg, 90);
  assert.equal((await stored(A.setIds[2])).weightKg, 80);
  assert.equal((await stored(A.setIds[1])).source, 'rx,default');
});

test('drain — 묶음(탑셋+백오프 × 일반) 대기열 전체: 단계마다 카드 기대값 = 완료 직전 저장값(시뮬레이션 = drain)', async () => {
  await reset();
  const w = await create('workouts', { state: 'active', started_at: 1000, name: 't' });
  const A = await makeBlock(w, 0, '벤치', rxTopBackoff, [[100, 5, 'top'], [20, 5, 'backoff'], [20, 5, 'backoff']], 'g');
  const B = await makeBlock(w, 1, '로우', null, [[60, 8, null], [60, 8, null], [60, 8, null]], 'g');
  const e = await epoch();
  const blocks = await repo.loadSimBlocks([A.weId, B.weId]);
  const steps = lock.buildLockSteps([{ kind: 'group', members: blocks.map((b) => ({ weId: b.weId, sets: b.sets })) }]);
  const expect = lock.planLockQueueValues(blocks, steps);
  const acts = steps.map((st) => action(w, e, st.setIds, st.setIds.map((id) => ({ setId: id, weightKg: expect.get(id)?.weightKg ?? null, reps: expect.get(id)?.reps ?? null }))));
  // 한 번에 하나씩 drain — 매번 「완료 직전 저장값」과 비교된다
  for (const a of acts) {
    const r = await drainLockActions(repo, { actions: [a], dbEpoch: e });
    assert.equal(r.mismatches.length, 0, `${a.id} 기대값 = 저장값`);
  }
  for (const id of [...A.setIds, ...B.setIds]) assert.equal((await stored(id)).done, true);
  assert.equal((await stored(A.setIds[2])).weightKg, 80);
});

test('drain — 다른 저장소(재설치)의 워터마크는 0 으로 본다 · seq 순서대로', async () => {
  await reset();
  const w = await create('workouts', { state: 'active', started_at: 1000, name: 't' });
  const A = await makeBlock(w, 0, '로우', null, [[50, 10, null], [50, 10, null]]);
  const e = await epoch();
  await repo.setLockWatermark({ storeId: 'OLD', dbEpoch: e, seq: 999 });
  const second = action(w, e, [A.setIds[1]], [], { storeId: 'S2', seq: 2 });
  const first = action(w, e, [A.setIds[0]], [], { storeId: 'S2', seq: 1 });
  const r = await drainLockActions(repo, { actions: [second, first], dbEpoch: e });
  assert.equal(r.applied, 2);
  assert.deepEqual(r.handled, [first.id, second.id]);
  assert.deepEqual(await repo.getLockWatermark(), { storeId: 'S2', dbEpoch: e, seq: 2 });
});

test('스냅샷 재료 — 행 순서·이름·출처·일시정지 · 끝난 운동은 null', async () => {
  await reset();
  const w = await create('workouts', { state: 'paused', started_at: 1000, name: '하체' });
  await makeBlock(w, 0, '스쿼트', null, [[100, 5, null]]);
  await makeBlock(w, 1, '런지', null, [[20, 10, null]], 'g');
  await makeBlock(w, 2, '레그컬', null, [[30, 12, null]], 'g');
  const inp = await repo.loadLockSnapshotInput(w);
  assert.ok(inp);
  assert.equal(inp.title, '하체');
  assert.equal(inp.paused, true);
  assert.deepEqual(inp.rows.map((r) => r.kind), ['single', 'group']);
  assert.deepEqual(inp.blocks.map((b) => b.exerciseName), ['스쿼트', '런지', '레그컬']);
  assert.equal(inp.blocks[0].sets[0].valueSource, 'default');
  const snap = lock.buildLockSnapshot({
    sessionId: w, title: inp.title, rows: inp.rows, blocks: inp.blocks,
    rest: { endsAt: null, totalSec: null, setAt: 0, by: 'web' }, appliedThroughSeq: 0, storeId: 'S', dbEpoch: 'E',
    paused: inp.paused, sound: { enabled: true, preset: 'a', volume: 2 }, now: 1, restAfter: (_s, b) => b.restSec,
  });
  assert.equal(snap.steps.length, 2);
  assert.equal(snap.steps[0].openApp, true, '기본값은 앱 열기');
  await database.write(async () => {
    const rec = await database.get('workouts').find(w);
    await rec.update((x) => {
      (x._raw as unknown as Raw).state = 'completed';
    });
  });
  assert.equal(await repo.loadLockSnapshotInput(w), null);
});

test('dbEpoch — 한 번 만들면 그대로 · DB 를 비우면 새로 만든다', async () => {
  await reset();
  const a = await repo.getLockDbEpoch();
  assert.equal(a.created, true);
  const b = await repo.getLockDbEpoch();
  assert.equal(b.created, false);
  assert.equal(b.epoch, a.epoch);
  await reset();
  const c = await repo.getLockDbEpoch();
  assert.equal(c.created, true);
  assert.notEqual(c.epoch, a.epoch);
});

test('drain — noop 이어도 채우기를 다시 돌린다(완료~채우기 사이 kill 복구 · REV-006 테스트 H-3)', async () => {
  await reset();
  const w = await create('workouts', { state: 'active', started_at: 1000, name: 't' });
  const A = await makeBlock(w, 0, '벤치', rxTopBackoff, [[100, 5, 'top'], [20, 5, 'backoff'], [20, 5, 'backoff']]);
  const e = await epoch();
  // 완료만 되고 채우기 전에 끊긴 상태를 흉내 — 채우기 없이 완료
  await repo.setSetDone(A.setIds[0], true);
  assert.equal((await stored(A.setIds[1])).weightKg, 20);
  const r = await drainLockActions(repo, { actions: [action(w, e, [A.setIds[0]])], dbEpoch: e });
  assert.equal(r.noop, 1);
  assert.equal((await stored(A.setIds[1])).weightKg, 90, 'noop 도 백오프를 채운다');
  assert.equal((await stored(A.setIds[2])).weightKg, 80);
});

test('drain — 라운드 기준 채우기: 조작한 세트가 아니라 라운드 전부를 기준으로 채운다(화면과 같음)', async () => {
  await reset();
  const w = await create('workouts', { state: 'active', started_at: 1000, name: 't' });
  const A = await makeBlock(w, 0, '벤치', rxTopBackoff, [[100, 5, 'top'], [20, 5, 'backoff'], [20, 5, 'backoff']], 'g');
  const B = await makeBlock(w, 1, '로우', null, [[60, 8, null], [60, 8, null], [60, 8, null]], 'g');
  const e = await epoch();
  // 짝짓기는 키 기준 [A.T] → [A.B1, B.1] → [A.B2, B.2] → [B.3] — 앱에서 A.T·A.B1 을 채우기 없이 완료
  await repo.setSetDone(A.setIds[0], true);
  await repo.setSetDone(A.setIds[1], true);
  // 채우기 기준 = 라운드 전부(화면 completeSetsFlow 의 fillSetIds 와 같다) — 조작한 세트만이 아니다
  let round: string[] = [];
  const spy = { ...repo, applyLockAction: async (...args: Parameters<typeof repo.applyLockAction>) => {
    const out = await repo.applyLockAction(...args);
    round = out.roundSetIds;
    return out;
  } } as unknown as Parameters<typeof drainLockActions>[0];
  const r = await drainLockActions(spy, { actions: [action(w, e, [B.setIds[0]])], dbEpoch: e });
  assert.equal(r.applied, 1);
  assert.equal((await stored(B.setIds[0])).done, true);
  assert.deepEqual([...round].sort(), [A.setIds[1], B.setIds[0]].sort(), '라운드 = [A.B1, B.1]');
  // 백오프에서 백오프는 채우지 않는다(탑셋 기준 처방) — 화면과 같이 A.B2 는 그대로
  assert.equal((await stored(A.setIds[2])).weightKg, 20);
});

test('drain — 완료 시각: 시작 전 시각은 시작 시각으로 자르고 · 이미 완료된 세트는 시각을 덮지 않는다(REV-006 테스트 M-11)', async () => {
  await reset();
  const w = await create('workouts', { state: 'active', started_at: 1000, name: 't' });
  const A = await makeBlock(w, 0, '스쿼트', null, [[100, 5, null], [100, 5, null], [100, 5, null]]);
  const e = await epoch();
  await drainLockActions(repo, { actions: [action(w, e, [A.setIds[0]], [], { at: 500 })], dbEpoch: e, now: 9000 });
  const c0 = (await stored(A.setIds[0])).completedAt as number;
  assert.ok(c0 >= 1000 && c0 <= 9000, `잘린 시각 ${c0}`);
  // 묶음 일부가 이미 완료 — 그 세트의 시각은 그대로
  await drainLockActions(repo, { actions: [action(w, e, [A.setIds[1]], [], { at: 3000 })], dbEpoch: e, now: 9000 });
  await drainLockActions(repo, { actions: [action(w, e, [A.setIds[1], A.setIds[2]], [], { at: 6000 })], dbEpoch: e, now: 9000 });
  assert.equal((await stored(A.setIds[1])).completedAt, 3000);
  assert.equal((await stored(A.setIds[2])).completedAt, 6000);
});

test('drain — 형식이 깨진 조작은 버리고(워터마크 그대로) id 가 있으면 ack 대상 · 뒤 조작은 계속 적용', async () => {
  await reset();
  const w = await create('workouts', { state: 'active', started_at: 1000, name: 't' });
  const A = await makeBlock(w, 0, '로우', null, [[50, 10, null]]);
  const e = await epoch();
  const good = action(w, e, [A.setIds[0]]);
  const bad = { id: 'bad', storeId: 'S1', seq: 'x' } as unknown as typeof good;
  const r = await drainLockActions(repo, { actions: [bad, null as unknown as typeof good, good], dbEpoch: e });
  assert.equal(r.malformed, 2);
  assert.equal(r.discarded, 2);
  assert.equal(r.applied, 1);
  assert.ok(r.handled.includes('bad'));
  assert.ok(r.handled.includes(good.id));
  assert.equal((await repo.getLockWatermark())?.seq, good.seq);
});

test('drain — 적용 예외: 처음엔 멈춤(stalled · 워터마크 그대로) · 같은 조작이 POISON_LIMIT 번 던지면 버리고 다음으로', async () => {
  await reset();
  const w = await create('workouts', { state: 'active', started_at: 1000, name: 't' });
  const A = await makeBlock(w, 0, '로우', null, [[50, 10, null], [50, 10, null]]);
  const e = await epoch();
  const poison = action(w, e, [A.setIds[0]]);
  const next = action(w, e, [A.setIds[1]]);
  const flaky = { ...repo, applyLockAction: async (a: { id: string }, ep: string, now?: number) => {
    if (a.id === poison.id) throw new Error('boom');
    return repo.applyLockAction(a as never, ep, now);
  } } as unknown as Parameters<typeof drainLockActions>[0];
  const fails = new Map<string, number>();
  const { POISON_LIMIT } = await import('../lockDrain');
  for (let i = 1; i < POISON_LIMIT; i++) {
    const r = await drainLockActions(flaky, { actions: [poison, next], dbEpoch: e, failCounts: fails });
    assert.equal(r.stalled, true);
    assert.deepEqual(r.handled, []);
    assert.equal((await stored(A.setIds[1])).done, false, '멈추면 뒤 조작도 미룬다');
  }
  const r = await drainLockActions(flaky, { actions: [poison, next], dbEpoch: e, failCounts: fails });
  assert.ok(!r.stalled);
  assert.equal(r.discarded, 1);
  assert.equal(r.applied, 1);
  assert.deepEqual(r.handled, [poison.id, next.id]);
  assert.equal(fails.size, 0);
});

test('본 값으로 바꾸기 뒤 다시 채우기 — 탑셋 값을 바꾸면 백오프도 본 값 기준(REV-006 저장소 M-2)', async () => {
  await reset();
  const w = await create('workouts', { state: 'active', started_at: 1000, name: 't' });
  const A = await makeBlock(w, 0, '벤치', rxTopBackoff, [[100, 5, 'top'], [20, 5, 'backoff'], [20, 5, 'backoff']]);
  const e = await epoch();
  const r = await drainLockActions(repo, { actions: [action(w, e, [A.setIds[0]], [{ setId: A.setIds[0], weightKg: 110, reps: 5 }])], dbEpoch: e });
  assert.equal(r.mismatches.length, 1);
  assert.equal((await stored(A.setIds[1])).weightKg, 90);
  await repo.applyLockSeenValues([{ setId: A.setIds[0], seen: r.mismatches[0].seen }]);
  await repo.refillLoadsAfter([A.setIds[0]]);
  // 110kg 기준 90%·80% (원판 단위 반올림) — 100kg 기준(90·80)이 아니어야 한다
  assert.notEqual((await stored(A.setIds[1])).weightKg, 90);
  assert.notEqual((await stored(A.setIds[2])).weightKg, 80);
  assert.ok(Math.abs((await stored(A.setIds[1])).weightKg - 99) <= 1.25);
});

// ── SPEC-019 잠금 운동 화면 — 바꾼 무게·횟수 ─────────────────────────────────────

test('SPEC-019 — values: 바꾼 무게·횟수로 완료(출처 user · mismatch 없음) · lb 블록은 표시 단위 역변환 · 바꾸지 않은 멤버는 그대로', async () => {
  await reset();
  const w = await create('workouts', { state: 'active', started_at: 1000, name: 't' });
  const A = await makeBlock(w, 0, '벤치', null, [[60, 8, null], [60, 8, null]], 'g1');
  const B = await makeBlock(w, 1, '로우', null, [[lock.LOCK_VALUE_MAX_KG / 20, 10, null]], 'g1', { unit: 'lb' });
  const e = await epoch();
  const a = action(
    w,
    e,
    [A.setIds[0], B.setIds[0]],
    [
      { setId: A.setIds[0], weightKg: 60, reps: 8 },
      { setId: B.setIds[0], weightKg: 50, reps: 10 },
    ],
    { values: [{ setId: A.setIds[0], weight: 62.5, reps: 6 }] },
  );
  const r = await drainLockActions(repo, { actions: [a], dbEpoch: e, now: 9000 });
  assert.equal(r.applied, 1);
  assert.equal(r.mismatches.length, 0);
  const sa = await stored(A.setIds[0]);
  assert.equal(sa.done, true);
  assert.equal(sa.weightKg, 62.5);
  assert.equal(sa.reps, 6);
  assert.equal(sa.userEdited, true);
  assert.match(String(sa.source), /user/);
  const sb = await stored(B.setIds[0]);
  assert.equal(sb.done, true);
  assert.equal(sb.weightKg, 50, '바꾸지 않은 멤버는 저장 값 그대로');

  // lb 블록 — 화면에 보인 100(lb) → 45.359237kg
  const C = await makeBlock(w, 2, '컬', null, [[20, 10, null]], null, { unit: 'lb' });
  const c = action(w, e, [C.setIds[0]], [], { values: [{ setId: C.setIds[0], weight: 100, reps: null }] });
  await drainLockActions(repo, { actions: [c], dbEpoch: e, now: 9100 });
  const sc = await stored(C.setIds[0]);
  assert.ok(Math.abs(sc.weightKg - 45.359237) < 1e-9);
  assert.equal(sc.reps, 10, 'reps null 은 그대로');
});

test('SPEC-019 — values 형식·범위: 깨진 values 는 조작 전체를 버림 · 범위 밖 값만 빼고 완료 · values 없는 옛 조작은 그대로', async () => {
  assert.equal(lock.wellFormedValues(undefined), true);
  assert.equal(lock.wellFormedValues([{ setId: 'x', weight: 1, reps: null }]), true);
  assert.equal(lock.wellFormedValues('x'), false);
  assert.equal(lock.wellFormedValues([{ setId: 1, weight: 1, reps: 1 }]), false);
  assert.equal(lock.wellFormedValues([{ setId: 'x', weight: Number.NaN, reps: 1 }]), false);
  assert.equal(lock.wellFormedValues([{ setId: 'x', weight: '5', reps: 1 }]), false);
  assert.deepEqual(lock.lockValueToSaved({ setId: 'x', weight: 2000, reps: 5 }, 'kg'), { reps: 5 });
  assert.deepEqual(lock.lockValueToSaved({ setId: 'x', weight: -1, reps: 1000 }, 'kg'), null);
  assert.deepEqual(lock.lockValueToSaved({ setId: 'x', weight: 0, reps: 0 }, 'kg'), { weightKg: 0, reps: 0 });

  await reset();
  const w = await create('workouts', { state: 'active', started_at: 1000, name: 't' });
  const A = await makeBlock(w, 0, '스쿼트', null, [[100, 5, null], [100, 5, null]]);
  const e = await epoch();
  const bad = action(w, e, [A.setIds[0]], [], { values: [{ setId: A.setIds[0], weight: 'x', reps: 5 }] });
  const r = await drainLockActions(repo, { actions: [bad as never], dbEpoch: e, now: 9000 });
  assert.equal(r.malformed, 1);
  assert.equal((await stored(A.setIds[0])).done, false);

  const out = action(w, e, [A.setIds[1]], [], { values: [{ setId: A.setIds[1], weight: 5000, reps: 3 }] });
  await drainLockActions(repo, { actions: [out], dbEpoch: e, now: 9100 });
  const s = await stored(A.setIds[1]);
  assert.equal(s.done, true);
  assert.equal(s.weightKg, 100, '범위 밖 무게는 버림');
  assert.equal(s.reps, 3);
});

// ── REV-014 보강 — 바꾼 칸만 · 남은 칸 「다름」 · 단위 · 낡은 처방값 · 유산소·범위 밖 setId · 멱등 ────────────────────

test('REV-014 #38·#39 — 같은 값은 쓰지 않음(저장 kg·출처 유지) · 정한 칸만 「다름」 비교에서 빼고 남은 칸은 비교', async () => {
  const lw = lock.lockValueWrite({ setId: 'x', weight: 61.23, reps: 8 }, { weightKg: 61.2349, reps: 8 }, 'kg');
  assert.deepEqual(lw.write, {}, '표시 정밀도로 같으면 쓰지 않는다');
  assert.deepEqual(lw.covered, { weight: true, reps: true });
  assert.deepEqual(lock.lockValueWrite({ setId: 'x', weight: null, reps: 6 }, { weightKg: 60, reps: 8 }, 'kg'), { write: { reps: 6 }, covered: { weight: false, reps: true }, chosen: { reps: 6 } });
  // 조작에 실린 단위가 블록 단위보다 먼저(#41)
  const u = lock.lockValueWrite({ setId: 'x', weight: 100, reps: null, unit: 'lb' }, { weightKg: 40, reps: 5 }, 'kg');
  assert.ok(Math.abs((u.write.weightKg ?? 0) - 45.359237) < 1e-9);
  assert.equal(lock.wellFormedValues([{ setId: 'x', weight: 1, reps: 1, unit: 'st' }]), false);

  await reset();
  const w = await create('workouts', { state: 'active', started_at: 1000, name: 't' });
  const A = await makeBlock(w, 0, '벤치', null, [[60, 8, null], [60, 8, null]], null, { source: 'prev' });
  const e = await epoch();
  // 무게는 그대로(60) · 횟수만 6 → 무게 칸 출처 prev 유지
  await drainLockActions(repo, { actions: [action(w, e, [A.setIds[0]], [{ setId: A.setIds[0], weightKg: 60, reps: 8 }], { values: [{ setId: A.setIds[0], weight: 60, reps: 6 }] })], dbEpoch: e, now: 9000 });
  const s0 = await stored(A.setIds[0]);
  assert.equal(s0.reps, 6);
  assert.equal(s0.weightKg, 60);
  assert.match(String(s0.source), /^prev,user$/, '무게 칸 출처는 그대로');
  // 횟수만 정했는데 그 사이 무게가 바뀌었다(본 값 55) → 「다름」은 남는다
  const r = await drainLockActions(repo, { actions: [action(w, e, [A.setIds[1]], [{ setId: A.setIds[1], weightKg: 55, reps: 8 }], { values: [{ setId: A.setIds[1], weight: null, reps: 7 }] })], dbEpoch: e, now: 9100 });
  assert.equal(r.mismatches.length, 1, '정하지 않은 무게 칸의 다름은 알린다');
  assert.equal((await stored(A.setIds[1])).reps, 7);
  // 안내의 본 값: 무게 = 카드에 본 값 · 횟수 = 잠금에서 정한 값 / 저장 값 = 쓴 뒤(REV-015 정합성 #1)
  assert.deepEqual([r.mismatches[0].seen.weightKg, r.mismatches[0].seen.reps], [55, 7]);
  assert.deepEqual([r.mismatches[0].saved.weightKg, r.mismatches[0].saved.reps], [60, 7]);
  // 「본 값으로 바꾸기」가 잠금에서 고친 횟수를 되돌리지 않는다
  await repo.applyLockSeenValues([{ setId: A.setIds[1], seen: r.mismatches[0].seen }]);
  assert.equal((await stored(A.setIds[1])).reps, 7);
  assert.equal((await stored(A.setIds[1])).weightKg, 55);
});

test('REV-014 #37 — 탑셋을 잠금에서 고친 뒤 백오프는 보인 값(옛 계산) 그대로 기록 · 「다름」 없음', async () => {
  await reset();
  const w = await create('workouts', { state: 'active', started_at: 1000, name: 't' });
  const A = await makeBlock(w, 0, '벤치', rxTopBackoff, [[100, 5, 'top'], [90, 5, 'backoff'], [80, 5, 'backoff']], null, { source: 'rx' });
  const e = await epoch();
  const top = action(w, e, [A.setIds[0]], [{ setId: A.setIds[0], weightKg: 100, reps: 5 }], { values: [{ setId: A.setIds[0], weight: 105, reps: null }] });
  // 네이티브 사본의 백오프는 옛 계산 90 — 보인 값을 values 로 싣는다
  const back = action(w, e, [A.setIds[1]], [{ setId: A.setIds[1], weightKg: 90, reps: 5 }], { values: [{ setId: A.setIds[1], weight: 90, reps: 5 }] });
  const r = await drainLockActions(repo, { actions: [top, back], dbEpoch: e, now: 9000 });
  assert.equal(r.applied, 2);
  assert.equal(r.mismatches.length, 0);
  assert.equal((await stored(A.setIds[0])).weightKg, 105);
  assert.equal((await stored(A.setIds[1])).weightKg, 90, '사용자가 든 값');
  assert.equal((await stored(A.setIds[1])).userEdited, true);
});

test('REV-014 #42·L-5 — 유산소 세트·setIds 밖·이미 완료 세트의 values 무시 · 같은 조작 재적용은 noop(값 그대로)', async () => {
  await reset();
  const w = await create('workouts', { state: 'active', started_at: 1000, name: 't' });
  const A = await makeBlock(w, 0, '스쿼트', null, [[100, 5, null], [100, 5, null]]);
  const e = await epoch();
  const a = action(w, e, [A.setIds[0]], [], { values: [{ setId: A.setIds[0], weight: 110, reps: 4 }, { setId: A.setIds[1], weight: 1, reps: 1 }] });
  await drainLockActions(repo, { actions: [a], dbEpoch: e, now: 9000 });
  assert.equal((await stored(A.setIds[1])).weightKg, 100, 'setIds 밖 values 는 무시');
  assert.equal((await stored(A.setIds[1])).done, false);
  // 같은 조작 재적용(워터마크 뒤 다른 저장소로 다시 와도) — 이미 완료라 값을 덮지 않는다
  const again = { ...a, id: 'again', storeId: 'S2', values: [{ setId: A.setIds[0], weight: 200, reps: 1 }] };
  const r2 = await drainLockActions(repo, { actions: [again], dbEpoch: e, now: 9100 });
  assert.equal(r2.applied, 0, '이미 완료 — 다시 쓰지 않는다');
  assert.equal((await stored(A.setIds[0])).weightKg, 110);
  // 유산소(시간 세트)
  const C = await makeBlock(w, 1, '러닝', null, [[0, 0, null]]);
  await database.write(async () => {
    const rec = await database.get('set_logs').find(C.setIds[0]);
    await rec.update((x) => { (x._raw as unknown as Raw).duration_sec = 600; });
  });
  await drainLockActions(repo, { actions: [action(w, e, [C.setIds[0]], [], { values: [{ setId: C.setIds[0], weight: 50, reps: 5 }] })], dbEpoch: e, now: 9200 });
  const sc = await stored(C.setIds[0]);
  assert.equal(sc.done, true);
  assert.equal(sc.weightKg, 0);
  assert.equal(sc.reps, 0);
});
