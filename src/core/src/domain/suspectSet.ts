// 튀는 기록 판정(SPEC-044 · SRS-109) — 「lb 기구에서 든 132 를 kg 칸에 132 로 적었다」 같은 실수를 앱이 먼저 찾아 묻는다.
//
// 규칙(의도적으로 단순 · 오탐을 줄이는 쪽 · REV-079):
//   · 같은 종목·같은 기록 칸의 **지난 완료 운동 2회 이상**이 있어야 판정한다(세트 수가 아니라 운동 수)
//   · 기준 = max(최근 6회의 최고 추정 1RM, 그 칸의 전체 기간 최고) — 디로드·부상 복귀 뒤 오탐을 줄인다(C-6)
//   · 후보 세트의 추정 1RM 이 기준의 1.3배를 **넘으면** 「확인 필요」(정확히 1.3배는 아니다 · 1e-9 여유)
//   · 웜업·실패·무게 0·횟수 0 세트, 맨몸·어시스트 종목, 유산소 지표가 있는 세트는 판정하지 않는다
//   · 옛 배수 null 기록은 후보 세트의 배수로 읽는다 — 플레이트 한쪽 입력 블록과 옛 기록이 2배로 보이던 오탐(C-1 · adoptLegacyMultiplier 와 같은 생각)
//   · 이유: 무게 비율과 횟수 비율 중 큰 쪽(같으면 무게) — 무게가 튀었고 lb 로 읽으면 평소 범위에 들어올 때만 「lb로 적었어요」를 권한다(C-8)
// 「확인 필요」 세트는 확인 전까지 PR·1RM·세트 방식 무게·다음 무게 제안에서 빠진다(LoggedSet.suspect · 볼륨은 그대로).
// 「제대로 적었어요」는 그때의 값 지문과 함께 적는다 — 값이 어느 경로로든 바뀌면 다시 판정한다(D-3).
import { estimateOneRepMax } from './oneRepMax';
import type { LoggedSet } from './types';
import { effectiveWeightKg } from './volume';

export const SUSPECT_RATIO = 1.3;
/** 판정에 필요한 지난 완료 운동 수 */
export const SUSPECT_MIN_WORKOUTS = 2;
/** 지난 기록으로 보는 최근 완료 운동 수 */
export const SUSPECT_LOOKBACK_WORKOUTS = 6;
/** lb 로 읽은 값이 평소 범위의 이 배수 안이면 「lb로 적었어요」를 권한다 */
export const LB_PLAUSIBLE_BAND: [number, number] = [0.8, 1.2];
const KG_PER_LB = 0.45359237;

export interface SuspectVerdict {
  suspect: boolean;
  /** 무게가 튀었나(weight) · 횟수가 튀었나(reps) — suspect 일 때만 */
  reason: 'weight' | 'reps' | null;
  /** 지난 기록 작업 세트 무게 범위(kg · **입력 무게** 기준 = 배수 전) — 안내 문구 「평소 55~60kg」 */
  usualKg: [number, number] | null;
  /** 무게를 lb 로 읽으면 평소 범위에 들어오나 — 「lb로 적었어요」 버튼을 보일지 */
  lbPlausible: boolean;
}

export const NOT_SUSPECT: SuspectVerdict = { suspect: false, reason: null, usualKg: null, lbPlausible: false };

/** 판정 대상 세트인가 — 웜업·실패·0 · 맨몸·어시스트·유산소 제외 */
export function isJudgeable(s: LoggedSet): boolean {
  if (s.isWarmup || s.isFailed) return false;
  if (!(s.weightKg > 0) || !(s.reps > 0)) return false;
  if (s.loadMode === 'bodyweight' || s.loadMode === 'assisted') return false;
  if ((s.durationSec ?? 0) > 0 || (s.distanceM ?? 0) > 0) return false;
  return true;
}

export interface SuspectHistory {
  /** 최근 완료 운동(최대 6회)의 세트 */
  recent: LoggedSet[];
  /** recent 가 나온 지난 완료 운동 수(수행 세트가 있는 것만) */
  workouts: number;
  /** 그 칸의 전체 기간 세트(최근 6회보다 오래된 것 포함) — 기준을 높이는 데만 쓴다 */
  older?: LoggedSet[];
}

