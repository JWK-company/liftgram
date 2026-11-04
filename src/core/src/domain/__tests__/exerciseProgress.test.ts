// 분석 탭 심화 분석 계산(SRS-101)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  exerciseChanges,
  localWeekStart,
  plateauedExercises,
  recentWeekStarts,
  weeklyMuscleSets,
  type E1rmPoint,
} from '../exerciseProgress';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 4, 12, 0, 0).getTime(); // 수요일
const p = (exerciseId: string, daysAgo: number, value: number): E1rmPoint => ({ exerciseId, atMs: NOW - daysAgo * DAY, value });

describe('exerciseChanges', () => {
  it('기간 안 두 번 미만은 뺀다', () => {
    const r = exerciseChanges([p('a', 40, 100), p('a', 1, 120), p('b', 1, 50)], NOW - 7 * DAY);
    assert.deepEqual(r, { up: [], down: [], compared: 0 });
  });
  it('첫 값과 마지막 값을 비교한다(가운데 값·입력 순서 무시)', () => {
    const r = exerciseChanges([p('a', 1, 110), p('a', 20, 100), p('a', 10, 200)], null);
    assert.deepEqual(r.up[0], { exerciseId: 'a', firstKg: 100, lastKg: 110, changeKg: 10, changePct: 10, sessions: 3 });
  });
  it('0.5kg 미만 변화는 비교만 하고 목록에 넣지 않는다', () => {
    assert.deepEqual(exerciseChanges([p('a', 5, 100), p('a', 1, 100.4)], null), { up: [], down: [], compared: 1 });
    assert.equal(exerciseChanges([p('a', 5, 100), p('a', 1, 100.5)], null).up.length, 1);
  });
  it('오름·내림을 나눠 변화율 큰 순으로 자른다', () => {
    const r = exerciseChanges(
      [p('a', 5, 100), p('a', 1, 105), p('b', 5, 100), p('b', 1, 120), p('c', 5, 100), p('c', 1, 90), p('d', 5, 100), p('d', 1, 110)],
      null,
      2,
    );
    assert.deepEqual(r.up.map((c) => c.exerciseId), ['b', 'd']);
    assert.deepEqual(r.down.map((c) => c.exerciseId), ['c']);
    assert.equal(r.compared, 4);
  });
  it('값 0(유산소·맨몸 추가 무게 없음)은 세지 않는다', () => {
    assert.equal(exerciseChanges([p('a', 5, 0), p('a', 1, 100)], null).compared, 0);
  });
});

describe('plateauedExercises', () => {
  const series = (id: string, best: number, bestDaysAgo: number, after: number[]) => [
    p(id, bestDaysAgo, best),
    ...after.map((d) => p(id, d, best - 5)),
  ];
  it('4주·3회·28일 안을 모두 만족하면 잡는다', () => {
    const [r] = plateauedExercises(series('a', 100, 35, [30, 20, 3]), NOW);
    assert.equal(r.exerciseId, 'a');
    assert.equal(r.bestKg, 100);
    assert.equal(r.weeks, 5);
    assert.equal(r.sessionsSince, 3);
  });
  it('경계 — 4주 미만 · 3회 미만 · 최근 28일 밖은 뺀다', () => {
    assert.deepEqual(plateauedExercises(series('a', 100, 27, [20, 10, 3]), NOW), []);
    assert.deepEqual(plateauedExercises(series('a', 100, 35, [20, 3]), NOW), []);
    assert.deepEqual(plateauedExercises(series('a', 100, 90, [80, 70, 29]), NOW), []);
    assert.equal(plateauedExercises(series('a', 100, 40, [30, 29, 28]), NOW).length, 1);
  });
  it('조금이라도 높으면 갱신이다(최근 PR 과 같은 기준) · 같은 값은 갱신이 아니다', () => {
    const same = plateauedExercises([p('a', 60, 100), p('a', 50, 100), p('a', 40, 100), p('a', 20, 100)], NOW);
    assert.equal(same[0].bestAtMs, NOW - 60 * DAY);
    assert.deepEqual(plateauedExercises([p('a', 60, 100), p('a', 50, 95), p('a', 40, 95), p('a', 30, 95), p('a', 2, 100.3)], NOW), []);
  });
  it('오래된 순으로 자른다', () => {
    const r = plateauedExercises(
      [...series('a', 100, 40, [30, 20, 3]), ...series('b', 100, 70, [30, 20, 3]), ...series('c', 100, 50, [30, 20, 3])],
      NOW,
      2,
    );
    assert.deepEqual(r.map((x) => x.exerciseId), ['b', 'c']);
  });
});

describe('주 경계', () => {
  it('일요일 밤은 그 주, 월요일 0시는 다음 주', () => {
    const sun = new Date(2026, 10, 1, 23, 59, 59).getTime();
    const mon = new Date(2026, 10, 2, 0, 0, 0).getTime();
    assert.equal(localWeekStart(sun), new Date(2026, 9, 26).getTime());
    assert.equal(localWeekStart(mon), mon);
  });
  it('끝 칸이 이번 주인 8칸', () => {
    const w = recentWeekStarts(NOW);
    assert.equal(w.length, 8);
    assert.equal(w[7], new Date(2026, 10, 2).getTime());
    assert.equal(w[0], new Date(2026, 8, 14).getTime());
  });
});

describe('weeklyMuscleSets', () => {
  const set = (daysAgo: number, extra = {}) => ({
    atMs: NOW - daysAgo * DAY,
    primaryMuscles: ['chest'] as const,
    secondaryMuscles: ['triceps'] as const,
    ...extra,
  });
  it('주근육 1 · 보조근 0.5 · 많은 순 · 워밍업·실패 제외', () => {
    const r = weeklyMuscleSets([set(0), set(0), set(0, { isWarmup: true }), set(0, { isFailed: true }), set(7)], NOW);
    assert.deepEqual(r.rows.map((x) => x.muscle), ['chest', 'triceps']);
    assert.deepEqual(r.rows[0].sets.slice(-2), [1, 2]);
    assert.deepEqual(r.rows[1].sets.slice(-2), [0.5, 1]);
  });
  it('8주 밖은 버리고, 세트 없는 근육은 줄이 없다', () => {
    const r = weeklyMuscleSets([set(70)], NOW);
    assert.deepEqual(r.rows, []);
    assert.deepEqual(r.fullBody, [0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it('전신은 따로 센다', () => {
    const r = weeklyMuscleSets([{ atMs: NOW, primaryMuscles: ['fullBody'], secondaryMuscles: [] }], NOW);
    assert.deepEqual(r.rows, []);
    assert.equal(r.fullBody[7], 1);
  });
});
