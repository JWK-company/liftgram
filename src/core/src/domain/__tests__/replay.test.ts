// @plm SRS-065  「이 운동 그대로 다시 시작」·피드 「바로 시작」 — 시작 계획(순수 함수)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planReplay, planFromSpec, routineLinesToStartRows, type ReplaySourceBlock, type RoutineLineLike } from '../replay';

const V0 = {
  variantKey: null,
  variantEquipment: null,
  variantGrip: null,
  variantArm: null,
  variantLoad: null,
  variantAttach: null,
  machineVariant: null,
};
const set = (done: boolean, isWarmup = false) => ({ done, isWarmup });
const src = (id: string, exerciseId: string, sortOrder: number, extra: Partial<ReplaySourceBlock> = {}): ReplaySourceBlock => ({
  id,
  exerciseId,
  sortOrder,
  supersetGroup: null,
  routineExerciseId: null,
  isCardio: false,
  targetRepsMin: 8,
  targetRepsMax: 12,
  restSeconds: 90,
  prescription: null,
  cardioTarget: null,
  variant: V0,
  sets: [set(true), set(true), set(true)],
  ...extra,
});

test('다시 시작 — 순서·완료 워킹 세트 수·워밍업 수·목표·조합을 원본 그대로', () => {
  const rows = planReplay([
    src('b2', 'fly', 1, { sets: [set(true), set(true), set(true), set(true)] }),
    src('b1', 'bench', 0, {
      sets: [set(true, true), set(true), set(true)],
      variant: { ...V0, variantKey: 'hammer|plate', variantEquipment: 'hammer', variantLoad: 'plate' },
      targetRepsMin: 5,
      targetRepsMax: 5,
      restSeconds: 180,
    }),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.exerciseId, r.targetSets, r.warmupSets]),
    [
      ['bench', 2, 1],
      ['fly', 4, 0],
    ],
  );
  assert.equal(rows[0].variant?.variantKey, 'hammer|plate');
  assert.equal(rows[0].targetRepsMin, 5);
  assert.equal(rows[0].restSeconds, 180);
  // 무게는 담지 않는다 — 시작할 때 이전 기록으로 채운다(D3)
  assert.equal(rows[0].targetWeightKg, null);
});

test('다시 시작 — 완료 세트가 없거나 워밍업만 한 종목은 빠진다 · 체크 안 한 세트는 세지 않는다', () => {
  const rows = planReplay([
    src('a', 'squat', 0, { sets: [set(true), set(false), set(false)] }),
    src('b', 'curl', 1, { sets: [set(false), set(false)] }),
    src('c', 'press', 2, { sets: [set(true, true)] }),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.exerciseId, r.targetSets]),
    [['squat', 1]],
  );
});

test('다시 시작 — 슈퍼셋은 새 그룹 id 로 · 짝이 빠져 혼자 남은 묶음은 푼다', () => {
  const rows = planReplay([
    src('a', 'curl', 0, { supersetGroup: 'g1' }),
    src('b', 'pushdown', 1, { supersetGroup: 'g1' }),
    src('c', 'raise', 2, { supersetGroup: 'g2' }),
    src('d', 'shrug', 3, { supersetGroup: 'g2', sets: [set(false)] }),
  ]);
  assert.equal(rows.length, 3);
  assert.ok(rows[0].supersetGroup);
  assert.equal(rows[0].supersetGroup, rows[1].supersetGroup);
  assert.notEqual(rows[0].supersetGroup, 'g1'); // 원본 세션의 그룹 id 를 그대로 쓰지 않는다
  assert.equal(rows[2].supersetGroup, null); // 짝(shrug)이 빠졌다
});

test('다시 시작 — 처방·유산소 목표·루틴 줄 연결을 복사한다(R3 · 완료 시 루틴 반영이 이어진다)', () => {
  const rx = [{ setType: 'top' as const, targetRir: 1, repMin: 5, repMax: 5, loadHint: null }];
  const rows = planReplay([
    src('a', 'bench', 0, { prescription: rx, routineExerciseId: 're1' }),
    src('b', 'bike', 1, { isCardio: true, cardioTarget: { durationSec: 600 }, sets: [set(true)] }),
  ]);
  assert.deepEqual(rows[0].prescription, rx);
  assert.equal(rows[0].routineExerciseId, 're1');
  assert.equal(rows[1].targetSets, 1);
  assert.deepEqual(rows[1].cardioTarget, { durationSec: 600 });
});

