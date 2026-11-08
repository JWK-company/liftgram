// 루틴 한눈에(SPEC-045 · SRS-110) — 루틴 목록 줄의 종목 한 줄과 미리보기 시트의 세트 요약.
import { groupSessionRows } from './lockScreen';
import type { PrescribedSet } from './prescription';
import { rowsFromRoutineLine } from './routineSets';

/** 앞에서부터 max 개 이름 + 나머지 수 — 「벤치 · 스쿼트 · 데드 외 1」 */
export function routineLineText(names: string[], max = 3): { shown: string[]; more: number } {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  const shown = clean.slice(0, Math.max(0, max));
  return { shown, more: Math.max(0, clean.length - shown.length) };
}

export interface RoutineLineInput {
  targetSets: number;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  prescription: PrescribedSet[] | null;
  /** 유산소 종목(기록 종류가 시간·거리) */
  cardio?: boolean;
}

export interface RoutineLineSummary {
  /** 작업 세트 수(top·normal·backoff — 웜업·피더·드롭 제외 · routineSets 의 작업 세트와 같은 기준) */
  sets: number;
  /** 웜업·피더 세트 수 */
  warmups: number;
  /** 드롭 세트 수 */
  drops: number;
  repMin: number | null;
  repMax: number | null;
  /** 작업 세트 중 「최대」(AMRAP)가 있다 */
  amrap: boolean;
  cardio: boolean;
}

const isPrep = (r: PrescribedSet) => r.setType === 'warmup' || r.setType === 'feeder';

/**
 * 루틴 줄 하나의 세트 요약 — 처방 줄은 블록 횟수를 물려받으므로(rowsFromRoutineLine) 펼친 뒤 작업 세트만 본다(스펙 리뷰 H1·H2).
 */
export function routineExerciseSummary(re: RoutineLineInput): RoutineLineSummary {
  if (re.cardio) return { sets: 0, warmups: 0, drops: 0, repMin: null, repMax: null, amrap: false, cardio: true };
  const rows = rowsFromRoutineLine(
    { targetSets: re.targetSets, targetWeightKg: null, targetRepsMin: re.targetRepsMin, targetRepsMax: re.targetRepsMax, prescription: re.prescription },
    { allowLoad: false },
  );
  const work = rows.filter((r) => !isPrep(r) && r.setType !== 'drop');
  // [원본] 빈 쪽을 반대쪽 값으로 채웠다 — 「~5」·「8+」가 「5」·「8」로 보여 세션 표기(repRangeLabel(null,5))와 어긋났다(코드 리뷰 정확성 3)
  // const a = r.repMin ?? r.repMax; const b = r.repMax ?? r.repMin;
  // [개선] 최소는 최소끼리, 최대는 최대끼리 — 한쪽이 모두 비면 null 로 두어 repRangeLabel 이 「~5」·「8+」로 그린다
  let lo: number | null = null;
  let hi: number | null = null;
  let anyLoOpen = false;
  let anyHiOpen = false;
  for (const r of work) {
    if (r.amrap) continue;
    if (r.repMin == null && r.repMax == null) continue;
    if (r.repMin != null) lo = lo == null ? r.repMin : Math.min(lo, r.repMin);
    else anyLoOpen = true;
    if (r.repMax != null) hi = hi == null ? r.repMax : Math.max(hi, r.repMax);
    else anyHiOpen = true;
  }
  // 「~5」와 「8+」가 섞이면 한쪽이 열린 범위 — 열린 쪽은 비운다
  if (anyLoOpen) lo = null;
  if (anyHiOpen) hi = null;
  return {
    sets: work.length,
    warmups: rows.filter(isPrep).length,
    drops: rows.filter((r) => r.setType === 'drop').length,
    repMin: lo,
    repMax: hi,
    amrap: work.some((r) => r.amrap === true),
    cardio: false,
  };
}

/**
 * 운동 화면과 같은 순서·묶음(groupSessionRows) — 떨어져 있어도 같은 그룹 2개 이상이면 첫 멤버 자리에 모아 A1·A2(코드 리뷰 정확성 4).
 * 미리보기가 「시작하면 보일 순서」 그대로 보이게 한다. 결과: 원래 줄 번호(index)와 라벨.
 */
export function sessionOrderLabels(groups: (string | null)[]): { index: number; label: string | null }[] {
  const rows = groupSessionRows(groups.map((g, index) => ({ index, supersetGroup: g })));
  const out: { index: number; label: string | null }[] = [];
  let k = 0;
  for (const r of rows) {
    if (r.kind === 'group') {
      const L = String.fromCharCode(65 + (k++ % 26));
      r.members.forEach((m, j) => out.push({ index: m.index, label: `${L}${j + 1}` }));
    } else out.push({ index: r.we.index, label: null });
  }
  return out;
}

// [원본] 연달아 있는 것만 묶었다 — 운동 화면(groupSessionRows)은 떨어진 같은 그룹도 묶어 「보이는 대로 시작」이 깨졌다(코드 리뷰 정확성 4) → sessionOrderLabels
/** 슈퍼셋 표시 — **연달아 있는** 같은 그룹 2개 이상만 A·B…(떨어져 있으면 묶지 않는다 · 스펙 리뷰 M4) */
export function supersetLabels(groups: (string | null)[]): (string | null)[] {
  const out: (string | null)[] = groups.map(() => null);
  let k = 0;
  let i = 0;
  while (i < groups.length) {
    const g = groups[i];
    let j = i;
    while (g && j + 1 < groups.length && groups[j + 1] === g) j++;
    if (g && j > i) {
      const label = String.fromCharCode(65 + (k++ % 26));
      for (let x = i; x <= j; x++) out[x] = `${label}${x - i + 1}`;
    }
    i = j + 1;
  }
  return out;
}
