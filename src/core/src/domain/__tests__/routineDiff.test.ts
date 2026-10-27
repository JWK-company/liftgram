// @plm SRS-059 SRS-060  운동 완료 시 루틴 대비 변경점 · 반영 계획 · 루틴으로 저장
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSelection,
  dedupeName,
  diffRoutine,
  planRoutineApply,
  routineLinesFromWorkout,
  suggestRoutineName,
  type RoutineLine,
  type SessionBlock,
} from '../routineDiff';

const line = (id: string, exerciseId: string, sortOrder: number, extra: Partial<RoutineLine> = {}): RoutineLine => ({
  id,
  exerciseId,
  targetSets: 3,
  sortOrder,
  supersetGroup: null,
  hasPrescription: false,
  ...extra,
});
const block = (id: string, exerciseId: string, sortOrder: number, extra: Partial<SessionBlock> = {}): SessionBlock => ({
  id,
  exerciseId,
  routineExerciseId: null,
  sortOrder,
  supersetGroup: null,
  doneSets: 3,
  doneWorkingSets: 3,
  workingReps: [10, 10, 9],
  isCardio: false,
  targetRepsMin: 8,
  targetRepsMax: 12,
  restSeconds: 90,
  ...extra,
});
const kinds = (p: ReturnType<typeof diffRoutine>) => p.changes.map((c) => c.kind).sort();

test('사용자 예시 — 벤치 교체 + 플라이 2→3, 플라이만 반영하면 벤치는 그대로·플라이 3세트', () => {
  const lines = [line('r1', 'bb-bench', 0), line('r2', 'cable-fly', 1, { targetSets: 2 })];
  const blocks = [
    block('w1', 'db-bench', 0, { routineExerciseId: 'r1' }), // 운동 중 종목만 바꿨다 — 같은 행
    block('w2', 'cable-fly', 1, { routineExerciseId: 'r2', doneSets: 3, doneWorkingSets: 3 }),
  ];
  const plan = diffRoutine('R', lines, blocks);
  assert.deepEqual(kinds(plan), ['sets', 'swap']);
  const swap = plan.changes.find((c) => c.kind === 'swap');
  assert.ok(swap && swap.kind === 'swap' && swap.from === 'bb-bench' && swap.to === 'db-bench');
  const sets = plan.changes.find((c) => c.kind === 'sets');
  assert.ok(sets && sets.kind === 'sets' && sets.from === 2 && sets.to === 3);

  const ap = planRoutineApply(plan, new Set(['sets:r2']));
  assert.deepEqual(ap.deletes, []);
  assert.deepEqual(ap.creates, []);
  const r1 = ap.updates.find((u) => u.lineId === 'r1');
  const r2 = ap.updates.find((u) => u.lineId === 'r2');
  assert.equal(r1?.exerciseId, undefined); // 벤치는 바뀌지 않는다
  assert.equal(r2?.targetSets, 3);
});

test('변형 칸만 바꾼 운동·그대로 한 운동은 변경 없음(무게·횟수도 변경 아님)', () => {
  const lines = [line('r1', 'pushdown', 0), line('r2', 'curl', 1)];
  const blocks = [
    block('w1', 'pushdown', 0, { routineExerciseId: 'r1', workingReps: [15, 12, 10] }),
    block('w2', 'curl', 1, { routineExerciseId: 'r2' }),
  ];
  assert.equal(diffRoutine('R', lines, blocks).changes.length, 0);
});

test('세트 수 = 완료 워킹 세트(워밍업 제외)', () => {
  const lines = [line('r1', 'squat', 0, { targetSets: 3 })];
  const same = diffRoutine('R', lines, [block('w1', 'squat', 0, { routineExerciseId: 'r1', doneSets: 5, doneWorkingSets: 3 })]);
  assert.equal(same.changes.length, 0); // 워밍업 2 + 워킹 3 = 루틴 그대로
  const less = diffRoutine('R', lines, [block('w1', 'squat', 0, { routineExerciseId: 'r1', doneSets: 2, doneWorkingSets: 2 })]);
  const c = less.changes[0];
  assert.ok(c.kind === 'sets' && c.from === 3 && c.to === 2);
});

