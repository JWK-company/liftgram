// @plm SRS-079 SRS-080 ADR-040  기간 성과 요약·스냅샷 검증·트레이너 원본 변환 — `bun run test:core`
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPeriodSummary,
  customSummaryRange,
  isValidSummaryRange,
  muscleLoadFromSummary,
  omitSections,
  presentSections,
  previousRange,
  summaryRange,
  summaryRangeDays,
  SUMMARY_MAX_PRS,
  type SummaryExerciseRec,
  type SummaryRange,
  type SummaryV1,
} from '../periodSummary';
import { fitsSummaryLimit, parseSummaryV1, serializeSummaryV1, summaryByteLength, SUMMARY_MAX_BYTES } from '../summarySchema';
import { exerciseFromRaw, memberReportFromRecords, summaryInputFromRaw, type SummaryRawRecords } from '../summaryRecords';
import { snapshotFromSets, sweepPrCounts, type PrSweepWorkout } from '../personalRecords';
import { totalVolumeKg, resolveLoadMode } from '../volume';
import type { LoggedSet, MuscleGroup } from '../types';

// ── 표본 만들기 ──────────────────────────────────────────────────────

type Raw = Record<string, unknown>;

interface ExDef {
  id: string;
  nameKo: string;
  primary: MuscleGroup[];
  secondary?: MuscleGroup[];
  equipment: string;
  loadMode?: string | null;
  kind?: string | null;
  custom?: boolean;
}

const EX: Record<string, ExDef> = {
  bench: { id: 'seed-bench', nameKo: '벤치프레스', primary: ['chest'], secondary: ['triceps', 'shoulders'], equipment: 'barbell' },
  squat: { id: 'seed-squat', nameKo: '스쿼트', primary: ['quads', 'glutes'], secondary: ['hamstrings'], equipment: 'barbell' },
  pullup: { id: 'seed-pullup', nameKo: '턱걸이', primary: ['back'], secondary: ['biceps'], equipment: 'bodyweight', loadMode: 'bodyweight' },
  dip: { id: 'seed-assist-dip', nameKo: '어시스트 딥스', primary: ['chest', 'triceps'], equipment: 'machine', loadMode: 'assisted' },
  run: { id: 'seed-run', nameKo: '러닝', primary: ['calves', 'fullBody'], equipment: 'bodyweight', kind: 'cardio' },
  custom: { id: 'cx-myrow', nameKo: '내 로우', primary: ['back'], secondary: ['biceps'], equipment: 'cable', custom: true },
};

function exRaw(d: ExDef): Raw {
  return {
    id: d.id,
    name_ko: d.nameKo,
    name_en: null,
    primary_muscles: JSON.stringify(d.primary),
    secondary_muscles: JSON.stringify(d.secondary ?? []),
    equipment: d.equipment,
    kind: d.kind ?? null,
    load_mode: d.loadMode ?? null,
    // 허용 밖 칸(서버는 지운다)
    notes: '비밀 메모',
    image_url: 'https://example.invalid/x.png',
  };
}

interface SetDef {
  w: number;
  r: number;
  warm?: boolean;
  fail?: boolean;
  done?: boolean | null;
  rir?: number | null;
  rpe?: number | null;
}

interface WorkoutDef {
  at: number;
  blocks: { ex: ExDef; sets: SetDef[]; variant?: string | null }[];
  state?: string;
}

