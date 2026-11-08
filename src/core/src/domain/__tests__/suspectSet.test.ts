// SRS-109 튀는 기록 판정(SPEC-044 · REV-079 T-1·T-2) — 경계·지난 기록 범위·이유·lb 권유·확인함 지문·시간순 훑기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  judgeSuspectSet,
  nextCheckState,
  confirmedState,
  isConfirmedFor,
  planSuspectStates,
  SUSPECT,
  type SweepWorkout,
} from '../suspectSet';
import { bestEstimatedOneRepMax } from '../oneRepMax';
import { pickPrSets, snapshotFromSets } from '../personalRecords';
import { totalVolumeKg } from '../volume';
import type { LoggedSet } from '../types';

const set = (w: number, r: number, extra: Partial<LoggedSet> = {}): LoggedSet => ({
  weightKg: w,
  reps: r,
  isWarmup: false,
  isFailed: false,
  ...extra,
});
const two = { recent: [set(60, 8), set(60, 8)], workouts: 2 };

test('지난 2회 60×8 뒤 132×8 → 확인 필요 · 이유 무게 · lb 로 읽으면 59.9 라 lb 권유', () => {
  const v = judgeSuspectSet(set(132, 8), two);
  assert.equal(v.suspect, true);
  assert.equal(v.reason, 'weight');
  assert.equal(v.lbPlausible, true);
  assert.deepEqual(v.usualKg, [60, 60]);
});

test('80×8 은 확인 필요지만 lb 로 읽으면 36.3 — 평소의 0.8배 밑이라 lb 를 권하지 않는다(REV-079 C-8)', () => {
  const v = judgeSuspectSet(set(80, 8), two);
  assert.equal(v.suspect, true);
  assert.equal(v.lbPlausible, false);
});

test('경계: 정확히 1.3배는 아니다 · 조금 넘으면 확인 필요 · 100×1 → 130×1 도 아니다', () => {
  assert.equal(judgeSuspectSet(set(78, 8), two).suspect, false); // 98.8 = 76 × 1.3
  assert.equal(judgeSuspectSet(set(78.5, 8), two).suspect, true);
  const one = { recent: [set(100, 1)], workouts: 2 };
  assert.equal(judgeSuspectSet(set(130, 1), one).suspect, false);
  assert.equal(judgeSuspectSet(set(130.5, 1), one).suspect, true);
  // 소수에 약한 조합 — 62.5×5 기준 72.917 → ×1.3 = 94.79 · 81.25×5 = 94.79(같음)
  const p = { recent: [set(62.5, 5)], workouts: 2 };
  assert.equal(judgeSuspectSet(set(81.25, 5), p).suspect, false);
});

test('지난 운동 2회 미만이면 판정하지 않는다(세트 수가 아니라 운동 수)', () => {
  assert.equal(judgeSuspectSet(set(132, 8), { recent: [set(60, 8), set(60, 8), set(60, 8)], workouts: 1 }).suspect, false);
});

test('기준은 최근 6회와 전체 기간 최고 중 큰 쪽 — 디로드 뒤 복귀는 확인 필요가 아니다(REV-079 C-6)', () => {
  const deload = { recent: [set(40, 8), set(40, 8)], workouts: 2, older: [set(60, 8)] };
  assert.equal(judgeSuspectSet(set(60, 8), deload).suspect, false);
  assert.equal(judgeSuspectSet(set(60, 8), { recent: [set(40, 8), set(40, 8)], workouts: 2 }).suspect, true);
});

test('이유 = 횟수가 더 튀면 reps · lb 는 권하지 않는다', () => {
  const v = judgeSuspectSet(set(60, 50), two);
  assert.equal(v.suspect, true);
  assert.equal(v.reason, 'reps');
  assert.equal(v.lbPlausible, false);
});

