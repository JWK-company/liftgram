// @plm SRS-065  「이 운동 그대로 다시 시작」·피드 「바로 시작」 — 무엇으로 시작할지(순수 함수)
//
// 시작 자체(이전 기록·지난 조합·처방 무게 프리레이)는 저장소의 공통 시작 함수가 한다. 여기서는 원본(지난 운동 또는
// 피드의 운동)을 「시작할 줄」 목록으로 바꾸기만 한다 — DB 없이 테스트된다.
//
// 규칙(스펙 D3 · QA R3):
//   · 완료한 워킹 세트가 있는 종목만(워밍업만 한 종목은 빠진다 — routineDiff.performed 와 같은 기준)
//   · 세트 수 = 완료한 워킹 세트 수, 그 앞에 완료한 워밍업 세트 수만큼 워밍업
//   · 원본 블록의 목표(횟수 범위·휴식·처방·유산소 목표)와 기록 칸 조합을 복사 · **무게는 담지 않는다**(이전 기록으로 채움)
//   · 슈퍼셋은 새 묶음 표식으로(세션 그룹 id 가 새 운동으로 새지 않게) · 짝이 빠져 혼자 남은 묶음은 푼다
import type { PrescribedSet } from './prescription';

export interface VariantColumnsLike {
  variantKey: string | null;
  variantEquipment: string | null;
  variantGrip: string | null;
  variantArm: string | null;
  variantLoad: string | null;
  variantAttach: string | null;
  machineVariant: string | null;
}

export interface ReplaySourceBlock {
  id: string;
  exerciseId: string;
  sortOrder: number;
  supersetGroup: string | null;
  /** 원본이 루틴에서 왔으면 그 줄 — 다시 시작한 운동을 끝낼 때도 루틴 반영(SRS-059)이 이어진다. */
  routineExerciseId: string | null;
  isCardio: boolean;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  restSeconds: number | null;
  prescription: PrescribedSet[] | null;
  cardioTarget: unknown;
  variant: VariantColumnsLike;
  sets: { done: boolean | null; isWarmup: boolean }[];
}

/** 공통 시작 함수가 받는 한 줄. `supersetGroup` 은 **묶음 표식**이다 — 저장소가 새 id 로 바꾼다. */
export interface StartRow {
  exerciseId: string;
  targetSets: number;
  warmupSets: number;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  /** 다시 시작·피드는 늘 null(무게는 이전 기록) — 루틴 시작만 루틴의 목표 무게를 싣는다. */
  targetWeightKg: number | null;
  restSeconds: number | null;
  /** null = 지정 없음(지난 조합 승계 — resolveStartVariant). */
  variant: VariantColumnsLike | null;
  /** true = 칸을 **그대로** 쓴다(다시 시작 — 원본이 기본 칸이었으면 기본 칸). false = 루틴처럼 미지정이면 지난 조합 승계. */
  variantExact: boolean;
  /** 블록 메모 시드(루틴 줄 메모·팁) — 다시 시작·피드는 null. */
  note?: string | null;
  supersetGroup: string | null;
  routineExerciseId: string | null;
  prescription: PrescribedSet[] | null;
  cardioTarget: unknown;
}

const DEFAULT_REST = 90;

/** 묶음 표식 — 2개 이상 남은 묶음만. */
function groupTokens(items: { key: string; group: string | null }[]): Map<string, string | null> {
  const count = new Map<string, number>();
  for (const it of items) if (it.group) count.set(it.group, (count.get(it.group) ?? 0) + 1);
  const out = new Map<string, string | null>();
  for (const it of items) out.set(it.key, it.group && (count.get(it.group) ?? 0) >= 2 ? `g:${it.group}` : null);
  return out;
}

export function planReplay(source: ReplaySourceBlock[]): StartRow[] {
  const counted = [...source]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((b) => {
      const done = b.sets.filter((s) => s.done !== false);
      const working = done.filter((s) => !s.isWarmup).length;
      const warmup = done.length - working;
      return { b, working, warmup, any: done.length };
    })
    .filter(({ b, working, any }) => (b.isCardio ? any > 0 : working > 0));
  const tokens = groupTokens(counted.map(({ b }) => ({ key: b.id, group: b.supersetGroup })));
  return counted.map(({ b, working, warmup }) => ({
    exerciseId: b.exerciseId,
    targetSets: b.isCardio ? 1 : working,
    warmupSets: b.isCardio ? 0 : warmup,
    targetRepsMin: b.targetRepsMin,
    targetRepsMax: b.targetRepsMax,
    targetWeightKg: null,
    restSeconds: b.restSeconds ?? DEFAULT_REST,
    variant: { ...b.variant },
    variantExact: true,
    supersetGroup: tokens.get(b.id) ?? null,
    routineExerciseId: b.routineExerciseId,
    prescription: b.prescription && b.prescription.length > 0 ? b.prescription : null,
    cardioTarget: b.cardioTarget ?? null,
  }));
}

/** 피드의 남의 운동 — 종목은 이미 내 기기 종목으로 해석된 뒤다(가져오기와 같은 매칭). 루틴·변형은 잇지 않는다. */
export function planFromSpec(items: { exerciseId: string; sets: number; supersetGroup?: string | null }[]): StartRow[] {
  const keyed = items.map((it, i) => ({ ...it, key: String(i) }));
  const tokens = groupTokens(keyed.map((it) => ({ key: it.key, group: it.supersetGroup ?? null })));
  return keyed.map((it) => ({
    exerciseId: it.exerciseId,
    targetSets: Math.max(1, Math.round(it.sets) || 1),
    warmupSets: 0,
    targetRepsMin: null,
    targetRepsMax: null,
    targetWeightKg: null,
    restSeconds: DEFAULT_REST,
    variant: null,
    variantExact: false,
    supersetGroup: tokens.get(it.key) ?? null,
    routineExerciseId: null,
    prescription: null,
    cardioTarget: null,
  }));
}
