// @plm SRS-059 SRS-060  운동 완료 시 루틴 대비 변경점 · 반영 계획 · 운동을 루틴으로 저장할 내용 — 순수 함수
//
// 저장소는 여기서 나온 **계획**을 한 번의 쓰기로 실행만 한다(QA Q2 — 코어 테스트는 DB 없는 순수 함수뿐).
// 변경점은 완료 **직전**에 계산한다(QA Q1): 완료가 세트 0 블록·미완료 세트를 지우기 때문이다.
//
// 변경으로 치는 것(D1): 종목 교체 · 추가 · 삭제 · 세트 수(완료 워킹 세트 — D2) · 순서 · 슈퍼셋 묶음.
// 무게·횟수·휴식·기록 칸 변형(그립·적재·브랜드·부착물)은 변경이 아니다 — 다음 시작 때 지난 기록·지난 조합이 뜬다.
import { muscleLabel } from './labels';
import type { PrescribedSet, SchemeId } from './prescription';
import { schemeAllowed, schemeRows } from './setSchemes';
import { restOverridesOf, sameRestOverrides, withRestOverrides, type RestOverrides } from './restPlan'; // SPEC-051
import type { AppLanguage, MuscleGroup } from './types';

/** 루틴의 한 줄(현재 루틴 상태). */
export interface RoutineLine {
  id: string;
  exerciseId: string;
  targetSets: number;
  sortOrder: number;
  supersetGroup: string | null;
  /** 세트별 처방이 있다(ADR-028 — 사람이 쓴 처방은 세트 수를 바꾸면 어긋난다 · D5). */
  hasPrescription: boolean;
  /** 처방의 웜업 줄 수 — targetSets 는 웜업을 포함하고 세션 비교값은 작업 세트 수다(SPEC-023). */
  prescribedWarmups?: number;
  /** 루틴 줄의 세트 방식(SPEC-041 · 없으면 일반·직접 구성) */
  scheme?: SchemeId | null;
  /** 루틴 줄의 처방(SPEC-051 — 세트별 휴식만 반영할 때 이 줄들에 칸 값을 적는다) */
  prescription?: PrescribedSet[] | null;
}

/** 오늘 운동의 한 블록(완료 직전 상태). */
export interface SessionBlock {
  id: string;
  exerciseId: string;
  /** v24 — 루틴의 어느 줄에서 왔나(운동 중 종목을 바꿔도 같은 행이라 유지된다). 없으면 옛 운동·즉석 추가. */
  routineExerciseId: string | null;
  sortOrder: number;
  supersetGroup: string | null;
  /** 완료 체크한 세트 수(워밍업 포함). 0 이면 「하지 않은 종목」. */
  doneSets: number;
  /** 완료 체크한 워킹 세트 수(워밍업 제외 — D2). */
  doneWorkingSets: number;
  /** 완료한 워킹 세트들의 횟수 — 빠른 운동을 저장할 때 횟수 범위가 된다(D4). */
  workingReps: number[];
  isCardio: boolean;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  restSeconds: number | null;
  primaryMuscle?: MuscleGroup | null;
  /** 오늘 표의 세트 방식(SPEC-041 · 운동 중 바꿨으면 바꾼 방식) */
  scheme?: SchemeId | null;
  /** 이 종목이 무게 기준을 쓰나(맨몸·어시스트·유산소는 false) — 반영할 새 틀을 만들 때 */
  schemeAllowLoad?: boolean;
  /** 이 종목의 기구 — 세트 방식 제한(드롭세트는 바벨류·맨몸 X) */
  equipment?: string | null;
  /** 오늘 블록에서 사람이 정한 세트별 휴식(SPEC-051 · 칸 → 초) */
  restOverrides?: RestOverrides;
  /** 시작 때 이 블록에 실렸을 지난 칸 값(기억 · SPEC-051 리뷰) — 루틴 줄에 값이 없고 오늘 값이 이것과 같으면 바꾼 게 아니다 */
  restRemembered?: RestOverrides | null;
}

