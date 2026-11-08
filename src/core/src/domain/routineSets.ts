// 루틴 세트 표 ↔ 루틴 줄 저장값 변환(SPEC-023 · 순수 로직)
//
// 규칙은 하나다 — **표의 무게는 시작 값이고, 지난 기록이 있으면 지난 기록이 먼저다.** 지난 기록을 이겨야 하는 줄은
// 사람이 직접 고정(fixed)을 고른다. 고치지 않은 줄의 fixed·%·loadHint 는 그대로 둔다.
// 표의 값이 모두 블록 값으로 묶이면 처방은 null — 표를 쓰지 않은 옛 루틴과 같은 모양이다.
// 비운 칸은 비운 대로 — 다른 줄에 무게가 있으면 { start, loadKg: 0 } 표식으로 남겨 블록 값을 물려받지 않는다(REV-028).
import type { PrescribedSet } from './prescription';

export interface RoutineLineSets {
  targetSets: number;
  targetWeightKg: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  prescription: PrescribedSet[] | null;
}

export const ROUTINE_SETS_MAX = 20;

const positive = (v: number | null | undefined): v is number => typeof v === 'number' && v > 0;
const sameKg = (a: number, b: number) => Math.abs(a - b) < 1e-6;

export function emptySetRow(): PrescribedSet {
  return { setType: 'normal', targetRir: null, repMin: null, repMax: null, loadHint: null };
}

/** 표에 그릴 줄. allowLoad=false(맨몸·어시스트)면 줄에 무게를 채우지 않는다 — 스테퍼 하나가 targetWeightKg 를 맡는다. */
export function rowsFromRoutineLine(line: RoutineLineSets, opts: { allowLoad: boolean }): PrescribedSet[] {
  const base = line.prescription?.length
    ? line.prescription
    : Array.from({ length: Math.max(1, line.targetSets || 1) }, emptySetRow);
  return base.map((r) => {
    // [원본] repMin: r.repMin ?? line.targetRepsMin, repMax: r.repMax ?? line.targetRepsMax — 한 칸만 비워도 되돌아왔다
    // [개선] 「최대」 줄은 횟수를 물려받지 않는다 — 블록 횟수 8 이 붙으면 수정함으로 보이고 세션이 8 로 채운다(REV-074)
    const inheritReps = r.repMin == null && r.repMax == null && r.amrap !== true;
    const out: PrescribedSet = {
      ...r,
      repMin: inheritReps ? line.targetRepsMin : r.repMin,
      repMax: inheritReps ? line.targetRepsMax : r.repMax,
    };
    if (opts.allowLoad && !r.loadBasis && positive(line.targetWeightKg)) {
      out.loadBasis = 'start';
      out.loadKg = line.targetWeightKg;
    }
    return out;
  });
}

// 대표 줄 — 탑세트 > 일반·백오프. 웜업·드롭 값은 블록 값이 되지 않는다(작업 세트가 그 값으로 채워진다 · REV-028).
function representative<T>(rows: PrescribedSet[], pick: (r: PrescribedSet) => T | null): T | null {
  const order: ((r: PrescribedSet) => boolean)[] = [
    (r) => r.setType === 'top',
    (r) => r.setType === 'normal' || r.setType === 'backoff',
    // [원본] () => true, — 웜업·드롭까지 대표로 삼았다
  ];
  for (const match of order) {
    for (const r of rows) {
      if (!match(r)) continue;
      const v = pick(r);
      if (v != null) return v;
    }
  }
  return null;
}

