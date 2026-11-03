// 잠금 카드 네이티브 공용 픽스처(SPEC-017 Phase 4·5 · REV-005 테스트 M-6) — core 순수 함수가 정답을 만들고,
// 안드로이드(JUnit)·iOS(XCTest)가 같은 파일을 읽어 같은 답을 내는지 본다. 규칙이 바뀌면 이 테스트가 드리프트를 잡는다.
//   다시 만들기: WRITE_LOCK_FIXTURES=1 node --import tsx --test core/src/domain/__tests__/lockFixtures.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { acceptSnapshot, canForgetAcked, mergeRest, queueStalled, rebaseLockQueue, restRemainingSec, type RestState } from '../lockScreen';

const FILE = fileURLToPath(new URL('../../../../mobile/native/fixtures/lock-rules.json', import.meta.url));

type Step = { setIds: string[]; members?: { setId: string }[] };
const st = (...ids: string[]): Step => ({ setIds: ids, members: ids.map((setId) => ({ setId })) });
const rest = (endsAt: number | null, setAt: number, by: 'web' | 'native'): RestState => ({ endsAt, totalSec: endsAt == null ? null : 60, setAt, by });

function build() {
  const steps = [st('a1', 'b1'), st('a2', 'b2'), st('a3')];
  const rebaseCases = [
    { name: '겹침 없음 — 그대로', steps, appliedThroughSeq: 0, pending: [{ seq: 1, setIds: ['zz'] }] },
    { name: '단계 하나 통째로 — 지운다', steps, appliedThroughSeq: 0, pending: [{ seq: 1, setIds: ['a1', 'b1'] }] },
    { name: '묶음 일부 — 남은 멤버만', steps, appliedThroughSeq: 0, pending: [{ seq: 1, setIds: ['b2'] }] },
    { name: '이미 스냅샷이 반영한 조작(seq ≤ applied)은 빼지 않는다', steps, appliedThroughSeq: 5, pending: [{ seq: 5, setIds: ['a1', 'b1'] }] },
    { name: 'ack 먼저 도착 — 덮이지 않은 조작은 계속 뺀다', steps, appliedThroughSeq: 4, pending: [{ seq: 5, setIds: ['a1', 'b1'] }, { seq: 6, setIds: ['a2', 'b2'] }] },
    // REV-007 테스트 M-6 — 조작마다 판단 · 빈 대기열 · members 없는 단계
    { name: '섞임 — 반영된 것은 두고 덮이지 않은 것만 뺀다', steps, appliedThroughSeq: 4, pending: [{ seq: 4, setIds: ['a1', 'b1'] }, { seq: 5, setIds: ['a2'] }] },
    { name: '대기열 비었음', steps, appliedThroughSeq: 0, pending: [] },
    { name: 'members 없는 단계', steps: [{ setIds: ['a1', 'b1'] }] as Step[], appliedThroughSeq: 0, pending: [{ seq: 1, setIds: ['b1'] }] },
  ].map((c) => ({ ...c, expect: rebaseLockQueue(c.steps, c.appliedThroughSeq, c.pending).map((s) => ({ setIds: s.setIds, members: s.members ? s.members.map((m) => m.setId) : null })) }));
  const acceptCases = [
    { name: '처음', current: null, next: { appliedThroughSeq: 0, storeId: 'S', dbEpoch: 'E', sessionId: 'w1' } },
    { name: '거꾸로 가는 스냅샷은 버린다', current: { appliedThroughSeq: 9, storeId: 'S', dbEpoch: 'E', sessionId: 'w1' }, next: { appliedThroughSeq: 8, storeId: 'S', dbEpoch: 'E', sessionId: 'w1' } },
    { name: '같은 seq 는 받는다', current: { appliedThroughSeq: 9, storeId: 'S', dbEpoch: 'E', sessionId: 'w1' }, next: { appliedThroughSeq: 9, storeId: 'S', dbEpoch: 'E', sessionId: 'w1' } },
    { name: 'dbEpoch 가 바뀌면 seq 비교 없이 받는다', current: { appliedThroughSeq: 9, storeId: 'S', dbEpoch: 'E', sessionId: 'w1' }, next: { appliedThroughSeq: 0, storeId: 'S', dbEpoch: 'E2', sessionId: 'w1' } },
    { name: '세션이 바뀌면 받는다', current: { appliedThroughSeq: 9, storeId: 'S', dbEpoch: 'E', sessionId: 'w1' }, next: { appliedThroughSeq: 0, storeId: 'S', dbEpoch: 'E', sessionId: 'w2' } },
    // REV-007 테스트 H-1
    { name: 'storeId 가 바뀌면 seq 비교 없이 받는다', current: { appliedThroughSeq: 9, storeId: 'S', dbEpoch: 'E', sessionId: 'w1' }, next: { appliedThroughSeq: 0, storeId: 'S2', dbEpoch: 'E', sessionId: 'w1' } },
    { name: '키가 없는 사본끼리는 같은 것으로 본다', current: { appliedThroughSeq: 9 }, next: { appliedThroughSeq: 8 } },
  ].map((c) => ({ ...c, expect: acceptSnapshot(c.current, c.next) }));
  const forgetCases = [
    { name: '스냅샷 없음', seq: 3, snapshot: null },
    { name: '덮였다', seq: 3, snapshot: { appliedThroughSeq: 3 } },
    { name: '아직', seq: 4, snapshot: { appliedThroughSeq: 3 } },
    { name: '더 큰 스냅샷이 덮었다', seq: 3, snapshot: { appliedThroughSeq: 5 } },
  ].map((c) => ({ ...c, expect: canForgetAcked({ seq: c.seq }, c.snapshot) }));
  const mergeCases = [
    { name: '늦은 setAt 이 이긴다', a: rest(1000, 10, 'web'), b: rest(2000, 20, 'native') },
    { name: '같은 setAt 이면 native', a: rest(1000, 10, 'web'), b: rest(2000, 10, 'native') },
    { name: '끝내기(endsAt null)도 setAt 으로', a: rest(5000, 30, 'web'), b: rest(null, 31, 'native') },
    { name: '한쪽이 없음', a: null, b: rest(2000, 20, 'web') },
    // REV-007 테스트 H-2 — 실제 호출 순서(지금 값=native, 들어온 값=web)
    { name: '같은 setAt — native(앞)가 이긴다', a: rest(2000, 10, 'native'), b: rest(1000, 10, 'web') },
    { name: '같은 setAt·같은 by — 앞 값 유지', a: rest(2000, 10, 'web'), b: rest(1000, 10, 'web') },
    { name: '들어온 값이 없음', a: rest(2000, 20, 'web'), b: null },
    { name: '둘 다 없음', a: null, b: null },
  ].map((c) => ({ ...c, expect: mergeRest(c.a, c.b) }));
  const stallCases = [
    { name: '비었음', pendingAts: [], now: 100_000 },
    { name: '60초 정확히 — 아직', pendingAts: [40_000], now: 100_000 },
    { name: '60초 넘음', pendingAts: [39_999], now: 100_000 },
    { name: '30개 — 아직', pendingAts: Array.from({ length: 30 }, () => 99_000), now: 100_000 },
    { name: '31개', pendingAts: Array.from({ length: 31 }, () => 99_000), now: 100_000 },
    // REV-007 테스트 H-5 — 가장 오래된 것 기준
    { name: '섞인 순서 — 가장 오래된 것이 60초 넘음', pendingAts: [99_000, 39_999, 99_500], now: 100_000 },
    { name: '가장 오래된 것도 60초 안', pendingAts: [99_000, 40_000], now: 100_000 },
  ].map((c) => ({ ...c, expect: queueStalled(c.pendingAts, c.now) }));
  const remainCases = [
    { name: '없음', rest: null, now: 0 },
    { name: '올림', rest: rest(10_500, 0, 'web'), now: 1_000 },
    { name: '지남', rest: rest(1_000, 0, 'web'), now: 2_000 },
    // REV-007 테스트 M-7
    { name: '정확히 10초', rest: rest(11_000, 0, 'web'), now: 1_000 },
    { name: '정확히 끝', rest: rest(1_000, 0, 'web'), now: 1_000 },
    { name: '끝내기(endsAt null)', rest: rest(null, 0, 'native'), now: 0 },
    { name: 'endsAt 0', rest: { endsAt: 0, totalSec: 0, setAt: 0, by: 'web' as const }, now: 0 },
  ].map((c) => ({ ...c, expect: restRemainingSec(c.rest, c.now) }));
  return { v: 1, note: 'core/src/domain/__tests__/lockFixtures.test.ts 가 만든다 — 손으로 고치지 않는다', rebase: rebaseCases, acceptSnapshot: acceptCases, canForgetAcked: forgetCases, mergeRest: mergeCases, queueStalled: stallCases, restRemainingSec: remainCases };
}

test('네이티브 공용 픽스처 = core 규칙(드리프트 없음)', () => {
  const want = `${JSON.stringify(build(), null, 2)}\n`;
  if (process.env.WRITE_LOCK_FIXTURES === '1') writeFileSync(FILE, want);
  assert.equal(readFileSync(FILE, 'utf8'), want, 'core 규칙이 바뀌었다 — WRITE_LOCK_FIXTURES=1 로 다시 만들고 네이티브 테스트를 돌린다');
});