/** 기기 raw 처럼 만든다 — total_volume_kg 은 체중 bw 로, pr_count 는 완료 판정 규칙(sweep)으로 채운다. */
function buildRaw(defs: WorkoutDef[], bw: number | null): SummaryRawRecords {
  const workouts: Raw[] = [];
  const blocks: Raw[] = [];
  const sets: Raw[] = [];
  const sweepIn: PrSweepWorkout[] = [];
  defs.forEach((d, wi) => {
    const wid = `w-${String(wi).padStart(4, '0')}`;
    let vol = 0;
    const groups = new Map<string, LoggedSet[]>();
    d.blocks.forEach((b, bi) => {
      const bid = `${wid}-b${bi}`;
      blocks.push({ id: bid, workout_id: wid, exercise_id: b.ex.id, sort_order: bi, variant_key: b.variant ?? null, note: '블록 메모', prev_weight_kg: 1 });
      const logged: LoggedSet[] = [];
      b.sets.forEach((s, si) => {
        sets.push({
          id: `${bid}-s${si}`,
          workout_exercise_id: bid,
          set_number: si + 1,
          weight_kg: s.w,
          reps: s.r,
          rpe: s.rpe ?? null,
          rir: s.rir ?? null,
          is_warmup: s.warm ?? false,
          is_failed: s.fail ?? false,
          done: s.done === undefined ? true : s.done,
          note: '세트 메모',
        });
        if (s.done === false) return;
        logged.push({
          weightKg: s.w,
          reps: s.r,
          isWarmup: s.warm ?? false,
          isFailed: s.fail ?? false,
          loadMode: resolveLoadMode({ loadMode: (b.ex.loadMode ?? null) as never, equipment: b.ex.equipment }),
          bodyweightKg: bw,
        });
      });
      vol += totalVolumeKg(logged);
      if (b.ex.kind === 'cardio') return;
      const key = `${b.ex.id}::${b.variant ?? ''}`;
      const g = groups.get(key);
      if (g) g.push(...logged);
      else groups.set(key, logged);
    });
    const completedAt = d.at + 3_600_000;
    workouts.push({
      id: wid,
      state: d.state ?? 'completed',
      started_at: d.at,
      completed_at: completedAt,
      duration_seconds: 3600,
      total_volume_kg: vol,
      pr_count: 0,
      accumulated_pause_ms: 0,
      title: '운동 제목',
    });
    if ((d.state ?? 'completed') === 'completed')
      sweepIn.push({ id: wid, completedAt, groups: [...groups.entries()].map(([key, l]) => ({ key, current: snapshotFromSets(l) })) });
  });
  const counts = sweepPrCounts(sweepIn);
  for (const w of workouts) w.pr_count = counts.get(w.id as string) ?? 0;
  return { workouts, workoutExercises: blocks, setLogs: sets, exercises: Object.values(EX).map(exRaw) };
}

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 27, 15, 0).getTime(); // 2026-10-27 15:00 로컬
const R4 = summaryRange('4w', NOW, 'Asia/Seoul');
const catalog: SummaryExerciseRec[] = Object.values(EX)
  .filter((d) => !d.custom)
  .map((d) => exerciseFromRaw(exRaw(d))!);

/** 서버 GetMemberRecords 흉내 — 허용 칸만 · 완료 운동과 자식 · 쓰인 커스텀 종목만 · [start − 길이, end) · started_at 기준. */
const ALLOWED = {
  workouts: ['id', 'state', 'started_at', 'completed_at', 'duration_seconds', 'total_volume_kg', 'pr_count', 'routine_id', 'source'],
  workoutExercises: ['id', 'workout_id', 'exercise_id', 'sort_order', 'weight_unit', 'variant_key', 'variant_equipment', 'variant_grip', 'variant_arm', 'variant_load', 'variant_attach'],
  setLogs: ['id', 'workout_exercise_id', 'set_number', 'weight_kg', 'reps', 'rpe', 'rir', 'is_warmup', 'is_failed', 'is_drop', 'set_type', 'done', 'load_multiplier', 'load_adjust_kg', 'strict_reps', 'partial_reps', 'duration_sec', 'distance_m'],
  exercises: ['id', 'name_ko', 'name_en', 'primary_muscles', 'secondary_muscles', 'equipment', 'kind', 'load_mode'],
} as const;
function project(r: Raw, keys: readonly string[]): string {
  const o: Raw = {};
  for (const k of keys) if (k in r) o[k] = r[k];
  return JSON.stringify(o);
}
function serverRecords(raw: SummaryRawRecords, range: SummaryRange) {
  const len = range.endMs - range.startMs;
  const from = range.startMs - len;
  const ws = raw.workouts.filter((w) => w.state === 'completed' && (w.started_at as number) >= from && (w.started_at as number) < range.endMs);
  const wIds = new Set(ws.map((w) => w.id));
  const bs = raw.workoutExercises.filter((b) => wIds.has(b.workout_id));
  const bIds = new Set(bs.map((b) => b.id));
  const ss = raw.setLogs.filter((s) => bIds.has(s.workout_exercise_id));
  const used = new Set(bs.map((b) => b.exercise_id));
  const customIds = new Set(Object.values(EX).filter((d) => d.custom).map((d) => d.id));
  const exs = raw.exercises.filter((e) => used.has(e.id) && customIds.has(e.id as string));
  return {
    workouts: ws.map((r) => project(r, ALLOWED.workouts)),
    workoutExercises: bs.map((r) => project(r, ALLOWED.workoutExercises)),
    setLogs: ss.map((r) => project(r, ALLOWED.setLogs)),
    exercises: exs.map((r) => project(r, ALLOWED.exercises)),
  };
}

