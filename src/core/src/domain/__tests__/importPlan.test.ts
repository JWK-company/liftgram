// @plm SRS-081 SRS-082  가져오기 계획 — 칸 값 계약(D-12) · 운동·세트·총 볼륨 일치 · lb 변환 · TZ 두 곳 같은 id(D-7) ·
// 재실행 전부 건너뜀 · 묶음 자르기(≤2000행) · 1만 세트 계획 시간. 시험 파일 값은 전부 지어낸 것.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { KG_PER_LB } from '../units';
import { parseImportFile, distinctExerciseNames } from '../import/parse';
import { importAliasId, importCustomExerciseId, importWorkoutId } from '../import/hash';
import {
  buildImportPlan,
  chunkPlannedWorkouts,
  ImportPlanError,
  plannedIds,
  type ExerciseDecision,
  type ExerciseInfo,
  type ImportPlan,
  type PlanInput,
} from '../import/plan';
import { generateLargeStrongCsv } from './fixtures/import/generateLarge';

const fx = (name: string) => readFileSync(new URL(`./fixtures/import/${name}`, import.meta.url), 'utf8');
const NOW = Date.UTC(2026, 9, 27, 3, 0, 0);
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

const INFO: Record<string, ExerciseInfo> = {
  'seed-barbell-bench-press': { equipment: 'barbell' },
  'seed-triceps-pushdown': { equipment: 'cable' },
  'seed-barbell-squat': { equipment: 'barbell' },
  'seed-running': { equipment: 'bodyweight' },
  'seed-deadlift': { equipment: 'barbell' },
  'seed-lat-pulldown': { equipment: 'cable' },
  'seed-leg-press': { equipment: 'machine' },
  'seed-pull-up': { equipment: 'bodyweight' },
  'seed-dumbbell-curl': { equipment: 'dumbbell' },
};
const DEFAULT: Record<string, ExerciseDecision> = {
  'Bench Press (Barbell)': { kind: 'existing', exerciseId: 'seed-barbell-bench-press' },
  'Triceps Pushdown (Cable - Rope)': { kind: 'existing', exerciseId: 'seed-triceps-pushdown', variant: { attach: 'rope' } },
  'Triceps Pushdown (Cable)': { kind: 'existing', exerciseId: 'seed-triceps-pushdown' },
  'Squat (Barbell)': { kind: 'existing', exerciseId: 'seed-barbell-squat' },
  Running: { kind: 'existing', exerciseId: 'seed-running' },
  'Deadlift (Barbell)': { kind: 'existing', exerciseId: 'seed-deadlift' },
  'Lat Pulldown (Cable)': { kind: 'existing', exerciseId: 'seed-lat-pulldown' },
  'Leg Press (Machine)': { kind: 'existing', exerciseId: 'seed-leg-press' },
  'Bicep Curl (Dumbbell)': { kind: 'existing', exerciseId: 'seed-dumbbell-curl', remember: true },
};

function plan(file: string, over: Partial<PlanInput> = {}, decisions: Record<string, ExerciseDecision> = DEFAULT): ImportPlan {
  const parsed = parseImportFile(file);
  const d = new Map<string, ExerciseDecision>();
  for (const n of distinctExerciseNames(parsed)) d.set(n, decisions[n] ?? { kind: 'custom' });
  return buildImportPlan({
    parsed,
    decisions: d,
    exerciseInfo: new Map(Object.entries(INFO)),
    bodyweightKg: 75,
    fileLabel: 'test',
    now: NOW,
    batchId: 'ib-test',
    tzOffsetMin: 540,
    ...over,
  });
}

test('Strong 쉼표 kg — 운동·종목 줄·세트·총 볼륨 일치', () => {
  const p = plan(fx('strong-comma.csv'), { weightUnit: 'kg' });
  assert.equal(p.stats.workouts, 2);
  assert.equal(p.stats.workoutExercises, 4);
  assert.equal(p.stats.sets, 9);
  assert.equal(p.stats.rows, 15);
  // 벤치 80×5×2 + 드롭 60×8 + 푸시다운 25×12(F 제외·W 제외) = 1580 · 스쿼트 100×5×2 = 1000 · 러닝 0
  close(p.workouts[0].row.total_volume_kg as number, 1580);
  close(p.workouts[1].row.total_volume_kg as number, 1000);
  close(p.stats.totalVolumeKg, 2580);
  assert.equal(p.batch.weightUnit, 'kg');
  assert.equal(p.batch.tzOffsetMin, 540);
  const run = p.workouts[1].sets.at(-1);
  assert.equal(run?.distance_m, 3200); // 단위 없는 파일 + kg → km
  assert.equal(run?.duration_sec, 1200);
});

