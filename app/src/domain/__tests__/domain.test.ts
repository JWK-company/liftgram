// 순수 도메인 단위테스트 — `npm test` (node --import tsx --test). RN 불필요.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  estimateOneRepMax,
  bestEstimatedOneRepMax,
  totalVolumeKg,
  setVolumeKg,
  workingSetCount,
  snapshotFromSets,
  detectNewPRs,
  EMPTY_PR,
  calcPlates,
  toKg,
  fromKg,
  formatWeight,
  roundToIncrement,
  containsMedicalClaim,
  suggestNextSet,
  detectStall,
  generateProgram,
  canonicalVariantKey,
  parseVariantKey,
  legacyMachineVariantToV6,
  effectiveWeightKg,
  effectiveReps,
  minInputToSec,
  secToMinInput,
  kmInputToM,
  mToKmInput,
  formatCardioSet,
  formatDurationClock,
  sumCardio,
  FINDER_TREE,
  type CatalogExercise,
  type LoggedSet,
} from '../index';
import { SEED_EXERCISES } from '../../data/seed/exercises.seed';

const ws = (weightKg: number, reps: number, extra: Partial<LoggedSet> = {}): LoggedSet => ({
  weightKg,
  reps,
  isWarmup: false,
  isFailed: false,
  ...extra,
});

// ── Epley 1RM (ADR-010) ──────────────────────────────────────────────
test('Epley: reps=1 → 무게 그대로', () => {
  assert.equal(estimateOneRepMax(100, 1), 100);
});

test('Epley: 100kg × 5 = 116.666…', () => {
  assert.ok(Math.abs(estimateOneRepMax(100, 5) - 100 * (1 + 5 / 30)) < 1e-9);
  assert.ok(Math.abs(estimateOneRepMax(100, 5) - 116.6667) < 1e-3);
});

test('Epley: 비정상 입력 → 0', () => {
  assert.equal(estimateOneRepMax(0, 5), 0);
  assert.equal(estimateOneRepMax(100, 0), 0);
  assert.equal(estimateOneRepMax(-50, 5), 0);
});

test('bestEstimatedOneRepMax: 워밍업/실패 제외', () => {
  const sets = [ws(60, 10), ws(120, 1), ws(200, 1, { isWarmup: true }), ws(300, 1, { isFailed: true })];
  // 워킹 세트: 60×10(=80), 120×1(=120) → 최고 120
  assert.equal(bestEstimatedOneRepMax(sets), 120);
});

// ── 볼륨 (SRS-005) ───────────────────────────────────────────────────
test('볼륨: 워밍업·실패 세트는 0', () => {
  assert.equal(setVolumeKg(ws(100, 5, { isWarmup: true })), 0);
  assert.equal(setVolumeKg(ws(100, 5, { isFailed: true })), 0);
  assert.equal(setVolumeKg(ws(100, 5)), 500);
});

test('볼륨 합계 + 워킹세트 수', () => {
  const sets = [ws(80, 8), ws(80, 8), ws(80, 8), ws(40, 10, { isWarmup: true })];
  assert.equal(totalVolumeKg(sets), 80 * 8 * 3);
  assert.equal(workingSetCount(sets), 3);
});

// ── PR 검출 (SRS-005) ────────────────────────────────────────────────
test('PR: 과거 기록 없으면 모든 지표가 신규 PR', () => {
  const snap = snapshotFromSets([ws(100, 5)]);
  const prs = detectNewPRs(snap, EMPTY_PR);
  const types = prs.map((p) => p.type).sort();
  assert.deepEqual(types, ['estimated1RM', 'maxReps', 'maxVolumeSet', 'maxWeight'].sort());
});

test('PR: 동률이면 갱신 아님', () => {
  const snap = snapshotFromSets([ws(100, 5)]);
  assert.equal(detectNewPRs(snap, snap).length, 0);
});

