// 완료 흐름(SPEC-017 Phase 2 §5·§10) — 실제 WatermelonDB(LokiJS 메모리)에서 「시뮬레이션 결과 = 실제 drain 뒤 DB」를 고정한다.
// 데코레이터 모델·IndexedDB 어댑터는 fixtures/wm/loader.mjs 가 바꿔 끼운다.
import './fixtures/wm/register.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { database } = await import('../../db/database');
const repo = await import('../../data/workoutRepository');
const { completeSetsFlow } = await import('../completeSetsFlow');
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

/** 시뮬레이션 = drain 공용 — 단계마다 「완료 직전 저장값 = 기대값」을 보고, 잠금 drain 경로(completeSetsFlow + lockRoundOf)로 완료한다. */
async function simEqualsDrain(weIds: string[], grouped: boolean, unit: 'kg' | 'lb' = 'kg') {
  const blocks = await repo.loadSimBlocks(weIds);
  const members = blocks.map((b) => ({ weId: b.weId, sets: b.sets }));
  const rows = grouped ? [{ kind: 'group' as const, members }] : members.map((m) => ({ kind: 'single' as const, block: m }));
  const steps = lock.buildLockSteps(rows);
  const expect = lock.planLockQueueValues(blocks, steps);
  let at = 2000;
  for (const st of steps) {
    for (const id of st.setIds) {
      const now = await stored(id);
      const e = expect.get(id);
      assert.ok(e, `기대값 ${id}`);
      assert.ok(
        lock.sameAtDisplayPrecision({ weightKg: now.weightKg, reps: now.reps, seconds: null }, e, unit),
        `${id}: 저장 ${now.weightKg} vs 기대 ${e.weightKg}`,
      );
    }
    const fillSetIds = grouped ? [...new Set(st.setIds.flatMap((id) => lock.lockRoundOf(members, id)))] : st.setIds;
    await completeSetsFlow(repo, { workoutExerciseIds: weIds, setIds: st.setIds, fillSetIds, at: (at += 1000) });
  }
  return { steps, expect };
}

test('시뮬레이션 = drain — 탑셋+백오프 묶음을 단계마다 completeSetsFlow 로 완료하면 DB 값이 기대값과 같다', async () => {
  await reset();
  const workoutId = await create('workouts', { state: 'active', started_at: 1000, name: '테스트' });
  const A = await makeBlock(workoutId, 0, '벤치', rxTopBackoff, [[100, 5, 'top'], [20, 5, 'backoff'], [20, 5, 'backoff']], 'g');
  const B = await makeBlock(workoutId, 1, '로우', null, [[60, 8, null], [60, 8, null], [60, 8, null]], 'g');
  const weIds = [A.weId, B.weId];
  const blocks = await repo.loadSimBlocks(weIds);
  const members = blocks.map((b) => ({ weId: b.weId, sets: b.sets }));
  const steps = lock.buildLockSteps([{ kind: 'group', members }]);
  // 화면과 같은 짝 키 — 탑셋은 짝이 없고 백오프 1·2 가 B 의 1·2 와 짝(REV-005 도메인 M-3)
  assert.deepEqual(
    steps.map((s) => s.setIds),
    [[A.setIds[0]], [A.setIds[1], B.setIds[0]], [A.setIds[2], B.setIds[1]], [B.setIds[2]]],
  );
  const expect = lock.planLockQueueValues(blocks, steps);

  let at = 2000;
  for (const st of steps) {
    // 완료 직전(같은 순간) 저장값 = 카드에 보인 기대값
    for (const id of st.setIds) {
      const now = await stored(id);
      const e = expect.get(id);
      assert.ok(e, `기대값 ${id}`);
      assert.ok(lock.sameAtDisplayPrecision({ weightKg: now.weightKg, reps: now.reps, seconds: null }, e, 'kg'), `${id}: 저장 ${now.weightKg} vs 기대 ${e.weightKg}`);
    }
    // 잠금 drain 경로: 실린 setIds + 위치 기준 라운드 짝으로 채운다
    const fillSetIds = [...new Set(st.setIds.flatMap((id) => lock.lockRoundOf(members, id)))];
    const r = await completeSetsFlow(repo, { workoutExerciseIds: weIds, setIds: st.setIds, fillSetIds, at: (at += 1000) });
    assert.deepEqual(r.changed.sort(), [...st.setIds].sort());
  }
  assert.equal((await stored(A.setIds[1])).weightKg, 90);
  assert.equal((await stored(A.setIds[2])).weightKg, 80);
  assert.equal((await stored(A.setIds[1])).source, 'rx,default'); // 칸별 — 무게 rx · 횟수는 그대로(REV-005 H-1)
});

