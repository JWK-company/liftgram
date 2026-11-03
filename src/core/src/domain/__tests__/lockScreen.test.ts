// 잠금화면 카드 순수 규칙(SPEC-017 Phase 2 · SRS-096) — §4 순서 규칙 표 · §5 시뮬레이션 · §6 rebase · §7 LWW · §8 출처
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  acceptSnapshot,
  alreadyApplied,
  buildLockSnapshot,
  buildLockSteps,
  canForgetAcked,
  clampCompletedAt,
  groupSessionRows,
  judgeLockAction,
  lockNeedsOpenApp,
  lockRoundOf,
  mergeRest,
  planLockQueueValues,
  queueStalled,
  rebaseLockQueue,
  restRemainingSec,
  sameAtDisplayPrecision,
  planRoundFills,
  encodeValueSource,
  decodeValueSource,
  effectiveValueSource,
  withFieldSource,
  weakestValueSource,
  type LockRowInput,
  type LockSetInput,
  type LockSnapshotBlock,
  type RestState,
  type SimBlock,
  type SimSet,
} from '../lockScreen';
import type { PrescribedSet } from '../prescription';

// 세트 표기: '1' 일반 · 'W' 워밍업 · 'D' 드롭 · 'F' 실패 · 'T' 탑셋 · 'B' 백오프 — 뒤에 ✓ 면 완료
function block(weId: string, spec: string[]): { weId: string; sets: LockSetInput[] } {
  return {
    weId,
    sets: spec.map((t, i) => {
      const done = t.endsWith('✓');
      const k = t.replace('✓', '');
      return {
        id: `${weId}${k}${i}`,
        setNumber: i + 1,
        done,
        isWarmup: k === 'W',
        isDrop: k === 'D',
        isFailed: k.endsWith('F'),
        setType: k === 'T' ? 'top' : k === 'B' ? 'backoff' : null,
      };
    }),
  };
}
const ids = (b: { sets: LockSetInput[] }) => b.sets.map((s) => s.id);
const group = (...members: { weId: string; sets: LockSetInput[] }[]): LockRowInput => ({ kind: 'group', members });
const single = (b: { weId: string; sets: LockSetInput[] }): LockRowInput => ({ kind: 'single', block: b });
const stepsOf = (rows: LockRowInput[]) => buildLockSteps(rows).map((s) => s.setIds);

test('§4 워밍업 한쪽만 — [B-W] → [A1,B1] → [A2,B2]', () => {
  const A = block('A', ['1', '2']);
  const B = block('B', ['W', '1', '2']);
  const [a1, a2] = ids(A);
  const [bw, b1, b2] = ids(B);
  assert.deepEqual(stepsOf([group(A, B)]), [[bw], [a1, b1], [a2, b2]]);
});

test('§4 한 멤버만 완료 — [B1] → [A2,B2] · 라운드 기준에는 완료한 짝도 들어간다', () => {
  const A = block('A', ['1✓', '2']);
  const B = block('B', ['1', '2']);
  const [a1, a2] = ids(A);
  const [b1, b2] = ids(B);
  const plan = buildLockSteps([group(A, B)]);
  assert.deepEqual(plan.map((s) => s.setIds), [[b1], [a2, b2]]);
  assert.deepEqual(plan[0].roundSetIds, [a1, b1]);
});

test('§4 이웃 아닌 멤버 — 묶음은 첫 멤버 자리에 한 줄(groupSessionRows) · C 는 그 뒤', () => {
  const rows = groupSessionRows([
    { id: 'A', supersetGroup: 'g' },
    { id: 'C', supersetGroup: null },
    { id: 'B', supersetGroup: 'g' },
  ]);
  assert.deepEqual(
    rows.map((r) => (r.kind === 'group' ? r.members.map((m) => m.id).join('+') : r.we.id)),
    ['A+B', 'C'],
  );
  const A = block('A', ['1']);
  const B = block('B', ['1']);
  const C = block('C', ['1']);
  assert.deepEqual(stepsOf([group(A, B), single(C)]), [[ids(A)[0], ids(B)[0]], [ids(C)[0]]]);
});

