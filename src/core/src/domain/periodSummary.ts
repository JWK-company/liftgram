// @plm SRS-079 SRS-080 ADR-040  기간 성과 요약(SummaryV1) 계산 — 회원 미리보기·코치에게 보내는 스냅샷·트레이너 리포트가 이 함수 하나를 쓴다.
//
// 규칙(SAD-024 ① · ADR-040 개정):
//   · 기간은 [startMs, endMs) 이고 운동은 **started_at** 으로 넣고 뺀다. 서버 GetMemberRecords 가 started_at 으로 거르므로
//     회원·트레이너가 같은 운동 집합을 보게 하려면 같은 기준이어야 한다(통계 카드의 completed_at 기준과 하루 경계에서 다를 수 있다).
//   · 직전 비교(delta)는 바로 앞의 같은 길이 [startMs − 길이, startMs) 이다.
//   · 총 볼륨 = workouts.total_volume_kg(완료 때 저장한 캐시) 합, PR 수 = workouts.pr_count 합. 맨몸·보조 종목 볼륨은 체중이
//     있어야 계산되는데 트레이너는 체중을 받지 않는다 — 캐시를 양쪽이 같이 써서 「같은 숫자」를 지킨다(S-12).
//   · 세트 단위 계산(최고 세트·PR 목록)은 넘겨받은 체중으로 한다. 체중이 없으면(트레이너) 맨몸 = 가중분만이다.
//   · 부위별 세트 = muscleLoad.setsByMuscle(ADR-039) · 힘든 정도 = effort.summarizeEffort(ADR-038) · 체중 = bodyweight 이력.
//   · 값이 없는 섹션은 키째 뺀다(undefined 키도 남기지 않는다) — 화면·보낼 항목 목록에 빈 칸이 생기지 않게.
//   · 사실 숫자만 담는다. 평가·권고 문장은 core 에도 화면에도 없다(SRS-015 웰니스).
import { dayNumber } from './streak';
import { emptyMuscleLoad, MAP_MUSCLES, setsByMuscle, type MapMuscle, type MuscleLoad, type MuscleLoadItem } from './muscleLoad';
import { summarizeEffort, type EffortInputSet } from './effort';
import { sortBodyweightLogs, type BodyweightLogLike } from './bodyweight';
import { detectMajorPRs, EMPTY_PR, mergeSnapshots, pickPrSets, snapshotFromSets, type PRSnapshot } from './personalRecords';
import { effectiveReps, effectiveWeightKg, resolveLoadMode } from './volume';
import { legacyMachineVariantToV6 } from './variants';
import { isCardioKind, type AppLanguage, type ExerciseKind, type LoadMode, type LoggedSet, type MuscleGroup } from './types';

// ── 스냅샷 계약(SummaryV1) ────────────────────────────────────────────

/** 스냅샷 판 — 서버가 아는 판은 {1}. 칸 뜻을 바꾸면 판을 올린다(서버 상수·parseSummaryV1 함께). */
export const SUMMARY_SCHEMA_VERSION = 1 as const;
/** 기간 최대 길이(일) — 서버 GetMemberRecords·SendProgressSummary 상한과 같다. */
export const SUMMARY_MAX_RANGE_DAYS = 400;
/** 많이 한 종목 상위 몇 개 */
export const SUMMARY_TOP_EXERCISES = 5;
/** 새 기록 목록 상한(가장 최근 것부터 남긴다) */
export const SUMMARY_MAX_PRS = 50;

const DAY_MS = 86_400_000;

export interface SummaryRange {
  /** 시작(포함) epoch ms — 보통 회원 로컬 자정 */
  startMs: number;
  /** 끝(제외) epoch ms */
  endMs: number;
  /** 회원 시간대(IANA · 예 'Asia/Seoul') — 트레이너가 회원 기준 날짜로 보이게. 모르면 ''. */
  tz: string;
}

