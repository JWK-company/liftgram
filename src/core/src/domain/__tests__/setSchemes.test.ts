// SPEC-041 세트 방식 — 틀 펼치기·판정·운동 중 남은 줄·처방 정리
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPrescribedLoadFills, sanitizePrescriptionValue, SCHEME_IDS } from '../prescription';
import { routineLinePatch, rowsFromRoutineLine, rowHasMeaning } from '../routineSets';
import { isSchemeEdited, remainingSchemeRows, schemeAllowed, schemeOf, schemeRows, SCHEMES } from '../setSchemes';

test('틀 — 모든 세트 방식이 정의돼 있고 줄마다 방식 표시가 붙는다(일반은 표시 없음)', () => {
  assert.deepEqual(SCHEMES.map((s) => s.id), SCHEME_IDS);
  for (const id of SCHEME_IDS) {
    const rows = schemeRows(id, { allowLoad: true });
    assert.ok(rows.length >= 3, id);
    if (id === 'straight') assert.ok(rows.every((r) => r.scheme === undefined && !r.loadBasis));
    else assert.ok(rows.every((r) => r.scheme === id), id);
  }
});

test('탑세트+백오프 — 웜업 2 · 피더 1 · 탑 1 · 백오프 1, 무게는 1RM % 와 탑의 %', () => {
  const rows = schemeRows('topBackoff', { allowLoad: true });
  assert.deepEqual(rows.map((r) => r.setType), ['warmup', 'warmup', 'feeder', 'top', 'backoff']);
  assert.deepEqual(rows.map((r) => [r.loadBasis, r.loadPct]), [
    ['pct1rm', 40],
    ['pct1rm', 60],
    ['pct1rm', 75],
    ['pct1rm', 82],
    ['pctTop', 85],
  ]);
  assert.deepEqual([rows[3].repMin, rows[3].repMax], [3, 5]);
});

test('맨몸·어시스트 — 무게 기준 없이 타입·횟수만', () => {
  const rows = schemeRows('pyramid', { allowLoad: false });
  assert.ok(rows.every((r) => !r.loadBasis && r.loadPct === undefined));
  assert.equal(rows[1].repMin, 10);
});

test('드롭세트 — 마지막 두 줄은 「최대」, 바벨류·맨몸에서는 고를 수 없다', () => {
  const rows = schemeRows('dropSet', { allowLoad: true });
  assert.deepEqual(rows.slice(-2).map((r) => [r.setType, r.amrap, r.repMin]), [
    ['drop', true, null],
    ['drop', true, null],
  ]);
  assert.equal(schemeAllowed('dropSet', 'barbell'), false);
  assert.equal(schemeAllowed('dropSet', 'bodyweight'), false);
  assert.equal(schemeAllowed('dropSet', 'cable'), true);
  assert.equal(schemeAllowed('topBackoff', 'barbell'), true);
});

test('schemeOf · 수정함 — 틀 그대로면 방식, 줄을 고치면 수정함, 섞이면 없음', () => {
  const rows = schemeRows('fiveByFive', { allowLoad: true });
  assert.equal(schemeOf(rows), 'fiveByFive');
  assert.equal(isSchemeEdited(rows, { allowLoad: true }), false);
  const edited = rows.map((r, i) => (i === 4 ? { ...r, repMin: 3, repMax: 3 } : r));
  assert.equal(isSchemeEdited(edited, { allowLoad: true }), true);
  assert.equal(isSchemeEdited(rows.slice(0, -1), { allowLoad: true }), true);
  assert.equal(schemeOf([...rows, { ...rows[0], scheme: undefined }]), null);
  assert.equal(schemeOf(schemeRows('straight', { allowLoad: true })), null);
  assert.equal(schemeOf(null), null);
});

test('운동 중 바꾸기 — 웜업만 했으면 웜업 자리만 빠진다', () => {
  const left = remainingSchemeRows('topBackoff', [{ setType: 'warmup' }], { allowLoad: true });
  assert.deepEqual(left.map((r) => r.setType), ['warmup', 'feeder', 'top', 'backoff']);
});

