// SPEC-055 Phase 1 — 운동 중 PR 축하 규칙(REV-118 D1~D5 · 실제 WatermelonDB · LokiJS 메모리)
// 중량 PR 만 · 종목 전체(변형 무시) 지난 최고 기준 · 처음 하는 종목은 축하 없음 · 보조 종목은 체중을 알아야 · 운동×종목 1회.
import './fixtures/wm/register.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { database } = await import('../../db/database');
const repo = await import('../../data/workoutRepository');

type Raw = Record<string, unknown>;

async function reset(): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
  repo.__resetSuspectBackfillForTest();
  repo.__resetLiveCelebratedForTest();
  repo.invalidateLivePrCache();
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

async function exercise(name: string, extra: Raw = {}): Promise<string> {
  return create('exercises', {
    name_ko: name,
    equipment: 'barbell',
    kind: 'strength',
    is_custom: true,
    is_archived: false,
    primary_muscles: '[]',
    secondary_muscles: '[]',
    substitute_ids: '[]',
    aliases: '[]',
    similar: '[]',
    ...extra,
  });
}

/** 운동 하나 — sets: [kg, reps][] · 진행 중이면 세트는 아직 안 한 상태 */
async function workout(at: number, exId: string, sets: [number, number][], opt: { state?: string; variant?: string | null } = {}) {
  const state = opt.state ?? 'completed';
  const workoutId = await create('workouts', {
    state,
    started_at: at - 3600_000,
    completed_at: state === 'completed' ? at : null,
    name: '운동',
    total_volume_kg: 0,
    pr_count: 0,
    accumulated_pause_ms: 0,
  });
  const weId = await create('workout_exercises', {
    workout_id: workoutId,
    exercise_id: exId,
    sort_order: 0,
    rest_seconds: 90,
    weight_unit: 'kg',
    variant_key: opt.variant ?? null,
  });
  const setIds: string[] = [];
  for (let i = 0; i < sets.length; i++) {
    setIds.push(
      await create('set_logs', {
        workout_exercise_id: weId,
        set_number: i + 1,
        weight_kg: sets[i][0],
        reps: sets[i][1],
        is_warmup: false,
        is_failed: false,
        user_edited: true,
        done: state === 'completed',
        completed_at: state === 'completed' ? at : null,
      }),
    );
  }
  return { workoutId, weId, setIds };
}

/** 진행 중 운동에 같은 종목 블록을 하나 더(다른 변형) */
async function addBlock(workoutId: string, exId: string, sets: [number, number][], variant: string | null) {
  const weId = await create('workout_exercises', {
    workout_id: workoutId,
    exercise_id: exId,
    sort_order: 1,
    rest_seconds: 90,
    weight_unit: 'kg',
    variant_key: variant,
  });
  const setIds: string[] = [];
  for (let i = 0; i < sets.length; i++) {
    setIds.push(
      await create('set_logs', {
        workout_exercise_id: weId,
        set_number: i + 1,
        weight_kg: sets[i][0],
        reps: sets[i][1],
        is_warmup: false,
        is_failed: false,
        user_edited: true,
        done: false,
      }),
    );
  }
  return { weId, setIds };
}

async function check(weId: string, setId: string, kg: number, reps: number) {
  await repo.setSetDone(setId, true);
  return repo.evalLiveSetPr(weId, setId, kg, reps);
}

const DAY = 86_400_000;

test('처음 하는 종목은 축하하지 않는다(지난 최고 0)', async () => {
  await reset();
  const ex = await exercise('벤치');
  const cur = await workout(3 * DAY, ex, [[60, 8], [70, 8]], { state: 'active' });
  assert.deepEqual(await check(cur.weId, cur.setIds[0], 60, 8), []);
  assert.deepEqual(await check(cur.weId, cur.setIds[1], 70, 8), []);
});

test('볼륨만 늘면 축하하지 않는다 · 무게가 넘으면 중량 PR 하나만', async () => {
  await reset();
  const ex = await exercise('벤치');
  await workout(1 * DAY, ex, [[60, 8]]);
  await workout(2 * DAY, ex, [[60, 8]]);
  const cur = await workout(3 * DAY, ex, [[60, 12], [62.5, 8]], { state: 'active' });
  assert.deepEqual(await check(cur.weId, cur.setIds[0], 60, 12), [], '60×12 는 볼륨만 늘었다');
  const prs = await check(cur.weId, cur.setIds[1], 62.5, 8);
  assert.deepEqual(
    prs.map((p) => p.type),
    ['maxWeight'],
  );
  assert.equal(prs[0].previous, 60);
  assert.equal(prs[0].current, 62.5);
});

test('한 운동에서 종목마다 1번 — 더 무거운 다음 세트·체크 해제 후 재체크도 다시 축하하지 않는다', async () => {
  await reset();
  const ex = await exercise('벤치');
  await workout(1 * DAY, ex, [[60, 8]]);
  await workout(2 * DAY, ex, [[60, 8]]);
  const cur = await workout(3 * DAY, ex, [[65, 8], [70, 8]], { state: 'active' });
  assert.equal((await check(cur.weId, cur.setIds[0], 65, 8)).length, 1);
  assert.deepEqual(await check(cur.weId, cur.setIds[1], 70, 8), [], '더 무거워도 두 번째는 없다');
  await repo.setSetDone(cur.setIds[0], false);
  assert.deepEqual(await check(cur.weId, cur.setIds[0], 65, 8), [], '다시 체크해도 없다');
});