export type RoutineChange =
  | { kind: 'swap'; id: string; lineId: string; blockId: string; from: string; to: string; defaultOn: true }
  | { kind: 'sets'; id: string; lineId: string; blockId: string; exerciseId: string; from: number; to: number; defaultOn: true }
  | { kind: 'add'; id: string; blockId: string; exerciseId: string; defaultOn: true }
  // 세트 방식 — 운동 중 바꿨다(SPEC-041). 반영하면 루틴 줄의 처방을 새 틀 전체로 쓴다. 끄면 오늘만.
  | { kind: 'scheme'; id: string; lineId: string; blockId: string; exerciseId: string; from: SchemeId | null; to: SchemeId; defaultOn: true }
  // 세트별 휴식(SPEC-051) — 루틴 줄과 방식이 같고 사람이 정한 칸 값이 다르다. 반영하면 루틴 줄 처방에 칸 값을 쓴다.
  | { kind: 'rest'; id: string; lineId: string; blockId: string; exerciseId: string; defaultOn: true }
  | {
      kind: 'remove';
      id: string;
      lineId: string;
      exerciseId: string;
      /** deleted = 운동 중에 지웠다(기본 체크) · skipped = 남아 있었지만 한 세트도 안 했다(기본 해제 — 그날만 건너뛴 경우가 많다). */
      reason: 'deleted' | 'skipped';
      defaultOn: boolean;
    }
  | { kind: 'order'; id: 'order'; defaultOn: true }
  | { kind: 'superset'; id: 'superset'; defaultOn: true };

export interface FinishPlan {
  routineId: string;
  lines: RoutineLine[];
  blocks: SessionBlock[];
  changes: RoutineChange[];
  /** 처방이 있는 루틴은 「바꾸기」를 막는다(D5). */
  canApply: boolean;
}

/**
 * 「한 종목」인가 — 근력은 완료 **워킹** 세트가 있어야 하고(워밍업만 한 종목은 하지 않은 것 — D2 · QA M4),
 * 유산소는 완료 세트가 있으면 된다. 실패 세트도 워킹 세트로 센다(D2 「완료 워킹」 — 실패해도 그 세트를 한 것이다 · QA L1).
 */
export function performed(b: SessionBlock): boolean {
  return b.isCardio ? b.doneSets > 0 : b.doneWorkingSets > 0;
}

// ── 짝짓기 ─────────────────────────────────────────────────────────────────

/** 블록 id → 루틴 줄 id. 연결 id 가 먼저, 없으면 같은 종목의 남은 줄을 순서대로(옛 운동·연결 없는 블록). */
export function pairBlocks(lines: RoutineLine[], blocks: SessionBlock[]): Map<string, string> {
  const byLine = new Map(lines.map((l) => [l.id, l]));
  const taken = new Set<string>();
  const out = new Map<string, string>();
  const ordered = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const b of ordered) {
    if (b.routineExerciseId && byLine.has(b.routineExerciseId) && !taken.has(b.routineExerciseId)) {
      out.set(b.id, b.routineExerciseId);
      taken.add(b.routineExerciseId);
    }
  }
  const sortedLines = [...lines].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const b of ordered) {
    if (out.has(b.id) || b.routineExerciseId) continue; // 연결이 있었는데 그 줄이 없다 = 루틴에서 빠진 줄 → 추가로 본다
    // 같은 종목 줄이 여럿이면 세트 수가 가장 가까운 줄(동률이면 앞 줄) — 하나만 한 날 엉뚱한 줄을 지우지 않게(QA L3).
    const cands = sortedLines.filter((l) => !taken.has(l.id) && l.exerciseId === b.exerciseId);
    const line = cands.reduce<RoutineLine | undefined>(
      (best, l) =>
        !best || Math.abs(l.targetSets - b.doneWorkingSets) < Math.abs(best.targetSets - b.doneWorkingSets) ? l : best,
      undefined,
    );
    if (line) {
      out.set(b.id, line.id);
      taken.add(line.id);
    }
  }
  return out;
}