test('운동 중 바꾸기 — 작업 세트를 했으면 남은 준비 세트(웜업·피더)도 빠진다', () => {
  const left = remainingSchemeRows('dropSet', [{ setType: 'normal' }], { allowLoad: true });
  assert.deepEqual(left.map((r) => r.setType), ['normal', 'drop', 'drop']);
  const none = remainingSchemeRows('pyramid', Array.from({ length: 6 }, () => ({ setType: 'normal' as const })), { allowLoad: true });
  assert.equal(none.length, 0);
});

test('처방 정리 — 피더·최대·방식은 남고 모르는 방식은 버린다', () => {
  const got = sanitizePrescriptionValue([
    { setType: 'feeder', amrap: true, scheme: 'topBackoff' },
    { setType: 'normal', amrap: 'yes', scheme: 'bogus' },
    { SetType: 'feeder', Amrap: true, Scheme: 'pyramid' },
  ]);
  assert.ok(got);
  assert.deepEqual([got[0].setType, got[0].amrap, got[0].scheme], ['feeder', true, 'topBackoff']);
  assert.equal(got[1].amrap, undefined);
  assert.equal(got[1].scheme, undefined);
  assert.deepEqual([got[2].setType, got[2].amrap, got[2].scheme], ['feeder', true, 'pyramid']);
});

test('루틴 저장 왕복 — 세트 방식 표는 저장하고 다시 열어도 같고 수정함이 아니다', () => {
  for (const id of SCHEME_IDS) {
    const rows = schemeRows(id, { allowLoad: true });
    const line = { targetSets: 3, targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 12, prescription: null };
    const saved = routineLinePatch(rows, line, { allowLoad: true });
    const back = rowsFromRoutineLine(saved, { allowLoad: true });
    if (id === 'straight') continue; // 일반은 표시 없는 표 — 블록 값으로 묶인다
    assert.equal(schemeOf(back), id, id);
    assert.equal(isSchemeEdited(back, { allowLoad: true }), false, id);
    assert.ok(rows.some(rowHasMeaning));
  }
});

test('피더를 끝내도 1RM 을 추정해 채우지 않는다(가벼운 준비 세트)', () => {
  const rx = schemeRows('topBackoff', { allowLoad: true });
  const sets = rx.map((_, i) => ({ id: `s${i}`, done: i <= 2, touched: false, loadMultiplier: null }));
  const fills = planPrescribedLoadFills({
    rx,
    sets,
    doneIdx: 2,
    done: { isWarmup: false, isFailed: false, setType: 'feeder' },
    doneCalcKg: 75,
    doneReps: 2,
    has1rm: false,
    equipment: 'barbell',
    unit: 'kg',
  });
  assert.equal(fills.length, 0);
  // 대조군 — 같은 자리의 일반 세트면 1RM 을 추정해 채운다
  const control = planPrescribedLoadFills({
    rx,
    sets,
    doneIdx: 2,
    done: { isWarmup: false, isFailed: false, setType: 'normal' },
    doneCalcKg: 75,
    doneReps: 2,
    has1rm: false,
    equipment: 'barbell',
    unit: 'kg',
  });
  assert.ok(control.length > 0);
});

test('운동 중 바꾸기 — 일반 세트를 했으면 탑은 남기고 백오프를 뺀다(탑의 % 를 채울 근거가 남게)', () => {
  const left = remainingSchemeRows('reversePyramid', [{ setType: 'warmup' }, { setType: 'normal' }], { allowLoad: true });
  assert.deepEqual(left.map((r) => [r.setType, r.loadBasis]), [
    ['top', 'pct1rm'],
    ['backoff', 'pctTop'],
  ]);
  const withTop = remainingSchemeRows('reversePyramid', [{ setType: 'top' }], { allowLoad: true });
  assert.deepEqual(withTop.map((r) => [r.setType, r.loadBasis]), [
    ['backoff', 'pctTop'],
    ['backoff', 'pctTop'],
  ]);
  // isWarmup 만 켜진 세트(타입 칸 없음)는 준비 세트로 센다
  const prep = remainingSchemeRows('topBackoff', [{ setType: 'normal', isWarmup: true }], { allowLoad: true });
  assert.equal(prep[0].setType, 'warmup');
  assert.equal(prep.length, 4);
});