/**
 * @param candidate 판정할 세트
 * @param hist      같은 종목·칸의 지난 기록(확인 필요 세트·웜업 등은 여기서 걸러진다)
 */
export function judgeSuspectSet(candidate: LoggedSet, hist: SuspectHistory): SuspectVerdict {
  if (!isJudgeable(candidate) || hist.workouts < SUSPECT_MIN_WORKOUTS) return NOT_SUSPECT;
  const mult = candidate.loadMultiplier ?? null;
  const adopt = (s: LoggedSet): LoggedSet => (s.loadMultiplier == null && mult != null ? { ...s, loadMultiplier: mult } : s);
  const usable = usableForBase;
  const recent = hist.recent.filter(usable).map(adopt);
  if (!recent.length) return NOT_SUSPECT;
  const all = [...recent, ...(hist.older ?? []).filter(usable).map(adopt)];
  let base = 0;
  for (const s of all) base = Math.max(base, estimateOneRepMax(effectiveWeightKg(s), s.reps));
  if (!(base > 0)) return NOT_SUSPECT;
  const e1rm = estimateOneRepMax(effectiveWeightKg(candidate), candidate.reps);
  if (!(e1rm > base * SUSPECT_RATIO + 1e-9)) return NOT_SUSPECT;
  // 평소 범위는 최근 기록의 입력 무게(배수 전) — 화면에 적는 숫자와 같은 기준(C-9a)
  let minIn = Number.POSITIVE_INFINITY;
  let maxIn = 0;
  let maxEff = 0;
  let maxReps = 0;
  for (const s of recent) {
    minIn = Math.min(minIn, s.weightKg);
    maxIn = Math.max(maxIn, s.weightKg);
    maxEff = Math.max(maxEff, effectiveWeightKg(s));
    maxReps = Math.max(maxReps, s.reps);
  }
  const wRatio = maxEff > 0 ? effectiveWeightKg(candidate) / maxEff : 1;
  const rRatio = maxReps > 0 ? candidate.reps / maxReps : 1;
  const reason: 'weight' | 'reps' = wRatio >= rRatio ? 'weight' : 'reps';
  const asLb = candidate.weightKg * KG_PER_LB;
  const lbPlausible = reason === 'weight' && asLb >= minIn * LB_PLAUSIBLE_BAND[0] - 1e-9 && asLb <= maxIn * LB_PLAUSIBLE_BAND[1] + 1e-9;
  return {
    suspect: true,
    reason,
    usualKg: [Math.round(minIn * 100) / 100, Math.round(maxIn * 100) / 100],
    lbPlausible,
  };
}

/** 기준이 될 수 있는 지난 세트 — 판정 대상이고 확인 필요가 아님 */
export function usableForBase(s: LoggedSet): boolean {
  return isJudgeable(s) && !s.suspect;
}

// ── 저장값(set_logs.check_state) ──────────────────────────────────
// null 보통 · 'suspect' 확인 필요 · 'confirmed:<효과 무게>x<횟수>' 확인함(그때의 값 지문)

export const SUSPECT = 'suspect';

// [원본] 'confirmed:<입력 무게>x<횟수>x<배수>' — 무게 반·배수 2 로 옮기는 배수 동기에서 효과 무게가 같은데도 확인이 풀렸다(데이터 리뷰 10)
// export function confirmedState(s) { return `confirmed:${Math.round(s.weightKg * 1000) / 1000}x${s.reps}x${s.loadMultiplier ?? 1}`; }
// [개선] 'confirmed:<효과 무게>x<횟수>' — 실제로 든 무게가 같으면 확인이 유지된다
export function confirmedState(s: { weightKg: number; reps: number; loadMultiplier?: number | null }): string {
  return `confirmed:${Math.round(s.weightKg * (s.loadMultiplier ?? 1) * 1000) / 1000}x${s.reps}`;
}