test('§4 드롭 사이 — [A1,B1] → [A-D] → [A2,B2]', () => {
  const A = block('A', ['1', 'D', '2']);
  const B = block('B', ['1', '2']);
  const [a1, ad, a2] = ids(A);
  const [b1, b2] = ids(B);
  assert.deepEqual(stepsOf([group(A, B)]), [[a1, b1], [ad], [a2, b2]]);
});

test('§4 뒤만 완료 — 블록의 첫 미완료부터 [A1] → [A3]', () => {
  const A = block('A', ['1', '2✓', '3']);
  const [a1, , a3] = ids(A);
  assert.deepEqual(stepsOf([single(A)]), [[a1], [a3]]);
});

// [원본] 위치 기준 [AT,B1] → [AB1,B2] → [AB2,B3] — 화면 묶음 완료(짝 키)와 짝이 달랐다(REV-005 도메인 M-3)
test('§4 탑셋+백오프 묶음 — 화면과 같은 짝 키: [AT] → [A백오프1,B1] → [A백오프2,B2] → [B3]', () => {
  const A = block('A', ['T', 'B', 'B']);
  const B = block('B', ['1', '2', '3']);
  const [at, ab1, ab2] = ids(A);
  const [b1, b2, b3] = ids(B);
  assert.deepEqual(stepsOf([group(A, B)]), [[at], [ab1, b1], [ab2, b2], [b3]]);
  assert.deepEqual(lockRoundOf([A, B], ab1), [ab1, b1]);
  assert.deepEqual(lockRoundOf([A, B], at), [at]);
});

test('§4 멤버 1개 묶음 · 빈 블록', () => {
  const A = block('A', ['1', '2']);
  assert.deepEqual(stepsOf([group(A)]), [[ids(A)[0]], [ids(A)[1]]]);
  assert.deepEqual(stepsOf([single(block('E', []))]), []);
});

test('§4 멤버 3개 — [A1,B1,C1] → [A2,B2]', () => {
  const A = block('A', ['1', '2']);
  const B = block('B', ['1', '2']);
  const C = block('C', ['1']);
  assert.deepEqual(stepsOf([group(A, B, C)]), [
    [ids(A)[0], ids(B)[0], ids(C)[0]],
    [ids(A)[1], ids(B)[1]],
  ]);
});

test('§4 실패로 짝 밀림 — [A1,B1] → [A-2F] → [A3,B2] → [B3]', () => {
  const A = block('A', ['1', '2F', '3']);
  const B = block('B', ['1', '2', '3']);
  const [a1, af, a3] = ids(A);
  const [b1, b2, b3] = ids(B);
  assert.deepEqual(stepsOf([group(A, B)]), [[a1, b1], [af], [a3, b2], [b3]]);
  assert.deepEqual(lockRoundOf([A, B], a3), [a3, b2]);
  assert.deepEqual(lockRoundOf([A, B], af), [af]);
});

test('§4 12단계 상한 — 묶음 한 단계는 1로 센다', () => {
  const A = block('A', Array.from({ length: 10 }, () => '1'));
  const B = block('B', Array.from({ length: 10 }, () => '1'));
  const C = block('C', Array.from({ length: 5 }, () => '1'));
  const plan = buildLockSteps([group(A, B), single(C)]);
  assert.equal(plan.length, 12);
  assert.equal(plan[9].setIds.length, 2);
  assert.equal(plan[11].setIds.length, 1);
});

// ── §5 시뮬레이션 ──

function simBlock(
  weId: string,
  rows: { kg: number; reps: number; type?: 'warmup' | 'top' | 'backoff'; done?: boolean; touched?: boolean; mult?: number }[],
  rx: PrescribedSet[] | null,
  extra: Partial<SimBlock> = {},
): SimBlock {
  return {
    weId,
    rx,
    has1rm: false,
    equipment: 'barbell',
    unit: 'kg',
    ...extra,
    sets: rows.map(
      (r, i): SimSet => ({
        id: `${weId}${i + 1}`,
        setNumber: i + 1,
        done: r.done ?? false,
        isWarmup: r.type === 'warmup',
        setType: r.type ?? null,
        weightKg: r.kg,
        reps: r.reps,
        touched: r.touched ?? false,
        loadMultiplier: r.mult ?? null,
      }),
    ),
  };
}
const rxRow = (p: Partial<PrescribedSet>): PrescribedSet => ({ setType: 'normal', repMin: 5, repMax: 5, ...p }) as PrescribedSet;