test('칸 값 계약(D-12)', () => {
  const p = plan(fx('strong-comma.csv'), { weightUnit: 'kg' });
  const w = p.workouts[0];
  const started = Date.UTC(2026, 7, 25, 10, 10, 0) - 540 * 60_000;
  assert.deepEqual(
    { ...w.row },
    {
      id: importWorkoutId('strong', '2026-08-25T10:10:00'),
      user_id: null,
      routine_id: null,
      name: 'Push Day',
      state: 'completed',
      started_at: started,
      paused_at: null,
      accumulated_pause_ms: 0,
      completed_at: started + 3900 * 1000,
      total_volume_kg: 1580,
      duration_seconds: 3900,
      pr_count: 0,
      notes: '가슴 날, 컨디션 좋음',
      source: 'strong',
      import_batch_id: 'ib-test',
      created_at: NOW,
      updated_at: NOW,
    },
  );
  const kinds = w.sets.map((s) => [s.is_warmup, s.is_drop, s.is_failed, s.set_type]);
  assert.deepEqual(kinds, [
    [true, false, false, 'warmup'],
    [false, false, false, null],
    [false, false, false, null],
    [false, true, false, null],
    [false, false, false, null],
    [false, false, true, null],
  ]);
  for (const s of p.workouts.flatMap((x) => x.sets)) {
    assert.equal(s.done, true);
    assert.equal(s.completed_at, null);
    assert.equal(s.user_edited, false);
    assert.equal(s.rir, null); // rpe 만 있으면 읽을 때 effectiveRir 가 환산
    assert.equal(s.created_at, NOW);
    assert.equal(s.updated_at, NOW);
  }
  assert.equal(w.sets[1].rpe, 8);
  assert.deepEqual(w.sets.map((s) => s.set_number), [1, 2, 3, 4, 1, 2]);
  const we = w.exercises;
  assert.equal(we[0].weight_unit, null);
  assert.equal(we[0].note, '그립 좁게');
  assert.equal(we[1].variant_attach, 'rope');
  assert.equal(we[1].variant_key, 'attach:rope');
  assert.equal(we[0].variant_key, null);
  assert.equal(we[1].variant_equipment, null); // 기구 값은 칸이 아니다(ADR-034)
  // 시간 없는 운동은 completed_at = started
  const p2 = plan(fx('strong-comma.csv').replace(/,1h 5m,/g, ',,'), { weightUnit: 'kg' });
  assert.equal(p2.workouts[0].row.completed_at, p2.workouts[0].row.started_at);
  assert.equal(p2.workouts[0].row.duration_seconds, null);
});

test('lb — kg 정규화 · 종목 줄 weight_unit=lb · 묶음 단위 · 거리 마일', () => {
  const p = plan(fx('strong-comma.csv'), { weightUnit: 'lb' });
  close(p.stats.totalVolumeKg, 2580 * KG_PER_LB);
  close(p.workouts[0].sets[1].weight_kg as number, 80 * KG_PER_LB);
  assert.ok(p.workouts.every((w) => w.exercises.every((e) => e.weight_unit === 'lb')));
  assert.equal(p.batch.weightUnit, 'lb');
  close(p.workouts[1].sets.at(-1)?.distance_m as number, 3.2 * 1609.344);
  // 단위가 없는 파일은 단위를 골라야 한다
  assert.throws(() => plan(fx('strong-comma.csv')), (e: unknown) => e instanceof ImportPlanError && e.code === 'unit_required');

  const h = plan(fx('hevy-lb.csv'));
  assert.equal(h.batch.weightUnit, 'lb'); // 파일이 밝힌 단위
  close(h.stats.totalVolumeKg, 6250 * KG_PER_LB);
  close(h.workouts[1].sets[0].distance_m as number, 2 * 1609.344);
  assert.equal(h.workouts[0].row.duration_seconds, 4200);
});

test('Strong 세미콜론 · Hevy kg — 볼륨·같은 시각 두 운동 순번·슈퍼셋', () => {
  const s = plan(fx('strong-semicolon.csv'));
  assert.equal(s.stats.workouts, 2);
  close(s.stats.totalVolumeKg, 140.5 * 3 + 55 * 10);
  assert.equal(s.workouts[0].id, importWorkoutId('strong', '2026-09-01T07:00:00'));
  assert.equal(s.workouts[1].id, importWorkoutId('strong', '2026-09-01T07:00:00', 2));
  assert.equal(s.workouts[1].sets[0].distance_m, 2000);

  const h = plan(fx('hevy-kg.csv'));
  assert.equal(h.stats.workouts, 2);
  assert.equal(h.stats.sets, 6);
  close(h.stats.totalVolumeKg, 82.5 * 5 + 14 * 12 + 30 * 10);
  const [, curl, push] = h.workouts[0].exercises;
  assert.ok(curl.superset_group);
  assert.equal(curl.superset_group, push.superset_group);
  assert.equal(h.workouts[1].sets[0].distance_m, 5000);
  assert.equal(h.workouts[0].row.source, 'hevy');
});

