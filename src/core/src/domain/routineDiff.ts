// @plm SRS-059 SRS-060  운동 완료 시 루틴 대비 변경점 · 반영 계획 · 운동을 루틴으로 저장할 내용 — 순수 함수
//
// 저장소는 여기서 나온 **계획**을 한 번의 쓰기로 실행만 한다(QA Q2 — 코어 테스트는 DB 없는 순수 함수뿐).
// 변경점은 완료 **직전**에 계산한다(QA Q1): 완료가 세트 0 블록·미완료 세트를 지우기 때문이다.
//
// 변경으로 치는 것(D1): 종목 교체 · 추가 · 삭제 · 세트 수(완료 워킹 세트 — D2) · 순서 · 슈퍼셋 묶음.
// 무게·횟수·휴식·기록 칸 변형(그립·적재·브랜드·부착물)은 변경이 아니다 — 다음 시작 때 지난 기록·지난 조합이 뜬다.
import { muscleLabel } from './labels';
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
}

export type RoutineChange =
  | { kind: 'swap'; id: string; lineId: string; blockId: string; from: string; to: string; defaultOn: true }
  | { kind: 'sets'; id: string; lineId: string; blockId: string; exerciseId: string; from: number; to: number; defaultOn: true }
  | { kind: 'add'; id: string; blockId: string; exerciseId: string; defaultOn: true }
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
    const line = sortedLines.find((l) => !taken.has(l.id) && l.exerciseId === b.exerciseId);
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
    if (b.doneSets === 0) {
      changes.push({ kind: 'remove', id: `remove:${line.id}`, lineId: line.id, exerciseId: line.exerciseId, reason: 'skipped', defaultOn: false });
      continue;
    }
    if (b.exerciseId !== line.exerciseId) {
      changes.push({ kind: 'swap', id: `swap:${line.id}`, lineId: line.id, blockId: b.id, from: line.exerciseId, to: b.exerciseId, defaultOn: true });
    }
    // 유산소는 세트 수가 의미 없다(QA Q3).
    if (!b.isCardio && b.doneWorkingSets > 0 && b.doneWorkingSets !== line.targetSets) {
      changes.push({
        kind: 'sets',
        id: `sets:${line.id}`,
        lineId: line.id,
        blockId: b.id,
        exerciseId: b.exerciseId,
        from: line.targetSets,
        to: b.doneWorkingSets,
        defaultOn: true,
      });
    }
  }

  const sortedBlocks = [...blocks].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const b of sortedBlocks) {
    if (pair.has(b.id) || b.doneSets === 0) continue;
    changes.push({ kind: 'add', id: `add:${b.id}`, blockId: b.id, exerciseId: b.exerciseId, defaultOn: true });
  }

  // 순서·묶음은 **양쪽에 다 있는** 줄(한 줄 이상 한 것)끼리만 비교한다 — 추가·삭제는 각자의 항목이 따로 있다.
  const both = sortedLines.filter((l) => {
    const b = blockOfLine.get(l.id);
    return b && b.doneSets > 0;
  });
  const routineOrder = both.map((l) => l.id).join(',');
  const todayOrder = [...both]
    .sort((x, y) => (blockOfLine.get(x.id) as SessionBlock).sortOrder - (blockOfLine.get(y.id) as SessionBlock).sortOrder)
    .map((l) => l.id)
    .join(',');
  if (routineOrder !== todayOrder) changes.push({ kind: 'order', id: 'order', defaultOn: true });

  const routineGroups = new Map(both.map((l) => [l.id, l.supersetGroup]));
  const todayGroups = new Map(both.map((l) => [l.id, (blockOfLine.get(l.id) as SessionBlock).supersetGroup]));
  if (partitionKey(routineGroups) !== partitionKey(todayGroups)) changes.push({ kind: 'superset', id: 'superset', defaultOn: true });

  return { routineId, lines, blocks, changes, canApply: !lines.some((l) => l.hasPrescription) };
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
}

export interface ApplyPlan {
  /** 바꿀 루틴 줄 — 적힌 필드만 바꾼다. group: undefined=그대로 · string=묶음 표식 · null=풀기. */
  updates: { lineId: string; exerciseId?: string; targetSets?: number; sortOrder: number; group?: string | null }[];
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
    targetSets: b.isCardio ? 1 : Math.max(1, b.doneWorkingSets || b.doneSets),
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
  const adds = pick.filter((c) => c.kind === 'add').map((c) => blockById.get((c as { blockId: string }).blockId) as SessionBlock);
  const reorder = has('order');
  const regroup = has('superset');

  const sortedLines = [...plan.lines].sort((a, b) => a.sortOrder - b.sortOrder).filter((l) => !deletes.has(l.id));
  const live = (b: SessionBlock | undefined) => (b && b.doneSets > 0 ? b : undefined);

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

  const updates: ApplyPlan['updates'] = [];
  const creates: NewLine[] = [];
  items.forEach((it, i) => {
    if (it.lineId) {
      const u: ApplyPlan['updates'][number] = { lineId: it.lineId, sortOrder: i };
      const to = swapTo.get(it.lineId);
      if (to) u.exerciseId = to;
      const sets = setsTo.get(it.lineId);
      if (sets !== undefined) u.targetSets = sets;
      if (regroup && it.block) u.group = tokens.get(it.key) ?? null;
      updates.push(u);
    } else if (it.block) {
      const b = it.block;
      creates.push({
        exerciseId: b.exerciseId,
        ...lineValuesFromBlock(b, false),
        sortOrder: i,
        group: regroup ? tokens.get(it.key) ?? null : null,
        fromBlockId: b.id,
      });
    }
  });
  return { updates, creates, deletes: [...deletes] };
}

// ── 운동을 루틴으로 저장(SRS-060) ────────────────────────────────────────────

/**
 * 완료 세트가 있는 블록만 · 오늘 순서 · 묶음 · 완료 워킹 세트 수 · 횟수 범위 · 휴식. 무게·변형은 담지 않는다(D4).
 * fromRoutine=루틴 운동이면 루틴에서 온 블록의 목표 횟수를, 아니면 그날 한 횟수의 최소~최대를 쓴다.
 */
export function routineLinesFromWorkout(blocks: SessionBlock[], fromRoutine: boolean): NewLine[] {
  const done = [...blocks].filter((b) => b.doneSets > 0).sort((a, b) => a.sortOrder - b.sortOrder);
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
    if (b.doneSets === 0 || !b.primaryMuscle || b.primaryMuscle === 'other') continue;
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