/** 묶음 구성(멤버 2 이상)을 비교 가능한 문자열로. */
function partitionKey(groups: Map<string, string | null>): string {
  const byGroup = new Map<string, string[]>();
  for (const [member, g] of groups) {
    if (!g) continue;
    const arr = byGroup.get(g) ?? [];
    arr.push(member);
    byGroup.set(g, arr);
  }
  return [...byGroup.values()]
    .filter((m) => m.length >= 2)
    .map((m) => [...m].sort().join(','))
    .sort()
    .join('|');
}

// ── 변경점 ─────────────────────────────────────────────────────────────────

export function diffRoutine(routineId: string, lines: RoutineLine[], blocks: SessionBlock[]): FinishPlan {
  const pair = pairBlocks(lines, blocks);
  const blockOfLine = new Map<string, SessionBlock>();
  for (const b of blocks) {
    const l = pair.get(b.id);
    if (l) blockOfLine.set(l, b);
  }
  const sortedLines = [...lines].sort((a, b) => a.sortOrder - b.sortOrder);
  const changes: RoutineChange[] = [];

  for (const line of sortedLines) {
    const b = blockOfLine.get(line.id);
    if (!b) {
      changes.push({ kind: 'remove', id: `remove:${line.id}`, lineId: line.id, exerciseId: line.exerciseId, reason: 'deleted', defaultOn: true });
      continue;
    }
    if (!performed(b)) {
      changes.push({ kind: 'remove', id: `remove:${line.id}`, lineId: line.id, exerciseId: line.exerciseId, reason: 'skipped', defaultOn: false });
      continue;
    }
    if (b.exerciseId !== line.exerciseId) {
      changes.push({ kind: 'swap', id: `swap:${line.id}`, lineId: line.id, blockId: b.id, from: line.exerciseId, to: b.exerciseId, defaultOn: true });
    }
    // 유산소는 세트 수가 의미 없다(QA Q3).
    // [원본] b.doneWorkingSets !== line.targetSets — 웜업 줄이 있으면 매번 달라 시트가 떴다
    const plannedWorking = line.targetSets - (line.prescribedWarmups ?? 0);
    // 세트 방식(SPEC-041) — 오늘 방식이 있고 루틴과 다르면. 오늘이 일반·직접 구성이면 항목을 만들지 않는다(처방을 지우지 않는다).
    if (!b.isCardio && b.scheme && b.scheme !== (line.scheme ?? null) && schemeAllowed(b.scheme, b.equipment ?? null)) {
      changes.push({
        kind: 'scheme',
        id: `scheme:${line.id}`,
        lineId: line.id,
        blockId: b.id,
        exerciseId: line.exerciseId,
        from: line.scheme ?? null,
        to: b.scheme,
        defaultOn: true,
      });
    }
    // 세트별 휴식(SPEC-051) — 방식이 같을 때만(방식을 바꾸면 새 틀에 칸 값이 함께 실린다)
    // [원본] if (!b.isCardio && b.scheme && b.scheme === (line.scheme ?? null) && line.prescription &&
    //   !sameRestOverrides(b.restOverrides ?? {}, restOverridesOf(line.prescription))) {
    // [개선] 기억으로 실린 값(루틴 줄엔 값이 없고 오늘 값 = 기억값)은 오늘 바꾼 게 아니다 — 띄우지 않는다(SPEC-051 리뷰)
    const lineRest = line.prescription ? restOverridesOf(line.prescription) : {};
    const fromMemory =
      Object.keys(lineRest).length === 0 &&
      !!b.restRemembered &&
      Object.keys(b.restRemembered).length > 0 &&
      sameRestOverrides(b.restOverrides ?? {}, b.restRemembered);
    if (
      !b.isCardio &&
      b.scheme &&
      b.scheme === (line.scheme ?? null) &&
      line.prescription &&
      !fromMemory &&
      !sameRestOverrides(b.restOverrides ?? {}, lineRest)
    ) {
      changes.push({ kind: 'rest', id: `rest:${line.id}`, lineId: line.id, blockId: b.id, exerciseId: line.exerciseId, defaultOn: true });
    }
    // [원본] if (!b.isCardio && b.doneWorkingSets > 0 && b.doneWorkingSets !== plannedWorking) {
    // [개선] 처방이 있는 줄은 세트 수 항목을 만들지 않는다 — 세트 수는 처방(세트 방식)이 정한다(D5 의 이유 · SPEC-041)
    if (!line.hasPrescription && !b.isCardio && b.doneWorkingSets > 0 && b.doneWorkingSets !== plannedWorking) {
      changes.push({
        kind: 'sets',
        id: `sets:${line.id}`,
        lineId: line.id,
        blockId: b.id,
        exerciseId: line.exerciseId, // 루틴 **줄** 기준 — 교체를 끄고 세트만 남기면 원래 종목 줄에 적용된다(QA M2)
        from: plannedWorking,
        to: b.doneWorkingSets,
        defaultOn: true,
      });
    }
  }

  const sortedBlocks = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const b of sortedBlocks) {
    if (pair.has(b.id) || !performed(b)) continue;
    changes.push({ kind: 'add', id: `add:${b.id}`, blockId: b.id, exerciseId: b.exerciseId, defaultOn: true });
  }

  // 순서·묶음은 **양쪽에 다 있는** 줄(한 줄 이상 한 것)끼리만 비교한다 — 추가·삭제는 각자의 항목이 따로 있다.
  const both = sortedLines.filter((l) => {
    const b = blockOfLine.get(l.id);
    return b && performed(b);
  });
  const routineOrder = both.map((l) => l.id).join(',');
  const todayOrder = [...both]
    .sort((x, y) => (blockOfLine.get(x.id) as SessionBlock).sortOrder - (blockOfLine.get(y.id) as SessionBlock).sortOrder)
    .map((l) => l.id)
    .join(',');
  if (routineOrder !== todayOrder) changes.push({ kind: 'order', id: 'order', defaultOn: true });

  // 묶음은 추가 종목까지 넣어 비교한다 — 즉석 추가 종목을 기존 줄과 묶은 것도 묶음 변경이다(QA H1).
  const addedBlocks = sortedBlocks.filter((b) => !pair.has(b.id) && performed(b));
  const routineGroups = new Map<string, string | null>([
    ...both.map((l) => [l.id, l.supersetGroup] as [string, string | null]),
    ...addedBlocks.map((b) => [b.id, null] as [string, string | null]),
  ]);
  const todayGroups = new Map<string, string | null>([
    ...both.map((l) => [l.id, (blockOfLine.get(l.id) as SessionBlock).supersetGroup] as [string, string | null]),
    ...addedBlocks.map((b) => [b.id, b.supersetGroup] as [string, string | null]),
  ]);
  if (partitionKey(routineGroups) !== partitionKey(todayGroups)) changes.push({ kind: 'superset', id: 'superset', defaultOn: true });

  // [원본] return { routineId, lines, blocks, changes, canApply: !lines.some((l) => l.hasPrescription) };
  // [개선] 처방 루틴도 반영한다 — 처방 줄은 세트 수 항목을 만들지 않고, 세트 방식은 새 틀 전체로 쓴다(SPEC-041)
  return { routineId, lines, blocks, changes, canApply: true };
}

