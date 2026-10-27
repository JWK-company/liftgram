// @plm SRS-057 SRS-058  기록 칸(조합) 규칙 — 지난 조합 승계 · 플레이트 한쪽 입력 배수 · 조합별 기록 요약 (ADR-034 · ADR-037)
//
// 저장소(workoutRepository)와 화면이 같은 규칙을 쓰도록 순수 함수로 둔다(DB·RN 의존 0 → node 단위 테스트).
//
//   · 지난 조합 승계: 세션 시작·즉석 추가·종목 교체 모두 「지난번 수행 조합」이 기본값이다(ADR-034).
//     사용자가(루틴에서) 칸을 명시했으면 그것이 우선이다.
//   · 플레이트 한쪽 입력: 적재 방식이 plate 인 블록에서 사용자가 「한쪽 무게로 입력」을 켜면 세트 배수 = 2.
//     입력·표시는 한쪽, 볼륨·PR 은 effectiveWeightKg(×배수)가 계산한다(ADR-037). 핀로드·프리웨이트에는 없다.
//   · 조합별 기록 요약: 한 종목의 수행 이력을 칸(variant_key)별로 묶어 「다른 조합 기록 보기」에 쓴다.
import type { LoadMode, LoggedSet } from './types';
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

// ── 플레이트 머신 한쪽 입력 기본(2026-10-27 피드백 #63 · SRS-084) ─────────────────────────
// 사람들은 「한쪽 무게로 입력」을 일일이 켜지 않았다 — 운영 오늘 기록의 머신 세트가 전부 배수 null(=1)이라 볼륨이 절반이었다.
// 새 규칙: 플레이트 후보 머신은 **기본이 한쪽(×2)**. 종목의 입력 방식을 아직 안 정했으면(선택 null) 한 번 묻고,
// 답은 종목별로 기억한다(true=한쪽 · false=양쪽 합·핀). 핀 칸은 늘 1. 옛 함수(blockLoadMultiplier)는 원복용으로 둔다.

/** 플레이트 후보 — 종목 기구가 머신이고 family 에 적재 축이 있으며 하중 모드가 external(어시스트·맨몸 기준 머신 제외 · /qa spec H-1). */
export function isPlateLoadCandidate(
  baseEquipment: string | null | undefined,
  axesLoad: boolean | null | undefined,
  loadMode: LoadMode | string | null | undefined,
): boolean {
  return baseEquipment === 'machine' && axesLoad === true && (loadMode == null || loadMode === 'external');
}

/**
 * 플레이트 후보의 「흔한 적재 방식」 — 후보가 아니면 null. 적재 칸이 비었을 때 이 값으로 본다(family 메타 load_default ·
 * 레그 프레스·하이 로우처럼 원판을 거는 머신은 plate, 레그 익스텐션·펙 덱처럼 핀 스택이 흔한 머신은 pin).
 */
export function plateDefaultLoad(
  baseEquipment: string | null | undefined,
  axesLoad: boolean | null | undefined,
  loadMode: LoadMode | string | null | undefined,
  loadDefault: 'plate' | 'pin' | null | undefined,
): 'plate' | 'pin' | null {
  if (!isPlateLoadCandidate(baseEquipment, axesLoad, loadMode)) return null;
  return loadDefault === 'pin' ? 'pin' : 'plate';
}

/**
 * 블록 배수(V2) — 후보 아님 → null · 적재 칸(비면 흔한 적재 방식)이 핀 → null(=1) · 「양쪽 합」으로 정함 → **명시 1**
 * (프리필 환산이 「양쪽 합」을 알도록) · 한쪽으로 정함·아직 안 정함 → 2(플레이트는 기본이 한쪽).
 */
export function blockLoadMultiplierV2(
  dims: Pick<VariantDims, 'load'> | null | undefined,
  choice: boolean | null | undefined,
  defaultLoad: 'plate' | 'pin' | null | undefined,
): number | null {
  if (!defaultLoad) return null;
  if ((dims?.load ?? defaultLoad) === 'pin') return null;
  return choice === false ? 1 : 2;
}