test('noop — 이미 완료된 세트를 다시 완료해도 완료 시각을 덮지 않고 changed 가 비어 있다 · 완료 시각 = at', async () => {
  await reset();
  const workoutId = await create('workouts', { state: 'active', started_at: 1000, name: '테스트' });
  const A = await makeBlock(workoutId, 0, '스쿼트', null, [[100, 5, null]]);
  const first = await completeSetsFlow(repo, { workoutExerciseIds: [A.weId], setIds: A.setIds, at: 5000 });
  assert.deepEqual(first.changed, A.setIds);
  assert.equal((await stored(A.setIds[0])).completedAt, 5000);
  assert.equal(first.restSec, 100);
  const again = await completeSetsFlow(repo, { workoutExerciseIds: [A.weId], setIds: A.setIds, at: 9000 });
  assert.deepEqual(again.changed, []);
  assert.equal((await stored(A.setIds[0])).completedAt, 5000);
  // setSetDone 도 같은 규칙
  assert.equal(await repo.setSetDone(A.setIds[0], true, 12_000), false);
  assert.equal((await stored(A.setIds[0])).completedAt, 5000);
});

test('출처 — 입력 중 값 저장은 user · 처방 채우기는 rx(횟수 칸이 더 약하면 그대로) · 세트 추가 복제', async () => {
  await reset();
  const workoutId = await create('workouts', { state: 'active', started_at: 1000, name: '테스트' });
  const A = await makeBlock(workoutId, 0, '데드', rxTopBackoff, [[100, 5, 'top'], [20, 5, 'backoff'], [20, 5, 'backoff']]);
  await database.write(async () => {
    const s = await database.get('set_logs').find(A.setIds[2]);
    await s.update((r) => {
      (r._raw as unknown as Raw).value_source = 'rx';
    });
  });
  await completeSetsFlow(repo, {
    workoutExerciseIds: [A.weId],
    setIds: [A.setIds[0]],
    at: 3000,
    values: new Map([[A.setIds[0], { weightKg: 110, reps: 5 }]]),
    writeValues: true,
  });
  const top = await stored(A.setIds[0]);
  assert.deepEqual([top.weightKg, top.source, top.userEdited], [110, 'user,default', true]); // 바꾼 칸(무게)만 user
  assert.equal((await stored(A.setIds[1])).weightKg, 100); // 110 × 90% = 99 → 바벨 원판 2.5 반올림
  assert.equal((await stored(A.setIds[2])).source, 'rx');
  assert.equal((await stored(A.setIds[1])).source, 'rx,default');
  // 처방이 채운 뒤 무게 칸은 rx — 횟수 칸도 rx 였다면 「앱 열기」가 아니다
  assert.equal(lock.lockNeedsOpenApp({ userEdited: false, valueSource: lock.withFieldSource('default,rx', 'weight', 'rx') }), false);

  // 세트 추가 — 직전이 미완료 기본값이면 copied_default · 완료했거나 사람이 고친 세트면 user · 값을 넘기면 user
  const B = await makeBlock(workoutId, 1, '컬', null, [[10, 12, null]]);
  const c1 = await repo.addSet(B.weId);
  assert.equal(c1.valueSource, 'copied_default');
  assert.equal(lock.lockNeedsOpenApp({ userEdited: c1.userEdited, valueSource: c1.valueSource }), true);
  await repo.updateSetLog(c1.id, { weightKg: 12 });
  assert.equal((await stored(c1.id)).source, 'user,copied_default'); // 고친 칸만 user
  const c2 = await repo.addSet(B.weId);
  assert.equal(c2.valueSource, 'user');
  const c3 = await repo.addSet(B.weId, { weightKg: 14, reps: 10 });
  assert.equal(c3.valueSource, 'user');
});

test('블록 휴식 저장 — 시트를 닫을 때 한 번 · 같으면 쓰지 않는다', async () => {
  await reset();
  const workoutId = await create('workouts', { state: 'active', started_at: 1000, name: '테스트' });
  const A = await makeBlock(workoutId, 0, '프레스', null, [[40, 8, null]]);
  assert.equal(await repo.setWorkoutExerciseRestSeconds(A.weId, 150), true);
  assert.equal(await repo.setWorkoutExerciseRestSeconds(A.weId, 150), false);
  const we = (await database.get('workout_exercises').find(A.weId))._raw as unknown as Raw;
  assert.equal(we.rest_seconds, 150);
});

const rxPct1rm = [
  { setType: 'normal', targetRir: null, repMin: 10, repMax: 10, loadHint: null, loadBasis: 'pct1rm', loadPct: 70 },
  { setType: 'normal', targetRir: null, repMin: 8, repMax: 8, loadHint: null, loadBasis: 'pct1rm', loadPct: 75 },
  { setType: 'normal', targetRir: null, repMin: 8, repMax: 8, loadHint: null, loadBasis: 'pct1rm', loadPct: 70 },
];

test('시뮬레이션 = drain — pct1rm 연쇄(기록 없는 칸 · 완료마다 다시 채움)', async () => {
  await reset();
  const workoutId = await create('workouts', { state: 'active', started_at: 1000, name: '테스트' });
  const A = await makeBlock(workoutId, 0, '스쿼트', rxPct1rm, [[60, 10, null], [20, 8, null], [20, 8, null]]);
  const { expect } = await simEqualsDrain([A.weId], false);
  assert.ok((expect.get(A.setIds[1])?.weightKg ?? 0) > 20);
  assert.equal((await stored(A.setIds[2])).done, true);
});

