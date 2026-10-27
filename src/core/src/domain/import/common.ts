// @plm SRS-081  가져오기 공통 — 파싱 결과 모양 · 현지 시각 정규화 · 숫자 읽기 · 파일 라벨.
//
// 시각은 **시간대 해석 전의 현지 시각 문자열**(`YYYY-MM-DDTHH:mm:ss`)로 들고 다닌다. 결정적 id 는 이 문자열로 만들고
// (기기 시간대·여행·서머타임과 무관 — D-7), epoch 변환은 계획(plan.ts)이 한 번만 한다.

export type ImportSourceKind = 'strong' | 'hevy';
export type ImportFormat = 'strong-comma' | 'strong-semicolon' | 'hevy';
export type ImportWeightUnit = 'kg' | 'lb';

/** 세트 종류 — Strong Set Order 의 W/D/F, Hevy set_type 의 warmup/dropset/failure */
export type ParsedSetKind = 'normal' | 'warmup' | 'drop' | 'failure';

export interface ParsedSet {
  line: number;
  kind: ParsedSetKind;
  /** 원본 무게 숫자(단위 변환 전). 비었으면 null */
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  /** 원본 거리 숫자(단위 변환 전) */
  distance: number | null;
  durationSec: number | null;
  note: string | null;
}

export interface ParsedExercise {
  /** 원본 종목 이름(트림) */
  name: string;
  note: string | null;
  /** Hevy superset_id(없으면 null) */
  supersetKey: string | null;
  sets: ParsedSet[];
}

export interface ParsedWorkout {
  /** 정규화 현지 시각 `YYYY-MM-DDTHH:mm:ss`(시간대 해석 전) — id 입력 */
  localStart: string;
  /** 파일이 시각에 시간대를 명시했으면(ISO `Z`·`+09:00`) 그 오프셋(분). 없으면 null = 기기·선택 시간대로 해석 */
  explicitOffsetMin: number | null;
  durationSec: number | null;
  title: string | null;
  note: string | null;
  exercises: ParsedExercise[];
  /** 이 운동이 시작한 원본 줄 */
  line: number;
}

/** 깨진 행의 이유 — 원본 내용은 싣지 않는다(줄 번호·칸 이름만). */
export type ParseIssueReason =
  | 'column_count'
  | 'bad_date'
  | 'bad_number'
  | 'bad_set_order'
  | 'missing_exercise_name'
  | 'unterminated_quote';

export interface ParseIssue {
  line: number;
  reason: ParseIssueReason;
  /** 문제가 된 칸 이름(헤더) */
  column?: string;
}

/** 파일 전체를 읽을 수 없는 이유 */
export type ParseFatal = 'empty' | 'unknown_format' | 'missing_columns';

export interface ParseResult {
  source: ImportSourceKind | null;
  format: ImportFormat | null;
  /** 파일이 밝힌 무게 단위. null = 파일에 없다(Strong 쉼표 형식) → 사용자가 고른다 */
  fileWeightUnit: ImportWeightUnit | null;
  /** 파일이 밝힌 거리 단위. null = 파일에 없다 → 무게 단위 선택을 따른다(kg→km, lb→mile) */
  fileDistanceUnit: 'm' | 'km' | 'mile' | null;
  workouts: ParsedWorkout[];
  issues: ParseIssue[];
  /** 데이터 행 수(헤더 제외) */
  rowCount: number;
  /** 읽어 들인 세트 수(깨진 행·휴식 타이머 행 제외) */
  setCount: number;
  fatal: ParseFatal | null;
  /** 읽을 수 없었던 필수 칸(헤더) — fatal='missing_columns' 일 때 */
  missingColumns?: string[];
}