/** 처음에 체크된 항목들. */
export function defaultSelection(changes: RoutineChange[]): Set<string> {
  return new Set(changes.filter((c) => c.defaultOn).map((c) => c.id));
}

// ── 반영 계획 ──────────────────────────────────────────────────────────────

/** 새로 만들 루틴 줄 하나(추가·루틴으로 저장 공용). group 은 계획 안의 묶음 표식 — 저장소가 새 그룹 id 로 바꾼다(QA Q7). */
export interface NewLine {
  exerciseId: string;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number;
  sortOrder: number;
  group: string | null;
  /** 이 블록에서 왔다 — 저장소가 유산소 목표 등을 블록에서 복사할 때 쓴다. */
  fromBlockId: string;
  /** 오늘 블록의 세트 방식 새 틀(SPEC-041 · REV-076 데이터 6) — 있으면 targetSets 는 그 줄 수 */
  prescription?: PrescribedSet[];
}

export interface ApplyPlan {
  /** 바꿀 루틴 줄 — 적힌 필드만 바꾼다. group: undefined=그대로 · string=묶음 표식 · null=풀기. */
  // [원본] updates: { lineId: string; exerciseId?: string; targetSets?: number; sortOrder: number; group?: string | null }[];
  /** prescription: 세트 방식을 반영할 때 새 틀 전체(SPEC-041) — targetSets 는 그 줄 수 */
  updates: {
    lineId: string;
    exerciseId?: string;
    targetSets?: number;
    sortOrder: number;
    group?: string | null;
    prescription?: PrescribedSet[];
  }[];
  creates: NewLine[];
  deletes: string[];
}