// 기기 시간대 두 곳(Asia/Seoul +540 · America/New_York 8월 −240)을 오프셋으로 흉내 낸다. 기기 시간대 경로(tzOffsetMin 없음)는
// 같은 스위트를 `TZ=Asia/Seoul`·`TZ=America/New_York` 로 각각 돌려 확인한다(보고서). process.env 는 설정 접근 검사(docs-check) 밖이라 건드리지 않는다.
test('TZ=Asia/Seoul · America/New_York — 같은 id 집합(시간대는 epoch 에만)', () => {
  const run = (tzOffsetMin: number | undefined) => {
    const p = plan(fx('hevy-kg.csv'), { tzOffsetMin });
    return { ids: p.workouts.flatMap(plannedIds), started: p.workouts.map((w) => w.startedAt), tz: p.batch.tzOffsetMin };
  };
  const seoul = run(540);
  const ny = run(-240);
  const device = run(undefined);
  assert.deepEqual(seoul.ids, ny.ids);
  assert.deepEqual(device.ids, seoul.ids);
  assert.equal(seoul.tz, 540);
  assert.equal(ny.tz, -240);
  assert.equal(ny.started[0] - seoul.started[0], 13 * 3600_000);
  // 기기 시간대 경로: 기록한 오프셋 = 그 시각의 기기 오프셋, epoch 는 그 오프셋으로 읽은 값
  assert.equal(device.tz, -new Date(device.started[0]).getTimezoneOffset());
  assert.equal(device.started[0], Date.UTC(2026, 7, 30, 9, 0, 0) - device.tz * 60_000);
});

test('재실행 — 이미 있는 id 면 전부 건너뜀 · 커스텀 종목·별칭도 새로 안 만든다', () => {
  const first = plan(fx('strong-comma.csv'), { weightUnit: 'kg' }, { ...DEFAULT, Running: { kind: 'custom', nameKo: '야외 러닝' } });
  assert.equal(first.customExercises.length, 1);
  const cx = first.customExercises[0];
  assert.equal(cx.id, importCustomExerciseId('strong', 'Running'));
  assert.ok(!cx.id.startsWith('seed-'));
  assert.equal(cx.nameKo, '야외 러닝');
  assert.equal(cx.nameEn, 'Running');
  assert.equal(cx.equipment, 'other');
  assert.equal(first.workouts[1].exercises[1].exercise_id, cx.id);
  assert.deepEqual(first.aliases.map((a) => [a.id, a.exerciseId]), [[importAliasId('strong', 'Running'), cx.id]]);

  const taken = new Set(first.workouts.flatMap(plannedIds));
  const again = plan(
    fx('strong-comma.csv'),
    { weightUnit: 'kg', existingIds: taken, existingAliases: new Map(first.aliases.map((a) => [a.id, a.exerciseId])) },
    { ...DEFAULT, Running: { kind: 'custom', nameKo: '야외 러닝' } },
  );
  assert.equal(again.workouts.length, 0);
  assert.deepEqual(again.skipped.map((s) => s.reason), ['exists', 'exists']);
  assert.equal(again.customExercises.length, 0);
  assert.equal(again.aliases.length, 0);
  // 운동 id 만 알아도 걸린다(화면 요약은 takenWorkoutIds 만 넘긴다)
  const byWorkout = plan(fx('strong-comma.csv'), { weightUnit: 'kg', existingIds: new Set(first.workouts.map((w) => w.id)) });
  assert.equal(byWorkout.workouts.length, 0);
});

test('결정 — skip 종목은 빠지고, 종목이 하나도 안 남은 운동은 건너뜀 · remember 만 별칭', () => {
  const p = plan(fx('strong-comma.csv'), { weightUnit: 'kg' }, { ...DEFAULT, 'Squat (Barbell)': { kind: 'skip' }, Running: { kind: 'skip' } });
  assert.equal(p.stats.workouts, 1);
  assert.deepEqual(p.skipped.map((s) => s.reason), ['no_exercises']);
  assert.deepEqual(p.stats.skippedExerciseNames, ['Squat (Barbell)', 'Running']);
  assert.equal(p.aliases.length, 0); // remember 없는 existing 은 별칭을 남기지 않는다
  const h = plan(fx('hevy-kg.csv'));
  assert.deepEqual(h.aliases.map((a) => a.sourceName), ['Bicep Curl (Dumbbell)']);
  const same = plan(fx('hevy-kg.csv'), { existingAliases: new Map([[importAliasId('hevy', 'Bicep Curl (Dumbbell)'), 'seed-dumbbell-curl']]) });
  assert.equal(same.aliases.length, 0);
});

