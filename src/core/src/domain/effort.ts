// @plm SRS-073 SRS-074 ADR-038  세트 힘든 정도(RIR — 몇 개 더 할 수 있었나) 계산. 순수 함수 한 곳.
//
// 척도는 RIR 하나다(ADR-038). set_logs.rir 가 실제 값이고, rir 가 없고 rpe 만 있는 세트(옛 기록·가져온 기록)는
// **읽을 때** 10 − rpe 로 환산한다. 환산·자르기·null 처리는 여기 말고 다른 곳에 두지 않는다(ADR-037 QA B1 — optional 숫자 칸).
//
// 웰니스 가드레일: 사실 집계만 돌려준다(평균·분포·비율). 「더 세게 하세요」 같은 권고는 화면에도 두지 않는다.
import { dayNumber } from './streak';

/** RIR 범위 — 0(한계까지) ~ 10. 화면 선택지는 0·0.5·1·2·3·4+ 이고 「4+」 는 4 로 저장한다. */
export const EFFORT_RIR_MIN = 0;
export const EFFORT_RIR_MAX = 10;
/** RIR 단위 — 0.5 */
export const EFFORT_RIR_STEP = 0.5;
/** 「여유 3개 이하」 기준 */
export const EFFORT_RIR_HARD_THRESHOLD = 3;
/** 분포 칸 수 — [0, 1, 2, 3, 4+] */
export const EFFORT_RIR_BUCKET_COUNT = 5;

/** 숫자를 RIR 범위(0~10)로 자르고 0.5 단위로 맞춘다. 숫자가 아니면 null. */
export function normalizeRir(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const clipped = Math.min(EFFORT_RIR_MAX, Math.max(EFFORT_RIR_MIN, v));
  return Math.round(clipped / EFFORT_RIR_STEP) * EFFORT_RIR_STEP;
}

/** RPE → RIR 환산(10 − RPE, 0~10 으로 자름). 숫자가 아니면 null. */
export function rirFromRpe(rpe: number | null | undefined): number | null {
  if (rpe === null || rpe === undefined || !Number.isFinite(rpe)) return null;
  return normalizeRir(10 - rpe);
}

/** RIR 을 읽는 데 필요한 세트 칸 */
export interface EffortSetLike {
  rir?: number | null;
  rpe?: number | null;
}

/** 이 세트의 RIR — 적은 값(rir) 우선, 없으면 rpe 환산. 둘 다 없으면 null. */
export function effectiveRir(set: EffortSetLike): number | null {
  const own = normalizeRir(set.rir);
  if (own !== null) return own;
  return rirFromRpe(set.rpe);
}

/** RIR 값이 rpe 환산에서 왔는가(화면의 「≈RIR n」 표시용). */
export function isRirConverted(set: EffortSetLike): boolean {
  return normalizeRir(set.rir) === null && rirFromRpe(set.rpe) !== null;
}

/**
 * 분포 칸 번호 — 0·1·2·3·4+ 다섯 칸. 칸 k(0~3)는 (k−1, k] 이라 0.5 는 「1」 칸, 3.5 는 「4+」 칸이다.
 * 그래서 0~3 칸의 합 = 「여유 3개 이하」 세트 수가 정확히 맞는다.
 */
export function rirBucket(rir: number): number {
  return Math.min(EFFORT_RIR_BUCKET_COUNT - 1, Math.max(0, Math.ceil(rir)));
}

/** summarizeEffort 입력 — analyticsRepository.getCompletedSets 의 결과(EnrichedSet)를 그대로 넣을 수 있다. */
export interface EffortInputSet extends EffortSetLike {
  completedAt: number;
  /** 수행 완료 체크 — null(레거시) = 수행됨. false 만 뺀다. */
  done?: boolean | null;
  isWarmup?: boolean | null;
  /** 처방 세트 타입 — 'warmup' 이면 워밍업으로 뺀다. */
  setType?: string | null;
}

/** 기간 — [startMs, endMs). startMs 0·미지정 = 처음부터, endMs 미지정 = 끝없음. */
export interface EffortRange {
  startMs?: number;
  endMs?: number;
}

