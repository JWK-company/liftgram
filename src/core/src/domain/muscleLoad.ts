// @plm SRS-075 SRS-076  근육별 세트 집계 — 근육 지도·근육 균형·성과 요약·회원 리포트가 모두 이 함수 하나를 쓴다(ADR-039).
//
// 규칙(ADR-039):
//   · 단위는 「작업 세트 수」. 한 세트가 주근육 각각에 1, 보조근육 각각에 SECONDARY_WEIGHT(0.5)를 더한다.
//   · 워밍업(is_warmup 또는 처방 set_type='warmup')은 뺀다.
//   · 실패 표시(is_failed) 세트도 뺀다 — 앱의 「작업 세트」(isWorkingSet)·KPI 작업 세트·볼륨과 같은 정의(ADR-039 개정).
//   · fullBody 는 그림에 칠하지 않고 별도 「전신」 숫자로만 센다. other 는 어디에도 세지 않는다.
//   · 같은 근육이 주·보조에 함께 있으면 주(1)로 한 번만 센다. 목록 안 중복도 한 번.
// 가중치를 바꾸려면 ADR-039 를 대체하는 새 ADR 이 필요하다.
import { ALL_MUSCLE_GROUPS, type MuscleGroup } from './types';
import { muscleLabel } from './labels';
import type { AppLanguage } from './types';
import type { PrescribedSet } from './prescription';

/** 보조근육 한 세트의 무게(주근육 = 1). @plm SRS-075 */
export const SECONDARY_WEIGHT = 0.5;

/** 그림에 칠하는 근육 12구역 — fullBody·other 를 뺀 것. */
export type MapMuscle = Exclude<MuscleGroup, 'fullBody' | 'other'>;

export const MAP_MUSCLES: MapMuscle[] = ALL_MUSCLE_GROUPS.filter(
  (m): m is MapMuscle => m !== 'fullBody' && m !== 'other',
);

export interface MuscleLoad {
  /** 12구역 근육별 세트(0 포함 — 키가 항상 다 있다). */
  byMuscle: Record<MapMuscle, number>;
  /** 전신(fullBody) 세트 — 그림 밖 별도 숫자. */
  fullBody: number;
}

/** 집계 입력 한 줄 — 세트 하나(또는 같은 종목 세트 `sets` 개). */
export interface MuscleLoadItem {
  primaryMuscles: readonly MuscleGroup[] | null | undefined;
  secondaryMuscles?: readonly MuscleGroup[] | null | undefined;
  /** 이 줄이 대표하는 세트 수(기본 1 · 루틴 계획 세트처럼 여러 개를 한 줄로 넘길 때). */
  sets?: number;
  isWarmup?: boolean | null;
  /** 처방 세트 타입 — 'warmup' 이면 워밍업 */
  setType?: string | null;
  /** 실패 표시 세트 — 집계에서 뺀다(ADR-039 개정 · 작업 세트 정의와 맞춤) */
  isFailed?: boolean | null;
}

export function emptyMuscleLoad(): MuscleLoad {
  const byMuscle = {} as Record<MapMuscle, number>;
  for (const m of MAP_MUSCLES) byMuscle[m] = 0;
  return { byMuscle, fullBody: 0 };
}

function isMapMuscle(m: unknown): m is MapMuscle {
  return typeof m === 'string' && (MAP_MUSCLES as string[]).includes(m);
}

/** 워밍업인가(is_warmup 또는 처방 warmup). 집계에서 뺀다. */
export function isWarmupItem(i: Pick<MuscleLoadItem, 'isWarmup' | 'setType'>): boolean {
  return i.isWarmup === true || i.setType === 'warmup';
}

/** 근육 집계에서 빼는 세트인가 — 워밍업 또는 실패 표시. 판정은 여기 한 곳(ADR-039). */
export function isExcludedItem(i: Pick<MuscleLoadItem, 'isWarmup' | 'setType' | 'isFailed'>): boolean {
  return isWarmupItem(i) || i.isFailed === true;
}

/**
 * 근육별 세트 수. 워밍업·실패 세트는 빼고, 주근육 1 · 보조근육 0.5, fullBody 는 별도, other 는 제외.
 * 결과는 0.5 단위로만 움직인다(부동소수 오차 없음).
 */
export function setsByMuscle(items: readonly MuscleLoadItem[]): MuscleLoad {
  const out = emptyMuscleLoad();
  for (const it of items) {
    if (isExcludedItem(it)) continue;
    const n = it.sets ?? 1;
    if (!Number.isFinite(n) || n <= 0) continue;
    const primary = new Set(it.primaryMuscles ?? []);
    const secondary = new Set((it.secondaryMuscles ?? []).filter((m) => !primary.has(m)));
    for (const m of primary) {
      if (m === 'fullBody') out.fullBody += n;
      else if (isMapMuscle(m)) out.byMuscle[m] += n;
    }
    for (const m of secondary) {
      if (m === 'fullBody') out.fullBody += n * SECONDARY_WEIGHT;
      else if (isMapMuscle(m)) out.byMuscle[m] += n * SECONDARY_WEIGHT;
    }
  }
  return out;
}