test('§5 탑셋 → 백오프: 탑셋을 완료한 결과(%)가 다음 단계 기대값이 된다', () => {
  const rx = [rxRow({ setType: 'top' }), rxRow({ setType: 'backoff', loadBasis: 'pctTop', loadPct: 90 }), rxRow({ setType: 'backoff', loadBasis: 'pctTop', loadPct: 80 })];
  const A = simBlock('A', [{ kg: 100, reps: 5, type: 'top' }, { kg: 20, reps: 5, type: 'backoff' }, { kg: 20, reps: 5, type: 'backoff' }], rx);
  const steps = buildLockSteps([single({ weId: 'A', sets: A.sets })]);
  const out = planLockQueueValues([A], steps);
  assert.equal(out.get('A1')?.weightKg, 100);
  assert.equal(out.get('A2')?.weightKg, 90);
  assert.equal(out.get('A3')?.weightKg, 80);
  // 입력을 바꾸지 않는다
  assert.equal(A.sets[1].weightKg, 20);
});

test('§5 pct1rm 연쇄 — 기록 없는 블록은 완료마다 다시 채워진다(첫 세트 → 뒤 세트 %)', () => {
  const rx = [rxRow({ loadBasis: 'pct1rm', loadPct: 70 }), rxRow({ loadBasis: 'pct1rm', loadPct: 75 })];
  const A = simBlock('A', [{ kg: 60, reps: 10 }, { kg: 20, reps: 8 }], rx, { has1rm: false });
  const out = planLockQueueValues([A], buildLockSteps([single({ weId: 'A', sets: A.sets })]));
  assert.equal(out.get('A1')?.weightKg, 60);
  // 60×10 → 1RM 80(Epley) × 75% = 60 → 바벨 2.5 반올림 60(REV-005 테스트 L-2: 정확한 값으로)
  assert.equal(out.get('A2')?.weightKg, 60);
});

test('§5 사람이 고친 세트는 채우지 않는다 · 한쪽 입력(배수 2)은 한쪽 값', () => {
  const rx = [rxRow({ setType: 'top' }), rxRow({ setType: 'backoff', loadBasis: 'pctTop', loadPct: 90 }), rxRow({ setType: 'backoff', loadBasis: 'pctTop', loadPct: 80 })];
  const A = simBlock(
    'A',
    [{ kg: 50, reps: 5, type: 'top', mult: 2 }, { kg: 30, reps: 5, type: 'backoff', touched: true, mult: 2 }, { kg: 10, reps: 5, type: 'backoff', mult: 2 }],
    rx,
  );
  const out = planLockQueueValues([A], buildLockSteps([single({ weId: 'A', sets: A.sets })]));
  assert.equal(out.get('A2')?.weightKg, 30);
  assert.equal(out.get('A3')?.weightKg, 40); // 100 × 80% = 80 → 한쪽 40
});

test('§5 묶음 완료 멤버 재채우기 — 라운드의 이미 완료한 짝으로도 그 블록 다음 세트를 채운다(planRoundFills)', () => {
  const rx = [rxRow({ setType: 'top' }), rxRow({ setType: 'backoff', loadBasis: 'pctTop', loadPct: 90 })];
  const A = simBlock('A', [{ kg: 100, reps: 5, type: 'top', done: true }, { kg: 20, reps: 5, type: 'backoff' }], rx);
  const B = simBlock('B', [{ kg: 40, reps: 10 }, { kg: 40, reps: 10 }], null);
  // 라운드 = [AT(완료), B1] 이라면 B1 을 완료할 때 AT 로도 A 의 백오프를 다시 채운다
  const fills = planRoundFills([A, B], ['A1', 'B1']);
  assert.deepEqual(
    fills.map((f) => [f.setLogId, f.weightKg]),
    [['A2', 90]],
  );
});

test('§5 슈퍼셋 멤버 무게가 달라도 블록별로 따로 계산된다', () => {
  const rx = [rxRow({ setType: 'top' }), rxRow({ setType: 'backoff', loadBasis: 'pctTop', loadPct: 50 })];
  const A = simBlock('A', [{ kg: 100, reps: 5, type: 'top' }, { kg: 1, reps: 5, type: 'backoff' }], rx);
  const B = simBlock('B', [{ kg: 60, reps: 5, type: 'top' }, { kg: 1, reps: 5, type: 'backoff' }], rx);
  const steps = buildLockSteps([group({ weId: 'A', sets: A.sets }, { weId: 'B', sets: B.sets })]);
  const out = planLockQueueValues([A, B], steps);
  assert.equal(out.get('A2')?.weightKg, 50);
  assert.equal(out.get('B2')?.weightKg, 30);
});