test('시뮬레이션 = drain — 1RM 기록이 있으면(has1rm) pct1rm 은 다시 채우지 않는다', async () => {
  await reset();
  const past = await create('workouts', { state: 'completed', started_at: 10, completed_at: 20, name: '지난' });
  const P = await makeBlock(past, 0, '벤치', null, [[100, 5, null]]);
  await database.write(async () => {
    const s = await database.get('set_logs').find(P.setIds[0]);
    await s.update((r) => { (r._raw as unknown as Raw).done = true; });
  });
  const exId = ((await database.get('workout_exercises').find(P.weId))._raw as unknown as Raw).exercise_id as string;
  const workoutId = await create('workouts', { state: 'active', started_at: 1000, name: '테스트' });
  const weId = await create('workout_exercises', {
    workout_id: workoutId, exercise_id: exId, sort_order: 0, rest_seconds: 100, weight_unit: 'kg', prescription: JSON.stringify(rxPct1rm),
  });
  const ids: string[] = [];
  for (let i = 0; i < 3; i++)
    ids.push(await create('set_logs', { workout_exercise_id: weId, set_number: i + 1, weight_kg: 77.5, reps: 8, is_warmup: false, is_failed: false, user_edited: false, value_source: 'rx', done: false }));
  const blocks = await repo.loadSimBlocks([weId]);
  assert.equal(blocks[0].has1rm, true);
  await simEqualsDrain([weId], false);
  assert.equal((await stored(ids[2])).weightKg, 77.5);
});

test('시뮬레이션 = drain — lb 블록 · 플레이트 한쪽(배수 2) · 묶음 멤버 무게 다름', async () => {
  await reset();
  const workoutId = await create('workouts', { state: 'active', started_at: 1000, name: '테스트' });
  const lb = 0.45359237;
  const A = await makeBlock(workoutId, 0, '벤치', rxTopBackoff, [[225 * lb, 5, 'top'], [20, 5, 'backoff'], [20, 5, 'backoff']], 'g', { unit: 'lb' });
  const B = await makeBlock(workoutId, 1, '레그프레스', rxTopBackoff, [[50, 5, 'top'], [10, 5, 'backoff'], [10, 5, 'backoff']], 'g', { mult: 2, equipment: 'machine' });
  await simEqualsDrain([A.weId, B.weId], true, 'lb');
  // 한쪽 입력 — 계산 무게 100 의 90% = 90 → 한쪽 45
  assert.equal((await stored(B.setIds[1])).weightKg, 45);
  // 225lb × 90% = 202.5 → lb 바벨 5lb 반올림 205
  assert.ok(Math.abs((await stored(A.setIds[1])).weightKg / lb - 205) < 0.01, `lb 백오프 ${(await stored(A.setIds[1])).weightKg / lb}`);
});

test('휴식 — 세트 유형별(탑셋 180초) · 이미 완료한 세트를 다른 값으로 다시 완료해도 완료 시각은 그대로', async () => {
  await reset();
  const workoutId = await create('workouts', { state: 'active', started_at: 1000, name: '테스트' });
  const A = await makeBlock(workoutId, 0, '데드', rxTopBackoff, [[100, 5, 'top'], [20, 5, 'backoff'], [20, 5, 'backoff']]);
  const r = await completeSetsFlow(repo, { workoutExerciseIds: [A.weId], setIds: [A.setIds[0]], at: 4000 });
  assert.equal(r.restSec, 180);
  const again = await completeSetsFlow(repo, {
    workoutExerciseIds: [A.weId], setIds: [A.setIds[0]], at: 9000,
    values: new Map([[A.setIds[0], { weightKg: 105, reps: 5 }]]), writeValues: true,
  });
  assert.deepEqual(again.changed, []); // 완료 상태는 그대로 — noop
  const top = await stored(A.setIds[0]);
  assert.deepEqual([top.weightKg, top.completedAt], [105, 4000]);
});

test('채우기 — 그 사이 사람이 고친 세트는 건너뛰고, 실제로 쓴 것만 돌려준다', async () => {
  await reset();
  const workoutId = await create('workouts', { state: 'active', started_at: 1000, name: '테스트' });
  const A = await makeBlock(workoutId, 0, '벤치', rxTopBackoff, [[100, 5, 'top'], [20, 5, 'backoff'], [20, 5, 'backoff']]);
  const applied = await repo.applyLoadFills([
    { setLogId: A.setIds[1], weightKg: 90 },
    { setLogId: A.setIds[2], weightKg: 80 },
  ]);
  assert.deepEqual(applied, [A.setIds[1], A.setIds[2]]);
  await repo.updateSetLog(A.setIds[2], { weightKg: 70 });
  const again = await repo.applyLoadFills([{ setLogId: A.setIds[2], weightKg: 80 }]);
  assert.deepEqual(again, []);
  assert.equal((await stored(A.setIds[2])).weightKg, 70);
});