/** 「원판 한쪽 무게로 적나요?」를 물을 블록인가 — 후보 · 플레이트 칸(비면 흔한 적재 방식) · 아직 안 정함. */
export function needsPlateOneSideQuestion(
  dims: Pick<VariantDims, 'load'> | null | undefined,
  choice: boolean | null | undefined,
  defaultLoad: 'plate' | 'pin' | null | undefined,
): boolean {
  return !!defaultLoad && (dims?.load ?? defaultLoad) === 'plate' && choice == null;
}

/**
 * 프리필 환산(V2) — 지난 배수가 **null(옛 기록·모름)이면 숫자 그대로**. 옛 null 기록은 「옵션을 안 누른」 기록이라
 * 실제로는 한쪽 숫자인 경우가 많다(이번 사용자) — 옛 규칙(null=양쪽)으로 절반 환산하면 40 이 20 이 된다.
 * 명시 배수(1·2)끼리만 계산 무게가 같도록 옮긴다.
 */
export function carryWeightAcrossMultiplierV2(
  weightKg: number,
  fromMultiplier: number | null | undefined,
  toMultiplier: number | null | undefined,
): number {
  if (fromMultiplier == null) return weightKg;
  return carryWeightAcrossMultiplier(weightKg, fromMultiplier, toMultiplier);
}

/** planBlockMultiplierResync 와 같되 환산은 V2(옛 null 세트는 숫자 그대로 배수만). 칸 시트 토글·칸 바꾸기가 쓴다. */
export function planBlockMultiplierResyncV2(
  sets: { id: string; done: boolean | null; weightKg: number; loadMultiplier: number | null | undefined; touched?: boolean }[],
  toMultiplier: number | null,
): { id: string; weightKg: number; loadMultiplier: number | null }[] {
  const out: { id: string; weightKg: number; loadMultiplier: number | null }[] = [];
  for (const s of sets) {
    if (s.done !== false) continue;
    if ((s.loadMultiplier ?? null) === toMultiplier) continue;
    const weightKg = s.touched ? s.weightKg : carryWeightAcrossMultiplierV2(s.weightKg, s.loadMultiplier, toMultiplier);
    out.push({ id: s.id, weightKg, loadMultiplier: toMultiplier });
  }
  return out;
}

/**
 * 질문 답의 재표기 — 블록 세트 **전부(한 세트 포함)** 의 배수만 바꾸고 숫자는 그대로. 답은 「적은 숫자의 뜻」을 밝힌 것이라
 * 숫자를 환산하면 안 되고, 질문 전 기본(×2)으로 체크한 세트가 「양쪽 합」 답에도 ×2 로 남으면 거짓 볼륨이다(/qa spec M-2).
 */
export function planBlockMultiplierRetag(
  sets: { id: string; done: boolean | null; weightKg: number; loadMultiplier: number | null | undefined }[],
  toMultiplier: number | null,
): { id: string; weightKg: number; loadMultiplier: number | null }[] {
  return sets
    .filter((s) => (s.loadMultiplier ?? null) !== toMultiplier)
    .map((s) => ({ id: s.id, weightKg: s.weightKg, loadMultiplier: toMultiplier }));
}

/**
 * /qa code M-1 — 칸 시트(적재 칸·「한쪽 무게로 입력」)를 바꿀 때 세트를 어떻게 맞출지. 아직 입력 방식을 안 정한 후보 종목이면
 * 지금 붙은 ×2 는 「기본」일 뿐 사람이 한쪽이라고 한 근거가 없다 → 질문 답과 똑같이 **재표기**(숫자 그대로 배수만).
 * 정했거나 후보가 아니면 기존 규칙(안 한 세트만 계산 무게 보존 환산). @plm SRS-084
 */
export function plateChangeMode(
  choiceBefore: boolean | null | undefined,
  defaultLoad: 'plate' | 'pin' | null | undefined,
): 'retag' | 'resync' {
  return defaultLoad && choiceBefore == null ? 'retag' : 'resync';
}