export interface SummaryCounts {
  /** 완료한 운동 수 */
  workouts: number;
  /** 총 운동 시간(초) */
  durationSec: number;
  /** 총 볼륨(kg) — workouts.total_volume_kg 캐시 합 */
  volumeKg: number;
  /** 주당 운동 수(0.1 단위) */
  perWeek: number;
}

export interface SummaryBestSet {
  /** 계산 무게(kg — 배수·하중모드 반영, 체중이 없으면 맨몸 = 가중분) */
  weightKg: number;
  reps: number;
  /** 그 운동의 시작 시각 */
  atMs: number;
}

export interface SummaryTopExercise {
  exerciseId: string;
  /** 보낸 사람 기준 표시 이름(≤80자) — 받는 쪽은 exerciseId 로 자기 카탈로그 이름을 먼저 찾는다 */
  name: string;
  /** 기간 안 작업 세트 수(워밍업·실패·미수행 제외) */
  sets: number;
  /** 이 종목을 한 운동 수 */
  sessions: number;
  /** 기간 첫 운동의 최고 세트 → 마지막 운동의 최고 세트 */
  first: SummaryBestSet;
  last: SummaryBestSet;
}

export type SummaryPrType = 'maxWeight' | 'maxVolumeSet';

export interface SummaryPr {
  exerciseId: string;
  name: string;
  type: SummaryPrType;
  /** 새 값(kg — maxWeight 는 무게, maxVolumeSet 은 세트 볼륨) */
  valueKg: number;
  /** 그 전 최고(없었으면 0) */
  previousKg: number;
  atMs: number;
}

export interface SummaryMuscleSets {
  /** 0 이 아닌 근육만(0.5 단위) — 그림용 MuscleLoad 는 muscleLoadFromSummary 로 */
  byMuscle: Partial<Record<MapMuscle, number>>;
  fullBody: number;
}

export interface SummaryEffort {
  /** 평균 RIR(아는 세트 0 이면 null) */
  avg: number | null;
  /** 여유 3개 이하 비율 0~1 */
  shareAtOrBelow3: number | null;
  /** [0, 1, 2, 3, 4+] 칸별 세트 수 */
  buckets: number[];
  /** 대상 세트 수 · RIR 을 아는 세트 수 · rpe 환산으로 안 세트 수 */
  total: number;
  rated: number;
  fromRpe: number;
}

export interface SummaryBodyweight {
  startKg: number;
  endKg: number;
  /** endKg − startKg */
  changeKg: number;
  startMs: number;
  endMs: number;
  /** 기간 안 측정 수 */
  count: number;
}

export interface SummaryV1 {
  schemaVersion: typeof SUMMARY_SCHEMA_VERSION;
  range: SummaryRange;
  counts: SummaryCounts;
  /** 이번 − 직전 같은 길이 기간 */
  delta?: SummaryCounts;
  /** 기간 PR 수(workouts.pr_count 합) */
  prCount?: number;
  /** 기간 새 기록 목록(회원 쪽만 · 트레이너 리포트는 개수만) */
  prs?: SummaryPr[];
  topExercises?: SummaryTopExercise[];
  muscleSets?: SummaryMuscleSets;
  effort?: SummaryEffort;
  bodyweight?: SummaryBodyweight;
}

/** 켜고 끌 수 있는 섹션(range·counts·schemaVersion 은 늘 있다). 'prs' 는 prs 와 prCount 를 함께 뺀다. */
export type SummarySection = 'delta' | 'prs' | 'topExercises' | 'muscleSets' | 'effort' | 'bodyweight';
export const SUMMARY_SECTIONS: readonly SummarySection[] = ['delta', 'prs', 'topExercises', 'muscleSets', 'effort', 'bodyweight'];

/** 보내기 시트 기본 토글 — 체중만 꺼짐(S-11 · SRS-080 신체정보 기본 제외). */
export const SUMMARY_DEFAULT_OFF: readonly SummarySection[] = ['bodyweight'];

