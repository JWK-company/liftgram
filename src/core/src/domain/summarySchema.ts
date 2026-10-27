// @plm SRS-079 SRS-080  성과 요약 스냅샷 검증 — 회원 미리보기·트레이너 열람 모두 렌더 **전에** parseSummaryV1 을 거친다(S-18).
//
// 받는 쪽은 보낸 사람이 고친 클라이언트일 수 있다고 본다. 그래서 받은 JSON 을 믿지 않고 아는 칸만 **새 객체로 다시 만든다**:
//   · 모르는 키는 버린다(복사하지 않으므로 __proto__ 같은 키도 따라오지 않는다).
//   · 배열 상한: prs ≤ 50 · topExercises ≤ 5 · effort.buckets = 정확히 5칸.
//   · 문자열 ≤ 80자(코드포인트 기준으로 자른다). id 가 80자를 넘으면 그 줄을 버린다(잘린 id 는 다른 종목을 가리킬 수 있다).
//   · 숫자는 유한값만. 필수 부분(schemaVersion·range·counts)이 틀리면 null, 선택 섹션이 틀리면 그 섹션만 버린다.
//   · schemaVersion 이 1 이 아니면 null(모르는 판은 그리지 않는다).
// 스냅샷 값으로 링크(href)·스타일을 만들지 않는다 — 화면 규칙(SummaryView).
import { MAP_MUSCLES, type MapMuscle } from './muscleLoad';
import {
  SUMMARY_MAX_PRS,
  SUMMARY_SCHEMA_VERSION,
  SUMMARY_TOP_EXERCISES,
  type SummaryBestSet,
  type SummaryBodyweight,
  type SummaryCounts,
  type SummaryEffort,
  type SummaryMuscleSets,
  type SummaryPr,
  type SummaryRange,
  type SummaryTopExercise,
  type SummaryV1,
} from './periodSummary';
import { EFFORT_RIR_BUCKET_COUNT } from './effort';

/** 서버 snapshot_json 상한(바이트) — buf.validate 와 같다. */
export const SUMMARY_MAX_BYTES = 65_536;
/** 스냅샷 안 문자열 상한(자) */
export const SUMMARY_MAX_STRING = 80;

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const cps = [...v];
  return cps.length > SUMMARY_MAX_STRING ? cps.slice(0, SUMMARY_MAX_STRING).join('') : v;
}
/** id — 80자 넘으면 버린다(자르지 않는다) */
function id(v: unknown): string | null {
  if (typeof v !== 'string' || !v || [...v].length > SUMMARY_MAX_STRING) return null;
  return v;
}
function nullableNum(v: unknown): number | null | undefined {
  if (v === null) return null;
  const n = num(v);
  return n === null ? undefined : n;
}

function parseRange(v: unknown): SummaryRange | null {
  if (!isObj(v)) return null;
  const startMs = num(v.startMs);
  const endMs = num(v.endMs);
  if (startMs === null || endMs === null || startMs >= endMs) return null;
  return { startMs, endMs, tz: str(v.tz) ?? '' };
}

function parseCounts(v: unknown): SummaryCounts | null {
  if (!isObj(v)) return null;
  const workouts = num(v.workouts);
  const durationSec = num(v.durationSec);
  const volumeKg = num(v.volumeKg);
  const perWeek = num(v.perWeek);
  if (workouts === null || durationSec === null || volumeKg === null || perWeek === null) return null;
  return { workouts, durationSec, volumeKg, perWeek };
}

function parseBest(v: unknown): SummaryBestSet | null {
  if (!isObj(v)) return null;
  const weightKg = num(v.weightKg);
  const reps = num(v.reps);
  const atMs = num(v.atMs);
  if (weightKg === null || reps === null || atMs === null) return null;
  return { weightKg, reps, atMs };
}

function parseTop(v: unknown): SummaryTopExercise | null {
  if (!isObj(v)) return null;
  const exerciseId = id(v.exerciseId);
  const name = str(v.name);
  const sets = num(v.sets);
  const sessions = num(v.sessions);
  const first = parseBest(v.first);
  const last = parseBest(v.last);
  if (exerciseId === null || name === null || sets === null || sessions === null || !first || !last) return null;
  return { exerciseId, name, sets, sessions, first, last };
}

function parsePr(v: unknown): SummaryPr | null {
  if (!isObj(v)) return null;
  const exerciseId = id(v.exerciseId);
  const name = str(v.name);
  const type = v.type === 'maxWeight' || v.type === 'maxVolumeSet' ? v.type : null;
  const valueKg = num(v.valueKg);
  const previousKg = num(v.previousKg);
  const atMs = num(v.atMs);
  if (exerciseId === null || name === null || !type || valueKg === null || previousKg === null || atMs === null) return null;
  return { exerciseId, name, type, valueKg, previousKg, atMs };
}