/**
 * /qa code M-2 — 옛 기록(배수 null)을 지금 블록 배수로 읽는다. 프리필과 같은 규칙 「플레이트 머신의 옛 null 기록 = 예전과
 * 같은 숫자로 보인다」를 1RM % 처방에도 적용하려고, 1RM 을 추정하기 전에 null 배수를 블록 배수로 채운다. 블록 배수가 null 이면
 * 그대로(=1). 명시 배수 기록은 바꾸지 않는다. @plm SRS-084
 */
export function adoptLegacyMultiplier<T extends { loadMultiplier?: number | null }>(sets: T[], blockMultiplier: number | null | undefined): T[] {
  if (blockMultiplier == null) return sets;
  return sets.map((s) => (s.loadMultiplier == null ? { ...s, loadMultiplier: blockMultiplier } : s));
}

export interface SlotSession {
  variantKey: string | null;
  completedAt: number;
  weightUnit?: 'kg' | 'lb' | null; // v25: 그 블록에 적은 단위(/qa code M-2 — 다른 칸의 기록도 적은 단위로) @plm SRS-067
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
  /** 가장 최근 세션에 적은 단위(null=kg) — 칸 시트가 이 단위로 보인다(Q2 A · /qa code M-2) */
  weightUnit?: 'kg' | 'lb' | null;
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
      weightUnit: latest.weightUnit ?? null,
    });
  }
  return out.sort((a, b) => b.lastAt - a.lastAt);
}

/**
 * 블록 배수가 바뀔 때(「한쪽 무게로 입력」 토글·적재 방식 변경·기구 바꾸기) 세트를 어떻게 고칠지(/qa code M-1).
 *
 * **이미 한 세트(done ≠ false)는 건드리지 않는다** — 그 무게는 그 배수로 적은 것이라, 배수만 바꾸면 계산 무게가
 * 두 배·절반이 되어 거짓 PR·볼륨이 남는다. 아직 안 한 세트만 새 배수로 옮기고, 적힌 무게는 계산 무게가 같도록 환산한다
 * (양쪽 100 → 한쪽 50). 바꿀 것이 없으면 빈 목록.
 */
export function planBlockMultiplierResync(
  // [원본] sets: { id; done; weightKg; loadMultiplier }[] — 안 한 세트는 전부 환산했다
  // [개선] touched — 사람이 이미 적은 숫자는 그대로 두고 배수만(늦게 도착한 환산이 입력 중 값을 덮던 것 · /qa code H-3 원칙) @plm SRS-067
  sets: { id: string; done: boolean | null; weightKg: number; loadMultiplier: number | null | undefined; touched?: boolean }[],
  toMultiplier: number | null,
): { id: string; weightKg: number; loadMultiplier: number | null }[] {
  const out: { id: string; weightKg: number; loadMultiplier: number | null }[] = [];
  for (const s of sets) {
    if (s.done !== false) continue;
    if ((s.loadMultiplier ?? null) === toMultiplier) continue;
    const weightKg = s.touched ? s.weightKg : carryWeightAcrossMultiplier(s.weightKg, s.loadMultiplier, toMultiplier);
    out.push({ id: s.id, weightKg, loadMultiplier: toMultiplier });
  }
  return out;
}

/**
 * 칸 시트 「최근 쓴 브랜드」 — 수행 이력(최신순)의 브랜드를 겹치지 않게 앞에서부터 limit 개(화면 정리 D9).
 * 허용 목록(머신 브랜드·커스텀 키) 밖 값(기구 키·빈 값)은 건너뛴다. @plm SRS-071
 */
export function pickRecentBrands(
  brandsNewestFirst: readonly (string | null | undefined)[],
  allowed: readonly string[],
  limit = 3,
): string[] {
  const out: string[] = [];
  for (const b of brandsNewestFirst) {
    if (!b || !allowed.includes(b) || out.includes(b)) continue;
    out.push(b);
    if (out.length >= limit) break;
  }
  return out;
}
