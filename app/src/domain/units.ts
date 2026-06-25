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