test('판정하지 않는 세트 — 웜업·실패·0·맨몸·어시스트 · 지난 기록의 확인 필요는 기준에서 빠진다', () => {
  assert.equal(judgeSuspectSet(set(132, 8, { isWarmup: true }), two).suspect, false);
  assert.equal(judgeSuspectSet(set(132, 8, { isFailed: true }), two).suspect, false);
  assert.equal(judgeSuspectSet(set(132, 0), two).suspect, false);
  assert.equal(judgeSuspectSet(set(132, 8, { loadMode: 'bodyweight', bodyweightKg: 70 }), two).suspect, false);
  assert.equal(judgeSuspectSet(set(132, 8, { loadMode: 'assisted', bodyweightKg: 70 }), two).suspect, false);
  const withBad = { recent: [set(60, 8), set(132, 8, { suspect: true })], workouts: 2 };
  assert.equal(judgeSuspectSet(set(132, 8), withBad).suspect, true);
});

test('옛 배수 null 기록은 후보의 배수로 읽는다 — 플레이트 한쪽 50 은 오탐이 아니다(REV-079 C-1)', () => {
  const legacy = { recent: [set(50, 8, { loadMultiplier: null }), set(50, 8)], workouts: 2 };
  assert.equal(judgeSuspectSet(set(50, 8, { loadMultiplier: 2 }), legacy).suspect, false);
  // 배수를 적은 옛 기록(1)은 그대로 — 진짜 2배는 확인 필요
  const explicit = { recent: [set(50, 8, { loadMultiplier: 1 }), set(50, 8, { loadMultiplier: 1 })], workouts: 2 };
  assert.equal(judgeSuspectSet(set(50, 8, { loadMultiplier: 2 }), explicit).suspect, true);
});

test('확인함 지문 — 값이 그대로면 유지, 무게·횟수·배수가 바뀌면 다시 판정', () => {
  const s = { weightKg: 132, reps: 8, loadMultiplier: null };
  const c = confirmedState(s);
  assert.equal(isConfirmedFor(c, s), true);
  assert.equal(isConfirmedFor(c, { ...s, reps: 9 }), false);
  assert.equal(isConfirmedFor(c, { ...s, loadMultiplier: 2 }), false);
  const verdict = judgeSuspectSet(set(132, 8), two);
  assert.equal(nextCheckState(c, s, true, verdict), c);
  assert.equal(nextCheckState(c, { ...s, weightKg: 140 }, true, verdict), SUSPECT);
  assert.equal(nextCheckState(SUSPECT, s, false, verdict), null); // 체크를 풀면 푼다
  assert.equal(nextCheckState(null, s, true, { ...verdict, suspect: false }), null);
});

test('계산 제외 — 1RM·PR 스냅샷·PR 세트 고르기에서 빠지고 볼륨은 센다', () => {
  const sets = [set(60, 8), set(132, 8, { suspect: true })];
  assert.equal(Math.round(bestEstimatedOneRepMax(sets)), 76);
  assert.equal(snapshotFromSets(sets).maxWeightKg, 60);
  assert.equal(pickPrSets(sets).weight?.weightKg, 60);
  assert.equal(totalVolumeKg(sets), 60 * 8 + 132 * 8);
});

const W = (id: string, sets: [string, number, number, string | null?][]): SweepWorkout => ({
  id,
  blocks: [{ key: 'bench::', sets: sets.map(([sid, w, r, st]) => ({ id: sid, set: set(w, r), state: st ?? null, performed: true })) }],
});

test('훑기 — 시간순으로 쌓으며 판정 · 앞의 확인 필요는 뒤의 기준에 들지 않는다 · 확인함은 기준에 든다', () => {
  const plan = planSuspectStates([W('w1', [['a', 60, 8]]), W('w2', [['b', 60, 8]]), W('w3', [['c', 132, 8]]), W('w4', [['d', 100, 8]])]);
  assert.equal(plan.get('a'), null);
  assert.equal(plan.get('b'), null);
  assert.equal(plan.get('c'), SUSPECT);
  assert.equal(plan.get('d'), SUSPECT); // 100 도 60 기준으로는 튄다 — 132 가 기준에 들었으면 정상이었을 것
  const ok = confirmedState({ weightKg: 132, reps: 8 });
  const plan2 = planSuspectStates([W('w1', [['a', 60, 8]]), W('w2', [['b', 60, 8]]), W('w3', [['c', 132, 8, ok]]), W('w4', [['d', 100, 8]])]);
  assert.equal(plan2.get('c'), ok);
  assert.equal(plan2.get('d'), null);
});