test('PR: 중량만 갱신', () => {
  const hist = snapshotFromSets([ws(100, 5)]);
  const cur = snapshotFromSets([ws(110, 5)]);
  const prs = detectNewPRs(cur, hist);
  assert.ok(prs.some((p) => p.type === 'maxWeight'));
});

// ── 플레이트 계산기 (SRS-003) ────────────────────────────────────────
test('플레이트: 100kg 기본 → 한쪽 40kg, 잔여 0', () => {
  const r = calcPlates(100);
  assert.equal(r.achievableKg, 100);
  assert.equal(Math.round(r.leftoverKg * 100) / 100, 0);
  const perSideTotal = r.perSide.reduce((s, p) => s + p.plateKg * p.count, 0);
  assert.equal(perSideTotal, 40);
});

test('플레이트: 바 이하 목표 → 플레이트 없음', () => {
  const r = calcPlates(15);
  assert.deepEqual(r.perSide, []);
  assert.equal(r.achievableKg, 20);
});

test('플레이트: 못 맞추는 잔여는 leftover로', () => {
  const r = calcPlates(21, { barKg: 20, platesKg: [5] }); // 한쪽 0.5 필요하나 5짜리뿐
  assert.equal(r.achievableKg, 20);
  assert.ok(r.leftoverKg > 0);
});

// ── 단위 변환 (SRS-003) ──────────────────────────────────────────────
test('단위: lb↔kg 왕복', () => {
  assert.ok(Math.abs(toKg(100, 'lb') - 45.359237) < 1e-6);
  assert.equal(fromKg(100, 'kg'), 100);
  assert.ok(Math.abs(fromKg(toKg(225, 'lb'), 'lb') - 225) < 1e-6);
});

test('단위: 반올림 증분 + 포맷', () => {
  assert.equal(roundToIncrement(101.3, 0.5), 101.5);
  assert.equal(formatWeight(100, 'kg'), '100kg');
  assert.equal(formatWeight(102.5, 'kg', { withUnit: false }), '102.5');
});

// ── 웰니스 카피 게이트 (ADR-006) ─────────────────────────────────────
test('웰니스: 의료 단정 표현 검출', () => {
  assert.equal(containsMedicalClaim('이 운동으로 질병을 치료할 수 있습니다'), true);
  assert.equal(containsMedicalClaim('이번 주 총 볼륨 12,400kg'), false);
});

// ── 점진적 과부하 (SRS-010) ──────────────────────────────────────────
test('progression: 상한 도달 → 무게 증가·반복 하한 리셋', () => {
  const s = suggestNextSet({ lastWeightKg: 60, lastReps: 12, repMin: 8, repMax: 12, incrementKg: 2.5 });
  assert.equal(s?.action, 'increaseWeight');
  assert.equal(s?.weightKg, 62.5);
  assert.equal(s?.reps, 8);
});

test('progression: 범위 내 → 같은 무게 +1 반복', () => {
  const s = suggestNextSet({ lastWeightKg: 60, lastReps: 9, repMin: 8, repMax: 12, incrementKg: 2.5 });
  assert.equal(s?.action, 'addRep');
  assert.equal(s?.weightKg, 60);
  assert.equal(s?.reps, 10);
});

test('progression: 하한 미달 → 무게 유지(hold)', () => {
  const s = suggestNextSet({ lastWeightKg: 60, lastReps: 5, repMin: 8, repMax: 12, incrementKg: 2.5 });
  assert.equal(s?.action, 'hold');
  assert.equal(s?.weightKg, 60);
  assert.equal(s?.reps, 8);
});

test('progression: 이력 없으면 제안 없음', () => {
  assert.equal(suggestNextSet({ lastWeightKg: null, lastReps: null, repMin: 8, repMax: 12, incrementKg: 2.5 }), null);
  assert.equal(suggestNextSet({ lastWeightKg: 0, lastReps: 10, repMin: 8, repMax: 12, incrementKg: 2.5 }), null);
});