// ── 계산 입력(정규화한 레코드 — raw 변환은 summaryRecords.ts) ─────────────────

export interface SummaryWorkoutRec {
  id: string;
  state: string | null;
  startedAt: number;
  completedAt: number | null;
  durationSec: number | null;
  totalVolumeKg: number | null;
  prCount: number | null;
}

export interface SummaryBlockRec {
  id: string;
  workoutId: string;
  exerciseId: string;
  /** 변형 버킷 키(PR 칸) — null = 기본 */
  variantKey: string | null;
  /** 레거시 v5 기구 키(variant_key 가 없을 때만 승계) */
  machineVariant?: string | null;
}

export interface SummarySetRec {
  id: string;
  blockId: string;
  weightKg: number;
  reps: number;
  rpe?: number | null;
  rir?: number | null;
  isWarmup?: boolean | null;
  isFailed?: boolean | null;
  setType?: string | null;
  /** null(옛 세트) = 수행함. false 만 뺀다 */
  done?: boolean | null;
  loadMultiplier?: number | null;
}

export interface SummaryExerciseRec {
  id: string;
  nameKo: string;
  nameEn?: string | null;
  primaryMuscles: readonly MuscleGroup[];
  secondaryMuscles: readonly MuscleGroup[];
  equipment: string;
  kind?: ExerciseKind | null;
  loadMode?: LoadMode | null;
}

export interface PeriodSummaryInput {
  range: SummaryRange;
  /** 기간 + 직전 기간의 운동(그보다 앞선 이력이 있어도 된다 — prList 일 때 PR 기준선으로 쓴다) */
  workouts: readonly SummaryWorkoutRec[];
  blocks: readonly SummaryBlockRec[];
  sets: readonly SummarySetRec[];
  exercises: readonly SummaryExerciseRec[];
  /** 세트 계산 체중(kg). null = 맨몸은 가중분만(트레이너 쪽) */
  bodyweightKg?: number | null;
  /** 체중 이력 — 없으면 bodyweight 섹션 없음(트레이너 쪽은 늘 없음) */
  bodyweightLogs?: readonly BodyweightLogLike[];
  /**
   * true = workouts 에 기간 앞의 전 이력이 다 들어 있다 → 새 기록 목록(prs)을 만든다(회원 쪽).
   * false(기본) = 목록 없이 개수(prCount)만(트레이너 쪽 — 이력이 [start − 길이, end) 뿐이라 기준선이 틀린다 · S-3).
   */
  prList?: boolean;
  lang?: AppLanguage;
  /** 표시 이름(사용자가 부르는 이름 — ADR-033). 없으면 nameKo/nameEn */
  displayName?: (exerciseId: string) => string | null | undefined;
}

// ── 기간 ────────────────────────────────────────────────────────────

/** 기간 고르기 — 7일·4주·3개월(직접은 customSummaryRange) */
export type SummaryPreset = '7d' | '4w' | '3m';