const DEFAULT_REST = 120;

/** 블록 → 새 루틴 줄의 처방 값(D4). useBlockTargets=루틴 운동이면 루틴에서 복사돼 온 목표 횟수를 쓴다. */
function lineValuesFromBlock(b: SessionBlock, useBlockTargets: boolean): Omit<NewLine, 'sortOrder' | 'group' | 'fromBlockId' | 'exerciseId'> {
  let min: number | null = null;
  let max: number | null = null;
  if (useBlockTargets && (b.targetRepsMin || b.targetRepsMax)) {
    min = b.targetRepsMin || b.targetRepsMax;
    max = b.targetRepsMax || b.targetRepsMin;
  } else if (b.workingReps.length > 0) {
    min = Math.min(...b.workingReps);
    max = Math.max(...b.workingReps);
  }
  return {
    targetSets: b.isCardio ? 1 : Math.max(1, b.doneWorkingSets), // 워밍업은 세트 수에 넣지 않는다(D2 · QA M4)
    targetRepsMin: min && min > 0 ? min : 8,
    targetRepsMax: max && max > 0 ? max : 12,
    restSeconds: b.restSeconds && b.restSeconds > 0 ? b.restSeconds : DEFAULT_REST,
  };
}

/** 오늘 묶음 → 계획 표식. 멤버가 2 이상인 묶음만 남는다. */
function groupTokens(items: { key: string; group: string | null }[]): Map<string, string | null> {
  const count = new Map<string, number>();
  for (const it of items) if (it.group) count.set(it.group, (count.get(it.group) ?? 0) + 1);
  const out = new Map<string, string | null>();
  for (const it of items) out.set(it.key, it.group && (count.get(it.group) ?? 0) >= 2 ? `g:${it.group}` : null);
  return out;
}