test('추가·운동 중 삭제(기본 체크)·건너뜀(기본 해제)', () => {
  const lines = [line('r1', 'a', 0), line('r2', 'b', 1), line('r3', 'c', 2)];
  const blocks = [
    block('w1', 'a', 0, { routineExerciseId: 'r1' }),
    // r2 는 운동 중에 지웠다(블록 없음)
    block('w3', 'c', 1, { routineExerciseId: 'r3', doneSets: 0, doneWorkingSets: 0, workingReps: [] }), // 건너뜀
    block('w4', 'd', 2), // 즉석 추가
  ];
  const plan = diffRoutine('R', lines, blocks);
  const rm2 = plan.changes.find((c) => c.id === 'remove:r2');
  const rm3 = plan.changes.find((c) => c.id === 'remove:r3');
  assert.ok(rm2 && rm2.kind === 'remove' && rm2.reason === 'deleted' && rm2.defaultOn);
  assert.ok(rm3 && rm3.kind === 'remove' && rm3.reason === 'skipped' && !rm3.defaultOn);
  assert.ok(plan.changes.some((c) => c.id === 'add:w4'));
  const sel = defaultSelection(plan.changes);
  assert.ok(sel.has('remove:r2') && !sel.has('remove:r3') && sel.has('add:w4'));

  const ap = planRoutineApply(plan, sel);
  assert.deepEqual(ap.deletes, ['r2']);
  assert.equal(ap.creates.length, 1);
  assert.equal(ap.creates[0].exerciseId, 'd');
  assert.equal(ap.creates[0].targetSets, 3);
  // 순서: a, c(남김), d — 추가는 오늘 그 앞에 한 루틴 줄(c 는 건너뜀이라 a… 가 아니라 마지막 한 줄) 뒤
  const order = [...ap.updates.map((u) => ({ k: u.lineId, o: u.sortOrder })), ...ap.creates.map((c) => ({ k: c.exerciseId, o: c.sortOrder }))]
    .sort((x, y) => x.o - y.o)
    .map((x) => x.k);
  assert.deepEqual(order, ['r1', 'r3', 'd']);
});

test('추가 종목은 오늘 한 자리에 들어간다(루틴 순서 유지 시)', () => {
  const lines = [line('r1', 'a', 0), line('r2', 'b', 1)];
  const blocks = [block('w1', 'a', 0, { routineExerciseId: 'r1' }), block('wx', 'x', 1), block('w2', 'b', 2, { routineExerciseId: 'r2' })];
  const ap = planRoutineApply(diffRoutine('R', lines, blocks), new Set(['add:wx']));
  const order = [...ap.updates.map((u) => ({ k: u.lineId, o: u.sortOrder })), ...ap.creates.map((c) => ({ k: c.exerciseId, o: c.sortOrder }))]
    .sort((x, y) => x.o - y.o)
    .map((x) => x.k);
  assert.deepEqual(order, ['r1', 'x', 'r2']);
});

test('순서 변경 — 선택하면 오늘 순서, 아니면 루틴 순서', () => {
  const lines = [line('r1', 'a', 0), line('r2', 'b', 1)];
  const blocks = [block('w2', 'b', 0, { routineExerciseId: 'r2' }), block('w1', 'a', 1, { routineExerciseId: 'r1' })];
  const plan = diffRoutine('R', lines, blocks);
  assert.deepEqual(kinds(plan), ['order']);
  const yes = planRoutineApply(plan, new Set(['order']));
  assert.equal(yes.updates.find((u) => u.lineId === 'r2')?.sortOrder, 0);
  const no = planRoutineApply(plan, new Set());
  assert.equal(no.updates.find((u) => u.lineId === 'r1')?.sortOrder, 0);
});

test('슈퍼셋 묶음 변경 — 오늘 묶음대로 표식, 선택 안 하면 그룹은 그대로', () => {
  const lines = [line('r1', 'a', 0), line('r2', 'b', 1), line('r3', 'c', 2)];
  const blocks = [
    block('w1', 'a', 0, { routineExerciseId: 'r1', supersetGroup: 'S' }),
    block('w2', 'b', 1, { routineExerciseId: 'r2', supersetGroup: 'S' }),
    block('w3', 'c', 2, { routineExerciseId: 'r3' }),
  ];
  const plan = diffRoutine('R', lines, blocks);
  assert.deepEqual(kinds(plan), ['superset']);
  const ap = planRoutineApply(plan, new Set(['superset']));
  const g1 = ap.updates.find((u) => u.lineId === 'r1')?.group;
  const g2 = ap.updates.find((u) => u.lineId === 'r2')?.group;
  assert.ok(g1 && g1 === g2);
  assert.equal(ap.updates.find((u) => u.lineId === 'r3')?.group, null);
  const keep = planRoutineApply(plan, new Set());
  assert.equal(keep.updates.find((u) => u.lineId === 'r1')?.group, undefined);
  // 같은 묶음 구성이면 그룹 id 가 달라도 변경 아님
  const same = diffRoutine('R', [line('r1', 'a', 0, { supersetGroup: 'X' }), line('r2', 'b', 1, { supersetGroup: 'X' })], [
    block('w1', 'a', 0, { routineExerciseId: 'r1', supersetGroup: 'Y' }),
    block('w2', 'b', 1, { routineExerciseId: 'r2', supersetGroup: 'Y' }),
  ]);
  assert.equal(same.changes.length, 0);
});

