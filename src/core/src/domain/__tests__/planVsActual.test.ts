// 처방 대 실제(SPEC-050 P4) — 블록 처방(글자·배열·옛 키) ↔ 끝낸 세트(done === true), 묶음별(준비·본) 순번 짝·상태(hit·under·over·missed·extra) · 처방 없으면 목표로.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blockPlan, planVsActual } from '../planVsActual';

const rx = JSON.stringify([
  { setType: 'warmup', targetRir: null, repMin: 10, repMax: 10, loadHint: 'light' },
  { setType: 'top', targetRir: 1, repMin: 4, repMax: 6, loadHint: 'heavy', loadBasis: 'fixed', loadKg: 100 },
  { setType: 'backoff', targetRir: 2, repMin: 8, repMax: 10, loadHint: null },
  { setType: 'backoff', targetRir: 2, repMin: 8, repMax: 10, loadHint: null, amrap: true },
]);

test('처방(직렬화 글자) — 순번 짝 · 범위 안/아래/위 · 안 한 줄은 missed', () => {
  const r = planVsActual({
    prescription: rx,
    sets: [
      { setNumber: 3, weightKg: 80, reps: 11, done: true }, // 백오프 위
      { setNumber: 1, weightKg: 40, reps: 10, done: true, setType: 'warmup' }, // 워밍업 hit
      { setNumber: 2, weightKg: 100, reps: 3, done: true }, // 탑 아래
      { setNumber: 4, weightKg: 80, reps: 8, done: false }, // 끝내지 않은 세트는 실제가 아니다
    ],
  });
  assert.ok(r);
  assert.deepEqual(
    r.rows.map((x) => x.status),
    ['hit', 'under', 'over', 'missed'],
  );
  assert.equal(r.rows[1].plan?.loadKg, 100);
  assert.equal(r.rows[1].actual?.weightKg, 100);
  assert.equal(r.planned, 4);
  assert.equal(r.done, 3);
  assert.equal(r.hit, 1);
});

test('계획보다 더 한 세트는 extra · amrap 은 한 번이라도 하면 hit', () => {
  const r = planVsActual({
    prescription: JSON.parse(rx),
    sets: [1, 2, 3, 4, 5].map((n) => ({
      setNumber: n,
      weightKg: 50,
      reps: n === 4 ? 15 : 10,
      done: true,
      isWarmup: n === 1,
    })),
  });
  assert.ok(r);
  assert.deepEqual(
    r.rows.map((x) => x.status),
    ['hit', 'over', 'hit', 'hit', 'extra'],
  );
  assert.equal(r.rows[4].plan, null);
  assert.equal(r.done, 4);
});

test('옛 Go 키(PascalCase) 처방도 읽는다', () => {
  const r = planVsActual({
    prescription: JSON.stringify([{ SetType: 'top', RepMin: 5, RepMax: 5 }]),
    sets: [{ setNumber: 1, weightKg: 100, reps: 5, done: true }],
  });
  assert.equal(r?.rows[0].plan?.setType, 'top');
  assert.equal(r?.rows[0].status, 'hit');
});

test('처방이 없으면 목표(세트 수·횟수·무게)로 · 범위 없는 목표는 done', () => {
  const r = planVsActual({
    prescription: null,
    targetSets: 3,
    targetRepsMin: 8,
    targetRepsMax: 12,
    targetWeightKg: 60,
    sets: [
      { setNumber: 1, weightKg: 60, reps: 12, done: true },
      { setNumber: 2, weightKg: 60, reps: 7, done: true },
    ],
  });
  assert.ok(r);
  assert.deepEqual(
    r.rows.map((x) => x.status),
    ['hit', 'under', 'missed'],
  );
  assert.equal(r.rows[0].planWeightKg, 60);
  const loose = planVsActual({ prescription: '[]', targetSets: 1, sets: [{ weightKg: 0, reps: 3, done: true }] });
  assert.equal(loose?.rows[0].status, 'done');
  assert.equal(loose?.hit, 1);
});

