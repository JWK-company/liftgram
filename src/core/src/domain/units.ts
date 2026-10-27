// 무게 단위 변환·포맷 (kg ↔ lb). 저장은 항상 kg 정규화. @plm SRS-003
import { WeightUnit } from './types';

export const KG_PER_LB = 0.45359237;
export const LB_PER_KG = 1 / KG_PER_LB;

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

// 사용자 입력 단위 → 정규 저장 단위(kg)
export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : lbToKg(value);
}

// 정규 저장 단위(kg) → 사용자 표시 단위
export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kgToLb(kg);
}

// 가장 가까운 증분으로 반올림(플레이트/바벨 단위 정렬). increment<=0 이면 원값.
export function roundToIncrement(value: number, increment: number): number {
  if (increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

// 표시용 문자열. kg는 0.5 단위, lb는 1 단위 기본 반올림 후 불필요한 0 제거.
export function formatWeight(kg: number, unit: WeightUnit, opts?: { increment?: number; withUnit?: boolean }): string {
  const value = fromKg(kg, unit);
  const increment = opts?.increment ?? (unit === 'kg' ? 0.5 : 1);
  const rounded = roundToIncrement(value, increment);
  const str = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return opts?.withUnit === false ? str : `${str}${unit}`;
}

// ── 세트 무게 표시(2026-10-27 · 블록별 kg/lb) ── @plm SRS-067
// kg 정본은 부동소수 그대로 저장한다(lbToKg(100)=45.359237). 표시는 **여기 한 곳**에서 소수 둘째 자리로 반올림해
// 적은 숫자를 그대로 돌려준다(100lb → 100 · 102.5lb → 102.5). 증분(0.5kg·1lb) 반올림은 하지 않는다 —
// 102.5lb 가 「103lb」로 보이면 기구에 적힌 숫자와 다르다(/qa spec Q1·Q2). 합계(볼륨)는 formatWeight 를 쓴다.
export function displayWeight(kg: number, unit: WeightUnit): number {
  if (!Number.isFinite(kg)) return 0;
  return Math.round(fromKg(kg, unit) * 100) / 100;
}

export function formatEnteredWeight(kg: number, unit: WeightUnit, opts?: { withUnit?: boolean }): string {
  const str = String(displayWeight(kg, unit));
  return opts?.withUnit === false ? str : `${str}${unit}`;
}