test('detectStall: 세션 부족 → 정체 아님', () => {
  assert.equal(detectStall([100, 105], 3).stalled, false);
});

test('detectStall: 최근 3세션 향상 없음 → 정체', () => {
  assert.equal(detectStall([100, 120, 120, 120], 3).stalled, true);
});

test('detectStall: 최근 향상 있으면 정체 아님', () => {
  assert.equal(detectStall([100, 100, 110], 3).stalled, false);
});

// ── 규칙기반 프로그램 생성 (SRS-009) ─────────────────────────────────
const CAT: CatalogExercise[] = [
  { id: 'bp', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'barbell' },
  { id: 'db_bp', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], equipment: 'dumbbell' },
  { id: 'fly', primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'cable' },
  { id: 'ohp', primaryMuscles: ['shoulders'], secondaryMuscles: ['triceps'], equipment: 'barbell' },
  { id: 'lat_raise', primaryMuscles: ['shoulders'], secondaryMuscles: [], equipment: 'dumbbell' },
  { id: 'pushdown', primaryMuscles: ['triceps'], secondaryMuscles: [], equipment: 'cable' },
  { id: 'skull', primaryMuscles: ['triceps'], secondaryMuscles: [], equipment: 'barbell' },
  { id: 'row', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'barbell' },
  { id: 'pulldown', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'cable' },
  { id: 'pullup', primaryMuscles: ['back'], secondaryMuscles: ['biceps'], equipment: 'bodyweight' },
  { id: 'curl', primaryMuscles: ['biceps'], secondaryMuscles: [], equipment: 'dumbbell' },
  { id: 'hammer', primaryMuscles: ['biceps'], secondaryMuscles: [], equipment: 'dumbbell' },
  { id: 'shrug', primaryMuscles: ['traps'], secondaryMuscles: [], equipment: 'barbell' },
  { id: 'squat', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'barbell' },
  { id: 'legpress', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], equipment: 'machine' },
  { id: 'rdl', primaryMuscles: ['hamstrings'], secondaryMuscles: ['glutes'], equipment: 'barbell' },
  { id: 'hipthrust', primaryMuscles: ['glutes'], secondaryMuscles: [], equipment: 'barbell' },
  { id: 'calf', primaryMuscles: ['calves'], secondaryMuscles: [], equipment: 'machine' },
  { id: 'plank', primaryMuscles: ['abs'], secondaryMuscles: [], equipment: 'bodyweight' },
];

