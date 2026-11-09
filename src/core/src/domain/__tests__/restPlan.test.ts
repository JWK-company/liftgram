// SPEC-051 세트 방식별 휴식 — 다음 세트 기준 규칙 표 · 사람이 정한 칸 값 · 기억 덧씌우기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyRememberedRest,
  kindOfSet,
  restAfterInBlock,
  restBeforeNextSet,
  restOverridesOf,
  restSlotsOf,
  sameRestOverrides,
  withRestOverrides,
  type RestSetKind,
} from '../restPlan';
import { sanitizePrescriptionValue, type PrescribedSet, type SchemeId } from '../prescription';
import { schemeRows } from '../setSchemes';

/** 처방 줄 → 세션 세트(일반·드롭은 타입 칸이 비고 표시로 · 웜업·피더는 웜업 표시) */
function sessionOf(rx: PrescribedSet[]): RestSetKind[] {
  return rx.map((r) => ({
    setType: r.setType === 'normal' || r.setType === 'drop' ? null : r.setType,
    isWarmup: r.setType === 'warmup' || r.setType === 'feeder',
    isDrop: r.setType === 'drop',
    done: false,
  }));
}

/** 앞에서부터 차례로 끝낼 때 각 세트 뒤 휴식 */
function restsInOrder(rx: PrescribedSet[], fallback = 120): number[] {
  const sets = sessionOf(rx);
  const out: number[] = [];
  for (let i = 0; i < sets.length; i++) {
    sets[i].done = true;
    out.push(restBeforeNextSet({ sets, doneIdx: i, rx, fallback }));
  }
  return out;
}

const rows = (id: SchemeId) => schemeRows(id, { allowLoad: true });

test('탑·백오프 — W→W 45 · W→피더 90 · 피더→탑 240 · 탑→백오프 180 · 마지막은 종목 휴식', () => {
  // W40 W60 P75 T82 B
  assert.deepEqual(restsInOrder(rows('topBackoff')), [45, 90, 240, 180, 120]);
});

test('탑·백오프 — 피더 둘이면 피더→피더 90 · 피더 없이 웜업→탑 240 · 백오프 사이 150', () => {
  const tb = rows('topBackoff');
  const twoFeeders = [tb[0], tb[1], tb[2], { ...tb[2] }, tb[3], tb[4], { ...tb[4] }];
  assert.deepEqual(restsInOrder(twoFeeders), [45, 90, 90, 240, 180, 150, 120]);
  const noFeeder = [tb[0], tb[1], tb[3], tb[4]];
  assert.deepEqual(restsInOrder(noFeeder), [45, 240, 180, 120]);
});

test('백오프가 1RM 78% 이상이면 백오프 사이 180', () => {
  const tb = rows('topBackoff');
  const heavy: PrescribedSet[] = [tb[3], tb[4], { ...tb[4], loadBasis: 'pct1rm', loadPct: 80 }];
  assert.deepEqual(restsInOrder(heavy), [180, 180, 120]);
  // 「탑의 %」 — 탑 95% × 85% = 80.75% → 180
  const top95: PrescribedSet = { ...tb[3], loadPct: 95 };
  assert.deepEqual(restsInOrder([top95, tb[4], { ...tb[4] }]), [180, 180, 120]);
});

test('5×5 — 웜업 사이 45 · 마지막 웜업 → 첫 본세트 180 · 본세트 사이 180(종목 휴식이 더 길면 그것)', () => {
  assert.deepEqual(restsInOrder(rows('fiveByFive')), [45, 45, 180, 180, 180, 180, 180, 120]);
  assert.deepEqual(restsInOrder(rows('fiveByFive'), 240), [45, 45, 240, 240, 240, 240, 240, 240]);
});

test('피라미드 — 웜업 → 첫 세트 120 · 120 → 150 → 180(마지막 직전 180)', () => {
  // W 65 72 78 82
  assert.deepEqual(restsInOrder(rows('pyramid')), [120, 120, 150, 180, 120]);
  // 일반 세트 5개 — 120 · 150 · 180(상한) · 마지막 직전 180
  const p = rows('pyramid');
  const five = [p[0], p[1], p[2], { ...p[2] }, p[3], p[4]];
  assert.deepEqual(restsInOrder(five), [120, 120, 150, 180, 180, 120]);
});

test('역피라미드 — 첫(가장 무거운) 세트 직전 180 · 첫 세트 뒤 180 · 그 뒤 150', () => {
  // W40 W60 P75 T82 B90% B80%
  assert.deepEqual(restsInOrder(rows('reversePyramid')), [45, 90, 180, 180, 150, 120]);
});