export function emptyResult(fatal: ParseFatal | null, extra: Partial<ParseResult> = {}): ParseResult {
  return {
    source: null,
    format: null,
    fileWeightUnit: null,
    fileDistanceUnit: null,
    workouts: [],
    issues: [],
    rowCount: 0,
    setCount: 0,
    fatal,
    ...extra,
  };
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const p2 = (n: number) => String(n).padStart(2, '0');

function validParts(y: number, mo: number, d: number, h: number, mi: number, s: number): boolean {
  if (!(y >= 1970 && y <= 2200 && mo >= 1 && mo <= 12 && d >= 1 && h >= 0 && h <= 23 && mi >= 0 && mi <= 59 && s >= 0 && s <= 59))
    return false;
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= dim;
}

export interface LocalTime {
  /** `YYYY-MM-DDTHH:mm:ss` */
  local: string;
  /** 문자열에 시간대가 있으면 그 오프셋(분, UTC 기준 + 동쪽). 없으면 null */
  offsetMin: number | null;
}

/**
 * 원본 날짜 문자열 → 정규화 현지 시각. 지원:
 *   `2026-08-25 10:10:00` · `2026-08-25T10:10` · `2026-08-25T10:10:00.000Z` · `2026-08-25T10:10:00+09:00` ·
 *   `25 Aug 2026, 10:10` · `25 Aug 2026 10:10:30` · 오전/오후 표기(`10:10 PM`)
 * 초가 없으면 `:00` 을 붙인다 — 같은 운동을 형식이 다른 내보내기로 받아도 같은 id 가 나오게.
 */
export function normalizeLocalTime(raw: string): LocalTime | null {
  const s = raw.trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(s);
  if (m) {
    const [y, mo, d, h, mi, sec] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0', m[6] ?? '0'].map(Number);
    if (!validParts(y, mo, d, h, mi, sec)) return null;
    let offsetMin: number | null = null;
    const tz = m[7];
    if (tz) {
      if (tz.toUpperCase() === 'Z') offsetMin = 0;
      else {
        const t = /^([+-])(\d{2}):?(\d{2})$/.exec(tz);
        if (!t) return null;
        offsetMin = (t[1] === '-' ? -1 : 1) * (Number(t[2]) * 60 + Number(t[3]));
      }
    }
    return { local: `${y}-${p2(mo)}-${p2(d)}T${p2(h)}:${p2(mi)}:${p2(sec)}`, offsetMin };
  }
  m = /^(\d{1,2})\s+([A-Za-z]{3,4})\.?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/.exec(s);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (!mo) return null;
    let h = Number(m[4]);
    const ap = m[7]?.toLowerCase();
    if (ap) {
      if (h < 1 || h > 12) return null;
      if (ap === 'pm' && h !== 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
    }
    const [y, d, mi, sec] = [Number(m[3]), Number(m[1]), Number(m[5]), Number(m[6] ?? 0)];
    if (!validParts(y, mo, d, h, mi, sec)) return null;
    return { local: `${y}-${p2(mo)}-${p2(d)}T${p2(h)}:${p2(mi)}:${p2(sec)}`, offsetMin: null };
  }
  return null;
}

/** 정규화 현지 시각의 구성 요소 */
export function localParts(local: string): [number, number, number, number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new Error('정규화 현지 시각이 아님');
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])];
}

/** 두 현지 시각의 차(초) — 시간대와 무관하게 벽시계 차이 */
export function localDiffSec(a: string, b: string): number {
  const pa = localParts(a);
  const pb = localParts(b);
  const ua = Date.UTC(pa[0], pa[1] - 1, pa[2], pa[3], pa[4], pa[5]);
  const ub = Date.UTC(pb[0], pb[1] - 1, pb[2], pb[3], pb[4], pb[5]);
  return Math.round((ub - ua) / 1000);
}

/**
 * 숫자 칸 읽기. 빈 칸 → null(정상). 숫자가 아니면 NaN(깨진 행).
 * 세미콜론 파일(유럽 로캘)의 소수 쉼표 `100,5` 도 받는다 — 쉼표 파일에서는 따옴표 안에서만 그렇게 온다.
 */
export function readNumber(raw: string | undefined): number | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const t = /^-?\d+,\d+$/.test(s) ? s.replace(',', '.') : s;
  if (!/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return Number.NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

export function textOrNull(raw: string | undefined): string | null {
  const s = (raw ?? '').trim();
  return s ? s : null;
}

/**
 * 표시용 파일 라벨 — 경로·확장자를 떼고 40자(코드 포인트)로 자른다(D-16).
 * 원래 파일 이름은 서버로 가지 않는다 — 이 라벨만 import_batches.file_label 에 남는다.
 */
export const FILE_LABEL_MAX = 40;
export function importFileLabel(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  const noExt = base.replace(/\.[^.]{1,8}$/, '').trim();
  return Array.from(noExt).slice(0, FILE_LABEL_MAX).join('').trim();
}

/** 헤더 칸 이름 정규화(대소문자·앞뒤 공백·BOM 무시) */
export function headerKey(h: string): string {
  return h.replace(/^﻿/, '').trim().toLowerCase();
}