test('§5 표시 정밀도 비교 — lb 반올림의 미세 차이는 같다, 진짜 다른 값은 다르다', () => {
  const lb = 0.45359237;
  assert.ok(sameAtDisplayPrecision({ weightKg: 100 * lb, reps: 8, seconds: null }, { weightKg: 100 * lb + 0.0001, reps: 8, seconds: null }, 'lb'));
  assert.ok(!sameAtDisplayPrecision({ weightKg: 80, reps: 8, seconds: null }, { weightKg: 82.5, reps: 8, seconds: null }, 'kg'));
  assert.ok(!sameAtDisplayPrecision({ weightKg: 80, reps: 8, seconds: null }, { weightKg: 80, reps: 7, seconds: null }, 'kg'));
});

// ── §6 rebase · 워터마크 · 판정 ──

test('§6 rebase — id 기반: 아직 스냅샷에 없는 조작의 세트만 뺀다(H-1 시나리오)', () => {
  const steps = [{ setIds: ['a', 'b'] }, { setIds: ['c'] }, { setIds: ['d'] }];
  // seq 5 는 이미 스냅샷에 들어갔다(appliedThroughSeq 5) — 다시 빼면 엉뚱한 단계가 사라진다
  const out = rebaseLockQueue(steps, 5, [
    { seq: 5, setIds: ['c'] },
    { seq: 6, setIds: ['a'] },
  ]);
  assert.deepEqual(out.map((s) => s.setIds), [['b'], ['c'], ['d']]);
  // 겹치는 것이 없으면(이미 화면에서 처리됨) 그대로
  assert.deepEqual(rebaseLockQueue(steps, 0, [{ seq: 1, setIds: ['zz'] }]), steps);
  // 단계가 비면 지운다
  assert.deepEqual(rebaseLockQueue(steps, 0, [{ seq: 1, setIds: ['c'] }]).map((s) => s.setIds), [['a', 'b'], ['d']]);
});

test('§6 해제 보존(H-3) — 워터마크 이하 조작은 다시 적용하지 않는다 · storeId 가 다르면 워터마크 0', () => {
  const wm = { storeId: 'S1', dbEpoch: 'E1', seq: 7 };
  assert.equal(alreadyApplied({ storeId: 'S1', seq: 7 }, wm, 'E1'), true);
  assert.equal(alreadyApplied({ storeId: 'S1', seq: 8 }, wm, 'E1'), false);
  assert.equal(alreadyApplied({ storeId: 'S2', seq: 3 }, wm, 'E1'), false);
  assert.equal(alreadyApplied({ storeId: 'S1', seq: 3 }, wm, 'E2'), false);
  assert.equal(alreadyApplied({ storeId: 'S1', seq: 3 }, null, 'E1'), false);
});

test('§6 ack 먼저 도착 · 거꾸로 가는 스냅샷', () => {
  assert.equal(canForgetAcked({ seq: 9 }, { appliedThroughSeq: 8 }), false);
  assert.equal(canForgetAcked({ seq: 9 }, { appliedThroughSeq: 9 }), true);
  assert.equal(canForgetAcked({ seq: 9 }, null), false);
  assert.equal(acceptSnapshot({ appliedThroughSeq: 9 }, { appliedThroughSeq: 8 }), false);
  assert.equal(acceptSnapshot({ appliedThroughSeq: 9 }, { appliedThroughSeq: 9 }), true);
  assert.equal(acceptSnapshot(null, { appliedThroughSeq: 0 }), true);
  // 저장소·웹 DB·세션이 바뀌면 0 부터인 스냅샷도 받는다(REV-005 도메인 M-5)
  const cur = { appliedThroughSeq: 9, storeId: 'S', dbEpoch: 'E', sessionId: 'W' };
  assert.equal(acceptSnapshot(cur, { ...cur, appliedThroughSeq: 0, dbEpoch: 'E2' }), true);
  assert.equal(acceptSnapshot(cur, { ...cur, appliedThroughSeq: 0, sessionId: 'W2' }), true);
  assert.equal(acceptSnapshot(cur, { ...cur, appliedThroughSeq: 0, storeId: 'S2' }), true);
  assert.equal(acceptSnapshot(cur, { ...cur, appliedThroughSeq: 8 }), false);
});