function memberSummary(raw: SummaryRawRecords, range: SummaryRange, bw: number | null, logs = [] as { id: string; measuredAt: number; weightKg: number; updatedAt: number }[]): SummaryV1 {
  return buildPeriodSummary(summaryInputFromRaw(raw, { range, bodyweightKg: bw, bodyweightLogs: logs, prList: true }));
}

const benchSets = (w: number): SetDef[] => [{ w: 40, r: 10, warm: true }, { w, r: 5 }, { w, r: 5 }, { w: w + 5, r: 3 }];

// ── 기간 ─────────────────────────────────────────────────────────────

test('summaryRange — 7일·4주·3개월은 로컬 자정 정렬 · 끝은 내일 자정(제외)', () => {
  const r7 = summaryRange('7d', NOW, 'Asia/Seoul');
  assert.equal(r7.startMs, new Date(2026, 9, 21).getTime());
  assert.equal(r7.endMs, new Date(2026, 9, 28).getTime());
  assert.equal(summaryRangeDays(r7), 7);
  assert.equal(R4.startMs, new Date(2026, 8, 30).getTime());
  assert.equal(summaryRangeDays(R4), 28);
  const r3 = summaryRange('3m', NOW, '');
  assert.equal(r3.startMs, new Date(2026, 6, 28).getTime());
  assert.equal(r3.tz, '');
  assert.deepEqual(previousRange(R4), { startMs: R4.startMs - (R4.endMs - R4.startMs), endMs: R4.startMs });
});

test('customSummaryRange — 끝 날짜 포함 · 형식/거꾸로/없는 날짜는 null · 서버 기간 검사', () => {
  const r = customSummaryRange('2026-10-01', '2026-10-01', 'Asia/Seoul')!;
  assert.equal(r.startMs, new Date(2026, 9, 1).getTime());
  assert.equal(r.endMs, new Date(2026, 9, 2).getTime());
  assert.equal(customSummaryRange('2026-10-05', '2026-10-01'), null);
  assert.equal(customSummaryRange('2026-02-30', '2026-03-01'), null);
  assert.equal(customSummaryRange('2026/10/01', '2026-10-02'), null);
  assert.equal(isValidSummaryRange(R4, NOW), true);
  assert.equal(isValidSummaryRange({ startMs: NOW - 401 * DAY, endMs: NOW }, NOW), false);
  assert.equal(isValidSummaryRange({ startMs: NOW, endMs: NOW + 2 * DAY }, NOW), false);
  assert.equal(isValidSummaryRange({ startMs: NOW, endMs: NOW }, NOW), false);
});

// ── 경계일 · 직전 기간 증감 ────────────────────────────────────────────