test('드롭 세트 — 드롭 사이 0(타이머 없음) · 같은 무게 N세트는 종목 휴식 · 묶음 끝은 종목 휴식', () => {
  // W40 70 70 D52 D38
  assert.deepEqual(restsInOrder(rows('dropSet')), [120, 120, 0, 0, 120]);
  assert.deepEqual(restsInOrder(rows('dropSet'), 90), [120, 90, 0, 0, 90]);
});

test('방식 없는 블록은 지금 규칙 그대로 — 마친 세트 타입(웜업 45·탑 180·백오프 120) · 일반은 종목 휴식', () => {
  const rx: PrescribedSet[] = [
    { setType: 'warmup', targetRir: null, repMin: 10, repMax: 10, loadHint: null },
    { setType: 'top', targetRir: null, repMin: 5, repMax: 5, loadHint: null },
    { setType: 'backoff', targetRir: null, repMin: 8, repMax: 8, loadHint: null },
    { setType: 'normal', targetRir: null, repMin: 8, repMax: 8, loadHint: null },
  ];
  assert.deepEqual(restsInOrder(rx), [45, 180, 120, 120]);
  // 처방 없음
  const plain: RestSetKind[] = [{ done: true }, { done: false }];
  assert.equal(restBeforeNextSet({ sets: plain, doneIdx: 0, rx: null, fallback: 100 }), 100);
});

test('다음 세트 = 아직 안 한 첫 세트 — 순서를 건너뛰어 끝내면 그 다음 안 한 세트로', () => {
  const rx = rows('topBackoff');
  const sets = sessionOf(rx);
  // 탑(3)을 먼저 끝냄 → 다음 안 한 세트는 백오프(4) → 180
  sets[3].done = true;
  assert.equal(restBeforeNextSet({ sets, doneIdx: 3, rx, fallback: 120 }), 180);
  // 웜업(0)을 끝냄 → 다음 안 한 세트는 W60(1) → 45
  sets[0].done = true;
  assert.equal(restBeforeNextSet({ sets, doneIdx: 0, rx, fallback: 120 }), 45);
});

test('사람이 정한 칸 값이 먼저 — 최소값 규칙보다도', () => {
  const rx = withRestOverrides(rows('topBackoff'), { beforeTop: 270, afterTop: 150 });
  assert.deepEqual(restsInOrder(rx), [45, 90, 270, 150, 120]);
  // 5×5 본세트 사이를 120 으로(최소 180 규칙보다 사람 값)
  const fb = withRestOverrides(rows('fiveByFive'), { work: 120 });
  assert.deepEqual(restsInOrder(fb), [45, 45, 120, 120, 120, 120, 120, 120]);
  // 피라미드 시작 값을 90 으로 → 90 · 120 · 150
  const py = withRestOverrides(rows('pyramid'), { ramp: 90 });
  assert.deepEqual(restsInOrder(py), [120, 90, 120, 150, 120]);
  // 0 = 쉬지 않음
  const zero = withRestOverrides(rows('topBackoff'), { warmup: 0 });
  assert.equal(restsInOrder(zero)[0], 0);
});

test('칸 값 읽기·쓰기 왕복 · 같은 칸 줄 전부에 · 권장값으로(빈 맵) 지움', () => {
  const rx = withRestOverrides(rows('fiveByFive'), { warmup: 60, work: 150 });
  assert.equal(rx[0].rest, undefined); // 첫 줄은 직전 휴식이 없다
  assert.equal(rx[1].rest, 60);
  assert.equal(rx[2].rest, 60);
  assert.equal(rx[3].rest, undefined); // 첫 본세트 직전 — 맵에 없음
  assert.deepEqual(rx.slice(4).map((r) => r.rest), [150, 150, 150, 150]);
  assert.ok(sameRestOverrides(restOverridesOf(rx), { warmup: 60, work: 150 }));
  const cleared = withRestOverrides(rx, {});
  assert.ok(cleared.every((r) => r.rest === undefined));
  assert.deepEqual(restOverridesOf(cleared), {});
  // 방식이 없는 처방은 쓰지 않는다
  const plain: PrescribedSet[] = [{ setType: 'normal', targetRir: null, repMin: 8, repMax: 8, loadHint: null }, { setType: 'normal', targetRir: null, repMin: 8, repMax: 8, loadHint: null }];
  assert.deepEqual(withRestOverrides(plain, { work: 100 }).map((r) => r.rest), [undefined, undefined]);
});

