// SPEC-023 세트 표 변환 — 왕복·보존·강도 목표
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePrescriptionValue, type PrescribedSet } from '../prescription';
import { effortGoalOf, emptySetRow, routineLinePatch, rowsFromRoutineLine, withEffortGoal, type RoutineLineSets } from '../routineSets';

const line = (p: Partial<RoutineLineSets> = {}): RoutineLineSets => ({
  targetSets: 3,
  targetWeightKg: null,
  targetRepsMin: null,
  targetRepsMax: null,
  prescription: null,
  ...p,
});
const load = { allowLoad: true };
const row = (p: Partial<PrescribedSet>): PrescribedSet => ({ ...emptySetRow(), ...p });
const start = (kg: number, p: Partial<PrescribedSet> = {}) => row({ loadBasis: 'start', loadKg: kg, ...p });

test('처방 없는 옛 줄 — 표로 열었다 그대로 저장하면 같은 값(처방 null)', () => {
  const l = line({ targetSets: 4, targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 12 });
  const rows = rowsFromRoutineLine(l, load);
  assert.equal(rows.length, 4);
  assert.deepEqual(routineLinePatch(rows, l, load), l);
});

test('무게가 다른 줄 — 기준은 탑세트, 다른 줄만 start 로 남고 왕복해도 같다', () => {
  const rows = [start(60, { setType: 'warmup' }), start(120, { setType: 'top' }), start(100, { setType: 'backoff' })];
  const p = routineLinePatch(rows, line(), load);
  assert.equal(p.targetWeightKg, 120);
  assert.equal(p.prescription?.[1].loadBasis, undefined);
  assert.equal(p.prescription?.[2].loadBasis, 'start');
  const again = routineLinePatch(rowsFromRoutineLine(p, load), p, load);
  assert.deepEqual(again, p);
  assert.deepEqual(rowsFromRoutineLine(p, load).map((r) => r.loadKg), [60, 120, 100]);
});

test('웜업이 많아도 작업 세트가 기준 — 웜업 값으로 묶이지 않는다', () => {
  const p = routineLinePatch([start(60, { setType: 'warmup' }), start(60, { setType: 'warmup' }), start(100)], line(), load);
  assert.equal(p.targetWeightKg, 100);
});

test('한쪽 입력·lb — 시작 무게는 입력값 그대로 왕복한다', () => {
  const kg = 135 * 0.45359237;
  const p = routineLinePatch([start(kg), start(40)], line(), load);
  const rows = rowsFromRoutineLine(p, load);
  assert.ok(Math.abs((rows[1].loadKg as number) - 40) < 1e-9);
  const clean = sanitizePrescriptionValue(p.prescription);
  assert.ok(Math.abs((clean?.[1].loadKg as number) - 40) < 1e-3);
  assert.ok(Math.abs(((sanitizePrescriptionValue([start(kg)]) as PrescribedSet[])[0].loadKg as number) / 0.45359237 - 135) < 0.001);
});

test('옛 처방 보존 — 고정·%·힌트·세트별 RIR 은 그대로', () => {
  const rx: PrescribedSet[] = [
    row({ loadBasis: 'fixed', loadKg: 100, targetRir: 1 }),
    row({ loadBasis: 'fixed', loadKg: 100, targetRir: 3 }),
    row({ loadBasis: 'pctTop', loadPct: 90, loadHint: 'heavy' }),
  ];
  const l = line({ targetWeightKg: 70, prescription: rx });
  const p = routineLinePatch(rowsFromRoutineLine(l, load), l, load);
  assert.deepEqual(p.prescription?.map((r) => r.loadBasis), ['fixed', 'fixed', 'pctTop']);
  assert.equal(p.prescription?.[2].loadHint, 'heavy');
  assert.equal(p.targetWeightKg, 70, '직접 입력이 없으면 블록 무게(1RM 없을 때의 대체값)를 지킨다');
  assert.deepEqual(p.prescription?.map((r) => r.targetRir), [1, 3, null]);
});

test('힌트만 있는 처방도 지우지 않는다', () => {
  const l = line({ targetSets: 1, prescription: [row({ loadHint: 'light' })] });
  assert.equal(routineLinePatch(rowsFromRoutineLine(l, load), l, load).prescription?.[0].loadHint, 'light');
});

test('맨몸 — 줄에 무게를 채우지 않고 스테퍼 값을 지킨다', () => {
  const l = line({ targetWeightKg: 10 });
  const rows = rowsFromRoutineLine(l, { allowLoad: false });
  assert.equal(rows[0].loadBasis, undefined);
  assert.equal(routineLinePatch(rows, l, { allowLoad: false }).targetWeightKg, 10);
});

