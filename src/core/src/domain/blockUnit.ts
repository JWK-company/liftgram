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

// ── /qa code 조치(2026-10-27) ───────────────────────────────────────────────

/**
 * 세트를 **사람이** 고쳤는가(/qa code H-3). 자동 채움(프리필·처방·환산)과 사람이 적은 숫자를 구분한다.
 * v25 부터 세트는 `userEdited` 를 갖는다(만들 때 false · 사람이 무게·횟수를 고치면 true). 옛 세트(null)는
 * 예전 판정(updated_at ≠ created_at)으로 본다. 완료한 세트는 사람이 확인한 숫자다.
 */
export function isUserTouched(s: {
  done?: boolean | null;
  userEdited?: boolean | null;
  updatedAt?: number | null;
  createdAt?: number | null;
}): boolean {
  if (s.done === true) return true;
  if (s.userEdited === true) return true;
  if (s.userEdited === false) return false;
  return s.updatedAt != null && s.createdAt != null && s.updatedAt !== s.createdAt;
}

/**
 * 토글 계획 v2(/qa code H-3 · main 결정).
 *   · 사람이 적었거나 완료한 세트 → Q4 B: 보이는 숫자 그대로, 단위만(저장 kg 재환산).
 *   · 아직 손대지 않은 자동 채움(처방 무게·% 채움·이전 기록 프리필·루틴 목표) → **실제 무게 그대로**, 새 단위의 원판 단위로 반올림.
 *     70kg 처방이 70lb(31.75kg)가 되면 안 된다 — 그 숫자는 단위를 틀린 것이 아니라 계산한 하중이다.
 * `round` 는 새 단위의 원판 반올림(prescription.roundLoadKg) — 순수 함수 경계를 지키려고 주입한다.
 */
export function planUnitSwitchV2(
  sets: readonly { id: string; weightKg: number; touched: boolean }[],
  from: WeightUnit,
  to: WeightUnit,
  round: (kg: number, unit: WeightUnit) => number,
): { id: string; weightKg: number }[] {
  if (from === to) return [];
  const out: { id: string; weightKg: number }[] = [];
  for (const s of sets) {
    if (!Number.isFinite(s.weightKg) || s.weightKg <= 0) continue;
    if (s.touched) {
      const shown = displayWeight(s.weightKg, from);
      out.push({ id: s.id, weightKg: to === 'kg' ? shown : toKg(shown, to) });
      continue;
    }
    // 반올림한 숫자를 새 단위의 **적은 숫자**로 저장한다(135lb → 정확히 lbToKg(135)) — 다시 볼 때 꼬리가 없다.
    const shown = displayWeight(round(s.weightKg, to), to);
    if (shown <= 0 || shown === displayWeight(s.weightKg, to)) continue;
    out.push({ id: s.id, weightKg: toKg(shown, to) });
  }
  return out;
}

/**
 * 입력칸 숫자 → 저장 kg(/qa code M-1). 칸에 보이던 숫자를 그대로 두고 떠났으면 저장 kg 를 **바꾸지 않는다**(null).
 * lb 블록의 kg 유래 60(=132.28lb 로 보임)을 누르고 떼기만 해도 60.0012 가 저장되어 거짓 PR 이 났다.
 */
export function enteredWeightToKg(entered: number, unit: WeightUnit, storedKg: number): number | null {
  if (!Number.isFinite(entered) || entered < 0) return null;
  if (Number.isFinite(storedKg) && entered === displayWeight(storedKg, unit)) return null;
  return toKg(entered, unit);
}