test('시트 칸 — 그 처방에 나오는 칸만 · 권장값 · 바꾼 표시', () => {
  const tb = restSlotsOf(rows('topBackoff'), 120);
  assert.deepEqual(tb.map((r) => [r.slot, r.def]), [['warmup', 45], ['feeder', 90], ['beforeTop', 240], ['afterTop', 180]]);
  const tb2 = restSlotsOf(withRestOverrides(rows('topBackoff'), { beforeTop: 270 }), 120);
  assert.deepEqual(tb2.find((r) => r.slot === 'beforeTop'), { slot: 'beforeTop', def: 240, value: 270, changed: true });
  assert.deepEqual(restSlotsOf(rows('fiveByFive'), 120).map((r) => [r.slot, r.def]), [['warmup', 45], ['beforeWork', 180], ['work', 180]]);
  assert.deepEqual(restSlotsOf(rows('pyramid'), 120).map((r) => [r.slot, r.def]), [['beforeWork', 120], ['ramp', 120]]);
  assert.deepEqual(restSlotsOf(rows('reversePyramid'), 120).map((r) => [r.slot, r.def]), [['warmup', 45], ['feeder', 90], ['beforeTop', 180], ['afterTop', 180], ['backoff', 150]]);
  assert.deepEqual(restSlotsOf(rows('dropSet'), 120).map((r) => r.slot), ['beforeWork']);
  assert.deepEqual(restSlotsOf(null, 120), []);
  assert.deepEqual(restSlotsOf(rows('straight'), 120), []); // 「일반」은 표시가 없다 — 시트 한 줄
});

test('기억 덧씌우기 — 자기 값이 없을 때만 · 방식 없는 처방은 그대로', () => {
  const fresh = rows('topBackoff');
  const got = applyRememberedRest(fresh, { beforeTop: 270 });
  assert.equal(got?.[3].rest, 270);
  const own = withRestOverrides(rows('topBackoff'), { afterTop: 200 });
  assert.equal(applyRememberedRest(own, { beforeTop: 270 }), own);
  assert.equal(applyRememberedRest(null, { beforeTop: 270 }), null);
  assert.equal(applyRememberedRest(fresh, {}), fresh);
});

test('처방 정리 — rest 0~900 정수만 남는다 · 옛 키 Rest 도 읽는다', () => {
  const rx = sanitizePrescriptionValue([
    { setType: 'top', rest: 270.4, scheme: 'topBackoff' },
    { setType: 'backoff', rest: 1200 },
    { setType: 'backoff', rest: -5 },
    { setType: 'backoff', Rest: 60 },
  ]);
  assert.deepEqual(rx?.map((r) => r.rest), [270, undefined, undefined, 60]);
});

test('kindOfSet — 타입 칸 우선 · 비면 드롭·웜업 표시', () => {
  assert.equal(kindOfSet({ setType: 'feeder', isWarmup: true }), 'feeder');
  assert.equal(kindOfSet({ setType: null, isDrop: true }), 'drop');
  assert.equal(kindOfSet({ setType: null, isWarmup: true }), 'warmup');
  assert.equal(kindOfSet({}), 'normal');
});

test('끝낼 때 루틴에 반영 — 방식이 같고 칸 값이 다르면 「세트별 휴식」 · 반영하면 루틴 줄 처방에 · 방식 바꾸기엔 새 틀에 실림', async () => {
  const { diffRoutine, planRoutineApply } = await import('../routineDiff');
  const rx = rows('topBackoff');
  const line = {
    id: 'r1', exerciseId: 'a', targetSets: 5, sortOrder: 0, supersetGroup: null,
    hasPrescription: true, prescribedWarmups: 3, scheme: 'topBackoff' as const, prescription: rx,
  };
  const block = {
    id: 'w1', exerciseId: 'a', routineExerciseId: 'r1', sortOrder: 0, supersetGroup: null,
    doneSets: 5, doneWorkingSets: 2, workingReps: [5, 8], isCardio: false, targetRepsMin: null, targetRepsMax: null,
    restSeconds: 120, scheme: 'topBackoff' as const, schemeAllowLoad: true, equipment: 'barbell',
    restOverrides: { beforeTop: 270 },
  };
  const plan = diffRoutine('R', [line], [block]);
  const c = plan.changes.find((x) => x.kind === 'rest');
  assert.ok(c && c.defaultOn);
  const u = planRoutineApply(plan, new Set([c.id])).updates[0];
  assert.equal(u.prescription?.[3].rest, 270);
  assert.ok(sameRestOverrides(restOverridesOf(u.prescription), { beforeTop: 270 }));
  assert.equal(planRoutineApply(plan, new Set()).updates[0].prescription, undefined);
  // 같으면 항목 없음
  assert.equal(diffRoutine('R', [{ ...line, prescription: withRestOverrides(rx, { beforeTop: 270 }) }], [block]).changes.length, 0);
  // 방식을 바꿨으면 「세트별 휴식」 대신 새 틀에 칸 값이 실린다
  const p2 = diffRoutine('R', [line], [{ ...block, scheme: 'reversePyramid' as const }]);
  assert.deepEqual(p2.changes.map((x) => x.kind), ['scheme']);
  const u2 = planRoutineApply(p2, new Set(['scheme:r1'])).updates[0];
  assert.equal(restOverridesOf(u2.prescription).beforeTop, 270);
});