test('경계일 — 시작 자정 포함 · 끝 자정 제외 · 시작 1ms 전은 직전 기간', () => {
  const raw = buildRaw(
    [
      { at: R4.startMs - R4.endMs + R4.startMs - 1, blocks: [{ ex: EX.bench, sets: benchSets(60) }] }, // 직전 기간보다 앞(어디에도 안 셈)
      { at: R4.startMs - (R4.endMs - R4.startMs), blocks: [{ ex: EX.bench, sets: benchSets(60) }] }, // 직전 기간 첫 순간
      { at: R4.startMs - 1, blocks: [{ ex: EX.bench, sets: benchSets(60) }] }, // 직전 기간 마지막
      { at: R4.startMs, blocks: [{ ex: EX.bench, sets: benchSets(60) }] }, // 이번 첫 순간
      { at: R4.endMs - 1, blocks: [{ ex: EX.bench, sets: benchSets(62.5) }] }, // 이번 마지막
      { at: R4.endMs, blocks: [{ ex: EX.bench, sets: benchSets(100) }] }, // 끝(제외)
      { at: R4.startMs + DAY, blocks: [{ ex: EX.bench, sets: benchSets(60) }], state: 'discarded' }, // 완료 아님
    ],
    80,
  );
  const s = memberSummary(raw, R4, 80);
  assert.equal(s.counts.workouts, 2);
  assert.equal(s.counts.durationSec, 7200);
  assert.equal(s.counts.perWeek, 0.5);
  assert.equal(s.delta!.workouts, 0); // 직전 기간도 2회
  const vol = raw.workouts.filter((w) => w.started_at === R4.startMs || w.started_at === R4.endMs - 1).reduce((n, w) => n + (w.total_volume_kg as number), 0);
  assert.equal(s.counts.volumeKg, Math.round(vol * 10) / 10);
});

test('직전 같은 길이 기간 대비 증감 — 횟수·시간·볼륨·주당', () => {
  const defs: WorkoutDef[] = [];
  for (let i = 0; i < 3; i++) defs.push({ at: R4.startMs - 20 * DAY + i * DAY, blocks: [{ ex: EX.squat, sets: [{ w: 100, r: 5 }] }] });
  for (let i = 0; i < 5; i++) defs.push({ at: R4.startMs + i * 2 * DAY, blocks: [{ ex: EX.squat, sets: [{ w: 100, r: 5 }, { w: 100, r: 5 }] }] });
  const s = memberSummary(buildRaw(defs, null), R4, null);
  assert.equal(s.counts.workouts, 5);
  assert.equal(s.counts.volumeKg, 5000);
  assert.deepEqual(s.delta, { workouts: 2, durationSec: 7200, volumeKg: 3500, perWeek: 0.5 }); // 1.3 − 0.8
});

// ── PR · 종목 · 근육 · 노력 · 체중 ─────────────────────────────────────

test('새 기록 목록 = 기간 PR(완료 판정 규칙) · 개수 = pr_count 합 · 기간 앞 이력이 기준선', () => {
  const defs: WorkoutDef[] = [
    { at: R4.startMs - 40 * DAY, blocks: [{ ex: EX.bench, sets: benchSets(80) }] }, // 기간 훨씬 앞 — 기준선
    { at: R4.startMs + DAY, blocks: [{ ex: EX.bench, sets: benchSets(70) }] }, // 기준선보다 낮음 → PR 아님
    { at: R4.startMs + 3 * DAY, blocks: [{ ex: EX.bench, sets: benchSets(85) }, { ex: EX.squat, sets: [{ w: 120, r: 3 }] }] },
    { at: R4.startMs + 5 * DAY, blocks: [{ ex: EX.bench, sets: benchSets(85), variant: 'equip:hammer' }] }, // 다른 칸 → 그 칸 첫 기록
    { at: R4.startMs + 6 * DAY, blocks: [{ ex: EX.run, sets: [{ w: 0, r: 0 }] }] }, // 유산소 PR 없음
  ];
  const raw = buildRaw(defs, 80);
  const s = memberSummary(raw, R4, 80);
  assert.ok(s.prs && s.prs.length > 0);
  assert.equal(s.prs!.length, s.prCount);
  assert.ok(s.prs!.every((p) => p.atMs >= R4.startMs));
  assert.ok(!s.prs!.some((p) => p.atMs === R4.startMs + DAY));
  const benchW = s.prs!.find((p) => p.exerciseId === EX.bench.id && p.type === 'maxWeight' && p.atMs === R4.startMs + 3 * DAY)!;
  assert.equal(benchW.previousKg, 85); // 기준선 = 40일 전 80+5
  assert.equal(benchW.valueKg, 90);
  assert.equal(benchW.name, '벤치프레스');
});