/** 표 → 저장값. line 은 지금 저장된 값 — 표에 직접 입력한 무게가 없을 때(맨몸·전 줄 %·고정) 블록 값을 지키는 데 쓴다. */
export function routineLinePatch(
  rows: PrescribedSet[],
  line: RoutineLineSets,
  opts: { allowLoad: boolean },
): RoutineLineSets {
  const startKg = (r: PrescribedSet) =>
    opts.allowLoad && r.loadBasis === 'start' && positive(r.loadKg) ? r.loadKg : null;
  const baseKg = representative(rows, startKg);
  const hasOtherBasis = rows.some((r) => !!r.loadBasis && r.loadBasis !== 'start');
  const isBlank = (r: PrescribedSet) => !r.loadBasis || (r.loadBasis === 'start' && !positive(r.loadKg));
  // 직접 입력이 없을 때 — 맨몸이거나 전 줄이 %·고정이면 있던 값을 지키고, 비운 줄이 있으면 지운다(되살아나지 않게).
  const targetWeightKg =
    baseKg ?? (!opts.allowLoad || (hasOtherBasis && !rows.some(isBlank)) ? line.targetWeightKg : null);

  // [원본] const hasReps = (r: PrescribedSet) => r.repMin != null || r.repMax != null;
  const hasReps = (r: PrescribedSet) => r.amrap !== true && (r.repMin != null || r.repMax != null);
  const baseReps = representative(rows, (r) => (hasReps(r) ? { min: r.repMin, max: r.repMax } : null));

  const cleaned = rows.map((r) => {
    const out: PrescribedSet = { ...r };
    const kg = startKg(r);
    // [원본] start 인데 값이 없거나 기준과 같으면 지웠다 — 비운 줄이 기준값으로 되살아났다
    const dropStart = () => {
      delete out.loadBasis;
      delete out.loadKg;
    };
    if (!opts.allowLoad) {
      if (r.loadBasis === 'start') dropStart();
    } else if (kg != null) {
      if (baseKg != null && sameKg(kg, baseKg)) dropStart();
    } else if (isBlank(r)) {
      if (baseKg != null) {
        out.loadBasis = 'start';
        out.loadKg = 0;
      } else dropStart();
    }
    // [개선] 대표가 될 수 있는 줄(탑·일반·백오프)만 블록 횟수로 묶는다 — 웜업·피더·드롭이 블록 횟수에 끌려가지 않게(REV-075)
    const repsFollowBlock = r.setType === 'top' || r.setType === 'normal' || r.setType === 'backoff';
    if (r.amrap === true) {
      out.repMin = null;
      out.repMax = null;
    } else if (baseReps && repsFollowBlock && r.repMin === baseReps.min && r.repMax === baseReps.max) {
      out.repMin = null;
      out.repMax = null;
    }
    return out;
  });
  return {
    targetSets: rows.length,
    targetWeightKg,
    targetRepsMin: baseReps ? baseReps.min : null,
    targetRepsMax: baseReps ? baseReps.max : null,
    prescription: cleaned.some(rowHasMeaning) ? cleaned : null,
  };
}

/** 한 줄이라도 뜻이 있으면 처방이다. */
export function rowHasMeaning(r: PrescribedSet): boolean {
  return (
    r.setType !== 'normal' ||
    r.targetRir != null ||
    r.repMin != null ||
    r.repMax != null ||
    r.loadHint != null ||
    !!r.loadBasis ||
    r.amrap === true || // SPEC-041
    !!r.scheme
  );
}

const effortRow = (r: PrescribedSet) => r.setType !== 'warmup' && r.setType !== 'drop';

/** 운동 하나의 강도 목표 — 웜업·드롭은 뺀다. null = 없음 · 'mixed' = 줄마다 다른 옛 처방. */
export function effortGoalOf(rows: PrescribedSet[]): number | null | 'mixed' {
  const values = rows.filter(effortRow).map((r) => r.targetRir ?? null);
  if (values.length === 0) return null;
  return values.every((v) => v === values[0]) ? values[0] : 'mixed';
}

export function withEffortGoal(rows: PrescribedSet[], rir: number | null): PrescribedSet[] {
  return rows.map((r) => (effortRow(r) ? { ...r, targetRir: rir } : r));
}