export interface EffortWeek {
  /** 그 주 월요일 로컬 자정(ms) */
  weekStartMs: number;
  /** RIR 을 아는 세트 수 */
  count: number;
  /** 평균 RIR(count 0 이면 null) */
  avg: number | null;
}

export interface EffortSummary {
  /** 평균 RIR(아는 세트 0 이면 null) */
  avg: number | null;
  /** 여유 3개 이하 비율 0~1(아는 세트 0 이면 null) */
  shareAtOrBelow3: number | null;
  /** [0, 1, 2, 3, 4+] 칸별 세트 수 */
  buckets: number[];
  /** 주별 추이 — 첫 기록 주부터 마지막 기록 주까지 빈 주 없이(빈 주는 count 0 · avg null) */
  weekly: EffortWeek[];
  coverage: {
    /** 대상 세트(완료 ∧ 워밍업 아님) 수 */
    total: number;
    /** 그중 RIR 을 아는 세트 수 */
    rated: number;
    /** 그중 rpe 환산으로 안 세트 수 */
    fromRpe: number;
    /** rated / total(대상 0 이면 null) */
    share: number | null;
  };
}

/** 노력 분석 대상 세트인가 — 완료(done≠false) ∧ 워밍업 아님(is_warmup 또는 처방 warmup). */
export function isEffortTarget(s: EffortInputSet): boolean {
  if (s.done === false) return false;
  if (s.isWarmup) return false;
  if (s.setType === 'warmup') return false;
  return true;
}

/** 로컬 날짜 기준 그 주(월요일 시작)의 dayNumber */
function weekStartDay(ms: number): number {
  const dn = dayNumber(ms);
  const dow = new Date(dn * 86400000).getUTCDay(); // 0=일
  return dn - ((dow + 6) % 7);
}

/** dayNumber → 그날 로컬 자정 ms */
function dayToLocalMs(dn: number): number {
  const u = new Date(dn * 86400000);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate()).getTime();
}

/** 기간 안 세트의 노력 요약. 대상 = 완료 ∧ 워밍업 아님, 값 = effectiveRir. */
export function summarizeEffort(sets: readonly EffortInputSet[], range: EffortRange = {}): EffortSummary {
  const start = range.startMs ?? 0;
  const end = range.endMs ?? Number.POSITIVE_INFINITY;
  const buckets = new Array<number>(EFFORT_RIR_BUCKET_COUNT).fill(0);
  let total = 0;
  let rated = 0;
  let fromRpe = 0;
  let sum = 0;
  let hard = 0;
  const byWeek = new Map<number, { count: number; sum: number }>();

  for (const s of sets) {
    if (!(s.completedAt >= start && s.completedAt < end)) continue;
    if (!isEffortTarget(s)) continue;
    total += 1;
    const r = effectiveRir(s);
    if (r === null) continue;
    rated += 1;
    if (isRirConverted(s)) fromRpe += 1;
    sum += r;
    if (r <= EFFORT_RIR_HARD_THRESHOLD) hard += 1;
    buckets[rirBucket(r)] += 1;
    const wk = weekStartDay(s.completedAt);
    const cur = byWeek.get(wk) ?? { count: 0, sum: 0 };
    cur.count += 1;
    cur.sum += r;
    byWeek.set(wk, cur);
  }

  const weekly: EffortWeek[] = [];
  if (byWeek.size) {
    const keys = [...byWeek.keys()];
    const first = Math.min(...keys);
    const last = Math.max(...keys);
    for (let wk = first; wk <= last; wk += 7) {
      const w = byWeek.get(wk);
      weekly.push({ weekStartMs: dayToLocalMs(wk), count: w?.count ?? 0, avg: w ? w.sum / w.count : null });
    }
  }

  return {
    avg: rated ? sum / rated : null,
    shareAtOrBelow3: rated ? hard / rated : null,
    buckets,
    weekly,
    coverage: { total, rated, fromRpe, share: total ? rated / total : null },
  };
}