test('§6 판정 — noop · discarded · 짝이 바뀌어도 apply', () => {
  const sets = new Map([
    ['a', { done: true, sessionId: 'W' }],
    ['b', { done: false, sessionId: 'W' }],
    ['x', { done: false, sessionId: 'OTHER' }],
  ]);
  const base = { activeSessionId: 'W', sessionActive: true, epochMatches: true, sets };
  const j = (o: Partial<typeof base> & { action: { sessionId: string; setIds: string[] } }) => judgeLockAction({ ...base, ...o });
  assert.deepEqual(j({ action: { sessionId: 'W', setIds: ['a'] } }), { verdict: 'noop', setIds: ['a'] });
  assert.deepEqual(j({ action: { sessionId: 'W', setIds: ['a', 'b'] } }), { verdict: 'apply', setIds: ['a', 'b'] });
  // 묶음 일부만 지워졌으면 남은 세트만 완료(REV-005 도메인 M-6)
  assert.deepEqual(j({ action: { sessionId: 'W', setIds: ['gone', 'b'] } }), { verdict: 'apply', setIds: ['b'] });
  assert.equal(j({ action: { sessionId: 'W', setIds: ['gone'] } }).verdict, 'discarded');
  assert.equal(j({ action: { sessionId: 'W', setIds: ['x'] } }).verdict, 'discarded');
  assert.equal(j({ action: { sessionId: 'OLD', setIds: ['b'] } }).verdict, 'discarded');
  assert.equal(j({ epochMatches: false, action: { sessionId: 'W', setIds: ['b'] } }).verdict, 'discarded');
  assert.equal(j({ sessionActive: false, action: { sessionId: 'W', setIds: ['b'] } }).verdict, 'discarded');
});

test('§6 시각 자르기 · 대기열 멈춤', () => {
  assert.equal(clampCompletedAt(50, 100, 200), 100);
  assert.equal(clampCompletedAt(500, 100, 200), 200);
  assert.equal(clampCompletedAt(150, 100, 200), 150);
  assert.equal(clampCompletedAt(Number.NaN, 100, 200), 200);
  assert.equal(queueStalled([], 1e6), false);
  assert.equal(queueStalled([1e6 - 61_000], 1e6), true);
  assert.equal(queueStalled([1e6 - 59_000], 1e6), false);
  assert.equal(queueStalled(Array.from({ length: 31 }, () => 1e6), 1e6), true);
  assert.equal(queueStalled(Array.from({ length: 30 }, () => 1e6), 1e6), false);
  assert.equal(queueStalled([1e6 - 60_000], 1e6), false);
});

// ── §7 휴식 LWW ──

test('§7 LWW — setAt 늦은 쪽 · 같으면 native · 시간 만료는 쓰기가 아니다', () => {
  const web: RestState = { endsAt: 1000, totalSec: 90, setAt: 10, by: 'web' };
  const nat: RestState = { endsAt: 4000, totalSec: 120, setAt: 20, by: 'native' };
  assert.equal(mergeRest(web, nat), nat);
  assert.equal(mergeRest({ ...web, setAt: 30 }, nat)?.by, 'web');
  assert.equal(mergeRest({ ...web, setAt: 20 }, nat)?.by, 'native');
  assert.equal(mergeRest(null, nat), nat);
  // 앱 복귀: 웹 휴식은 지났지만(계산 상태 0초) setAt 은 그대로 → 잠금 중 +30초(늦은 setAt)가 이긴다
  assert.equal(restRemainingSec(web, 5000), 0);
  assert.equal(mergeRest(web, { ...nat, endsAt: 30_000 })?.endsAt, 30_000);
});

// ── §8 출처 ──