test('저장 왕복 — 블록 횟수를 바꿔도 웜업·피더·드롭 횟수는 그대로 · 「최대」 줄에 옛 횟수가 남지 않는다', () => {
  const rows = schemeRows('fiveByFive', { allowLoad: true });
  const saved = routineLinePatch(rows, { targetSets: 3, targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, prescription: null }, { allowLoad: true });
  const back = rowsFromRoutineLine({ ...saved, targetRepsMin: 3, targetRepsMax: 3 }, { allowLoad: true });
  assert.deepEqual(back.slice(0, 3).map((r) => r.repMin), [5, 3, 2]);
  const drop = schemeRows('dropSet', { allowLoad: true }).map((r) => (r.amrap ? { ...r, repMin: 8 } : r));
  const saved2 = routineLinePatch(drop, { targetSets: 3, targetWeightKg: null, targetRepsMin: null, targetRepsMax: null, prescription: null }, { allowLoad: true });
  assert.ok(saved2.prescription?.filter((r) => r.amrap).every((r) => r.repMin == null));
  assert.equal(isSchemeEdited(rowsFromRoutineLine(saved2, { allowLoad: true }), { allowLoad: true }), false);
});

test('저장 왕복 — 맨몸 표(allowLoad=false)와 일반', () => {
  const rows = schemeRows('pyramid', { allowLoad: false });
  const saved = routineLinePatch(rows, { targetSets: 3, targetWeightKg: null, targetRepsMin: null, targetRepsMax: null, prescription: null }, { allowLoad: false });
  const back = rowsFromRoutineLine(saved, { allowLoad: false });
  assert.equal(schemeOf(back), 'pyramid');
  assert.equal(isSchemeEdited(back, { allowLoad: false }), false);
  const plain = routineLinePatch(schemeRows('straight', { allowLoad: true }), { targetSets: 3, targetWeightKg: null, targetRepsMin: null, targetRepsMax: null, prescription: null }, { allowLoad: true });
  assert.equal(plain.prescription, null);
  assert.deepEqual([plain.targetSets, plain.targetRepsMin, plain.targetRepsMax], [3, 8, 10]);
});

test('REV-076 — 일반 세트는 드롭·탑을 지우지 않는다(5×5 3세트 뒤 드롭세트 → 드롭 둘 · 일반 2세트 뒤 탑+백오프 → 탑 남음)', () => {
  const n = (k: number) => Array.from({ length: k }, () => ({ setType: 'normal' as const }));
  assert.deepEqual(remainingSchemeRows('dropSet', n(3), { allowLoad: true }).map((r) => [r.setType, r.loadPct]), [
    ['drop', 52],
    ['drop', 38],
  ]);
  assert.deepEqual(remainingSchemeRows('topBackoff', n(2), { allowLoad: true }).map((r) => r.setType), ['top']);
  assert.equal(schemeAllowed('dropSet', 'kettlebell'), false);
});

test('REV-076 — 기록 없이 세트 방식 줄을 끝내면 그 줄의 % 로 1RM 을 잡아 같은 % 줄은 같은 무게', () => {
  const rx = schemeRows('fiveByFive', { allowLoad: true });
  const sets = rx.map((_, i) => ({ id: `s${i}`, done: i <= 3, touched: false, loadMultiplier: null }));
  const fills = planPrescribedLoadFills({
    rx,
    sets,
    doneIdx: 3,
    done: { isWarmup: false, isFailed: false, setType: 'normal' },
    doneCalcKg: 100,
    doneReps: 5,
    has1rm: false,
    equipment: 'barbell',
    unit: 'kg',
  });
  assert.equal(fills.length, 4);
  assert.ok(fills.every((f) => f.weightKg === 100));
});