function localMidnight(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function addLocalDays(midnightMs: number, days: number): number {
  const d = new Date(midnightMs);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

/** 지금 기기 시간대 이름(모르면 '') */
export function currentTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

/**
 * 오늘을 포함해 끝나는 로컬 날짜 기간. 끝 = 내일 로컬 자정(제외).
 * 7d = 오늘 포함 7일 · 4w = 28일 · 3m = 석 달 전 같은 날의 다음 날부터(10/27 → 7/28~10/27).
 */
export function summaryRange(preset: SummaryPreset, nowMs: number, tz: string = currentTimeZone()): SummaryRange {
  const today = localMidnight(nowMs);
  const endMs = addLocalDays(today, 1);
  let startMs: number;
  if (preset === '7d') startMs = addLocalDays(today, -6);
  else if (preset === '4w') startMs = addLocalDays(today, -27);
  else {
    const d = new Date(today);
    startMs = new Date(d.getFullYear(), d.getMonth() - 3, d.getDate() + 1).getTime();
  }
  return { startMs, endMs, tz };
}

/** 직접 고른 날짜(로컬 'YYYY-MM-DD', 끝 날짜 포함) → [시작 자정, 끝 다음 날 자정). 형식이 틀리거나 거꾸로면 null. */
export function customSummaryRange(startDay: string, endDayInclusive: string, tz: string = currentTimeZone()): SummaryRange | null {
  const p = (s: string): number | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
    return d.getTime();
  };
  const s = p(startDay);
  const e = p(endDayInclusive);
  if (s === null || e === null || e < s) return null;
  return { startMs: s, endMs: addLocalDays(e, 1), tz };
}

/** 기간 일수(로컬 날짜 기준 — 서머타임 날도 1일) */
export function summaryRangeDays(range: Pick<SummaryRange, 'startMs' | 'endMs'>): number {
  return Math.max(0, dayNumber(range.endMs) - dayNumber(range.startMs)) || Math.max(0, Math.round((range.endMs - range.startMs) / DAY_MS));
}

/** 서버가 받아 주는 기간인가 — start < end · 길이 ≤ 400일 · 끝 ≤ now + 1일 */
export function isValidSummaryRange(range: Pick<SummaryRange, 'startMs' | 'endMs'>, nowMs: number): boolean {
  const { startMs, endMs } = range;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs <= 0 || startMs >= endMs) return false;
  if (endMs - startMs > SUMMARY_MAX_RANGE_DAYS * DAY_MS) return false;
  return endMs <= nowMs + DAY_MS;
}

/** 직전 같은 길이 기간 [start − 길이, start) — 트레이너 요청 기간을 서버가 두 배로 내주는 범위와 같다. */
export function previousRange(range: Pick<SummaryRange, 'startMs' | 'endMs'>): { startMs: number; endMs: number } {
  const len = range.endMs - range.startMs;
  return { startMs: range.startMs - len, endMs: range.startMs };
}

// ── 계산 ────────────────────────────────────────────────────────────

const r1 = (x: number): number => Math.round(x * 10) / 10;
const r2 = (x: number): number => Math.round(x * 100) / 100;
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

function isCompleted(w: SummaryWorkoutRec): boolean {
  return w.state === 'completed' && finite(w.startedAt);
}

function workoutDurationSec(w: SummaryWorkoutRec): number {
  if (finite(w.durationSec) && w.durationSec >= 0) return w.durationSec;
  if (finite(w.completedAt) && w.completedAt > w.startedAt) return Math.round((w.completedAt - w.startedAt) / 1000);
  return 0;
}

function countsOf(ws: readonly SummaryWorkoutRec[], days: number): SummaryCounts {
  let durationSec = 0;
  let volumeKg = 0;
  for (const w of ws) {
    durationSec += workoutDurationSec(w);
    if (finite(w.totalVolumeKg) && w.totalVolumeKg > 0) volumeKg += w.totalVolumeKg;
  }
  return {
    workouts: ws.length,
    durationSec: Math.round(durationSec),
    volumeKg: r1(volumeKg),
    perWeek: days > 0 ? r1((ws.length * 7) / days) : 0,
  };
}

function isPerformed(s: SummarySetRec): boolean {
  return s.done !== false;
}

function toLogged(s: SummarySetRec, ex: SummaryExerciseRec | undefined, bodyweightKg: number | null): LoggedSet {
  return {
    weightKg: finite(s.weightKg) ? s.weightKg : 0,
    reps: finite(s.reps) ? s.reps : 0,
    rpe: s.rpe ?? null,
    rir: s.rir ?? null,
    isWarmup: s.isWarmup === true,
    isFailed: s.isFailed === true,
    loadMode: ex ? resolveLoadMode({ loadMode: ex.loadMode ?? null, equipment: ex.equipment }) : null,
    bodyweightKg,
    loadMultiplier: s.loadMultiplier ?? null,
  };
}

function variantOf(b: SummaryBlockRec): string | null {
  return b.variantKey ?? (b.machineVariant ? legacyMachineVariantToV6(b.machineVariant).key : null);
}