test('훑기 — 최근 6회만 「최근」 · 7번째보다 오래된 기록은 기준(전체 최고)으로만', () => {
  const runs = [W('o', [['o1', 100, 8]]), ...[1, 2, 3, 4, 5, 6].map((i) => W(`w${i}`, [[`s${i}`, 60, 8]])), W('t', [['t1', 100, 8]])];
  // 100×8 은 오래된 기록과 같아 전체 최고 기준으로 정상
  assert.equal(planSuspectStates(runs).get('t1'), null);
});

test('훑기 — 다른 칸(key)은 서로 기준이 되지 않는다', () => {
  const other: SweepWorkout = { id: 'x', blocks: [{ key: 'bench::equip:a', sets: [{ id: 'x1', set: set(200, 8), state: null, performed: true }] }] };
  const plan = planSuspectStates([W('w1', [['a', 60, 8]]), other, W('w2', [['b', 60, 8]]), W('w3', [['c', 132, 8]])]);
  assert.equal(plan.get('x1'), null); // 그 칸은 지난 기록 0회
  assert.equal(plan.get('c'), SUSPECT);
});

test('훑기 — 쓸 수 있는 세트가 없는 운동(웜업만·전부 확인 필요)은 지난 운동 수에 들지 않는다(코드 리뷰 계산 5)', () => {
  const warmOnly: SweepWorkout = { id: 'w2', blocks: [{ key: 'bench::', sets: [{ id: 'b', set: set(40, 10, { isWarmup: true }), state: null, performed: true }] }] };
  const plan = planSuspectStates([W('w1', [['a', 60, 8]]), warmOnly, W('w3', [['c', 132, 8]])]);
  assert.equal(plan.get('c'), null); // 지난 운동은 실제로 1회
});

test('훑기 — 같은 운동의 확인함 세트는 옆 세트의 기준 · 범위 밖(fixed) 세트는 판정하지 않고 지금 상태 그대로', () => {
  const ok = confirmedState({ weightKg: 132, reps: 8 });
  const plan = planSuspectStates([W('w1', [['a', 60, 8]]), W('w2', [['b', 60, 8]]), W('w3', [['c1', 132, 8, ok], ['c2', 132, 8]])]);
  assert.equal(plan.get('c1'), ok);
  assert.equal(plan.get('c2'), null);
  const fixed: SweepWorkout = { id: 'w3', blocks: [{ key: 'bench::', sets: [{ id: 'f', set: set(132, 8), state: null, performed: true, fixed: true }] }] };
  const plan2 = planSuspectStates([W('w1', [['a', 60, 8]]), W('w2', [['b', 60, 8]]), fixed, W('w4', [['d', 132, 8]])]);
  assert.equal(plan2.get('f'), null); // 저장값 그대로
  assert.equal(plan2.get('d'), null); // 저장값(정상)인 132 가 기준에 든다 — PR 계산과 같은 상태
});

test('확인함 지문은 효과 무게 — 무게 반·배수 2 로 옮겨도 유지(데이터 리뷰 10) · 평소 범위 · 유산소 지표 세트는 판정 안 함', () => {
  const c = confirmedState({ weightKg: 100, reps: 5, loadMultiplier: 1 });
  assert.equal(isConfirmedFor(c, { weightKg: 50, reps: 5, loadMultiplier: 2 }), true);
  const v = judgeSuspectSet(set(132, 8), { recent: [set(55, 8), set(60, 8)], workouts: 2 });
  assert.deepEqual(v.usualKg, [55, 60]);
  assert.equal(judgeSuspectSet(set(132, 8, { durationSec: 60 }), two).suspect, false);
  assert.equal(judgeSuspectSet(set(0, 8), two).suspect, false);
});