// ── SPEC-051 리뷰 반영 ────────────────────────────────────────────────────

const dropRx = (): PrescribedSet[] =>
  [60, 60, 85].map((pct) => ({
    setType: 'normal' as const, targetRir: null, repMin: 8, repMax: 8, loadHint: null,
    loadBasis: 'pct1rm' as const, loadPct: pct, scheme: 'dropSet' as const,
  }));

test('1RM % 짝은 세트 번호 순 자리(refillable 과 같다) — 세트를 지우면 자리대로 · 더한 세트는 짝 없음', () => {
  const rx = dropRx();
  const three: RestSetKind[] = [{ done: true }, { done: false }, { done: false }];
  assert.equal(restBeforeNextSet({ sets: three, doneIdx: 0, rx, fallback: 120 }), 120); // 다음 60%
  three[1].done = true;
  assert.equal(restBeforeNextSet({ sets: three, doneIdx: 1, rx, fallback: 120 }), 180); // 다음 85% → 무겁다
  // 가운데 세트를 지워 두 세트 — 둘째 세트의 짝은 rx[1](60%) · 처방 줄이 남아도 자리로만 맞춘다
  const two: RestSetKind[] = [{ done: true }, { done: false }];
  assert.equal(restBeforeNextSet({ sets: two, doneIdx: 0, rx, fallback: 120 }), 120);
  // 세트를 더해 처방보다 많다 — 넷째 세트는 짝이 없어 무겁다고 보지 않는다
  const four: RestSetKind[] = [{ done: true }, { done: true }, { done: true }, { done: false }];
  assert.equal(restBeforeNextSet({ sets: four, doneIdx: 2, rx, fallback: 120 }), 120);
});

test('드롭 앞 0초는 처방 줄도 드롭일 때만 — 손으로 드롭 표시한 세트는 종목 휴식 · 처방 드롭인데 표시를 끈 세트도', () => {
  const rx = dropRx(); // 셋 다 일반 줄
  const handDrop: RestSetKind[] = [{ done: true }, { isDrop: true, done: false }, { done: false }];
  assert.equal(restBeforeNextSet({ sets: handDrop, doneIdx: 0, rx, fallback: 100 }), 100);
  // 방식 처방의 드롭 줄 + 드롭 세트 → 0
  const ds = rows('dropSet'); // W40 70 70 D52 D38
  const sets = sessionOf(ds);
  sets[2].done = true;
  assert.equal(restBeforeNextSet({ sets, doneIdx: 2, rx: ds, fallback: 100 }), 0);
  // 처방 드롭 줄이지만 세트의 드롭 표시를 껐다 → 종목 휴식
  const off = sessionOf(ds);
  off[3].isDrop = false;
  off[2].done = true;
  assert.equal(restBeforeNextSet({ sets: off, doneIdx: 2, rx: ds, fallback: 100 }), 100);
});

test('세트 추가·삭제 뒤 판정 — 탑·백오프에 백오프를 더하면 백오프 사이 150 · 피더를 지우면 웜업 → 탑 240', () => {
  const tb = rows('topBackoff'); // W40 W60 P75 T82 B
  // 백오프 하나 더(처방 줄은 그대로 5줄 — 세트만 6개)
  const sets = [...sessionOf(tb), { setType: 'backoff', done: false }];
  for (let i = 0; i <= 4; i++) sets[i].done = true;
  assert.equal(restBeforeNextSet({ sets, doneIdx: 4, rx: tb, fallback: 120 }), 150);
  // 피더(2)를 지움 — W60 다음이 탑
  const noFeeder = sessionOf(tb).filter((_, i) => i !== 2);
  noFeeder[0].done = true;
  noFeeder[1].done = true;
  assert.equal(restBeforeNextSet({ sets: noFeeder, doneIdx: 1, rx: tb, fallback: 120 }), 240);
  // 사람이 정한 탑 직전 값은 세트를 지운 뒤에도 그 칸으로 읽힌다
  const mine = withRestOverrides(tb, { beforeTop: 300 });
  assert.equal(restBeforeNextSet({ sets: noFeeder, doneIdx: 1, rx: mine, fallback: 120 }), 300);
});