test('무게를 재는 종목에서 전 줄을 비우면 지운다', () => {
  assert.equal(routineLinePatch([row({})], line({ targetWeightKg: 50 }), load).targetWeightKg, null);
});

test('횟수 — 같으면 블록 값으로 묶고, 다른 줄만 처방에 남는다', () => {
  const same = routineLinePatch([row({ repMin: 8, repMax: 12 }), row({ repMin: 8, repMax: 12 })], line(), load);
  assert.deepEqual([same.targetRepsMin, same.targetRepsMax, same.prescription], [8, 12, null]);
  const diff = routineLinePatch([row({ setType: 'top', repMin: 5, repMax: 5 }), row({ repMin: 8, repMax: 12 })], line(), load);
  assert.equal(diff.targetRepsMin, 5);
  assert.equal(diff.prescription?.[1].repMin, 8);
});

test('강도 목표 — 웜업·드롭은 제외, 섞이면 mixed, 고르면 통일', () => {
  const rows = [row({ setType: 'warmup', targetRir: null }), row({ targetRir: 2 }), row({ setType: 'drop' }), row({ setType: 'top', targetRir: 2 })];
  assert.equal(effortGoalOf(rows), 2);
  assert.equal(effortGoalOf([row({ targetRir: 1 }), row({ targetRir: 3 })]), 'mixed');
  const next = withEffortGoal(rows, 1);
  assert.deepEqual(next.map((r) => r.targetRir), [null, 1, null, 1]);
});

test('정리 함수 — drop·start 를 지키고, 모르는 타입은 일반', () => {
  const out = sanitizePrescriptionValue([{ setType: 'drop' }, { setType: 'x', loadBasis: 'start', loadKg: 40 }]);
  assert.equal(out?.[0].setType, 'drop');
  assert.equal(out?.[1].setType, 'normal');
  assert.equal(out?.[1].loadBasis, 'start');
});

test('비운 칸은 비운 대로 — 다른 줄에 무게가 있으면 표식으로 남아 왕복해도 빈칸이다', () => {
  const rows = [row({ setType: 'warmup' }), start(100), row({}), start(100)];
  const p = routineLinePatch(rows, line(), load);
  assert.equal(p.targetWeightKg, 100);
  assert.deepEqual([p.prescription?.[0].loadBasis, p.prescription?.[0].loadKg], ['start', 0]);
  assert.deepEqual([p.prescription?.[2].loadBasis, p.prescription?.[2].loadKg], ['start', 0]);
  const back = rowsFromRoutineLine(p, load);
  assert.deepEqual(back.map((r) => r.loadKg ?? 0), [0, 100, 0, 100]);
  assert.deepEqual(routineLinePatch(back, p, load), p);
});

test('웜업 값은 블록 값이 되지 않는다 — 작업 세트가 그 값으로 채워지지 않게', () => {
  const p = routineLinePatch([start(40, { setType: 'warmup', repMin: 15, repMax: 15 }), row({})], line(), load);
  assert.equal(p.targetWeightKg, null);
  assert.equal(p.targetRepsMin, null);
  assert.equal(p.prescription?.[0].loadKg, 40);
  assert.equal(p.prescription?.[0].repMin, 15);
});

test('고정 줄 옆 시작 값을 지우면 되살아나지 않는다', () => {
  const fixed = row({ loadBasis: 'fixed', loadKg: 100 });
  assert.equal(routineLinePatch([fixed, row({})], line({ targetWeightKg: 60 }), load).targetWeightKg, null);
  // 전 줄이 고정·% 면 있던 값을 지킨다
  assert.equal(routineLinePatch([fixed], line({ targetWeightKg: 60 }), load).targetWeightKg, 60);
});

test('횟수 한 칸만 비우면 그 칸이 되돌아오지 않는다', () => {
  const rows = rowsFromRoutineLine(
    line({ targetSets: 2, targetRepsMin: 8, targetRepsMax: 12, prescription: [row({ repMin: 8, repMax: null }), row({})] }),
    load,
  );
  assert.deepEqual([rows[0].repMin, rows[0].repMax], [8, null]);
  assert.deepEqual([rows[1].repMin, rows[1].repMax], [8, 12]);
});

test('맨몸 — 남아 있던 시작 무게로 스테퍼 값을 덮지 않고 지운다', () => {
  const p = routineLinePatch([start(100, { setType: 'top' })], line({ targetWeightKg: 10 }), { allowLoad: false });
  assert.equal(p.targetWeightKg, 10);
  assert.equal(p.prescription?.[0].loadBasis, undefined);
  assert.equal(p.prescription?.[0].loadKg, undefined);
});
