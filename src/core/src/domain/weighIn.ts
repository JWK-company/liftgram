// @plm SRS-077  운동 전 체중 체크인 — 시트를 띄울지 판정 · 표시 단위 숫자 ↔ 저장 kg(왕복 오차 없음) · 표시 단위 고르기
//
// 화면(WeighInSheet·ActiveWorkout·프로필·통계)은 판정을 하지 않는다 — 여기 순수 함수 한 곳(node 테스트로 고정).
//   · 띄우는 조건(U-7): 설정 켬 ∧ 완료 세트 0 ∧ now − startedAt ≤ 10분 ∧ 오늘(로컬 날짜) 유효 기록 없음 ∧ 이 운동에서 이미 띄운 표시 없음.
//     「설정 안 함」 표식(무게 0)은 측정이 아니라서 「오늘 기록」으로 세지 않는다.
//   · 숫자(U-8): 시트는 소수 첫째 자리까지 보인다. 보이던 숫자를 그대로 두고 저장하면 **저장 kg 원값**을 그대로 쓴다
//     (blockUnit.enteredWeightToKg 와 같은 생각 — 75kg 를 lb 로 보여 165.3 → 다시 kg 로 74.98 이 되는 왕복 오차를 막는다).
import { BODYWEIGHT_MAX_KG, isValidBodyweightLog, type BodyweightLogLike } from './bodyweight';
import { fromKg, toKg } from './units';
import type { WeightUnit } from './types';

/** 시작 뒤 이 시간 안에만 시트를 띄운다(몸풀기를 오래 하다 돌아와서 뜨지 않게 · U-7) */
export const WEIGH_IN_WINDOW_MS = 10 * 60_000;

/** 이 운동에서 시트를 이미 띄웠다는 표시(localStorage 키) — 운동이 끝나면 지운다 */
export const WEIGH_IN_MARK_PREFIX = 'weighin:';

export function weighInMarkKey(workoutId: string): string {
  return `${WEIGH_IN_MARK_PREFIX}${workoutId}`;
}

/** 이 시각이 속한 로컬 날짜의 [시작, 다음 날 시작) */
export function localDayRange(ms: number): { startMs: number; endMs: number } {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const startMs = d.getTime();
  d.setDate(d.getDate() + 1); // DST 날에도 로컬 자정
  return { startMs, endMs: d.getTime() };
}

/** 오늘(로컬 날짜)에 유효한 측정이 있나 — 표식(무게 0)·깨진 행은 세지 않는다 */
export function hasLogOnLocalDay(logs: readonly BodyweightLogLike[], now: number): boolean {
  const { startMs, endMs } = localDayRange(now);
  return logs.some((l) => isValidBodyweightLog(l) && l.measuredAt >= startMs && l.measuredAt < endMs);
}

export interface WeighInGateInput {
  enabled: boolean;
  doneSets: number;
  startedAt: number;
  now: number;
  /** 오늘 유효 측정이 있나(hasLogOnLocalDay) */
  loggedToday: boolean;
  /** 이 운동에서 이미 띄웠나(weighin:<id> 있음) */
  marked: boolean;
}

/** 운동 화면 첫 진입에서 체크인 시트를 띄우는가(U-7) */
export function shouldOfferWeighIn(i: WeighInGateInput): boolean {
  if (!i.enabled || i.marked || i.loggedToday) return false;
  if (i.doneSets > 0) return false;
  const since = i.now - i.startedAt;
  return Number.isFinite(since) && since >= -60_000 && since <= WEIGH_IN_WINDOW_MS; // 시계 차이 1분까지는 「방금 시작」
}

/**
 * 체중을 보일 단위 — **늘 kg**(SRS-067: 「프로필의 kg/lb 선택은 없애고 바 무게·체중은 kg로 고정」 · qa P3-3).
 * 예전 프로필 단위가 lb 인 사람에게만 lb 로 보이면 같은 화면의 바 무게(kg)와 어긋나고, 단위 줄이 없어 kg 로 돌아갈 길도 없다.
 * lb 스텝·왕복 로직(BODYWEIGHT_STEPS.lb · enteredBodyweightToKg)은 그대로 둔다 — 나중에 「체중 단위」 설정이 생기면 여기만 바꾼다.
 */
export function bodyweightUnitOf(_profileUnit: string | null | undefined): WeightUnit {
  // [원본] 원복 시 아래를 주석 해제하고 kg 고정 줄을 주석 처리
  // return _profileUnit === 'lb' ? 'lb' : 'kg';
  // [개선] kg 고정
  return 'kg';
}

/** 직접 입력의 하한(kg) — 웰니스 평가가 아니라 오타 방지(「72」를 치다 「7」에서 저장하는 일 · qa P3-6) */
export const WEIGH_IN_MIN_ENTRY_KG = 20;

/** 지난 값과 이만큼(비율) 넘게 다르면 저장 전에 한 번 확인한다(qa P3-6) */
export const WEIGH_IN_JUMP_RATIO = 0.3;

/** 지난 값 대비 ±30% 를 넘게 다른가 — 비교할 값이 없으면 false */
export function isLargeBodyweightJump(kg: number, refKg: number | null | undefined): boolean {
  if (typeof refKg !== 'number' || !Number.isFinite(refKg) || refKg <= 0 || !Number.isFinite(kg)) return false;
  return Math.abs(kg - refKg) / refKg > WEIGH_IN_JUMP_RATIO;
}

/** 시트·목록에 보이는 숫자(소수 첫째 자리) */
export function shownBodyweight(kg: number, unit: WeightUnit): number {
  return Math.round(fromKg(kg, unit) * 10) / 10;
}

/** 「75.0」·「165.3」 — 단위 글자는 부르는 쪽이 붙인다 */
export function formatBodyweight(kg: number, unit: WeightUnit): string {
  return shownBodyweight(kg, unit).toFixed(1);
}

/**
 * 직접 입력한 표시 단위 숫자 → 저장 kg. 보이던 숫자(baseKg 의 표시값)와 같으면 baseKg 그대로(왕복 오차 없음 · U-8).
 * 그 밖에는 소수 첫째 자리로 맞춰 kg 로. 범위 밖(하한 20kg 미만·상한 초과)·숫자 아님 = null(저장 안 함 — 화면이 이유를 한 줄로 알린다).
 */
export function enteredBodyweightToKg(entered: number, unit: WeightUnit, baseKg: number | null): number | null {
  if (!Number.isFinite(entered) || entered <= 0) return null;
  const rounded = Math.round(entered * 10) / 10;
  if (baseKg != null && Number.isFinite(baseKg) && rounded === shownBodyweight(baseKg, unit)) return baseKg;
  const kg = toKg(rounded, unit);
  // [원본] return kg > 0 && kg <= BODYWEIGHT_MAX_KG ? kg : null;
  // [개선] 하한 20kg(오타 방지 · qa P3-6)
  return kg >= WEIGH_IN_MIN_ENTRY_KG && kg <= BODYWEIGHT_MAX_KG ? kg : null;
}

/** 지난 값이 없을 때 시트가 출발하는 값(kg) — 표시 단위의 반올림 숫자(70kg · 155lb) */
export function weighInStartKg(lastKg: number | null | undefined, unit: WeightUnit): number {
  if (typeof lastKg === 'number' && Number.isFinite(lastKg) && lastKg > 0) return lastKg;
  return unit === 'lb' ? toKg(155, 'lb') : 70;
}