test('많이 한 종목 ≤5 — 작업 세트 수 순 · 최고 세트 처음→끝 · 유산소 제외', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const exs = ids.map((k): ExDef => ({ id: `cx-${k}`, nameKo: `종목${k}`, primary: ['chest'], equipment: 'machine', custom: true }));
  const defs: WorkoutDef[] = [
    { at: R4.startMs + DAY, blocks: exs.map((ex, i) => ({ ex, sets: Array.from({ length: i + 1 }, () => ({ w: 50, r: 10 })) })) },
    { at: R4.startMs + 2 * DAY, blocks: [{ ex: exs[6], sets: [{ w: 60, r: 8 }, { w: 55, r: 12 }] }, { ex: EX.run, sets: Array(20).fill({ w: 0, r: 0 }) }] },
  ];
  const raw = buildRaw(defs, null);
  raw.exercises = [...raw.exercises, ...exs.map(exRaw)];
  const s = memberSummary(raw, R4, null);
  assert.equal(s.topExercises!.length, 5);
  assert.deepEqual(s.topExercises!.map((t) => t.exerciseId), ['cx-g', 'cx-f', 'cx-e', 'cx-d', 'cx-c']);
  const g = s.topExercises![0];
  assert.equal(g.sets, 9);
  assert.equal(g.sessions, 2);
  assert.deepEqual(g.first, { weightKg: 50, reps: 10, atMs: R4.startMs + DAY });
  assert.deepEqual(g.last, { weightKg: 60, reps: 8, atMs: R4.startMs + 2 * DAY });
});

test('부위별 세트(ADR-039) · 노력 요약 · 체중 시작·끝·변화', () => {
  const defs: WorkoutDef[] = [
    { at: R4.startMs + DAY, blocks: [{ ex: EX.bench, sets: [{ w: 40, r: 10, warm: true }, { w: 60, r: 5, rir: 2 }, { w: 60, r: 5, rpe: 9 }, { w: 60, r: 5, done: false }] }] },
  ];
  const logs = [
    { id: 'bw0', measuredAt: R4.startMs - DAY, weightKg: 90, updatedAt: 1 },
    { id: 'bw1', measuredAt: R4.startMs + DAY, weightKg: 81.2, updatedAt: 1 },
    { id: 'bw2', measuredAt: R4.startMs + 10 * DAY, weightKg: 80.4, updatedAt: 1 },
    { id: 'bw3', measuredAt: R4.endMs, weightKg: 70, updatedAt: 1 },
  ];
  const s = memberSummary(buildRaw(defs, 80), R4, 80, logs);
  assert.deepEqual(s.muscleSets, { byMuscle: { chest: 2, shoulders: 1, triceps: 1 }, fullBody: 0 });
  assert.equal(muscleLoadFromSummary(s).byMuscle.back, 0);
  assert.equal(s.effort!.rated, 2);
  assert.equal(s.effort!.total, 2);
  assert.equal(s.effort!.fromRpe, 1);
  assert.equal(s.effort!.avg, 1.5);
  assert.deepEqual(s.bodyweight, { startKg: 81.2, endKg: 80.4, changeKg: -0.8, startMs: R4.startMs + DAY, endMs: R4.startMs + 10 * DAY, count: 2 });
});