/**
 * 루틴 종목 한 줄의 계획 작업 세트 수 — 처방이 있으면 처방 중 워밍업 아닌 줄 수, 없으면 target_sets(유한한 양수만).
 * 순수 함수라 domain 에 둔다(저장소 muscleLoadRepository 가 다시 내보낸다 · 단위 테스트 대상).
 */
export function plannedWorkingSets(re: {
  targetSets?: number | null;
  prescription?: readonly Pick<PrescribedSet, 'setType'>[] | null;
}): number {
  const rx = re.prescription;
  if (rx && rx.length > 0) return rx.filter((s) => s.setType !== 'warmup').length;
  const n = re.targetSets;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}

/** 두 집계를 더한다(주 이동·기간 합산용). */
export function addMuscleLoad(a: MuscleLoad, b: MuscleLoad): MuscleLoad {
  const out = emptyMuscleLoad();
  for (const m of MAP_MUSCLES) out.byMuscle[m] = a.byMuscle[m] + b.byMuscle[m];
  out.fullBody = a.fullBody + b.fullBody;
  return out;
}

/** 12구역 합(전신 제외) — 0 이면 화면은 그림을 숨긴다. */
export function totalMuscleSets(load: MuscleLoad): number {
  let t = 0;
  for (const m of MAP_MUSCLES) t += load.byMuscle[m];
  return t;
}

/** 많은 순 목록(0 제외). 같으면 ALL_MUSCLE_GROUPS 순서. 화면의 숫자 목록·aria-label 이 쓴다. */
export function rankedMuscles(load: MuscleLoad): { muscle: MapMuscle; sets: number }[] {
  return MAP_MUSCLES.map((muscle) => ({ muscle, sets: load.byMuscle[muscle] }))
    .filter((r) => r.sets > 0)
    .sort((a, b) => b.sets - a.sets || MAP_MUSCLES.indexOf(a.muscle) - MAP_MUSCLES.indexOf(b.muscle));
}

/** 이 기간에 안 한 근육(12구역 중 0). 전신 세트가 있어도 개별 근육은 「안 함」으로 본다(전신은 칠하지 않으므로). */
export function untrained(load: MuscleLoad): MapMuscle[] {
  return MAP_MUSCLES.filter((m) => load.byMuscle[m] <= 0);
}

/** 대표 근육(많은 순 최대 `limit` 개 · 기본 2). 비었으면 []. */
export function topMuscles(load: MuscleLoad, limit = 2): MapMuscle[] {
  return rankedMuscles(load)
    .slice(0, Math.max(0, limit))
    .map((r) => r.muscle);
}

/**
 * 대표 근육 이름을 「가슴·삼두」처럼 이어 붙인다(없으면 null). 「… 중심」 같은 문장은 화면이 i18n `muscleMap.focus` 로 만든다 —
 * core 는 언어 문장을 조립하지 않는다(근육 이름 라벨만 labels.ts 에서 가져온다).
 */
export function topMusclesLabel(load: MuscleLoad, lang: AppLanguage = 'ko', limit = 2): string | null {
  const top = topMuscles(load, limit);
  if (!top.length) return null;
  return top.map((m) => muscleLabel(m, lang)).join(lang === 'en' ? ' · ' : '·');
}

/**
 * 그림 칠하기 단계(0 = 안 함 · 1~3 = 30%·60%·100%). 가장 많은 근육 대비 비율로 나눈다:
 * > 2/3 → 3, > 1/3 → 2, > 0 → 1. 단계 구분은 숫자 목록이 맡고 그림은 대략만 보여 준다(U-4).
 */
export function muscleShadeLevel(load: MuscleLoad, m: MapMuscle): 0 | 1 | 2 | 3 {
  const v = load.byMuscle[m];
  if (!(v > 0)) return 0;
  let max = 0;
  for (const k of MAP_MUSCLES) max = Math.max(max, load.byMuscle[k]);
  const r = v / max;
  if (r > 2 / 3) return 3;
  if (r > 1 / 3) return 2;
  return 1;
}

/** 미니 그림(2단계): 종목 하나 또는 루틴의 주·보조 근육 구역. 주에 있으면 보조에서 뺀다. */
export function primarySecondaryMuscles(
  items: readonly Pick<MuscleLoadItem, 'primaryMuscles' | 'secondaryMuscles'>[],
): { primary: MapMuscle[]; secondary: MapMuscle[] } {
  const p = new Set<MapMuscle>();
  const s = new Set<MapMuscle>();
  for (const it of items) {
    for (const m of it.primaryMuscles ?? []) if (isMapMuscle(m)) p.add(m);
    for (const m of it.secondaryMuscles ?? []) if (isMapMuscle(m)) s.add(m);
  }
  return {
    primary: MAP_MUSCLES.filter((m) => p.has(m)),
    secondary: MAP_MUSCLES.filter((m) => s.has(m) && !p.has(m)),
  };
}
