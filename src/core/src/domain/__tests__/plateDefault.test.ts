// @plm SRS-084 SRS-058  플레이트 머신 한쪽 입력 기본(#63) — 후보 판정 · 배수 · 질문 · 프리필 환산 · 재표기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  plateDefaultLoad,
  blockLoadMultiplierV2,
  carryWeightAcrossMultiplierV2,
  isPlateLoadCandidate,
  needsPlateOneSideQuestion,
  planBlockMultiplierResyncV2,
  planBlockMultiplierRetag,
} from '../recordSlots';
import { effectiveWeightKg } from '../volume';

test('후보 = 머신 + 적재 축 + 하중 모드 external (어시스트·맨몸 기준·케이블·바벨 제외 · /qa spec H-1)', () => {
  assert.equal(isPlateLoadCandidate('machine', true, 'external'), true);
  assert.equal(isPlateLoadCandidate('machine', true, undefined), true);
  assert.equal(isPlateLoadCandidate('machine', false, 'external'), false);
  assert.equal(isPlateLoadCandidate('machine', true, 'assisted'), false);
  assert.equal(isPlateLoadCandidate('machine', true, 'bodyweight'), false);
  assert.equal(isPlateLoadCandidate('cable', true, 'external'), false);
  assert.equal(isPlateLoadCandidate('barbell', true, 'external'), false);
  assert.equal(isPlateLoadCandidate(null, true, 'external'), false);
});

test('흔한 적재 방식 — 후보면 family 의 load_default(없으면 plate), 후보 아니면 null', () => {
  assert.equal(plateDefaultLoad('machine', true, 'external', 'plate'), 'plate');
  assert.equal(plateDefaultLoad('machine', true, null, 'pin'), 'pin');
  assert.equal(plateDefaultLoad('machine', true, null, undefined), 'plate');
  assert.equal(plateDefaultLoad('machine', true, 'assisted', 'plate'), null);
  assert.equal(plateDefaultLoad('cable', true, null, 'plate'), null);
});

test('배수 — 플레이트 머신(빈 칸 포함)은 안 정함·한쪽이면 2, 양쪽 합이면 명시 1 · 핀(칸 또는 흔한 방식)이면 null', () => {
  assert.equal(blockLoadMultiplierV2({ load: null }, null, 'plate'), 2); // 기본이 한쪽(사용자 결정)
  assert.equal(blockLoadMultiplierV2({ load: 'plate' }, null, 'plate'), 2);
  assert.equal(blockLoadMultiplierV2({ load: 'plate' }, true, 'plate'), 2);
  assert.equal(blockLoadMultiplierV2({}, false, 'plate'), 1);
  assert.equal(blockLoadMultiplierV2({ load: 'pin' }, true, 'plate'), null);
  // 핀 스택이 흔한 머신(레그 익스텐션) — 빈 칸은 핀이라 1, 사람이 플레이트 칸을 고르면 한쪽 기본
  assert.equal(blockLoadMultiplierV2({ load: null }, null, 'pin'), null);
  assert.equal(blockLoadMultiplierV2({ load: 'plate' }, null, 'pin'), 2);
  assert.equal(blockLoadMultiplierV2({ load: 'plate' }, true, null), null);
  assert.equal(blockLoadMultiplierV2(null, null, null), null);
});

test('한쪽 40kg×10 = 볼륨 계산 무게 80kg · 양쪽 합(1) 40kg = 40kg', () => {
  const m2 = blockLoadMultiplierV2({ load: null }, null, 'plate');
  assert.equal(effectiveWeightKg({ weightKg: 40, reps: 10, isWarmup: false, isFailed: false, loadMultiplier: m2 } as never), 80);
  const m1 = blockLoadMultiplierV2({ load: null }, false, 'plate');
  assert.equal(effectiveWeightKg({ weightKg: 40, reps: 10, isWarmup: false, isFailed: false, loadMultiplier: m1 } as never), 40);
});

test('질문 — 플레이트 칸(빈 칸은 흔한 방식)이고 아직 안 정했을 때만', () => {
  assert.equal(needsPlateOneSideQuestion({ load: null }, null, 'plate'), true);
  assert.equal(needsPlateOneSideQuestion({ load: 'plate' }, undefined, 'plate'), true);
  assert.equal(needsPlateOneSideQuestion({ load: 'plate' }, null, 'pin'), true);
  assert.equal(needsPlateOneSideQuestion({ load: null }, null, 'pin'), false);
  assert.equal(needsPlateOneSideQuestion({ load: 'pin' }, null, 'plate'), false);
  assert.equal(needsPlateOneSideQuestion({ load: null }, true, 'plate'), false);
  assert.equal(needsPlateOneSideQuestion({ load: null }, false, 'plate'), false);
  assert.equal(needsPlateOneSideQuestion({ load: null }, null, null), false);
});