// ── 섹션 제거 ─────────────────────────────────────────────────────────

test('없는 섹션은 키째 없다 — 노력·체중·PR 목록·종목·근육', () => {
  const s = memberSummary(buildRaw([{ at: R4.startMs + DAY, blocks: [{ ex: EX.run, sets: [{ w: 0, r: 0 }] }] }], null), R4, null);
  for (const k of ['effort', 'bodyweight', 'prs', 'topExercises', 'muscleSets']) assert.equal(k in s, false, k);
  assert.equal(serializeSummaryV1(s).includes('undefined'), false);
  assert.deepEqual(presentSections(s), ['delta', 'prs']);
  const empty = memberSummary(buildRaw([], null), R4, null);
  assert.equal(empty.counts.workouts, 0);
  assert.equal(empty.prCount, 0);
});

test('omitSections — 끈 섹션 키 제거 · prs 끄면 prCount 도 · 원본 불변', () => {
  const defs: WorkoutDef[] = [{ at: R4.startMs + DAY, blocks: [{ ex: EX.bench, sets: [{ w: 60, r: 5, rir: 2 }] }] }];
  const s = memberSummary(buildRaw(defs, 80), R4, 80, [{ id: 'b', measuredAt: R4.startMs + DAY, weightKg: 80, updatedAt: 1 }]);
  assert.deepEqual(presentSections(s), ['delta', 'prs', 'topExercises', 'muscleSets', 'effort', 'bodyweight']);
  const o = omitSections(s, ['bodyweight', 'prs', 'effort']);
  for (const k of ['bodyweight', 'prs', 'prCount', 'effort']) assert.equal(k in o, false, k);
  assert.ok(o.topExercises && o.muscleSets && o.delta);
  assert.ok(s.bodyweight && s.prs && s.effort);
  o.counts.workouts = 99;
  assert.equal(s.counts.workouts, 1);
  assert.deepEqual(parseSummaryV1(serializeSummaryV1(o)), o);
});

// ── parseSummaryV1 방어 ───────────────────────────────────────────────

const base = (): Record<string, unknown> => ({
  schemaVersion: 1,
  range: { startMs: R4.startMs, endMs: R4.endMs, tz: 'Asia/Seoul' },
  counts: { workouts: 3, durationSec: 100, volumeKg: 1000, perWeek: 0.8 },
});

test('parseSummaryV1 — 판·JSON·필수 부분이 틀리면 null', () => {
  assert.ok(parseSummaryV1(base()));
  assert.equal(parseSummaryV1({ ...base(), schemaVersion: 2 }), null);
  assert.equal(parseSummaryV1({ ...base(), schemaVersion: '1' }), null);
  assert.equal(parseSummaryV1('{깨진'), null);
  assert.equal(parseSummaryV1('[]'), null);
  assert.equal(parseSummaryV1(null), null);
  assert.equal(parseSummaryV1({ ...base(), counts: { workouts: 3 } }), null);
  assert.equal(parseSummaryV1({ ...base(), range: { startMs: 5, endMs: 5 } }), null);
  // JSON 의 1e999 = Infinity · 문자열 숫자
  assert.equal(parseSummaryV1('{"schemaVersion":1,"range":{"startMs":1,"endMs":2},"counts":{"workouts":1e999,"durationSec":0,"volumeKg":0,"perWeek":0}}'), null);
  assert.equal(parseSummaryV1({ ...base(), counts: { workouts: '3', durationSec: 0, volumeKg: 0, perWeek: 0 } }), null);
});