test('계획이 없으면 null · 깨진 처방 글자는 목표로 내려간다', () => {
  assert.equal(planVsActual({ prescription: null, sets: [{ weightKg: 60, reps: 5 }] }), null);
  assert.equal(blockPlan({ prescription: '{깨짐', targetSets: 0 }), null);
  assert.equal(blockPlan({ prescription: '{깨짐', targetSets: 2 })?.rows.length, 2);
  assert.equal(blockPlan({ prescription: undefined, targetSets: 99 })?.rows.length, 30);
});

test('웜업을 건너뛰면 본 세트가 밀리지 않는다 — 웜업 줄만 missed', () => {
  const r = planVsActual({
    prescription: rx,
    sets: [
      { setNumber: 1, weightKg: 100, reps: 5, done: true, setType: 'top' },
      { setNumber: 2, weightKg: 80, reps: 9, done: true, setType: 'backoff' },
      { setNumber: 3, weightKg: 80, reps: 12, done: true, setType: 'backoff' },
    ],
  });
  assert.ok(r);
  assert.deepEqual(
    r.rows.map((x) => [x.plan?.setType ?? null, x.status]),
    [
      ['warmup', 'missed'],
      ['top', 'hit'],
      ['backoff', 'hit'],
      ['backoff', 'hit'],
    ],
  );
  assert.equal(r.done, 3);
  assert.equal(r.hit, 3);
});

test('처방에 없는 웜업을 더 하면 「계획 밖」으로 준비 묶음 끝에 · 본 세트 짝은 그대로', () => {
  const r = planVsActual({
    prescription: rx,
    sets: [
      { setNumber: 1, weightKg: 20, reps: 10, done: true, isWarmup: true },
      { setNumber: 2, weightKg: 40, reps: 8, done: true, isWarmup: true }, // 처방은 웜업 1줄 → 남는 웜업
      { setNumber: 3, weightKg: 60, reps: 3, done: true, setType: 'feeder' }, // 피더도 준비 세트
      { setNumber: 4, weightKg: 100, reps: 5, done: true, setType: 'top' },
      { setNumber: 5, weightKg: 80, reps: 8, done: true },
    ],
  });
  assert.ok(r);
  assert.deepEqual(
    r.rows.map((x) => [x.plan?.setType ?? null, x.actual?.setNumber ?? null, x.status]),
    [
      ['warmup', 1, 'hit'],
      [null, 2, 'extra'],
      [null, 3, 'extra'],
      ['top', 4, 'hit'],
      ['backoff', 5, 'hit'],
      ['backoff', null, 'missed'],
    ],
  );
  assert.deepEqual(
    r.rows.map((x) => x.index),
    [0, 1, 2, 3, 4, 5],
  );
  assert.equal(r.done, 3);
});

test('처방에 웜업이 없는데 웜업을 하면 맨 앞에 「계획 밖」', () => {
  const r = planVsActual({
    prescription: null,
    targetSets: 2,
    targetRepsMin: 5,
    targetRepsMax: 5,
    sets: [
      { setNumber: 1, weightKg: 40, reps: 10, done: true, isWarmup: true },
      { setNumber: 2, weightKg: 80, reps: 5, done: true },
      { setNumber: 3, weightKg: 80, reps: 5, done: true },
    ],
  });
  assert.deepEqual(
    r?.rows.map((x) => x.status),
    ['extra', 'hit', 'hit'],
  );
});

test('done 이 null·없음·false 인 세트는 끝낸 세트가 아니다', () => {
  const r = planVsActual({
    prescription: null,
    targetSets: 3,
    targetRepsMin: 5,
    targetRepsMax: 5,
    sets: [
      { setNumber: 1, weightKg: 80, reps: 5, done: true },
      { setNumber: 2, weightKg: 80, reps: 5, done: null },
      { setNumber: 3, weightKg: 80, reps: 5 },
      { setNumber: 4, weightKg: 80, reps: 5, done: false },
    ],
  });
  assert.deepEqual(
    r?.rows.map((x) => x.status),
    ['hit', 'missed', 'missed'],
  );
  assert.equal(r?.done, 1);
});