/** 배열 — 상한까지만 보고, 틀린 줄은 버린다. 배열이 아니면 null. */
function parseList<T>(v: unknown, max: number, one: (x: unknown) => T | null): T[] | null {
  if (!Array.isArray(v)) return null;
  const out: T[] = [];
  for (let i = 0; i < v.length && out.length < max; i++) {
    const x = one(v[i]);
    if (x) out.push(x);
  }
  return out;
}

function parseMuscleSets(v: unknown): SummaryMuscleSets | null {
  if (!isObj(v) || !isObj(v.byMuscle)) return null;
  const fullBody = num(v.fullBody);
  if (fullBody === null || fullBody < 0) return null;
  const src = v.byMuscle;
  const byMuscle: Partial<Record<MapMuscle, number>> = {};
  for (const m of MAP_MUSCLES) {
    if (!Object.prototype.hasOwnProperty.call(src, m)) continue;
    const n = num(src[m]);
    if (n === null || n < 0) return null;
    if (n > 0) byMuscle[m] = n;
  }
  return { byMuscle, fullBody };
}

function parseEffort(v: unknown): SummaryEffort | null {
  if (!isObj(v)) return null;
  const avg = nullableNum(v.avg);
  const share = nullableNum(v.shareAtOrBelow3);
  const total = num(v.total);
  const rated = num(v.rated);
  const fromRpe = num(v.fromRpe);
  if (avg === undefined || share === undefined || total === null || rated === null || fromRpe === null) return null;
  if (!Array.isArray(v.buckets) || v.buckets.length !== EFFORT_RIR_BUCKET_COUNT) return null;
  const buckets: number[] = [];
  for (const b of v.buckets) {
    const n = num(b);
    if (n === null) return null;
    buckets.push(n);
  }
  return { avg, shareAtOrBelow3: share, buckets, total, rated, fromRpe };
}

function parseBodyweight(v: unknown): SummaryBodyweight | null {
  if (!isObj(v)) return null;
  const startKg = num(v.startKg);
  const endKg = num(v.endKg);
  const changeKg = num(v.changeKg);
  const startMs = num(v.startMs);
  const endMs = num(v.endMs);
  const count = num(v.count);
  if (startKg === null || endKg === null || changeKg === null || startMs === null || endMs === null || count === null) return null;
  return { startKg, endKg, changeKg, startMs, endMs, count };
}

/**
 * 받은 스냅샷(JSON 문자열 또는 이미 파싱한 값) → 검증한 SummaryV1. 그릴 수 없으면 null.
 * 회원 미리보기(자기 계산 결과)와 트레이너 열람(GetProgressSummary.snapshot_json) 모두 이 함수를 거친다.
 */
export function parseSummaryV1(json: unknown): SummaryV1 | null {
  let v: unknown = json;
  if (typeof json === 'string') {
    try {
      v = JSON.parse(json);
    } catch {
      return null;
    }
  }
  if (!isObj(v) || v.schemaVersion !== SUMMARY_SCHEMA_VERSION) return null;
  const range = parseRange(v.range);
  const counts = parseCounts(v.counts);
  if (!range || !counts) return null;
  const out: SummaryV1 = { schemaVersion: SUMMARY_SCHEMA_VERSION, range, counts };

  if (v.delta !== undefined) {
    const d = parseCounts(v.delta);
    if (d) out.delta = d;
  }
  if (v.prCount !== undefined) {
    const n = num(v.prCount);
    if (n !== null && n >= 0) out.prCount = n;
  }
  if (v.prs !== undefined) {
    const prs = parseList(v.prs, SUMMARY_MAX_PRS, parsePr);
    if (prs && prs.length) out.prs = prs;
  }
  if (v.topExercises !== undefined) {
    const top = parseList(v.topExercises, SUMMARY_TOP_EXERCISES, parseTop);
    if (top && top.length) out.topExercises = top;
  }
  if (v.muscleSets !== undefined) {
    const m = parseMuscleSets(v.muscleSets);
    if (m) out.muscleSets = m;
  }
  if (v.effort !== undefined) {
    const e = parseEffort(v.effort);
    if (e) out.effort = e;
  }
  if (v.bodyweight !== undefined) {
    const b = parseBodyweight(v.bodyweight);
    if (b) out.bodyweight = b;
  }
  return out;
}

/** 보낼 JSON 문자열(snapshot_json). */
export function serializeSummaryV1(s: SummaryV1): string {
  return JSON.stringify(s);
}

/** UTF-8 바이트 수 — 서버 상한(SUMMARY_MAX_BYTES) 비교용. */
export function summaryByteLength(s: SummaryV1 | string): number {
  const text = typeof s === 'string' ? s : serializeSummaryV1(s);
  return new TextEncoder().encode(text).length;
}

/** 서버 상한 안인가(보내기 전 확인 — 넘으면 화면이 기간을 줄이라고 안내). */
export function fitsSummaryLimit(s: SummaryV1 | string): boolean {
  return summaryByteLength(s) <= SUMMARY_MAX_BYTES;
}