function nameOf(id: string, ex: SummaryExerciseRec | undefined, input: PeriodSummaryInput): string {
  const shown = input.displayName?.(id);
  const raw = shown || (input.lang === 'en' ? ex?.nameEn || ex?.nameKo : ex?.nameKo) || '';
  return [...raw].slice(0, 80).join('');
}

function compareWorkoutTime(a: SummaryWorkoutRec, b: SummaryWorkoutRec): number {
  return a.startedAt - b.startedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * 기간 성과 요약. 입력은 기간과 직전 기간(회원은 그 앞 이력까지)의 완료 운동·종목 블록·세트·종목, 그리고 체중.
 * 결과 객체에는 값이 있는 섹션 키만 있다.
 */
export function buildPeriodSummary(input: PeriodSummaryInput): SummaryV1 {
  const { range } = input;
  const { startMs, endMs } = range;
  const prev = previousRange(range);
  const days = summaryRangeDays(range);
  const bw = finite(input.bodyweightKg) && input.bodyweightKg > 0 ? input.bodyweightKg : null;

  const exById = new Map<string, SummaryExerciseRec>();
  for (const e of input.exercises) exById.set(e.id, e);
  const blocksByWorkout = new Map<string, SummaryBlockRec[]>();
  for (const b of input.blocks) {
    const arr = blocksByWorkout.get(b.workoutId);
    if (arr) arr.push(b);
    else blocksByWorkout.set(b.workoutId, [b]);
  }
  const setsByBlock = new Map<string, SummarySetRec[]>();
  for (const s of input.sets) {
    if (!isPerformed(s)) continue;
    const arr = setsByBlock.get(s.blockId);
    if (arr) arr.push(s);
    else setsByBlock.set(s.blockId, [s]);
  }

  const completed = input.workouts.filter(isCompleted);
  const current = completed.filter((w) => w.startedAt >= startMs && w.startedAt < endMs).sort(compareWorkoutTime);
  const before = completed.filter((w) => w.startedAt >= prev.startMs && w.startedAt < prev.endMs);

  const counts = countsOf(current, days);
  const prevCounts = countsOf(before, days);
  const delta: SummaryCounts = {
    workouts: counts.workouts - prevCounts.workouts,
    durationSec: counts.durationSec - prevCounts.durationSec,
    volumeKg: r1(counts.volumeKg - prevCounts.volumeKg),
    perWeek: r1(counts.perWeek - prevCounts.perWeek),
  };
  let prCount = 0;
  for (const w of current) if (finite(w.prCount) && w.prCount > 0) prCount += Math.round(w.prCount);

  // 부위별 세트·힘든 정도·종목별 최고 세트 — 기간 운동의 수행 세트만
  const muscleItems: MuscleLoadItem[] = [];
  const effortItems: EffortInputSet[] = [];
  const perExercise = new Map<string, { sets: number; sessions: { atMs: number; best: LoggedSet }[] }>();
  for (const w of current) {
    const byEx = new Map<string, LoggedSet[]>();
    for (const b of blocksByWorkout.get(w.id) ?? []) {
      const ex = exById.get(b.exerciseId);
      const cardio = ex ? isCardioKind(ex.kind) : false;
      for (const s of setsByBlock.get(b.id) ?? []) {
        effortItems.push({ completedAt: w.startedAt, rir: s.rir, rpe: s.rpe, done: s.done, isWarmup: s.isWarmup, setType: s.setType });
        if (!ex || cardio) continue;
        muscleItems.push({ primaryMuscles: ex.primaryMuscles, secondaryMuscles: ex.secondaryMuscles, isWarmup: s.isWarmup, setType: s.setType, isFailed: s.isFailed }); // 실패 세트 제외는 setsByMuscle(ADR-039 개정)
        const arr = byEx.get(b.exerciseId);
        const l = toLogged(s, ex, bw);
        if (arr) arr.push(l);
        else byEx.set(b.exerciseId, [l]);
      }
    }
    for (const [exId, logged] of byEx) {
      const working = logged.filter((l) => !l.isWarmup && !l.isFailed);
      if (!working.length) continue;
      const best = pickPrSets(working).weight;
      const cur = perExercise.get(exId) ?? { sets: 0, sessions: [] };
      cur.sets += working.length;
      if (best) cur.sessions.push({ atMs: w.startedAt, best });
      perExercise.set(exId, cur);
    }
  }

  const out: SummaryV1 = { schemaVersion: SUMMARY_SCHEMA_VERSION, range: { ...range }, counts, delta, prCount };

  // 새 기록 목록 — 회원 쪽만. 완료 판정(completeWorkout·recomputeWorkoutTotals)과 같은 규칙: (종목 × 변형) 칸 · 유산소 제외 ·
  // 칸별 「앞선 최고」를 completed_at 순으로 누적(sweepPrCounts 와 같은 순서).
  if (input.prList) {
    const prs: SummaryPr[] = [];
    const best = new Map<string, PRSnapshot>();
    const inRange = new Set(current.map((w) => w.id));
    const ordered = [...completed].sort(
      (a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    for (const w of ordered) {
      const groups = new Map<string, { exerciseId: string; logged: LoggedSet[] }>();
      for (const b of blocksByWorkout.get(w.id) ?? []) {
        const ex = exById.get(b.exerciseId);
        if (ex && isCardioKind(ex.kind)) continue;
        const key = `${b.exerciseId}::${variantOf(b) ?? ''}`;
        const logged = (setsByBlock.get(b.id) ?? []).map((s) => toLogged(s, ex, bw));
        const g = groups.get(key);
        if (g) g.logged.push(...logged);
        else groups.set(key, { exerciseId: b.exerciseId, logged });
      }
      const snaps = [...groups.entries()].map(([key, g]) => ({ key, exerciseId: g.exerciseId, snap: snapshotFromSets(g.logged) }));
      if (inRange.has(w.id)) {
        for (const g of snaps) {
          for (const r of detectMajorPRs(g.snap, best.get(g.key) ?? EMPTY_PR)) {
            prs.push({
              exerciseId: g.exerciseId,
              name: nameOf(g.exerciseId, exById.get(g.exerciseId), input),
              type: r.type as SummaryPrType,
              valueKg: r1(r.current),
              previousKg: r1(r.previous),
              atMs: w.startedAt,
            });
          }
        }
      }
      for (const g of snaps) best.set(g.key, mergeSnapshots(best.get(g.key) ?? EMPTY_PR, g.snap));
    }
    if (prs.length) {
      prs.sort((a, b) => a.atMs - b.atMs);
      out.prs = prs.slice(-SUMMARY_MAX_PRS);
    }
  }

  // 많이 한 종목 — 작업 세트 수 많은 순(같으면 운동 수 · id)
  const top = [...perExercise.entries()]
    .filter(([, v]) => v.sessions.length > 0)
    .sort((a, b) => b[1].sets - a[1].sets || b[1].sessions.length - a[1].sessions.length || (a[0] < b[0] ? -1 : 1))
    .slice(0, SUMMARY_TOP_EXERCISES)
    .map(([exerciseId, v]): SummaryTopExercise => {
      const toBest = (x: { atMs: number; best: LoggedSet }): SummaryBestSet => ({
        weightKg: r1(effectiveWeightKg(x.best)),
        reps: effectiveReps(x.best),
        atMs: x.atMs,
      });
      return {
        exerciseId,
        name: nameOf(exerciseId, exById.get(exerciseId), input),
        sets: v.sets,
        sessions: v.sessions.length,
        first: toBest(v.sessions[0]),
        last: toBest(v.sessions[v.sessions.length - 1]),
      };
    });
  if (top.length) out.topExercises = top;

  const load = setsByMuscle(muscleItems);
  const muscleSets = summaryMuscleSetsOf(load);
  if (muscleSets) out.muscleSets = muscleSets;

  const eff = summarizeEffort(effortItems, { startMs, endMs });
  if (eff.coverage.rated > 0) {
    out.effort = {
      avg: eff.avg === null ? null : r2(eff.avg),
      shareAtOrBelow3: eff.shareAtOrBelow3 === null ? null : r2(eff.shareAtOrBelow3),
      buckets: [...eff.buckets],
      total: eff.coverage.total,
      rated: eff.coverage.rated,
      fromRpe: eff.coverage.fromRpe,
    };
  }

  if (input.bodyweightLogs?.length) {
    const logs = sortBodyweightLogs(input.bodyweightLogs).filter((l) => l.measuredAt >= startMs && l.measuredAt < endMs);
    if (logs.length) {
      const a = logs[0];
      const z = logs[logs.length - 1];
      out.bodyweight = {
        startKg: r1(a.weightKg),
        endKg: r1(z.weightKg),
        changeKg: r1(z.weightKg - a.weightKg),
        startMs: a.measuredAt,
        endMs: z.measuredAt,
        count: logs.length,
      };
    }
  }

  return out;
}

/** MuscleLoad → 스냅샷 모양(0 인 근육 키는 뺀다). 전부 0 이면 null. */
export function summaryMuscleSetsOf(load: MuscleLoad): SummaryMuscleSets | null {
  const byMuscle: Partial<Record<MapMuscle, number>> = {};
  let any = load.fullBody > 0;
  for (const m of MAP_MUSCLES) {
    const v = load.byMuscle[m];
    if (v > 0) {
      byMuscle[m] = v;
      any = true;
    }
  }
  return any ? { byMuscle, fullBody: load.fullBody } : null;
}

/** 스냅샷 부위별 세트 → 그림·숫자 목록이 쓰는 MuscleLoad(없는 키 = 0). */
export function muscleLoadFromSummary(s: Pick<SummaryV1, 'muscleSets'>): MuscleLoad {
  const out = emptyMuscleLoad();
  if (!s.muscleSets) return out;
  for (const m of MAP_MUSCLES) out.byMuscle[m] = s.muscleSets.byMuscle[m] ?? 0;
  out.fullBody = s.muscleSets.fullBody;
  return out;
}

/** 이 요약에 실제로 있는 섹션(보내기 시트 토글 목록 — 없는 섹션은 토글도 없다). */
export function presentSections(s: SummaryV1): SummarySection[] {
  return SUMMARY_SECTIONS.filter((k) => (k === 'prs' ? s.prs !== undefined || s.prCount !== undefined : s[k] !== undefined));
}

/** 끈 섹션을 키째 뺀 새 객체(원본은 그대로). 'prs' 는 prs·prCount 를 함께 뺀다. */
export function omitSections(s: SummaryV1, sections: readonly SummarySection[]): SummaryV1 {
  const off = new Set(sections);
  const out: SummaryV1 = { schemaVersion: s.schemaVersion, range: { ...s.range }, counts: { ...s.counts } };
  if (s.delta && !off.has('delta')) out.delta = { ...s.delta };
  if (!off.has('prs')) {
    if (s.prCount !== undefined) out.prCount = s.prCount;
    if (s.prs) out.prs = s.prs.map((p) => ({ ...p }));
  }
  if (s.topExercises && !off.has('topExercises'))
    out.topExercises = s.topExercises.map((t) => ({ ...t, first: { ...t.first }, last: { ...t.last } }));
  if (s.muscleSets && !off.has('muscleSets')) out.muscleSets = { byMuscle: { ...s.muscleSets.byMuscle }, fullBody: s.muscleSets.fullBody };
  if (s.effort && !off.has('effort')) out.effort = { ...s.effort, buckets: [...s.effort.buckets] };
  if (s.bodyweight && !off.has('bodyweight')) out.bodyweight = { ...s.bodyweight };
  return out;
}