export function planRoutineApply(plan: FinishPlan, selected: Set<string>): ApplyPlan {
  const pick = plan.changes.filter((c) => selected.has(c.id));
  const has = (kind: RoutineChange['kind']) => pick.some((c) => c.kind === kind);
  const pair = pairBlocks(plan.lines, plan.blocks);
  const blockById = new Map(plan.blocks.map((b) => [b.id, b]));
  const blockOfLine = new Map<string, SessionBlock>();
  for (const [bid, lid] of pair) blockOfLine.set(lid, blockById.get(bid) as SessionBlock);

  const deletes = new Set(pick.filter((c) => c.kind === 'remove').map((c) => (c as { lineId: string }).lineId));
  const swapTo = new Map(pick.filter((c) => c.kind === 'swap').map((c) => [(c as { lineId: string }).lineId, (c as { to: string }).to]));
  const setsTo = new Map(pick.filter((c) => c.kind === 'sets').map((c) => [(c as { lineId: string }).lineId, (c as { to: number }).to]));
  // 세트 방식 → 새 틀 전체(오늘 블록의 무게 기준 사용 여부로)
  const schemeTo = new Map<string, PrescribedSet[]>();
  for (const c of pick) {
    if (c.kind !== 'scheme') continue;
    const b = blockById.get(c.blockId);
    // [원본] const rows = schemeRows(c.to, { allowLoad: b?.schemeAllowLoad ?? true });
    // [개선] 오늘 정한 세트별 휴식을 새 틀에 싣는다(SPEC-051)
    const rows = withRestOverrides(schemeRows(c.to, { allowLoad: b?.schemeAllowLoad ?? true }), b?.restOverrides ?? {});
    if (rows.length > 0) schemeTo.set(c.lineId, rows);
  }
  // 세트별 휴식만(SPEC-051) — 루틴 줄 처방에 오늘 칸 값
  const restTo = new Map<string, PrescribedSet[]>();
  for (const c of pick) {
    if (c.kind !== 'rest') continue;
    const b = blockById.get(c.blockId);
    const rx = plan.lines.find((l) => l.id === c.lineId)?.prescription;
    if (b && rx && rx.length > 0) restTo.set(c.lineId, withRestOverrides(rx, b.restOverrides ?? {}));
  }
  const adds = pick.filter((c) => c.kind === 'add').map((c) => blockById.get((c as { blockId: string }).blockId) as SessionBlock);
  const reorder = has('order');
  const regroup = has('superset');

  const sortedLines = [...plan.lines].sort((a, b) => a.sortOrder - b.sortOrder).filter((l) => !deletes.has(l.id));
  const live = (b: SessionBlock | undefined) => (b && performed(b) ? b : undefined);

  // 순위 — 정렬해 0..n 으로 다시 매긴다.
  type Item = { key: string; rank: number; lineId?: string; block?: SessionBlock };
  const items: Item[] = [];
  if (reorder) {
    // 오늘 한 순서대로. 오늘 블록이 없는 줄(건너뛰었지만 남긴 줄)은 루틴에서 바로 앞 줄 뒤에 붙는다.
    let prev = -1;
    for (const l of sortedLines) {
      const b = live(blockOfLine.get(l.id));
      const rank = b ? b.sortOrder : prev + 0.001;
      prev = rank;
      items.push({ key: l.id, rank, lineId: l.id, block: b });
    }
    for (const b of adds) items.push({ key: b.id, rank: b.sortOrder, block: b });
  } else {
    // 루틴 순서 그대로. 추가 종목은 오늘 그 앞에 했던 루틴 줄 바로 뒤에.
    const rankOfLine = new Map(sortedLines.map((l, i) => [l.id, i]));
    for (const l of sortedLines) items.push({ key: l.id, rank: rankOfLine.get(l.id) as number, lineId: l.id, block: live(blockOfLine.get(l.id)) });
    const todayOrdered = [...plan.blocks].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const b of adds) {
      let anchor = -1;
      for (const x of todayOrdered) {
        if (x.sortOrder >= b.sortOrder) break;
        const lid = pair.get(x.id);
        if (lid !== undefined && rankOfLine.has(lid)) anchor = rankOfLine.get(lid) as number;
      }
      items.push({ key: b.id, rank: anchor + 0.5 + b.sortOrder / 10000, block: b });
    }
  }
  items.sort((a, b) => a.rank - b.rank);

  const tokens = regroup
    ? groupTokens(items.filter((it) => it.block).map((it) => ({ key: it.key, group: (it.block as SessionBlock).supersetGroup })))
    : new Map<string, string | null>();

  // 오늘 손대지 않은 루틴 묶음은 그대로 둔다(QA H2) — 그 묶음 멤버들의 오늘 블록(건너뛴 것 포함)이 모두 같은
  // 오늘 묶음에 있고, 그 오늘 묶음에 다른 블록이 없으면 「그대로」다. 건너뛴 멤버 때문에 묶음이 풀리지 않는다.
  const keptGroups = new Set<string>();
  if (regroup) {
    const routineGroupIds = new Set(sortedLines.map((l) => l.supersetGroup).filter((g): g is string => !!g));
    for (const g of routineGroupIds) {
      const mine = sortedLines.filter((l) => l.supersetGroup === g).map((l) => blockOfLine.get(l.id)).filter((b): b is SessionBlock => !!b);
      if (mine.length === 0) {
        keptGroups.add(g);
        continue;
      }
      const x = mine[0].supersetGroup;
      if (x && mine.every((b) => b.supersetGroup === x) && plan.blocks.every((b) => b.supersetGroup !== x || mine.includes(b))) keptGroups.add(g);
    }
  }
  const lineById = new Map(plan.lines.map((l) => [l.id, l]));

  const updates: ApplyPlan['updates'] = [];
  const creates: NewLine[] = [];
  items.forEach((it, i) => {
    if (it.lineId) {
      const u: ApplyPlan['updates'][number] = { lineId: it.lineId, sortOrder: i };
      const to = swapTo.get(it.lineId);
      if (to) u.exerciseId = to;
      const sets = setsTo.get(it.lineId);
      if (sets !== undefined) u.targetSets = sets;
      // 처방 줄을 다른 종목으로 바꿔 반영하면 그 종목 기준으로 처방을 다시 맞춘다 — 바벨로 바꿨는데 드롭세트 처방이
      //   남거나 맨몸에 1RM % 가 남지 않게(REV-076 데이터 7). 방식이 맞지 않으면 처방을 비운다(세트 수는 그대로).
      if (to && !schemeTo.has(it.lineId) && lineById.get(it.lineId)?.hasPrescription && it.block) {
        const b = it.block;
        if (b.scheme && schemeAllowed(b.scheme, b.equipment ?? null)) {
          // [원본] const rows = schemeRows(b.scheme, { allowLoad: b.schemeAllowLoad ?? true });
          const rows = withRestOverrides(schemeRows(b.scheme, { allowLoad: b.schemeAllowLoad ?? true }), b.restOverrides ?? {}); // SPEC-051
          u.prescription = rows;
          u.targetSets = rows.length;
        } else {
          u.prescription = [];
        }
      }
      const rest = restTo.get(it.lineId);
      if (rest && !to) u.prescription = rest; // 종목을 바꾸면 위 규칙(새 틀 또는 비우기)이 먼저다
      const rx = schemeTo.get(it.lineId);
      if (rx) {
        u.prescription = rx;
        u.targetSets = rx.length; // 세트 수는 새 틀의 줄 수(웜업 포함 — 루틴 줄의 targetSets 규칙)
      }
      const old = lineById.get(it.lineId)?.supersetGroup ?? null;
      if (regroup && it.block && !(old && keptGroups.has(old))) u.group = tokens.get(it.key) ?? null;
      updates.push(u);
    } else if (it.block) {
      const b = it.block;
      // 추가한 종목도 오늘 세트 방식이 있으면 그 틀로(REV-076 데이터 6)
      const rx =
        b.scheme && !b.isCardio && schemeAllowed(b.scheme, b.equipment ?? null)
          ? // [원본] schemeRows(b.scheme, { allowLoad: b.schemeAllowLoad ?? true })
            withRestOverrides(schemeRows(b.scheme, { allowLoad: b.schemeAllowLoad ?? true }), b.restOverrides ?? {}) // SPEC-051
          : [];
      creates.push({
        exerciseId: b.exerciseId,
        ...lineValuesFromBlock(b, false),
        ...(rx.length > 0 ? { prescription: rx, targetSets: rx.length } : {}),
        sortOrder: i,
        group: regroup ? tokens.get(it.key) ?? null : null,
        fromBlockId: b.id,
      });
    }
  });

  // 혼자 남는 묶음은 풀어 둔다 — 짝을 지웠거나, 짝만 새 묶음으로 옮겨 갔을 때(QA H2 · L2).
  const groupKey = (u: ApplyPlan['updates'][number]): string | null => {
    if (u.group === undefined) {
      const old = lineById.get(u.lineId)?.supersetGroup ?? null;
      return old ? `o:${old}` : null;
    }
    return u.group ? `n:${u.group}` : null;
  };
  const used = new Map<string, number>();
  const bump = (k: string | null) => {
    if (k) used.set(k, (used.get(k) ?? 0) + 1);
  };
  for (const u of updates) bump(groupKey(u));
  for (const c of creates) bump(c.group ? `n:${c.group}` : null);
  for (const u of updates) {
    const k = groupKey(u);
    if (k && (used.get(k) ?? 0) < 2) u.group = null;
  }
  for (const c of creates) if (c.group && (used.get(`n:${c.group}`) ?? 0) < 2) c.group = null;

  return { updates, creates, deletes: [...deletes] };
}