test('program: 3일 → PPL 3일, 경력별 종목수, 근비대 스킴', () => {
  const p = generateProgram({ goal: 'hypertrophy', experience: 'intermediate', daysPerWeek: 3, equipment: [] }, CAT);
  assert.equal(p.days.length, 3);
  assert.deepEqual(p.days.map((d) => d.templateKey), ['push', 'pull', 'legs']);
  for (const d of p.days) {
    assert.equal(d.slots.length, 5); // intermediate=5
    for (const s of d.slots) {
      assert.equal(s.targetRepsMin, 8);
      assert.equal(s.targetRepsMax, 12);
      assert.equal(s.targetSets, 4);
    }
    // 하루 내 종목 중복 없음
    const ids = d.slots.map((s) => s.exerciseId);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('program: 컴파운드 우선 선택(가슴 첫 슬롯 = 바벨 벤치)', () => {
  const p = generateProgram({ goal: 'strength', experience: 'beginner', daysPerWeek: 3, equipment: [] }, CAT);
  const push = p.days[0];
  assert.equal(push.slots.length, 4); // beginner=4
  assert.equal(push.slots[0].exerciseId, 'bp'); // chest 컴파운드 바벨 우선
  assert.equal(push.slots[0].targetSets, 4); // strength 5 - beginner 1
  assert.equal(push.slots[0].targetRepsMax, 5);
});

test('program: 가용 장비 필터 — 바벨 제외 시 바벨 종목 미선택', () => {
  const p = generateProgram({ goal: 'hypertrophy', experience: 'advanced', daysPerWeek: 3, equipment: ['dumbbell', 'cable', 'machine', 'bodyweight'] }, CAT);
  const allIds = p.days.flatMap((d) => d.slots.map((s) => s.exerciseId));
  const barbellIds = ['bp', 'ohp', 'skull', 'row', 'shrug', 'squat', 'rdl', 'hipthrust'];
  for (const id of allIds) assert.equal(barbellIds.includes(id), false);
});

test('program: 6일 → PPL 2회전, 대체 후보 존재', () => {
  const p = generateProgram({ goal: 'hypertrophy', experience: 'intermediate', daysPerWeek: 6, equipment: [] }, CAT);
  assert.equal(p.days.length, 6);
  assert.deepEqual(p.days.map((d) => d.templateKey), ['push', 'pull', 'legs', 'push', 'pull', 'legs']);
  // 일부 슬롯엔 대체 후보가 있다(가슴은 3종).
  assert.ok(p.days[0].slots[0].alternatives.length >= 1);
});

// ── 종목 변형(variant) 모델 — SRS-028 ──────────────────────────────
test('variant: 전부 기본 → null(v5 기본버킷과 동일)', () => {
  assert.equal(canonicalVariantKey({}), null);
  assert.equal(canonicalVariantKey({ equipment: null, grip: null, arm: 'bi' }), null); // bi=기본
});
test('variant: 차원 조합 → 고정순서 canonical 키', () => {
  assert.equal(canonicalVariantKey({ equipment: 'hammer' }), 'equip:hammer');
  assert.equal(canonicalVariantKey({ equipment: 'barbell', grip: 'under', arm: 'uni' }), 'equip:barbell|grip:under|arm:uni');
  assert.equal(canonicalVariantKey({ grip: 'neutral' }), 'grip:neutral');
});
test('variant: parse ↔ canonical 왕복', () => {
  const dims = parseVariantKey('equip:barbell|grip:under|arm:uni');
  assert.deepEqual(dims, { equipment: 'barbell', grip: 'under', arm: 'uni' });
  assert.equal(canonicalVariantKey(dims), 'equip:barbell|grip:under|arm:uni');
});
test('variant: 레거시 machine_variant 무손실 승계(hammer→equip:hammer, null→null)', () => {
  const a = legacyMachineVariantToV6('hammer');
  assert.equal(a.key, 'equip:hammer');
  assert.equal(a.dims.equipment, 'hammer');
  // 신규 선택 hammer와 같은 버킷 문자열이어야 과거·신규 기록이 병합된다
  assert.equal(a.key, canonicalVariantKey({ equipment: 'hammer' }));
  assert.equal(legacyMachineVariantToV6(null).key, null);
});

// ── v9 볼륨 — 부분반복(깔짝) 제외·레거시 보조·가중 무시 — SRS-029 ────
test('볼륨: 유효무게=weightKg, 유효반복=reps (레거시 보조·가중·정자세비중 무시)', () => {
  const s = ws(100, 8, { partialReps: 3, loadAdjustKg: -20, strictReps: 5 });
  assert.equal(effectiveWeightKg(s), 100); // loadAdjust 무시
  assert.equal(effectiveReps(s), 8); // strict/partial 무시 — reps 그대로
  assert.equal(setVolumeKg(s), 800); // 100 × 8 (부분반복 3 제외)
});
test('볼륨: 부분반복(깔짝)은 볼륨에 미반영', () => {
  assert.equal(setVolumeKg(ws(50, 10, { partialReps: 5 })), 500);
  assert.equal(setVolumeKg(ws(50, 10)), 500);
});

// ── v10 유산소(cardio) — 시간·거리 변환·표시·볼륨 제외 — SRS-030 ──────
test('유산소: 분↔초 변환(입력·표시)', () => {
  assert.equal(minInputToSec('30'), 1800);
  assert.equal(minInputToSec('30.5'), 1830);
  assert.equal(minInputToSec('0'), null); // 0/빈값=미기록
  assert.equal(minInputToSec(''), null);
  assert.equal(minInputToSec('-5'), null);
  assert.equal(secToMinInput(1800), '30');
  assert.equal(secToMinInput(1830), '30.5');
  assert.equal(secToMinInput(null), '');
  assert.equal(secToMinInput(0), '');
});
test('유산소: km↔미터 변환(입력·표시)', () => {
  assert.equal(kmInputToM('5'), 5000);
  assert.equal(kmInputToM('5.2'), 5200);
  assert.equal(kmInputToM('0'), null);
  assert.equal(kmInputToM(''), null);
  assert.equal(mToKmInput(5000), '5');
  assert.equal(mToKmInput(5200), '5.2');
  assert.equal(mToKmInput(null), '');
});
test('유산소: 세트 요약 포맷(시간·거리 조합)', () => {
  assert.equal(formatCardioSet(1800, 5000), '30:00 · 5km');
  assert.equal(formatCardioSet(1830, 5200), '30:30 · 5.2km'); // 후행 0 정리(입력칸과 통일)
  assert.equal(formatCardioSet(null, 5250), '5.25km');
  assert.equal(formatCardioSet(1800, null), '30:00');
  assert.equal(formatCardioSet(null, 5000), '5km');
  assert.equal(formatCardioSet(null, null), '–');
  assert.equal(formatDurationClock(3661), '1:01:01'); // 1시간 이상
});
test('유산소: 세트 합계(총 시간·거리)', () => {
  const sum = sumCardio([
    { durationSec: 1800, distanceM: 5000 },
    { durationSec: 600, distanceM: 1500 },
    { durationSec: null, distanceM: null },
  ]);
  assert.equal(sum.durationSec, 2400);
  assert.equal(sum.distanceM, 6500);
});
test('유산소: 무게·횟수 0 세트는 볼륨 0(근력 통계 미오염)', () => {
  // 유산소 세트는 weight=0/reps=0으로 저장 → 볼륨/PR에 기여하지 않음
  assert.equal(setVolumeKg(ws(0, 0, { durationSec: 1800, distanceM: 5000 })), 0);
});

// ── 스무고개 트리 커버리지 — SRS-031 (큐레이션 누락·오타 방지) ────
test('스무고개: 서브그룹 있는 부위는 모든 근력 종목을 빠짐없이 분류(오타 종목 없음)', () => {
  const allNames = new Set(SEED_EXERCISES.map((e) => e.nameKo));
  for (const [muscle, subs] of Object.entries(FINDER_TREE)) {
    const covered = new Set(subs.flatMap((s) => s.names));
    // (1) 해당 부위 근력 종목(cardio 제외, primaryMuscles[0]=muscle)이 모두 어느 서브그룹엔가 속함
    const seedOfMuscle = SEED_EXERCISES.filter((e) => !e.kind && e.primaryMuscles[0] === muscle).map((e) => e.nameKo);
    const missing = seedOfMuscle.filter((n) => !covered.has(n));
    assert.deepEqual(missing, [], `${muscle} 미분류: ${missing.join(', ')}`);
    // (2) 트리에 적힌 종목이 실제 시드에 존재(이름 오타 방지)
    const ghost = [...covered].filter((n) => !allNames.has(n));
    assert.deepEqual(ghost, [], `${muscle} 존재하지 않는 종목: ${ghost.join(', ')}`);
    // (3) 서브그룹 key 중복 없음
    const keys = subs.map((s) => s.key);
    assert.equal(new Set(keys).size, keys.length, `${muscle} 서브그룹 key 중복`);
  }
});
