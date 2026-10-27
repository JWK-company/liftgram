// @plm SRS-079 SRS-080 ADR-040  원본 레코드(snake_case raw) → 기간 성과 요약 입력.
//
// 회원 기기의 Watermelon `_raw` 와 서버 GetMemberRecords 응답(허용 칸만 남긴 같은 snake_case JSON)이 **같은 변환 함수**를
// 지나 buildPeriodSummary 로 간다. 그래서 「같은 회원·같은 기간이면 세션 수·총 볼륨(캐시)·부위별 세트 수가 같다」가
// 계산 한 벌로 구조적으로 보장된다(ADR-040 · S-12).
//
// 트레이너 쪽 규칙(memberReportFromRecords · ADR-040 개정 · S-3·S-12):
//   · 체중 없이 계산한다 — 맨몸 종목은 가중분만, 보조 종목은 입력 무게 그대로(volume.effectiveWeightKg 의 체중 미입력 폴백).
//   · PR 은 workouts.pr_count 합(prCount)만. 새 기록 목록(prs)은 만들지 않는다(기간 앞 이력이 없어 기준선이 틀린다).
//   · bodyweight 섹션은 없다(서버가 user_profiles·bodyweight_logs 를 영원히 내주지 않는다).
//   · 시드 종목은 응답에 없다 → 트레이너 기기 카탈로그(opts.catalog)로 근육·하중모드를 찾는다. 응답의 커스텀 종목이 우선.
//   · 결과·원본은 화면 컴포넌트 상태에만 둔다(Watermelon·localStorage·IndexedDB 에 쓰지 않는다 · S-20) — 이 모듈은 저장하지 않는다.
import type { BodyweightLogLike } from './bodyweight';
import type {
  PeriodSummaryInput,
  SummaryBlockRec,
  SummaryExerciseRec,
  SummaryRange,
  SummarySetRec,
  SummaryWorkoutRec,
} from './periodSummary';
import type { AppLanguage, ExerciseKind, LoadMode, MuscleGroup } from './types';

type Raw = Record<string, unknown>;

/** 4개 컬렉션의 raw 객체(기기 `_raw` 또는 서버 JSON 을 파싱한 것) */
export interface SummaryRawRecords {
  workouts: readonly Raw[];
  workoutExercises: readonly Raw[];
  setLogs: readonly Raw[];
  exercises: readonly Raw[];
}

/** GetMemberRecords 응답 모양(각 원소 = JSON 문자열). 생성 타입 GetMemberRecordsResponse 를 그대로 넘겨도 된다. */
export interface MemberRecordsLike {
  workouts: readonly string[];
  workoutExercises: readonly string[];
  setLogs: readonly string[];
  exercises: readonly string[];
}

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const numOr = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const boolOrNull = (v: unknown): boolean | null => (v === true || v === 1 ? true : v === false || v === 0 ? false : null);