// ── 운동을 루틴으로 저장(SRS-060) ────────────────────────────────────────────

/**
 * 완료 세트가 있는 블록만 · 오늘 순서 · 묶음 · 완료 워킹 세트 수 · 횟수 범위 · 휴식. 무게·변형은 담지 않는다(D4).
 * fromRoutine=루틴 운동이면 루틴에서 온 블록의 목표 횟수를, 아니면 그날 한 횟수의 최소~최대를 쓴다.
 */
export function routineLinesFromWorkout(blocks: SessionBlock[], fromRoutine: boolean): NewLine[] {
  const done = [...blocks].filter(performed).sort((a, b) => a.sortOrder - b.sortOrder);
  const tokens = groupTokens(done.map((b) => ({ key: b.id, group: b.supersetGroup })));
  return done.map((b, i) => ({
    exerciseId: b.exerciseId,
    ...lineValuesFromBlock(b, fromRoutine && b.routineExerciseId != null),
    sortOrder: i,
    group: tokens.get(b.id) ?? null,
    fromBlockId: b.id,
  }));
}

/** 같은 이름이 있으면 「 (2)」「 (3)」… */
export function dedupeName(name: string, existing: string[]): string {
  const taken = new Set(existing.map((n) => n.trim()));
  const base = name.trim();
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const cand = `${base} (${i})`;
    if (!taken.has(cand)) return cand;
  }
}

/**
 * 기본 이름(D4) — 루틴 운동이면 「원래 이름 (수정)」, 아니면 「M/D 주 근육 2개」(완료 세트가 많은 순).
 */
export function suggestRoutineName(input: {
  routineName: string | null;
  date: Date;
  blocks: SessionBlock[];
  existing: string[];
  lang?: AppLanguage;
}): string {
  const lang = input.lang ?? 'ko';
  if (input.routineName) return dedupeName(`${input.routineName} ${lang === 'ko' ? '(수정)' : '(edited)'}`, input.existing);
  const bySets = new Map<MuscleGroup, number>();
  for (const b of input.blocks) {
    if (!performed(b) || !b.primaryMuscle || b.primaryMuscle === 'other') continue;
    bySets.set(b.primaryMuscle, (bySets.get(b.primaryMuscle) ?? 0) + b.doneSets);
  }
  const top = [...bySets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([m]) => muscleLabel(m, lang));
  const d = `${input.date.getMonth() + 1}/${input.date.getDate()}`;
  const label = top.length ? top.join('·') : lang === 'ko' ? '운동' : 'Workout';
  return dedupeName(`${d} ${label}`, input.existing);
}