test('parseSummaryV1 — 모르는 키 버림 · __proto__ 무시 · 문자열 80자 · 배열 상한 · NaN 섹션 버림', () => {
  const long = '가'.repeat(200);
  const pr = (i: number) => ({ exerciseId: `e${i}`, name: long, type: 'maxWeight', valueKg: i, previousKg: 0, atMs: i, extra: 'x' });
  const top = (i: number) => ({ exerciseId: `t${i}`, name: 'n', sets: 1, sessions: 1, first: { weightKg: 1, reps: 1, atMs: 1, z: 1 }, last: { weightKg: 1, reps: 1, atMs: 2 } });
  const json = JSON.stringify({
    ...base(),
    hacker: '<script>',
    range: { startMs: 1, endMs: 2, tz: long, more: 1 },
    prs: [...Array.from({ length: 70 }, (_, i) => pr(i)), { exerciseId: 'x'.repeat(81), name: 'a', type: 'maxWeight', valueKg: 1, previousKg: 0, atMs: 1 }],
    topExercises: [{ bad: true }, ...Array.from({ length: 9 }, (_, i) => top(i))],
    muscleSets: { byMuscle: { chest: 2, wings: 5, back: 0 }, fullBody: 1 },
    effort: { avg: null, shareAtOrBelow3: null, buckets: [1, 2, 3, 4], total: 1, rated: 1, fromRpe: 0 },
    bodyweight: { startKg: 80, endKg: 79, changeKg: -1, startMs: 1, endMs: 2, count: 2, raw: [1, 2] },
  }).replace('"hacker"', '"__proto__":{"polluted":true},"hacker"');
  const s = parseSummaryV1(json)!;
  assert.ok(s);
  assert.equal('hacker' in s, false);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal((s as unknown as Record<string, unknown>).polluted, undefined);
  assert.equal([...s.range.tz].length, 80);
  assert.equal('more' in s.range, false);
  assert.equal(s.prs!.length, SUMMARY_MAX_PRS);
  assert.ok(s.prs!.every((p) => [...p.name].length === 80 && !('extra' in p)));
  assert.equal(s.topExercises!.length, 5);
  assert.deepEqual(s.topExercises![0].first, { weightKg: 1, reps: 1, atMs: 1 });
  assert.deepEqual(s.muscleSets, { byMuscle: { chest: 2 }, fullBody: 1 });
  assert.equal('effort' in s, false); // 칸 수 틀림 → 섹션 버림
  assert.equal('raw' in s.bodyweight!, false);
  // NaN(객체로 넘긴 경우)·음수 근육 → 그 섹션만 버림
  const t = parseSummaryV1({ ...base(), delta: { workouts: Number.NaN, durationSec: 0, volumeKg: 0, perWeek: 0 }, muscleSets: { byMuscle: { chest: -1 }, fullBody: 0 } })!;
  assert.equal('delta' in t, false);
  assert.equal('muscleSets' in t, false);
});

// ── 64KB · 1년치 ───────────────────────────────────────────────────────

function yearDefs(endMs: number): WorkoutDef[] {
  const defs: WorkoutDef[] = [];
  const pool = [EX.bench, EX.squat, EX.pullup, EX.dip, EX.custom, EX.run];
  for (let d = 730; d > 0; d--) {
    if (d % 7 > 3) continue; // 주 4회
    const at = endMs - d * DAY + 7 * 3_600_000;
    const prog = (730 - d) / 7; // 매주 조금씩 오른다 → PR 이 많이 생긴다
    defs.push({
      at,
      blocks: pool.map((ex, i) => ({
        ex,
        variant: i === 0 && d % 2 ? 'equip:hammer' : null,
        sets: [
          { w: 20 + prog, r: 10, warm: true },
          { w: 40 + prog + i, r: 8, rir: 2 },
          { w: 40 + prog + i, r: 8, rpe: 8.5 },
          { w: 42.5 + prog + i, r: 6, rir: 1 },
        ],
      })),
    });
  }
  return defs;
}