test('빠르게 연달아 체크해도(동시에 판정) 종목마다 1번만 축하한다(코드 리뷰 M1)', async () => {
  await reset();
  const ex = await exercise('벤치');
  await workout(1 * DAY, ex, [[60, 8]]);
  await workout(2 * DAY, ex, [[60, 8]]);
  const cur = await workout(3 * DAY, ex, [[65, 8], [70, 8]], { state: 'active' });
  await repo.setSetDone(cur.setIds[0], true);
  await repo.setSetDone(cur.setIds[1], true);
  const [a, b] = await Promise.all([
    repo.evalLiveSetPr(cur.weId, cur.setIds[0], 65, 8),
    repo.evalLiveSetPr(cur.weId, cur.setIds[1], 70, 8),
  ]);
  assert.equal(a.length + b.length, 1);
});

test('PR 이 아니면 1회 키를 넣지 않는다 — 앞 세트가 PR 이 아니어도 뒤 세트가 PR 이면 축하', async () => {
  await reset();
  const ex = await exercise('벤치');
  await workout(1 * DAY, ex, [[60, 8]]);
  await workout(2 * DAY, ex, [[60, 8]]);
  const cur = await workout(3 * DAY, ex, [[55, 8], [65, 8]], { state: 'active' });
  assert.deepEqual(await check(cur.weId, cur.setIds[0], 55, 8), []);
  assert.equal((await check(cur.weId, cur.setIds[1], 65, 8)).length, 1);
});

test('다른 변형도 같은 기준 — 지난 운동이 다른 변형이어도 종목 전체 최고와 비교한다', async () => {
  await reset();
  const ex = await exercise('랫풀다운');
  await workout(1 * DAY, ex, [[70, 8]], { variant: 'grip:wide' });
  await workout(2 * DAY, ex, [[70, 8]], { variant: 'grip:wide' });
  // 기본 칸으로 60 — 다른 칸 지난 최고 70 이하라 축하 없음(예전엔 이 칸 처음이라 축하 안 함/비교 대상 달랐음)
  const cur = await workout(3 * DAY, ex, [[60, 8], [75, 8]], { state: 'active', variant: null });
  assert.deepEqual(await check(cur.weId, cur.setIds[0], 60, 8), []);
  assert.equal((await check(cur.weId, cur.setIds[1], 75, 8)).length, 1, '종목 전체 최고 70 을 넘었다');
});

// [원본] test('이번 운동의 앞선 다른 변형 세트도 기준에 든다') — 기준을 지난 완료 운동만으로 바꿨다(코드 리뷰 M1 · 종목마다 1번이라 이번 운동 세트와 겨루지 않는다)
test('기준은 지난 완료 운동만 — 이번 운동 다른 변형 세트가 앞서 있어도(그 세트가 축하 안 됐으면) 지난 최고를 넘으면 축하', async () => {
  await reset();
  const ex = await exercise('랫풀다운');
  await workout(1 * DAY, ex, [[60, 8]]);
  await workout(2 * DAY, ex, [[60, 8]]);
  const cur = await workout(3 * DAY, ex, [[60, 8]], { state: 'active', variant: null });
  const other = await addBlock(cur.workoutId, ex, [[80, 5]], 'grip:wide');
  await repo.setSetDone(other.setIds[0], true); // 판정 없이 끝난 세트(축하 전)
  assert.equal((await check(cur.weId, cur.setIds[0], 70, 8)).length, 1);
  // 그 뒤 다른 변형 80 은 같은 종목이라 다시 축하하지 않는다
  assert.deepEqual(await check(other.weId, other.setIds[0], 80, 5), []);
});

test('보조 종목은 체중을 모르면 축하하지 않는다 · 체중을 알면 유효 무게로 판정', async () => {
  await reset();
  const ex = await exercise('어시스트 풀업', { equipment: 'machine', load_mode: 'assisted' });
  await workout(1 * DAY, ex, [[30, 8]]);
  await workout(2 * DAY, ex, [[30, 8]]);
  const cur = await workout(3 * DAY, ex, [[20, 8]], { state: 'active' });
  // 체중을 모르면 입력 무게(40)가 그대로 유효 무게라 지난 30 보다 커 보인다 — 막음이 없으면 거짓 PR(코드 리뷰 M2)
  assert.deepEqual(await check(cur.weId, cur.setIds[0], 40, 8), [], '체중 없음');
  await create('user_profiles', { bodyweight_kg: 80 });
  // invalidateLivePrCache 를 부르지 않는다 — 체중이 캐시 키라 운동 중 체중을 적어도 기준이 바뀐다(코드 리뷰 M3)
  await repo.setSetDone(cur.setIds[0], false);
  const prs = await check(cur.weId, cur.setIds[0], 20, 8);
  assert.deepEqual(
    prs.map((p) => p.type),
    ['maxWeight'],
  );
  assert.equal(prs[0].current, 60); // 80 - 20
});
