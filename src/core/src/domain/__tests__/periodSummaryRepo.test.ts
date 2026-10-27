// @plm SRS-079 SRS-080  기간 성과 요약 저장소 — 실제 WatermelonDB(LokiJS 메모리)의 _raw 를 읽어 회원 요약을 만들고,
// 같은 기록을 서버 GetMemberRecords 모양으로 바꿔 만든 트레이너 리포트와 「같은 숫자」(세션·총 볼륨 캐시·부위별 세트)인지 본다.
import './fixtures/wm/register.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { database } = await import('../../db/database');
const repo = await import('../../data/periodSummaryRepository');
const { buildPeriodSummary, previousRange } = await import('../periodSummary');
const { memberReportFromRecords } = await import('../summaryRecords');

const DAY = 86_400_000;
// 4주 기간을 손으로 — 9/30 자정 ~ 10/28 자정
const range = { startMs: new Date(2026, 8, 30).getTime(), endMs: new Date(2026, 9, 28).getTime(), tz: 'Asia/Seoul' };

type Raw = Record<string, unknown>;

async function reset(): Promise<void> {
  await database.write(async () => {
    await database.unsafeResetDatabase();
  });
}

async function put(table: string, rows: Raw[]): Promise<void> {
  await database.write(async () => {
    const col = database.get(table);
    await database.batch(...rows.map((r) => col.prepareCreateFromDirtyRaw(r)));
  });
}

let n = 0;
function workout(startedAt: number, state = 'completed', volume = 1000, pr = 0): Raw {
  n += 1;
  return {
    id: `w${n}`,
    name: '',
    state,
    started_at: startedAt,
    completed_at: state === 'completed' ? startedAt + 3_600_000 : null,
    duration_seconds: state === 'completed' ? 3600 : null,
    total_volume_kg: volume,
    pr_count: pr,
    created_at: startedAt,
    updated_at: startedAt,
  };
}

async function seed(): Promise<{ workouts: Raw[]; blocks: Raw[]; sets: Raw[]; exercises: Raw[] }> {
  const exercises: Raw[] = [
    { id: 'cx-bench', name_ko: '벤치', primary_muscles: '["chest"]', secondary_muscles: '["triceps"]', equipment: 'barbell', is_custom: true, created_at: 1, updated_at: 1 },
    { id: 'cx-pull', name_ko: '턱걸이', primary_muscles: '["back"]', secondary_muscles: '[]', equipment: 'bodyweight', load_mode: 'bodyweight_plus', is_custom: true, created_at: 1, updated_at: 1 },
  ];
  const workouts: Raw[] = [
    workout(range.startMs - 60 * DAY, 'completed', 500), // 기준선(직전 기간보다 앞)
    workout(range.startMs - 10 * DAY, 'completed', 800), // 직전 기간
    workout(range.startMs + 1 * DAY, 'completed', 1200, 1), // 기간
    workout(range.startMs + 20 * DAY, 'completed', 1500, 2), // 기간
    workout(range.startMs + 21 * DAY, 'in_progress', 0), // 진행 중 — 빠짐
  ];
  const blocks: Raw[] = [];
  const sets: Raw[] = [];
  workouts.forEach((w, i) => {
    for (const ex of ['cx-bench', 'cx-pull']) {
      const bid = `${w.id}-${ex}`;
      blocks.push({ id: bid, workout_id: w.id, exercise_id: ex, sort_order: 0, created_at: 1, updated_at: 1 });
      for (let k = 0; k < 3; k++)
        sets.push({
          id: `${bid}-s${k}`,
          workout_exercise_id: bid,
          set_number: k + 1,
          weight_kg: ex === 'cx-bench' ? 40 + i * 5 : 0,
          reps: 8,
          is_warmup: k === 0 && ex === 'cx-bench',
          is_failed: false,
          done: true,
          rir: k === 2 ? 1 : null,
          created_at: 1,
          updated_at: 1,
        });
    }
  });
  await put('exercises', exercises);
  await put('workouts', workouts);
  await put('workout_exercises', blocks);
  await put('set_logs', sets);
  return { workouts, blocks, sets, exercises };
}