test('1년치 표본 — 스냅샷 64KB 이하 · parse 왕복이 같다', () => {
  const r = { startMs: NOW - 365 * DAY, endMs: NOW, tz: 'Asia/Seoul' };
  const raw = buildRaw(yearDefs(NOW), 80);
  const logs = Array.from({ length: 365 }, (_, i) => ({ id: `bw${i}`, measuredAt: NOW - (365 - i) * DAY, weightKg: 85 - i * 0.01, updatedAt: 1 }));
  const s = memberSummary(raw, r, 80, logs);
  assert.ok(s.counts.workouts > 200);
  assert.equal(s.prs!.length, SUMMARY_MAX_PRS);
  const bytes = summaryByteLength(s);
  assert.ok(bytes <= SUMMARY_MAX_BYTES, `${bytes}B`);
  assert.ok(fitsSummaryLimit(s));
  assert.deepEqual(parseSummaryV1(serializeSummaryV1(s)), s);
});

// ── 회원 요약 = 트레이너 리포트(같은 숫자) ─────────────────────────────

test('맨몸·보조 표본 — 회원 요약과 memberReportFromRecords 의 세션 수·총 볼륨(캐시)·부위별 세트 수·PR 수가 같다', () => {
  const raw = buildRaw(yearDefs(NOW), 80);
  for (const preset of ['7d', '4w', '3m'] as const) {
    const range = summaryRange(preset, NOW, 'Asia/Seoul');
    const member = memberSummary(raw, range, 80, [{ id: 'b', measuredAt: range.startMs + DAY, weightKg: 80, updatedAt: 1 }]);
    const recs = serverRecords(raw, range);
    // 허용 밖 칸이 응답 표본에 없음(서버 흉내 확인)
    assert.equal(recs.setLogs.some((s) => s.includes('세트 메모')), false);
    const trainer = buildPeriodSummary(memberReportFromRecords(recs, range, { catalog }));
    assert.ok(member.counts.workouts > 0, preset);
    assert.equal(trainer.counts.workouts, member.counts.workouts, preset);
    assert.equal(trainer.counts.volumeKg, member.counts.volumeKg, preset);
    assert.equal(trainer.counts.durationSec, member.counts.durationSec, preset);
    assert.deepEqual(trainer.delta, member.delta, preset);
    assert.deepEqual(trainer.muscleSets, member.muscleSets, preset);
    assert.equal(trainer.prCount, member.prCount, preset);
    assert.deepEqual(trainer.effort, member.effort, preset);
    // 트레이너 쪽: 새 기록 목록·체중 없음
    assert.equal('prs' in trainer, false);
    assert.equal('bodyweight' in trainer, false);
    assert.ok(member.bodyweight);
    // 맨몸 종목 최고 세트: 회원 = 체중 + 가중분, 트레이너 = 가중분만(S-12)
    const mp = member.topExercises!.find((t) => t.exerciseId === EX.pullup.id);
    const tp = trainer.topExercises!.find((t) => t.exerciseId === EX.pullup.id);
    assert.ok(mp && tp, preset);
    assert.equal(Math.round((mp.last.weightKg - tp.last.weightKg) * 10) / 10, 80);
  }
});

test('memberReportFromRecords — 깨진 줄·객체 아닌 줄은 건너뛴다 · 카탈로그 없으면 시드 종목 근육은 빠진다', () => {
  const range = R4;
  const raw = buildRaw([{ at: R4.startMs + DAY, blocks: [{ ex: EX.bench, sets: [{ w: 60, r: 5 }] }, { ex: EX.custom, sets: [{ w: 30, r: 10 }] }] }], null);
  const recs = serverRecords(raw, range);
  const input = memberReportFromRecords({ ...recs, setLogs: [...recs.setLogs, '{깨짐', '42', 'null'] }, range);
  assert.equal(input.sets.length, 2);
  assert.equal(input.bodyweightKg, null);
  assert.equal(input.prList, false);
  const s = buildPeriodSummary(input);
  assert.deepEqual(s.muscleSets, { byMuscle: { back: 1, biceps: 0.5 }, fullBody: 0 }); // 커스텀만 응답에 있다
  assert.equal(s.counts.workouts, 1);
});
