// SRS-110 루틴 한눈에 — 종목 한 줄·세트 요약(SPEC-045)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routineExerciseSummary, routineLineText, sessionOrderLabels, supersetLabels } from '../routineSummary';
import type { PrescribedSet } from '../prescription';

const row = (setType: PrescribedSet['setType'], repMin: number | null, repMax: number | null, extra: Partial<PrescribedSet> = {}): PrescribedSet => ({
  setType,
  targetRir: null,
  repMin,
  repMax,
  loadHint: null,
  ...extra,
});

test('종목 한 줄 — 0·1·3·4개 · 빈 이름은 뺀다', () => {
  assert.deepEqual(routineLineText([]), { shown: [], more: 0 });
  assert.deepEqual(routineLineText(['벤치']), { shown: ['벤치'], more: 0 });
  assert.deepEqual(routineLineText(['a', 'b', 'c']), { shown: ['a', 'b', 'c'], more: 0 });
  assert.deepEqual(routineLineText(['a', 'b', 'c', 'd']), { shown: ['a', 'b', 'c'], more: 1 });
  assert.deepEqual(routineLineText(['a', ' ', 'c']), { shown: ['a', 'c'], more: 0 });
});

test('세트 요약 — 처방 없음은 targetSets·targetReps · 횟수가 한쪽만이면 열린 범위(~5 · 8+ · 코드 리뷰 정확성 3)', () => {
  assert.deepEqual(routineExerciseSummary({ targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, prescription: null }), {
    sets: 3, warmups: 0, drops: 0, repMin: 8, repMax: 12, amrap: false, cardio: false,
  });
  const one = routineExerciseSummary({ targetSets: 5, targetRepsMin: null, targetRepsMax: 5, prescription: null });
  assert.equal(one.repMin, null);
  assert.equal(one.repMax, 5);
  const plus = routineExerciseSummary({ targetSets: 3, targetRepsMin: 8, targetRepsMax: null, prescription: null });
  assert.equal(plus.repMin, 8);
  assert.equal(plus.repMax, null);
});

test('세트 요약 — 처방 줄의 빈 횟수는 블록 횟수를 물려받는다 · 드롭은 따로', () => {
  const s = routineExerciseSummary({ targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, prescription: [row('normal', null, null), row('normal', null, null), row('drop', null, null)] });
  assert.equal(s.sets, 2);
  assert.equal(s.drops, 1);
  assert.equal(s.repMin, 8);
  assert.equal(s.repMax, 12);
});

test('슈퍼셋 표시 — 연달아 있는 같은 그룹만', () => {
  assert.deepEqual(supersetLabels(['g', 'g', null, 'h', 'x', 'h']), ['A1', 'A2', null, null, null, null]);
  assert.deepEqual(supersetLabels([null, 'a', 'a', 'a', 'b', 'b']), [null, 'A1', 'A2', 'A3', 'B1', 'B2']);
});

test('세트 요약 — 처방은 웜업·피더를 따로 세고 작업 세트의 횟수 범위 · 최대(AMRAP)', () => {
  const s = routineExerciseSummary({
    targetSets: 9,
    targetRepsMin: null,
    targetRepsMax: null,
    prescription: [row('warmup', 10, 10), row('feeder', 3, 3), row('top', 5, 5), row('backoff', 8, 10), row('backoff', null, null, { amrap: true })],
  });
  assert.equal(s.sets, 3);
  assert.equal(s.warmups, 2);
  assert.equal(s.repMin, 5);
  assert.equal(s.repMax, 10);
  assert.equal(s.amrap, true);
});

test('운동 화면 순서·묶음 — 떨어진 같은 그룹도 첫 자리에 모아 A1·A2(groupSessionRows 와 같게)', () => {
  assert.deepEqual(sessionOrderLabels(['g', 'x', 'g']), [
    { index: 0, label: 'A1' },
    { index: 2, label: 'A2' },
    { index: 1, label: null },
  ]);
  assert.deepEqual(sessionOrderLabels([null, 'a', 'a', 'b', 'b']).map((r) => r.label), [null, 'A1', 'A2', 'B1', 'B2']);
  assert.deepEqual(sessionOrderLabels(['solo', null]).map((r) => r.label), [null, null]);
});

test('세트 요약 — 최대만 · 최대 섞임 · 웜업만 · 드롭 횟수는 범위에 안 섞임', () => {
  const only = routineExerciseSummary({ targetSets: 1, targetRepsMin: null, targetRepsMax: null, prescription: [row('normal', null, null, { amrap: true })] });
  assert.equal(only.amrap, true);
  assert.equal(only.repMin, null);
  const mix = routineExerciseSummary({ targetSets: 4, targetRepsMin: 8, targetRepsMax: 12, prescription: [row('normal', 8, 12), row('normal', 8, 12), row('normal', null, null, { amrap: true })] });
  assert.equal(mix.sets, 3);
  assert.equal(mix.amrap, true);
  assert.equal(mix.repMin, 8);
  const warm = routineExerciseSummary({ targetSets: 1, targetRepsMin: null, targetRepsMax: null, prescription: [row('warmup', 10, 10), row('warmup', 8, 8)] });
  assert.equal(warm.sets, 0);
  assert.equal(warm.warmups, 2);
  const drop = routineExerciseSummary({ targetSets: 2, targetRepsMin: 5, targetRepsMax: 5, prescription: [row('normal', 5, 5), row('drop', 15, 20)] });
  assert.equal(drop.repMax, 5);
  assert.equal(drop.drops, 1);
});

test('세트 요약 — 유산소', () => {
  assert.equal(routineExerciseSummary({ targetSets: 1, targetRepsMin: null, targetRepsMax: null, prescription: null, cardio: true }).cardio, true);
});