test('피드 바로 시작 — 세트 수·순서·묶음만 · 변형·연결 없음 · 0 세트는 1 로', () => {
  const rows = planFromSpec([
    { exerciseId: 'row', sets: 4, supersetGroup: null },
    { exerciseId: 'curl', sets: 0, supersetGroup: 's' },
    { exerciseId: 'pushdown', sets: 3, supersetGroup: 's' },
  ]);
  assert.deepEqual(
    rows.map((r) => [r.exerciseId, r.targetSets, r.routineExerciseId, r.variant]),
    [
      ['row', 4, null, null],
      ['curl', 1, null, null],
      ['pushdown', 3, null, null],
    ],
  );
  assert.ok(rows[1].supersetGroup && rows[1].supersetGroup === rows[2].supersetGroup);
});

// ── 루틴 시작 매핑 회귀(QA M-4) — startWorkoutFromRoutine 이 공통 시작으로 옮겨 간 뒤에도 V1 규칙 그대로 ──

const line = (id: string, extra: Partial<RoutineLineLike> = {}): RoutineLineLike => ({
  id,
  exerciseId: `ex-${id}`,
  targetSets: 3,
  targetRepsMin: 8,
  targetRepsMax: 12,
  targetWeightKg: 60,
  restSeconds: 120,
  machineVariant: null,
  variantKey: null,
  variantEquipment: null,
  variantGrip: null,
  variantArm: null,
  variantLoad: null,
  variantAttach: null,
  supersetGroup: null,
  prescription: null,
  cardioTarget: null,
  note: null,
  ...extra,
});

test('루틴 줄 → 시작할 줄: 목표·휴식·무게·메모·처방·줄 연결을 그대로, 칸은 미지정이면 지난 조합 승계(variantExact=false)', () => {
  const rx = [{ setType: 'top' as const, targetRir: 1, repMin: 5, repMax: 5, loadHint: null }];
  const [r] = routineLinesToStartRows([line('a', { note: '팔꿈치 45도', prescription: rx })]);
  assert.equal(r.exerciseId, 'ex-a');
  assert.equal(r.targetSets, 3);
  assert.equal(r.warmupSets, 0);
  assert.deepEqual([r.targetRepsMin, r.targetRepsMax, r.targetWeightKg, r.restSeconds], [8, 12, 60, 120]);
  assert.equal(r.note, '팔꿈치 45도');
  assert.deepEqual(r.prescription, rx);
  assert.equal(r.routineExerciseId, 'a');
  assert.equal(r.variantExact, false);
});

test('루틴 슈퍼셋 그룹 id 는 그대로 — 묶음 표식(g:)이 아니라 저장소가 새 id 로 바꾸지 않는다(V1 동작)', () => {
  const rows = routineLinesToStartRows([line('a', { supersetGroup: 'ss_1' }), line('b', { supersetGroup: 'ss_1' })]);
  assert.deepEqual(
    rows.map((r) => r.supersetGroup),
    ['ss_1', 'ss_1'],
  );
  assert.ok(rows.every((r) => !r.supersetGroup?.startsWith('g:')));
});

test('레거시 머신 미러만 있는 줄은 그 브랜드 칸으로 시작한다(V1 effectiveVariantKey 와 같다)', () => {
  const [r] = routineLinesToStartRows([line('a', { machineVariant: 'hammer' })]);
  assert.ok(r.variant);
  assert.equal(r.variant?.machineVariant, 'hammer');
  assert.ok(r.variant?.variantKey, '미러에서 칸 키를 만든다');
  const [plain] = routineLinesToStartRows([line('b')]);
  assert.equal(plain.variant?.variantKey, null);
});
