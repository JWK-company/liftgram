// @plm SRS-057 SRS-058  기록 칸(조합) 규칙 — 지난 조합 승계 · 플레이트 한쪽 입력 배수 · 조합별 기록 요약 (ADR-034 · ADR-037)
//
// 저장소(workoutRepository)와 화면이 같은 규칙을 쓰도록 순수 함수로 둔다(DB·RN 의존 0 → node 단위 테스트).
//
//   · 지난 조합 승계: 세션 시작·즉석 추가·종목 교체 모두 「지난번 수행 조합」이 기본값이다(ADR-034).
//     사용자가(루틴에서) 칸을 명시했으면 그것이 우선이다.
//   · 플레이트 한쪽 입력: 적재 방식이 plate 인 블록에서 사용자가 「한쪽 무게로 입력」을 켜면 세트 배수 = 2.
//     입력·표시는 한쪽, 볼륨·PR 은 effectiveWeightKg(×배수)가 계산한다(ADR-037). 핀로드·프리웨이트에는 없다.
//   · 조합별 기록 요약: 한 종목의 수행 이력을 칸(variant_key)별로 묶어 「다른 조합 기록 보기」에 쓴다.
import type { LoggedSet } from './types';
import { effectiveMultiplier } from './volume';
import type { VariantDims } from './variants';

/** 블록 칸 결정 — 명시(루틴이 정한 칸)가 있으면 그대로, 없으면 지난번 수행 조합, 그것도 없으면 기본(null). */
export function pickStartSlot<T extends { variantKey: string | null }>(stored: T, latestPerformed: T | null): T {
  if (stored.variantKey != null) return stored;
  return latestPerformed ?? stored;
}

/** 이 블록의 세트 배수 — 플레이트 머신 + 한쪽 입력 켜짐이면 2, 아니면 null(=1). */
export function blockLoadMultiplier(dims: Pick<VariantDims, 'load'> | null | undefined, plateOneSide: boolean | null | undefined): number | null {
  return dims?.load === 'plate' && plateOneSide === true ? 2 : null;
}

/**
 * 지난 세트 무게를 지금 블록의 입력 방식으로 옮긴다 — 지난번엔 양쪽 합(배수 1)으로 적고 이번엔 한쪽(배수 2)이면
 * 프리필은 절반이어야 같은 무게다. 계산 무게(무게×배수)가 같게 유지된다.
 */
export function carryWeightAcrossMultiplier(weightKg: number, fromMultiplier: number | null | undefined, toMultiplier: number | null | undefined): number {
  const from = effectiveMultiplier({ loadMultiplier: fromMultiplier });
  const to = effectiveMultiplier({ loadMultiplier: toMultiplier });
  if (from === to) return weightKg;
  return Math.round(((weightKg * from) / to) * 100) / 100;
}

export interface SlotSession {
  variantKey: string | null;
  completedAt: number;
  sets: LoggedSet[]; // 수행한 세트(완료·미완료 판정은 호출 측이 이미 했다)
}

export interface SlotSummary {
  variantKey: string | null;
  lastAt: number;
  sessions: number;
  /** 가장 최근 세션의 워킹 세트(무게·횟수 원값 — 입력한 그대로) */
  lastSets: { weightKg: number; reps: number; loadMultiplier: number | null }[];
  /** 이 칸의 최고 계산 무게(배수 반영)와 그때의 횟수 */
  best: { weightKg: number; reps: number } | null;
}

/** 수행 이력을 칸별로 묶는다 — 최근 수행 칸이 먼저. 같은 키는 한 줄. */
export function summarizeSlots(sessions: SlotSession[]): SlotSummary[] {
  const byKey = new Map<string, SlotSession[]>();
  for (const s of sessions) {
    const k = s.variantKey ?? '';
    const list = byKey.get(k);
    if (list) list.push(s);
    else byKey.set(k, [s]);
  }
  const out: SlotSummary[] = [];
  for (const list of byKey.values()) {
    list.sort((a, b) => b.completedAt - a.completedAt);
    const latest = list[0];
    const all = list.flatMap((s) => s.sets);
    const working = all.filter((s) => !s.isWarmup && !s.isFailed);
    let best: { weightKg: number; reps: number } | null = null;
    for (const s of working) {
      const w = Math.max(0, s.weightKg) * effectiveMultiplier(s);
      if (!best || w > best.weightKg || (w === best.weightKg && s.reps > best.reps)) best = { weightKg: w, reps: s.reps };
    }
    out.push({
      variantKey: latest.variantKey,
      lastAt: latest.completedAt,
      sessions: list.length,
      lastSets: latest.sets
        .filter((s) => !s.isWarmup && !s.isFailed)
        .map((s) => ({ weightKg: s.weightKg, reps: s.reps, loadMultiplier: s.loadMultiplier ?? null })),
      best,
    });
  }
  return out.sort((a, b) => b.lastAt - a.lastAt);
}
