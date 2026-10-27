// @plm SRS-061 SRS-062 SRS-063  묶음 1 /qa code 결함 회귀 — H1·H2·M1·M3·L1
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizePrescriptionValue, planPrescribedLoadFills, type PrescribedSet } from '../prescription';
import { sweepPrCounts, snapshotFromSets, EMPTY_PR } from '../personalRecords';
import { roundKeyOf, pickRoundSets, firstOpenWorkingSet } from '../supersetRound';

// ── H2: 운영에 남은 옛 PascalCase 처방(Go 기본 마샬) ──
test('H2 — 옛 PascalCase 처방 JSON 도 세트 타입·RIR·반복·힌트를 읽는다', () => {
  const r = sanitizePrescriptionValue([
    { SetType: 'top', TargetRIR: 2, RepMin: 5, RepMax: 8, LoadHint: 'heavy' },
    { SetType: 'backoff', TargetRIR: null, RepMin: 8, RepMax: 10, LoadHint: '' },
  ]);
  assert.equal(r?.[0].setType, 'top');
  assert.equal(r?.[0].targetRir, 2);
  assert.equal(r?.[0].repMin, 5);
  assert.equal(r?.[0].repMax, 8);
  assert.equal(r?.[0].loadHint, 'heavy');
  assert.equal(r?.[1].setType, 'backoff');
  assert.equal(r?.[1].targetRir, null);
});

test('H2 — 새 camelCase 키가 있으면 그것이 우선', () => {
  const r = sanitizePrescriptionValue([{ setType: 'warmup', SetType: 'top' }]);
  assert.equal(r?.[0].setType, 'warmup');
});

// ── H1: 기록 없는 「1RM 의 N%」를 워밍업·실패 세트로 추정하지 않는다 ──
const rxW: PrescribedSet[] = [
  { setType: 'warmup', targetRir: null, repMin: 10, repMax: 10, loadHint: null },
  { setType: 'top', targetRir: 1, repMin: 5, repMax: 5, loadHint: null, loadBasis: 'pct1rm', loadPct: 80 },
  { setType: 'normal', targetRir: 2, repMin: 8, repMax: 8, loadHint: null, loadBasis: 'pct1rm', loadPct: 75 },
];
const open = (id: string) => ({ id, done: false, touched: false, loadMultiplier: null });

test('H1 — 워밍업을 마쳐도 1RM % 세트는 채우지 않는다(첫 작업 세트를 기다린다)', () => {
  const fills = planPrescribedLoadFills({
    rx: rxW,
    sets: [{ id: 'w', done: true, touched: true, loadMultiplier: null }, open('t'), open('n')],
    doneIdx: 0,
    done: { isWarmup: false, isFailed: false, setType: 'warmup' },
    doneCalcKg: 20,
    doneReps: 10,
    has1rm: false,
    equipment: 'barbell',
    unit: 'kg',
  });
  assert.deepEqual(fills, []);
});

test('H1 — 실패 표시 세트로도 추정하지 않는다', () => {
  const fills = planPrescribedLoadFills({
    rx: rxW,
    sets: [open('w'), { id: 't', done: true, touched: true, loadMultiplier: null }, open('n')],
    doneIdx: 1,
    done: { isWarmup: false, isFailed: true, setType: 'top' },
    doneCalcKg: 100,
    doneReps: 2,
    has1rm: false,
    equipment: 'barbell',
    unit: 'kg',
  });
  assert.deepEqual(fills, []);
});

test('H1 — 첫 작업 세트(탑 100×5)로 추정해 다음 1RM % 세트를 채운다', () => {
  const fills = planPrescribedLoadFills({
    rx: rxW,
    sets: [{ id: 'w', done: true, touched: true, loadMultiplier: null }, { id: 't', done: true, touched: true, loadMultiplier: null }, open('n')],
    doneIdx: 1,
    done: { isWarmup: false, isFailed: false, setType: 'top' },
    doneCalcKg: 100,
    doneReps: 5,
    has1rm: false,
    equipment: 'barbell',
    unit: 'kg',
  });
  assert.equal(fills.length, 1);
  assert.equal(fills[0].setLogId, 'n');
  assert.ok(fills[0].weightKg >= 80 && fills[0].weightKg <= 95, `75% of est1RM≈116 → ${fills[0].weightKg}`);
});

