// 운동 블록의 무게 단위(kg|lb) — 칸별 기본 단위 · 토글 환산(순수 함수) @plm SRS-067
//
// 한 헬스장 안에서도 kg·lb 기구가 섞여 있다(2026-10-27 사용자). 그래서 단위는 프로필 하나가 아니라 **블록**마다 있다.
//   · 기본 단위 = 같은 종목·같은 기록 칸(variant key)으로 가장 최근에 **완료한** 블록의 단위(Q1 A). 없으면 예전 프로필 단위.
//     기본 단위를 고르는 것은 표시만 바꾼다 — 저장 kg(실제 무게)는 그대로다.
//   · 사람이 토글을 누르면 그 블록 세트의 **보이는 숫자는 그대로, 단위만** 바뀐다(Q4 B — 잘못 고른 단위를 바로잡는 동작).
//     저장 kg 를 다시 환산한다. 다시 누르면 정확히 원래로 돌아온다(displayWeight 왕복).
import { displayWeight, toKg } from './units';
import type { WeightUnit } from './types';

export interface UnitHistoryEntry {
  variantKey: string | null;
  weightUnit: WeightUnit | null;
  completedAt: number | null;
}

const sameKey = (a: string | null | undefined, b: string | null | undefined) => (a ?? '') === (b ?? '');

export function pickStartUnit(
  history: readonly UnitHistoryEntry[],
  variantKey: string | null | undefined,
  legacy: WeightUnit | null | undefined,
): WeightUnit {
  let best: UnitHistoryEntry | null = null;
  for (const h of history) {
    if (h.completedAt == null || !h.weightUnit || !sameKey(h.variantKey, variantKey)) continue;
    if (!best || (best.completedAt ?? 0) < h.completedAt) best = h;
  }
  return best?.weightUnit ?? (legacy === 'lb' ? 'lb' : 'kg');
}

/** 토글(Q4 B) — 바뀌는 세트만 돌려준다(0·빈 무게·같은 단위는 바꿀 것이 없다). */
export function planUnitSwitch(
  sets: readonly { id: string; weightKg: number }[],
  from: WeightUnit,
  to: WeightUnit,
): { id: string; weightKg: number }[] {
  if (from === to) return [];
  const out: { id: string; weightKg: number }[] = [];
  for (const s of sets) {
    if (!Number.isFinite(s.weightKg) || s.weightKg <= 0) continue;
    const shown = displayWeight(s.weightKg, from);
    const kg = toKg(shown, to);
    // kg 로 돌아올 때는 표시값이 곧 kg 정본이다(100lb → 100kg). lb 로 갈 때는 lbToKg 그대로.
    out.push({ id: s.id, weightKg: to === 'kg' ? shown : kg });
  }
  return out;
}