test('§8 가장 약한 출처 · 앱 열기', () => {
  assert.equal(weakestValueSource('routine', 'default'), 'default');
  assert.equal(weakestValueSource('rx', 'prev'), 'prev');
  assert.equal(weakestValueSource('user', null), 'user');
  assert.equal(weakestValueSource(null, undefined), null);
  assert.equal(lockNeedsOpenApp({ userEdited: false, valueSource: 'default' }), true);
  assert.equal(lockNeedsOpenApp({ userEdited: false, valueSource: 'copied_default' }), true);
  assert.equal(lockNeedsOpenApp({ userEdited: true, valueSource: 'default' }), false);
  assert.equal(lockNeedsOpenApp({ userEdited: false, valueSource: 'prev' }), false);
  assert.equal(lockNeedsOpenApp({ userEdited: null, valueSource: null }), false);
  // 칸별 출처(REV-005 H-1) — 「무게,횟수」 · 가장 약한 칸
  assert.equal(encodeValueSource('rx', 'default'), 'rx,default');
  assert.equal(encodeValueSource('rx', 'rx'), 'rx');
  assert.deepEqual(decodeValueSource('prev'), { weight: 'prev', reps: 'prev' });
  assert.equal(effectiveValueSource('rx,default'), 'default');
  assert.equal(withFieldSource('default,rx', 'weight', 'rx'), 'rx');
  assert.equal(lockNeedsOpenApp({ userEdited: false, valueSource: 'rx,default' }), true);
  assert.equal(lockNeedsOpenApp({ userEdited: false, valueSource: 'default,rx' }), true);
  assert.equal(lockNeedsOpenApp({ userEdited: false, valueSource: withFieldSource('default,rx', 'weight', 'rx') }), false);
});

test('스냅샷 조립 — 표시는 시뮬레이션 값 · 블록 단위 · 워밍업 W · 기본값 세트는 앱 열기', () => {
  const rx = [rxRow({ setType: 'top' }), rxRow({ setType: 'backoff', loadBasis: 'pctTop', loadPct: 90 })];
  const A: LockSnapshotBlock = {
    ...simBlock('A', [{ kg: 100, reps: 5, type: 'top' }, { kg: 20, reps: 5, type: 'backoff' }], rx),
    exerciseName: '벤치프레스',
    restSec: 120,
  };
  const B: LockSnapshotBlock = {
    ...simBlock('B', [{ kg: 20, reps: 8 }], null),
    exerciseName: '스쿼트',
    restSec: 90,
  };
  B.sets[0].valueSource = 'default';
  B.sets[0].userEdited = false;
  const snap = buildLockSnapshot({
    sessionId: 'W',
    title: '빠른 운동',
    rows: [single({ weId: 'A', sets: A.sets }), single({ weId: 'B', sets: B.sets })],
    blocks: [A, B],
    rest: { endsAt: null, totalSec: null, setAt: 0, by: 'web' },
    appliedThroughSeq: 3,
    storeId: 'S',
    dbEpoch: 'E',
    paused: false,
    sound: { enabled: true, preset: 'bell', volume: 2 },
    now: 123,
    restAfter: (s, b) => (s.setType === 'top' ? 180 : b.restSec),
  });
  assert.equal(snap.steps.length, 3);
  assert.equal(snap.steps[0].restAfterSec, 180);
  assert.equal(snap.steps[0].members[0].label, 'T');
  assert.equal(snap.steps[1].members[0].display.weight, 90);
  assert.deepEqual([snap.steps[1].members[0].label, snap.steps[1].members[0].setNo, snap.steps[1].members[0].setTotal], ['1', 1, 1]);
  assert.equal(snap.steps[2].openApp, true);
  assert.equal(snap.steps[0].openApp, false);
  assert.equal(snap.appliedThroughSeq, 3);
  assert.equal(snap.truncated, false);
});