test('H1 — 사람이 고친 세트(touched)는 건드리지 않는다', () => {
  const fills = planPrescribedLoadFills({
    rx: rxW,
    sets: [open('w'), { id: 't', done: true, touched: true, loadMultiplier: null }, { id: 'n', done: false, touched: true, loadMultiplier: null }],
    doneIdx: 1,
    done: { isWarmup: false, isFailed: false, setType: 'top' },
    doneCalcKg: 100,
    doneReps: 5,
    has1rm: false,
    equipment: 'barbell',
    unit: 'kg',
  });
  assert.deepEqual(fills, []);
});

// ── M1: PR 수 다시 세기 — 한 번 훑기(prefix sweep) ──
const snap = (kg: number, reps: number) => snapshotFromSets([{ weightKg: kg, reps, isWarmup: false, isFailed: false }]);
test('M1 — 시간순으로 한 번 훑어 각 운동의 PR 수를 「앞선 기록만」으로 센다', () => {
  const counts = sweepPrCounts([
    { id: 'c', completedAt: 3, groups: [{ key: 'bench', current: snap(100, 5) }] },
    { id: 'a', completedAt: 1, groups: [{ key: 'bench', current: snap(80, 5) }] },
    { id: 'b', completedAt: 2, groups: [{ key: 'bench', current: snap(70, 5) }, { key: 'squat', current: snap(100, 5) }] },
  ]);
  assert.equal(counts.get('a'), 2); // 첫 기록 — 중량·볼륨 PR
  assert.equal(counts.get('b'), 2); // 벤치는 낮음(0) · 스쿼트 첫 기록(2)
  assert.equal(counts.get('c'), 2); // 벤치 100 > 80
});

test('M1 — 같은 시각이면 id 순서로 결정적', () => {
  const counts = sweepPrCounts([
    { id: 'y', completedAt: 5, groups: [{ key: 'k', current: snap(50, 5) }] },
    { id: 'x', completedAt: 5, groups: [{ key: 'k', current: snap(50, 5) }] },
  ]);
  assert.equal(counts.get('x'), 2);
  assert.equal(counts.get('y'), 0);
  void EMPTY_PR;
});

// ── M3: 슈퍼셋 「같은 번호」 = 화면에 보이는 번호 ──
const S = (id: string, n: number, extra: Record<string, unknown> = {}) => ({ id, setNumber: n, isWarmup: false, isDrop: false, isFailed: false, setType: null, ...extra });
test('M3 — 한쪽에만 워밍업이 있어도 화면 번호 「1」끼리 짝짓는다', () => {
  const a = [S('aW', 1, { isWarmup: true }), S('a1', 2), S('a2', 3), S('a3', 4)];
  const b = [S('b1', 1), S('b2', 2), S('b3', 3)];
  const key = roundKeyOf(a, 'a1');
  assert.equal(key, 'n:1');
  const picked = pickRoundSets([{ workoutExerciseId: 'A', sets: a }, { workoutExerciseId: 'B', sets: b }], key);
  assert.deepEqual(picked.map((p) => p.setLogId).sort(), ['a1', 'b1']);
});

test('M3 — 워밍업 칸은 짝이 없다(이 종목만)', () => {
  const a = [S('aW', 1, { isWarmup: true }), S('a1', 2)];
  assert.equal(roundKeyOf(a, 'aW'), null);
});

test('M3 — 짝 번호가 없는 멤버는 건너뛴다', () => {
  const a = [S('a1', 1), S('a2', 2), S('a3', 3)];
  const b = [S('b1', 1)];
  const picked = pickRoundSets([{ workoutExerciseId: 'A', sets: a }, { workoutExerciseId: 'B', sets: b }], roundKeyOf(a, 'a3'));
  assert.deepEqual(picked.map((p) => p.setLogId), ['a3']);
});

// ── L1: PR 칩 채움은 첫 「작업」 세트 ──
test('L1 — PR 칩은 워밍업이 아닌 첫 미완료 세트에 채운다(없으면 첫 미완료)', () => {
  const sets = [
    { id: 'w', done: false, isWarmup: true },
    { id: 'n', done: false, isWarmup: false },
  ];
  assert.equal(firstOpenWorkingSet(sets)?.id, 'n');
  assert.equal(firstOpenWorkingSet([{ id: 'w', done: false, isWarmup: true }])?.id, 'w');
  assert.equal(firstOpenWorkingSet([{ id: 'n', done: true, isWarmup: false }]), null);
});