test('같은 종목이 두 줄 — 연결 id 로 구분, 연결 없는 옛 운동은 순서대로 짝', () => {
  const lines = [line('r1', 'a', 0, { targetSets: 3 }), line('r2', 'a', 1, { targetSets: 2 })];
  const linked = diffRoutine('R', lines, [
    block('w1', 'a', 0, { routineExerciseId: 'r1' }),
    block('w2', 'a', 1, { routineExerciseId: 'r2', doneSets: 2, doneWorkingSets: 2 }),
  ]);
  assert.equal(linked.changes.length, 0);
  const legacy = diffRoutine('R', lines, [
    block('w1', 'a', 0),
    block('w2', 'a', 1, { doneSets: 2, doneWorkingSets: 2 }),
  ]);
  assert.equal(legacy.changes.length, 0);
});

test('유산소는 세트 수 변경이 아니다 · 처방 루틴은 바꾸기 불가', () => {
  const cardio = diffRoutine('R', [line('r1', 'run', 0, { targetSets: 1 })], [
    block('w1', 'run', 0, { routineExerciseId: 'r1', isCardio: true, doneSets: 2, doneWorkingSets: 2 }),
  ]);
  assert.equal(cardio.changes.length, 0);
  const rx = diffRoutine('R', [line('r1', 'a', 0, { hasPrescription: true })], [block('w1', 'b', 0, { routineExerciseId: 'r1' })]);
  assert.equal(rx.canApply, false);
  assert.ok(rx.changes.length > 0);
});

test('루틴으로 저장 — 완료 세트 있는 종목만·묶음·세트 수·횟수 범위(빠른 운동=그날 횟수)', () => {
  const blocks = [
    block('w1', 'a', 0, { supersetGroup: 'S', workingReps: [12, 10, 8], targetRepsMin: 5, targetRepsMax: 5 }),
    block('w2', 'b', 1, { supersetGroup: 'S', doneSets: 4, doneWorkingSets: 3 }),
    block('w3', 'c', 2, { doneSets: 0, doneWorkingSets: 0, workingReps: [] }),
    block('w4', 'd', 3, { supersetGroup: 'T' }), // 혼자 남은 묶음 → 풀림
  ];
  const quick = routineLinesFromWorkout(blocks, false);
  assert.deepEqual(quick.map((l) => l.exerciseId), ['a', 'b', 'd']);
  assert.equal(quick[0].targetRepsMin, 8);
  assert.equal(quick[0].targetRepsMax, 12);
  assert.equal(quick[1].targetSets, 3);
  assert.ok(quick[0].group && quick[0].group === quick[1].group);
  assert.equal(quick[2].group, null);
  // 루틴 운동 — 루틴에서 온 블록은 루틴 목표 횟수
  const fromRoutine = routineLinesFromWorkout([block('w1', 'a', 0, { routineExerciseId: 'r1', targetRepsMin: 5, targetRepsMax: 5 })], true);
  assert.equal(fromRoutine[0].targetRepsMin, 5);
});

test('기본 이름 — 루틴 (수정) · 빠른 운동은 M/D 주 근육 2개 · 중복이면 (2)', () => {
  assert.equal(suggestRoutineName({ routineName: '상체 A', date: new Date(2026, 9, 27), blocks: [], existing: [] }), '상체 A (수정)');
  const blocks = [
    block('w1', 'a', 0, { primaryMuscle: 'chest', doneSets: 4 }),
    block('w2', 'b', 1, { primaryMuscle: 'triceps', doneSets: 3 }),
    block('w3', 'c', 2, { primaryMuscle: 'abs', doneSets: 1 }),
  ];
  assert.equal(suggestRoutineName({ routineName: null, date: new Date(2026, 9, 27), blocks, existing: [] }), '10/27 가슴·삼두');
  assert.equal(
    suggestRoutineName({ routineName: null, date: new Date(2026, 9, 27), blocks, existing: ['10/27 가슴·삼두'] }),
    '10/27 가슴·삼두 (2)',
  );
  assert.equal(dedupeName('A', ['A', 'A (2)']), 'A (3)');
});