test('프리필 환산 — 지난 배수가 null(옛 기록·모름)이면 숫자 그대로, 명시 1·2 일 때만 환산', () => {
  assert.equal(carryWeightAcrossMultiplierV2(40, null, 2), 40); // 옛 하이로우 40(실제로 한쪽) → 한쪽 40
  assert.equal(carryWeightAcrossMultiplierV2(40, undefined, 2), 40);
  assert.equal(carryWeightAcrossMultiplierV2(80, 1, 2), 40); // 양쪽 합으로 정한 기록 → 한쪽
  assert.equal(carryWeightAcrossMultiplierV2(40, 2, 1), 80);
  assert.equal(carryWeightAcrossMultiplierV2(40, 2, null), 80);
  assert.equal(carryWeightAcrossMultiplierV2(40, 2, 2), 40);
  assert.equal(carryWeightAcrossMultiplierV2(40, null, null), 40);
});

test('질문 답 재표기 — 한 세트 포함 배수만, 숫자 그대로 · 같은 배수는 건너뜀', () => {
  const plan = planBlockMultiplierRetag(
    [
      { id: 'a', done: true, weightKg: 40, loadMultiplier: 2 },
      { id: 'b', done: false, weightKg: 40, loadMultiplier: 2 },
      { id: 'c', done: false, weightKg: 40, loadMultiplier: 1 },
    ],
    1,
  );
  assert.deepEqual(plan, [
    { id: 'a', weightKg: 40, loadMultiplier: 1 },
    { id: 'b', weightKg: 40, loadMultiplier: 1 },
  ]);
});

test('토글 동기(V2) — 안 한 세트만, 옛 null 세트는 숫자 그대로 배수만 · 명시 배수는 환산', () => {
  const plan = planBlockMultiplierResyncV2(
    [
      { id: 'done', done: true, weightKg: 40, loadMultiplier: null },
      { id: 'legacy', done: false, weightKg: 40, loadMultiplier: null },
      { id: 'explicit', done: false, weightKg: 80, loadMultiplier: 1 },
      { id: 'typed', done: false, weightKg: 70, loadMultiplier: 1, touched: true },
    ],
    2,
  );
  assert.deepEqual(plan, [
    { id: 'legacy', weightKg: 40, loadMultiplier: 2 },
    { id: 'explicit', weightKg: 40, loadMultiplier: 2 },
    { id: 'typed', weightKg: 70, loadMultiplier: 2 },
  ]);
});

// ── /qa code M-1·M-2 (2026-10-27) ──────────────────────────────────────────
import { adoptLegacyMultiplier, plateChangeMode } from '../recordSlots';
import { bestEstimatedOneRepMax } from '../oneRepMax';

test('M-1 칸·토글 변경 방식 — 아직 안 정한 후보는 질문 답과 같이 재표기(숫자 그대로), 정했거나 후보 아니면 기존 환산', () => {
  assert.equal(plateChangeMode(null, 'plate'), 'retag');
  assert.equal(plateChangeMode(undefined, 'pin'), 'retag');
  assert.equal(plateChangeMode(true, 'plate'), 'resync');
  assert.equal(plateChangeMode(false, 'plate'), 'resync');
  assert.equal(plateChangeMode(null, null), 'resync');
});

test('M-1 미정 → 핀: 재표기면 프리필 20 이 20 그대로(환산이면 40 이 되던 것)', () => {
  const sets = [{ id: 'a', done: false, weightKg: 20, loadMultiplier: 2 }];
  assert.deepEqual(planBlockMultiplierRetag(sets, null), [{ id: 'a', weightKg: 20, loadMultiplier: null }]);
  assert.deepEqual(planBlockMultiplierResyncV2(sets, null), [{ id: 'a', weightKg: 40, loadMultiplier: null }]);
});

test('M-2 옛 null 기록은 지금 블록 배수로 읽는다 — 1RM % 처방 프리필이 옛 숫자 기준(절반이 되지 않는다)', () => {
  const legacy = [{ weightKg: 100, reps: 10, isWarmup: false, isFailed: false, loadMultiplier: null }];
  const est1 = bestEstimatedOneRepMax(legacy as never);
  const est2 = bestEstimatedOneRepMax(adoptLegacyMultiplier(legacy, 2) as never);
  assert.ok(Math.abs(est2 - est1 * 2) < 1e-9);
  // 75% 처방 → 계산 kg ÷ 블록 배수 2 = 입력 숫자는 옛 숫자 기준 75%
  assert.ok(Math.abs((0.75 * est2) / 2 - 0.75 * est1) < 1e-9);
  // 명시 배수 기록·블록 배수 null 이면 그대로
  const explicit = [{ weightKg: 50, reps: 10, isWarmup: false, isFailed: false, loadMultiplier: 2 }];
  assert.deepEqual(adoptLegacyMultiplier(explicit, 1), explicit);
  assert.deepEqual(adoptLegacyMultiplier(legacy, null), legacy);
});