/** primary_muscles — 기기·서버 모두 직렬화된 문자열(`"[\"chest\"]"`)이 기본, 배열도 받는다. */
function muscles(v: unknown): MuscleGroup[] {
  let arr: unknown = v;
  if (typeof v === 'string') {
    try {
      arr = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(arr) ? (arr.filter((m) => typeof m === 'string') as MuscleGroup[]) : [];
}

export function workoutFromRaw(r: Raw): SummaryWorkoutRec | null {
  const id = strOrNull(r.id);
  const startedAt = numOrNull(r.started_at);
  if (!id || startedAt === null) return null;
  return {
    id,
    state: strOrNull(r.state),
    startedAt,
    completedAt: numOrNull(r.completed_at),
    durationSec: numOrNull(r.duration_seconds),
    totalVolumeKg: numOrNull(r.total_volume_kg),
    prCount: numOrNull(r.pr_count),
  };
}

export function blockFromRaw(r: Raw): SummaryBlockRec | null {
  const id = strOrNull(r.id);
  const workoutId = strOrNull(r.workout_id);
  const exerciseId = strOrNull(r.exercise_id);
  if (!id || !workoutId || !exerciseId) return null;
  return { id, workoutId, exerciseId, variantKey: strOrNull(r.variant_key), machineVariant: strOrNull(r.machine_variant) };
}

export function setFromRaw(r: Raw): SummarySetRec | null {
  const id = strOrNull(r.id);
  const blockId = strOrNull(r.workout_exercise_id);
  if (!id || !blockId) return null;
  return {
    id,
    blockId,
    weightKg: numOr(r.weight_kg, 0),
    reps: numOr(r.reps, 0),
    rpe: numOrNull(r.rpe),
    rir: numOrNull(r.rir),
    isWarmup: boolOrNull(r.is_warmup),
    isFailed: boolOrNull(r.is_failed),
    setType: strOrNull(r.set_type),
    done: boolOrNull(r.done),
    loadMultiplier: numOrNull(r.load_multiplier),
  };
}

export function exerciseFromRaw(r: Raw): SummaryExerciseRec | null {
  const id = strOrNull(r.id);
  if (!id) return null;
  return {
    id,
    nameKo: typeof r.name_ko === 'string' ? r.name_ko : '',
    nameEn: strOrNull(r.name_en),
    primaryMuscles: muscles(r.primary_muscles),
    secondaryMuscles: muscles(r.secondary_muscles),
    equipment: typeof r.equipment === 'string' ? r.equipment : 'other',
    kind: (strOrNull(r.kind) as ExerciseKind | null) ?? null,
    loadMode: (strOrNull(r.load_mode) as LoadMode | null) ?? null,
  };
}

function collect<T>(rows: readonly Raw[], one: (r: Raw) => T | null): T[] {
  const out: T[] = [];
  for (const r of rows) {
    if (!isObj(r)) continue;
    const x = one(r);
    if (x) out.push(x);
  }
  return out;
}

export interface SummaryFromRawOptions {
  range: SummaryRange;
  /** 레코드에 없는 종목(시드)을 찾을 카탈로그 — 레코드 쪽이 우선 */
  catalog?: readonly SummaryExerciseRec[];
  bodyweightKg?: number | null;
  bodyweightLogs?: readonly BodyweightLogLike[];
  prList?: boolean;
  lang?: AppLanguage;
  displayName?: (exerciseId: string) => string | null | undefined;
}

/** raw 4컬렉션 → buildPeriodSummary 입력. 회원 화면(기기 `_raw`)과 트레이너 리포트(서버 JSON)가 같이 쓴다. */
export function summaryInputFromRaw(raw: SummaryRawRecords, opts: SummaryFromRawOptions): PeriodSummaryInput {
  const exById = new Map<string, SummaryExerciseRec>();
  for (const e of opts.catalog ?? []) exById.set(e.id, e);
  for (const e of collect(raw.exercises, exerciseFromRaw)) exById.set(e.id, e);
  return {
    range: opts.range,
    workouts: collect(raw.workouts, workoutFromRaw),
    blocks: collect(raw.workoutExercises, blockFromRaw),
    sets: collect(raw.setLogs, setFromRaw),
    exercises: [...exById.values()],
    bodyweightKg: opts.bodyweightKg ?? null,
    bodyweightLogs: opts.bodyweightLogs,
    prList: opts.prList ?? false,
    lang: opts.lang,
    displayName: opts.displayName,
  };
}

function parseRows(rows: readonly string[] | undefined): Raw[] {
  const out: Raw[] = [];
  for (const s of rows ?? []) {
    if (typeof s !== 'string') continue;
    try {
      const v: unknown = JSON.parse(s);
      if (isObj(v)) out.push(v);
    } catch {
      /* 깨진 줄은 건너뛴다 */
    }
  }
  return out;
}

export interface MemberReportOptions {
  /** 트레이너 기기 카탈로그(시드 종목) */
  catalog?: readonly SummaryExerciseRec[];
  lang?: AppLanguage;
  displayName?: (exerciseId: string) => string | null | undefined;
}

/**
 * GetMemberRecords 응답(컬렉션별 JSON 문자열 목록) → buildPeriodSummary 입력.
 * range 는 트레이너가 **요청한** 기간(서버가 내준 served 범위는 그 두 배 — 앞 절반이 직전 비교용)이다.
 * 체중 없이(맨몸 = 가중분만) · PR 은 pr_count 합만 · 새 기록 목록·체중 섹션 없음.
 */
export function memberReportFromRecords(
  records: MemberRecordsLike,
  range: SummaryRange,
  opts: MemberReportOptions = {},
): PeriodSummaryInput {
  return summaryInputFromRaw(
    {
      workouts: parseRows(records.workouts),
      workoutExercises: parseRows(records.workoutExercises),
      setLogs: parseRows(records.setLogs),
      exercises: parseRows(records.exercises),
    },
    { range, catalog: opts.catalog, bodyweightKg: null, bodyweightLogs: undefined, prList: false, lang: opts.lang, displayName: opts.displayName },
  );
}
