// SPEC-043 · SRS-108 — 횟수 범위로 결과·다음 무게
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDoubleProgression, repResult } from '../progression';

test('결과 — 아래 · 안 · 위쪽 값 이상 · 범위 없음', () => {
  assert.equal(repResult(7, 8, 12), 'below');
  assert.equal(repResult(10, 8, 12), 'inRange');
  assert.equal(repResult(12, 8, 12), 'top');
  assert.equal(repResult(13, 8, 12), 'top');
  assert.equal(repResult(5, 5, null), 'top');
  assert.equal(repResult(10, null, null), null);
  assert.equal(repResult(0, 8, 12), null);
});

test('모든 주 세트가 12회 → 무게 +2.5 · 8회부터', () => {
  const p = planDoubleProgression({ lastWork: [{ weightKg: 60, reps: 12 }, { weightKg: 60, reps: 12 }, { weightKg: 60, reps: 13 }], repMin: 8, repMax: 12, incrementKg: 2.5 });
  assert.deepEqual([p?.action, p?.weightKg, p?.reps], ['increaseWeight', 62.5, 8]);
  assert.deepEqual(p?.lastReps, [12, 12, 13]);
});

test('범위 안이면 같은 무게로 한 회 더 · 아래면 아래쪽 값', () => {
  const add = planDoubleProgression({ lastWork: [{ weightKg: 60, reps: 10 }, { weightKg: 60, reps: 9 }], repMin: 8, repMax: 12, incrementKg: 2.5 });
  assert.deepEqual([add?.action, add?.weightKg, add?.reps], ['addRep', 60, 11]);
  assert.deepEqual(add?.repsBySet, [11, 10]); // 세트마다 지난번 +1
  const hold = planDoubleProgression({ lastWork: [{ weightKg: 60, reps: 9 }, { weightKg: 60, reps: 6 }], repMin: 8, repMax: 12, incrementKg: 2.5 });
  assert.deepEqual([hold?.action, hold?.weightKg, hold?.reps], ['hold', 60, 8]);
});

test('가벼운 백오프는 판단에서 빠진다 · 기록·범위 없으면 null', () => {
  const p = planDoubleProgression({ lastWork: [{ weightKg: 80, reps: 12 }, { weightKg: 80, reps: 12 }, { weightKg: 60, reps: 6 }], repMin: 8, repMax: 12, incrementKg: 2.5 });
  assert.equal(p?.action, 'increaseWeight');
  assert.equal(planDoubleProgression({ lastWork: [], repMin: 8, repMax: 12, incrementKg: 2.5 }), null);
  assert.equal(planDoubleProgression({ lastWork: [{ weightKg: 60, reps: 10 }], repMin: null, repMax: null, incrementKg: 2.5 }), null);
});

test('REV-078 — 주 세트에 실패가 있으면 올리지 않는다 · 높았던 세트는 깎지 않는다 · 기구별 증분', async () => {
  const { progressionIncrementKg } = await import('../progression');
  const f = planDoubleProgression({ lastWork: [{ weightKg: 60, reps: 12 }, { weightKg: 60, reps: 12 }, { weightKg: 60, reps: 7, failed: true }], repMin: 8, repMax: 12, incrementKg: 2.5 });
  assert.equal(f?.action, 'hold');
  const a = planDoubleProgression({ lastWork: [{ weightKg: 60, reps: 12 }, { weightKg: 60, reps: 12 }, { weightKg: 60, reps: 9 }], repMin: 8, repMax: 12, incrementKg: 2.5 });
  assert.deepEqual(a?.repsBySet, [12, 12, 10]);
  assert.equal(progressionIncrementKg('barbell', 'kg'), 2.5);
  assert.equal(progressionIncrementKg('dumbbell', 'kg'), 2);
  assert.equal(progressionIncrementKg('machine', 'kg'), 5);
  assert.ok(Math.abs(progressionIncrementKg('cable', 'lb') - 4.5359237) < 1e-9);
});