test('잠금 카드 스냅숏 restAfterSec — 세트 방식은 다음 세트 기준 · 드롭 앞 0 · 일반 블록은 종목 휴식', async () => {
  const { buildLockSnapshot } = await import('../lockScreen');
  type LSet = Parameters<typeof buildLockSnapshot>[0]['blocks'][number]['sets'][number];
  const mk = (weId: string, kinds: RestSetKind[]): LSet[] =>
    kinds.map((k, i) => ({
      id: `${weId}${i}`, setNumber: i + 1, done: false, isWarmup: k.isWarmup ?? false, isDrop: k.isDrop ?? false,
      isFailed: false, setType: k.setType ?? null, weightKg: 50, reps: 5, touched: true, loadMultiplier: null,
      userEdited: true, valueSource: null,
    }));
  const tb = rows('topBackoff');
  const ds = rows('dropSet');
  const A = { weId: 'A', rx: tb, has1rm: true, equipment: 'barbell', unit: 'kg' as const, exerciseName: 'A', restSec: 120, sets: mk('A', sessionOf(tb)) };
  const B = { weId: 'B', rx: ds, has1rm: true, equipment: 'dumbbell', unit: 'kg' as const, exerciseName: 'B', restSec: 90, sets: mk('B', sessionOf(ds)) };
  const snap = buildLockSnapshot({
    sessionId: 'W', title: 't',
    rows: [{ kind: 'single', block: { weId: 'A', sets: A.sets } }, { kind: 'single', block: { weId: 'B', sets: B.sets } }],
    blocks: [A, B],
    rest: { endsAt: null, totalSec: null, setAt: 0, by: 'web' },
    appliedThroughSeq: 0, storeId: 'S', dbEpoch: 'E', paused: false,
    sound: { enabled: true, preset: 'bell', volume: 2 }, now: 1,
    restAfter: (s, b) => restAfterInBlock(b, s.id),
  });
  // A: W→W 45 · W→P 90 · P→T 240 · T→B 180 · 끝 120 / B: W→70 120 · 70→70 90 · 70→D 0 · D→D 0 · 끝 90
  assert.deepEqual(snap.steps.map((x) => x.restAfterSec), [45, 90, 240, 180, 120, 120, 90, 0, 0, 90]);
  // 블록에 없는 세트 → 종목 휴식
  assert.equal(restAfterInBlock({ sets: [], rx: tb, restSec: 77 }, 'x'), 77);
});

test('루틴에 반영 — 기억으로 실린 값(루틴 줄엔 없음 · 오늘 값 = 기억값)은 띄우지 않고 오늘 바꾼 값만 띄운다', async () => {
  const { diffRoutine } = await import('../routineDiff');
  const rx = rows('topBackoff');
  const line = {
    id: 'r1', exerciseId: 'a', targetSets: 5, sortOrder: 0, supersetGroup: null,
    hasPrescription: true, prescribedWarmups: 3, scheme: 'topBackoff' as const, prescription: rx,
  };
  const block = {
    id: 'w1', exerciseId: 'a', routineExerciseId: 'r1', sortOrder: 0, supersetGroup: null,
    doneSets: 5, doneWorkingSets: 2, workingReps: [5, 8], isCardio: false, targetRepsMin: null, targetRepsMax: null,
    restSeconds: 120, scheme: 'topBackoff' as const, schemeAllowLoad: true, equipment: 'barbell',
    restOverrides: { beforeTop: 270 }, restRemembered: { beforeTop: 270 },
  };
  const kinds = (b: typeof block) => diffRoutine('R', [line], [b]).changes.map((x) => x.kind);
  assert.deepEqual(kinds(block), []); // 안 바꿈 — 기억 그대로
  assert.deepEqual(kinds({ ...block, restOverrides: { beforeTop: 300 } }), ['rest']); // 오늘 바꿈
  assert.deepEqual(kinds({ ...block, restOverrides: { beforeTop: 270, afterTop: 200 } }), ['rest']);
  assert.deepEqual(kinds({ ...block, restRemembered: null }), ['rest']); // 기억이 없으면 그대로 비교
  // 루틴 줄에 자기 값이 있으면 기억은 실리지 않았다 — 루틴 값과 비교
  const own = { ...line, prescription: withRestOverrides(rx, { beforeTop: 200 }) };
  assert.deepEqual(diffRoutine('R', [own], [block]).changes.map((x) => x.kind), ['rest']);
});