/** 서버 GetMemberRecords 흉내 — 완료 운동 · started_at ∈ [start − 길이, end) · 자식 · 쓰인 커스텀 종목 */
function serverLike(d: Awaited<ReturnType<typeof seed>>) {
  const prev = previousRange(range);
  const ws = d.workouts.filter((w) => w.state === 'completed' && (w.started_at as number) >= prev.startMs && (w.started_at as number) < range.endMs);
  const wid = new Set(ws.map((w) => w.id));
  const bs = d.blocks.filter((b) => wid.has(b.workout_id));
  const bid = new Set(bs.map((b) => b.id));
  const ss = d.sets.filter((s) => bid.has(s.workout_exercise_id));
  const used = new Set(bs.map((b) => b.exercise_id));
  const es = d.exercises.filter((e) => used.has(e.id));
  return {
    workouts: ws.map((x) => JSON.stringify(x)),
    workoutExercises: bs.map((x) => JSON.stringify(x)),
    setLogs: ss.map((x) => JSON.stringify(x)),
    exercises: es.map((x) => JSON.stringify(x)),
  };
}

test('회원 요약 — 기간 운동만 · 진행 중 제외 · 직전 대비 · 새 기록 목록(기준선은 기간 앞 이력)', async () => {
  await reset();
  await seed();
  const { summary, stats } = await repo.buildMemberSummary(range);
  assert.equal(stats.prList, true);
  assert.equal(stats.workouts, 4); // 기간 끝 전 완료 운동 전부(진행 중 제외)
  assert.equal(summary.counts.workouts, 2);
  // [원본] assert.equal(summary.counts.volumeKg, 2700); — 캐시(1200+1500) 합이었다
  // [개선] 총 볼륨 = 세트를 체중 없이 다시 센 합(P4S-1): 벤치 50×8×2 + 55×8×2 = 1680 · 턱걸이(맨몸 0kg) = 0
  assert.equal(summary.counts.volumeKg, 1680);
  assert.equal(summary.delta?.workouts, 1); // 2 − 1
  // 새 기록 개수 = 목록 개수(P4U-3) — 캐시 pr_count(1+2) 가 아니다
  assert.ok((summary.prs?.length ?? 0) > 0, '새 기록 목록이 있다');
  assert.equal(summary.prCount, summary.prs?.length);
  // 맨몸 턱걸이(0kg) 는 체중 없이 세므로 무게 기록이 아니다
  assert.equal(summary.prs?.some((p) => p.exerciseId === 'cx-pull'), false);
  assert.ok(summary.muscleSets && (summary.muscleSets.byMuscle.chest ?? 0) > 0);
});

test('트레이너 리포트(서버 모양 응답) = 회원 요약 — 세션 수·총 볼륨(체중 없이)·부위별 세트·맨몸 종목', async () => {
  await reset();
  const d = await seed();
  const member = (await repo.buildMemberSummary(range)).summary;
  const catalog = await repo.loadSummaryCatalog();
  const trainer = buildPeriodSummary(memberReportFromRecords(serverLike(d), range, { catalog }));
  assert.equal(trainer.counts.workouts, member.counts.workouts);
  assert.equal(trainer.counts.volumeKg, member.counts.volumeKg);
  assert.deepEqual(trainer.muscleSets, member.muscleSets);
  // [원본] assert.equal(trainer.prCount, member.prCount);
  // [개선] 트레이너는 기준선 이력이 없어 캐시 pr_count 합, 회원은 목록 개수 — 서로 다를 수 있다(P4U-3)
  assert.equal(trainer.prCount, 3);
  assert.equal(member.prCount, member.prs?.length);
  assert.equal(trainer.prs, undefined, '트레이너는 새 기록 개수만');
  // 맨몸 종목 최고 세트 — 양쪽 모두 가중분만(같은 세트 = 같은 숫자 · P4S-1)
  assert.deepEqual(
    trainer.topExercises?.find((t) => t.exerciseId === 'cx-pull'),
    member.topExercises?.find((t) => t.exerciseId === 'cx-pull'),
  );
});

test('100일 넘는 직접 기간 — 새 기록 목록 없이 개수만 · 직전 기간만 읽는다', async () => {
  await reset();
  await seed();
  const long = { startMs: range.endMs - 120 * DAY, endMs: range.endMs, tz: '' };
  const { summary, stats } = await repo.buildMemberSummary(long);
  assert.equal(stats.prList, false);
  assert.equal(summary.prs, undefined);
  assert.equal(summary.prCount, 3);
});