test('P5-3 — 하위 id 는 파일 안 원래 순번 · 「가져오지 않기」 결정이 달라도 같은 원본 줄 = 같은 id', () => {
  const all = plan(fx('strong-comma.csv'), { weightUnit: 'kg' });
  const some = plan(fx('strong-comma.csv'), { weightUnit: 'kg' }, { ...DEFAULT, 'Bench Press (Barbell)': { kind: 'skip' }, 'Squat (Barbell)': { kind: 'skip' } });
  /** 종목 줄 id → (종목 id · 세트 id 목록 · 세트 칸 값) */
  const index = (p: ImportPlan) => {
    const m = new Map<string, { exerciseId: unknown; sets: string[]; values: string[] }>();
    for (const w of p.workouts)
      for (const we of w.exercises) {
        const sets = w.sets.filter((s) => s.workout_exercise_id === we.id);
        m.set(we.id as string, {
          exerciseId: we.exercise_id,
          sets: sets.map((s) => s.id as string),
          values: sets.map((s) => `${s.set_number}:${s.weight_kg}x${s.reps}:${s.is_warmup}${s.is_drop}${s.is_failed}`),
        });
      }
    return m;
  };
  const a = index(all);
  const b = index(some);
  assert.equal(b.size, 2, '벤치·스쿼트를 빼면 푸시다운·러닝 두 줄');
  for (const [id, row] of b) {
    assert.ok(a.has(id), `${id} 는 전부 가져오기에도 있다`);
    assert.deepEqual(row, a.get(id), `${id} — 같은 종목·같은 세트 id·같은 세트 값`);
  }
  // 첫 종목을 뺐으므로 남은 줄은 e1 — 원래 순번을 쓴다
  assert.ok([...b.keys()].every((id) => id.endsWith('-e1')));
  // sort_order 는 가져온 줄 순번(빈 자리 없음)
  for (const w of some.workouts) assert.deepEqual(w.exercises.map((r) => r.sort_order), w.exercises.map((_, i) => i));
  // 같은 결정 두 번 → 같은 id 집합(재가져오기 멱등)
  const again = plan(fx('strong-comma.csv'), { weightUnit: 'kg' }, { ...DEFAULT, 'Bench Press (Barbell)': { kind: 'skip' }, 'Squat (Barbell)': { kind: 'skip' } });
  assert.deepEqual(again.workouts.flatMap(plannedIds), some.workouts.flatMap(plannedIds));
});

test('묶음 자르기 — 운동 단위 ≤2000행 · 큰 운동은 혼자', () => {
  const ws = [900, 900, 300, 2500, 10, 1990].map((rowCount, i) => ({ rowCount, i }));
  const chunks = chunkPlannedWorkouts(ws, 2000);
  assert.deepEqual(chunks.map((c) => c.map((w) => w.i)), [[0, 1], [2], [3], [4, 5]]);
  assert.deepEqual(chunkPlannedWorkouts([], 2000), []);
});

test('1만 세트 — 파싱·계획 시간 · 숫자 일치', (t) => {
  const big = generateLargeStrongCsv();
  const t0 = performance.now();
  const parsed = parseImportFile(big.text);
  const t1 = performance.now();
  const d = new Map<string, ExerciseDecision>(distinctExerciseNames(parsed).map((n) => [n, DEFAULT[n] ?? { kind: 'custom' }]));
  const p = buildImportPlan({
    parsed,
    weightUnit: 'kg',
    decisions: d,
    exerciseInfo: new Map(Object.entries(INFO)),
    bodyweightKg: null,
    fileLabel: 'big',
    now: NOW,
  });
  const t2 = performance.now();
  t.diagnostic(`1만 세트: 파싱 ${(t1 - t0).toFixed(1)}ms · 계획 ${(t2 - t1).toFixed(1)}ms · 행 ${p.stats.rows}`);
  assert.equal(parsed.issues.length, 0);
  assert.equal(p.stats.workouts, big.workouts);
  assert.equal(p.stats.sets, big.sets);
  close(p.stats.totalVolumeKg, big.volume, 1e-3);
  assert.equal(new Set(p.workouts.flatMap(plannedIds)).size, p.stats.rows); // id 충돌 없음
  for (const c of chunkPlannedWorkouts(p.workouts)) assert.ok(c.reduce((n, w) => n + w.rowCount, 0) <= 2000);
  assert.ok(t2 - t0 < 10_000);
});