test('스냅샷 — 같은 대기열에서 처방이 채울 기본값 무게는 「앱 열기」가 아니다 · W/D/F 라벨 · lb 표시 · 한쪽 · 유산소', () => {
  const rx = [rxRow({ setType: 'top' }), rxRow({ setType: 'backoff', loadBasis: 'pctTop', loadPct: 90 })];
  const A: LockSnapshotBlock = {
    ...simBlock('A', [{ kg: 100, reps: 5, type: 'top' }, { kg: 20, reps: 5, type: 'backoff', mult: 2 }], rx),
    exerciseName: '레그프레스',
    restSec: 120,
  };
  A.sets[0].valueSource = 'prev';
  A.sets[1].valueSource = 'default,rx'; // 무게만 기본값 — 탑셋을 마치면 rx 로 채워진다
  A.sets[1].userEdited = false;
  const lb = 0.45359237;
  const C: LockSnapshotBlock = {
    ...simBlock('C', [{ kg: 10, reps: 10, type: 'warmup' }, { kg: 100 * lb, reps: 8 }], null, { unit: 'lb' }),
    exerciseName: '컬',
    restSec: 60,
  };
  C.sets[0].valueSource = 'prev';
  C.sets[1].valueSource = 'prev';
  const D: LockSnapshotBlock = { ...simBlock('D', [{ kg: 0, reps: 0 }], null), exerciseName: '러닝', restSec: 0 };
  D.sets[0].cardio = { distance: 3000, seconds: null };
  const snap = buildLockSnapshot({
    sessionId: 'W',
    title: 't',
    rows: [single({ weId: 'A', sets: A.sets }), single({ weId: 'C', sets: C.sets }), single({ weId: 'D', sets: D.sets })],
    blocks: [A, C, D],
    rest: { endsAt: null, totalSec: null, setAt: 0, by: 'web' },
    appliedThroughSeq: 0,
    storeId: 'S',
    dbEpoch: 'E',
    paused: true,
    sound: { enabled: false, preset: 'bell', volume: 1 },
    now: 1,
    restAfter: (_s, b) => b.restSec,
  });
  const [top, back, warm, curl, run] = snap.steps.map((st) => st.members[0]);
  assert.equal(snap.steps[1].openApp, false);
  assert.equal(back.display.weight, 45); // 100 × 90% = 90 → 한쪽 45
  assert.equal(back.oneSide, true);
  assert.equal(top.oneSide, false);
  assert.equal(warm.label, 'W');
  assert.equal(curl.display.weight, 100);
  assert.equal(curl.unit, 'lb');
  assert.equal(run.display.distanceM, 3000);
  assert.equal(snap.steps[4].openApp, true); // 시간을 모른다
  assert.equal(snap.paused, true);
});

test('스냅샷 — 시간만 재는 유산소(줄넘기)는 거리 없이도 잠금 완료 · 거리 칸은 보이지 않는다(REV-007 표시 H-2)', () => {
  const J: LockSnapshotBlock = { ...simBlock('J', [{ kg: 0, reps: 0 }, { kg: 0, reps: 0 }], null), exerciseName: '줄넘기', restSec: 30 };
  J.sets[0].cardio = { distance: null, seconds: 120, metrics: ['duration'] };
  J.sets[1].cardio = { distance: null, seconds: null, metrics: ['duration'] };
  for (const x of J.sets) {
    x.valueSource = 'prev';
    x.userEdited = true;
  }
  const snap = buildLockSnapshot({
    sessionId: 'W', title: 't', rows: [single({ weId: 'J', sets: J.sets })], blocks: [J],
    rest: { endsAt: null, totalSec: null, setAt: 0, by: 'web' }, appliedThroughSeq: 0, storeId: 'S', dbEpoch: 'E',
    paused: false, sound: { enabled: true, preset: 'ding', volume: 2 }, now: 1, restAfter: (_s, b) => b.restSec,
  });
  assert.equal(snap.steps[0].openApp, false, '시간이 있으면 된다');
  assert.equal(snap.steps[0].members[0].display.seconds, 120);
  assert.equal(snap.steps[0].members[0].display.distanceM, null);
  assert.equal(snap.steps[1].openApp, true, '시간을 모르면 앱 열기');
});

test('스냅샷 — 12단계 상한을 넘으면 truncated', () => {
  const big: LockSnapshotBlock = {
    ...simBlock('Z', Array.from({ length: 14 }, () => ({ kg: 50, reps: 5 })), null),
    exerciseName: 'z',
    restSec: 60,
  };
  const snap = buildLockSnapshot({
    sessionId: 'W', title: 't', rows: [single({ weId: 'Z', sets: big.sets })], blocks: [big],
    rest: { endsAt: null, totalSec: null, setAt: 0, by: 'web' }, appliedThroughSeq: 0, storeId: 'S', dbEpoch: 'E',
    paused: false, sound: { enabled: false, preset: 'bell', volume: 1 }, now: 1, restAfter: () => 60,
  });
  assert.equal(snap.steps.length, 12);
  assert.equal(snap.truncated, true);
});