/** 확인함이고 지금 값이 그때와 같은가 */
export function isConfirmedFor(state: string | null | undefined, s: { weightKg: number; reps: number; loadMultiplier?: number | null }): boolean {
  return typeof state === 'string' && state.startsWith('confirmed:') && state === confirmedState(s);
}

/**
 * 세트에 적을 상태를 정한다.
 * @param performed 수행한 세트인가(체크를 풀면 표시도 푼다)
 */
export function nextCheckState(
  current: string | null | undefined,
  s: { weightKg: number; reps: number; loadMultiplier?: number | null },
  performed: boolean,
  verdict: SuspectVerdict | null | undefined,
): string | null {
  if (!performed) return current === SUSPECT ? null : (current ?? null);
  if (isConfirmedFor(current, s)) return current as string;
  return verdict?.suspect ? SUSPECT : null;
}

// ── 훑기(D-1·D-2) — 완료 운동을 시간순으로 한 번 읽어 칸마다 지난 기록을 쌓으며 판정한다 ──
export interface SweepSet {
  id: string;
  set: LoggedSet;
  state: string | null;
  performed: boolean;
  /** 이번 훑기 범위 밖 — 판정하지 않고 지금 상태를 그대로 쓴다(뒤 운동의 기준과 PR 계산이 같은 상태를 보게 · 코드 리뷰 계산 3) */
  fixed?: boolean;
}
export interface SweepWorkout {
  id: string;
  blocks: { key: string; sets: SweepSet[] }[];
}

/**
 * 시간순(오래된 것 먼저) 운동 목록 → 세트마다 적어야 할 상태. 결과에는 **모든** 세트가 들어간다(바뀌지 않은 것도).
 * 앞 운동의 판정이 뒤 운동의 지난 기록(확인 필요 제외)에 들어간다.
 */
export function planSuspectStates(ordered: SweepWorkout[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const histByKey = new Map<string, LoggedSet[][]>(); // 운동마다 그 칸의 수행 세트(확인 필요 표시 반영)
  for (const w of ordered) {
    const thisWorkout = new Map<string, LoggedSet[]>();
    // 같은 운동·같은 칸에서 「제대로 적었어요」 한 세트 — 저장소 판정(judgeBlockSets)처럼 다른 세트의 기준에 든다(코드 리뷰 계산 1)
    const confirmedHere = new Map<string, SweepSet[]>();
    for (const b of w.blocks)
      for (const x of b.sets)
        if (x.performed && isConfirmedFor(x.state, x.set)) {
          const arr = confirmedHere.get(b.key);
          if (arr) arr.push(x);
          else confirmedHere.set(b.key, [x]);
        }
    for (const b of w.blocks) {
      const past = histByKey.get(b.key) ?? [];
      const recentRuns = past.slice(-SUSPECT_LOOKBACK_WORKOUTS);
      const hist: SuspectHistory = {
        recent: recentRuns.flat(),
        workouts: recentRuns.length,
        older: past.slice(0, Math.max(0, past.length - SUSPECT_LOOKBACK_WORKOUTS)).flat(),
      };
      const mine = thisWorkout.get(b.key) ?? [];
      const confirmed = confirmedHere.get(b.key) ?? [];
      for (const x of b.sets) {
        const extra = confirmed.filter((c) => c.id !== x.id).map((c) => c.set);
        const verdict = x.performed && !x.fixed ? judgeSuspectSet(x.set, extra.length ? { ...hist, recent: [...hist.recent, ...extra] } : hist) : null;
        const next = x.fixed ? x.state : nextCheckState(x.state, x.set, x.performed, verdict);
        out.set(x.id, next);
        if (x.performed) mine.push({ ...x.set, suspect: next === SUSPECT });
      }
      thisWorkout.set(b.key, mine);
    }
    for (const [key, sets] of thisWorkout) {
      // 쓸 수 있는 세트(판정 대상 · 확인 필요 아님)가 없는 운동은 「지난 운동 수」에 넣지 않는다(코드 리뷰 계산 5 · R1)
      if (!sets.some(usableForBase)) continue;
      const arr = histByKey.get(key);
      if (arr) arr.push(sets);
      else histByKey.set(key, [sets]);
    }
  }
  return out;
}
