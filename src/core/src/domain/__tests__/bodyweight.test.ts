// @plm SRS-077 SRS-078  체중 이력 계산 + 미러 규칙 판정(D-10) — `bun run test:core`
// 미러를 실제로 쓰는 data/bodyweightRepository 는 데코레이터 모델 때문에 node 에서 못 불러온다 —
// 판정부(planBodyweightMirror)를 순수 함수로 분리해 여기서 시나리오(두 기기 교차 · 백업 · 옛 경로 · 초기 한 줄)를 고정한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BODYWEIGHT_STEPS,
  bodyweightInitLogId,
  bodyweightLegacyLogId,
  goalGap,
  latest,
  mirrorAfterLogWrite,
  planBodyweightMirror,
  resolveBodyweightKg,
  sortBodyweightLogs,
  stepBodyweightKg,
  weeklyRate,
  type BodyweightLogLike,
  type MirrorPlan,
  type MirrorProfile,
} from '../bodyweight';
import { lbToKg } from '../units';

const DAY = 86_400_000;
// 정오 기준(로컬 날짜 경계에서 멀리) — TZ 가 바뀌어도 같은 날로 묶인다.
const NOW = new Date(2026, 9, 27, 12, 0, 0).getTime();
const at = (daysAgo: number, hour = 12) => new Date(2026, 9, 27 - daysAgo, hour, 0, 0).getTime();

let seq = 0;
function log(measuredAt: number, weightKg: number, updatedAt = measuredAt, id = `l${++seq}`): BodyweightLogLike {
  return { id, measuredAt, weightKg, updatedAt };
}

// ── latest · resolve ──────────────────────────────────────────────────

test('latest — measured_at 최대, 동률이면 updated_at, 무효 행은 무시', () => {
  const a = log(at(3), 80, at(3), 'a');
  const b = log(at(1), 79, at(1), 'b');
  const c = log(at(1), 78.5, at(1) + 5000, 'c'); // 같은 측정 시각, 나중에 고침
  const bad = { id: 'x', measuredAt: at(0), weightKg: null, updatedAt: at(0) };
  assert.equal(latest([a, b, c, bad])?.id, 'c');
  assert.equal(latest([]), null);
  assert.equal(latest([bad]), null);
});

test('latest — 측정 시각 기준이지 기록 시각 기준이 아니다(늦게 적은 옛 측정은 최신이 아님)', () => {
  const recent = log(at(1), 77, at(1), 'recent');
  const backfilled = log(at(10), 81, NOW, 'old-but-new-write');
  assert.equal(latest([recent, backfilled])?.id, 'recent');
});

test('resolveBodyweightKg — 이력 있으면 최신 측정, 없으면 프로필, 둘 다 없으면 null', () => {
  assert.equal(resolveBodyweightKg({ bodyweightKg: 75 }, [log(at(2), 74)]), 74);
  assert.equal(resolveBodyweightKg({ bodyweightKg: 75 }, []), 75);
  assert.equal(resolveBodyweightKg({ bodyweightKg: null }, []), null);
  assert.equal(resolveBodyweightKg({ bodyweightKg: 0 }, []), null); // 0 = 미설정
  assert.equal(resolveBodyweightKg(null, []), null);
});

test('sortBodyweightLogs — 측정 시각 오름차순·무효 제외', () => {
  const s = sortBodyweightLogs([log(at(1), 70, at(1), 'b'), log(at(5), 71, at(5), 'a'), { id: 'z', measuredAt: null, weightKg: 70, updatedAt: 0 }]);
  assert.deepEqual(
    s.map((l) => l.id),
    ['a', 'b'],
  );
});

// ── goalGap ────────────────────────────────────────────────────────────

test('goalGap — 남은 차이·방향, 하나라도 없으면 null', () => {
  assert.deepEqual(goalGap(80, 75), { remainingKg: -5, absKg: 5, direction: 'down' });
  assert.equal(goalGap(60, 65)?.direction, 'up');
  assert.equal(goalGap(70, 70.02)?.direction, 'reached');
  assert.equal(goalGap(null, 70), null);
  assert.equal(goalGap(70, null), null);
});

// ── weeklyRate ─────────────────────────────────────────────────────────

test('weeklyRate — 하루 0.1kg 씩 줄면 주 −0.7kg (불규칙 간격)', () => {
  // 날짜 d(며칠 전)의 값 = 78 + 0.1·d  → 시간이 갈수록 0.1kg/일 감소
  const lin = [0, 2, 3, 7, 12, 20].map((d) => log(at(d), 78 + 0.1 * d));
  const r = weeklyRate(lin, NOW);
  assert.ok(r);
  assert.ok(Math.abs(r.kgPerWeek - -0.7) < 1e-9, `kgPerWeek=${r.kgPerWeek}`);
  assert.ok(Math.abs(r.pctPerWeek - (-0.7 / 78) * 100) < 1e-9);
  assert.equal(r.days, 6);
});

test('weeklyRate — 같은 날 여러 번은 그날 평균 한 점(아침·저녁 오르내림이 기울기를 흔들지 않음)', () => {
  const r = weeklyRate(
    [log(at(14, 7), 80), log(at(14, 21), 81), log(at(7), 80), log(at(0, 7), 79.5), log(at(0, 21), 80.5)],
    NOW + 10 * 3600_000,
  );
  assert.ok(r);
  assert.equal(r.days, 3);
  // 점: (−14, 80.5) (−7, 80) (0, 80) → 기울기 = −0.5/14 /일
  assert.ok(Math.abs(r.kgPerWeek - (-0.5 / 14) * 7) < 1e-9, `kgPerWeek=${r.kgPerWeek}`);
});

test('weeklyRate — 같은 날 3번만 있으면 null(서로 다른 날 3개 미만)', () => {
  assert.equal(weeklyRate([log(at(0, 7), 80), log(at(0, 9), 80.2), log(at(0, 11), 80.4)], NOW), null);
});

test('weeklyRate — 28일 밖은 뺀다 · 2개면 null · 미래 측정 제외', () => {
  assert.equal(weeklyRate([log(at(40), 90), log(at(35), 89), log(at(3), 80), log(at(1), 79.8)], NOW), null);
  assert.equal(weeklyRate([log(at(3), 80), log(at(1), 79.8)], NOW), null);
  assert.equal(weeklyRate([log(at(3), 80), log(at(1), 79.8), log(NOW + 3 * DAY, 70)], NOW), null);
  const ok = weeklyRate([log(at(27), 80), log(at(10), 80), log(at(1), 80)], NOW);
  assert.ok(ok);
  assert.equal(ok.kgPerWeek, 0);
});

test('weeklyRate — 무효 행·빈 목록', () => {
  assert.equal(weeklyRate([], NOW), null);
  assert.equal(
    weeklyRate([log(at(5), 80), { id: 'n', measuredAt: at(3), weightKg: null, updatedAt: 0 }, log(at(1), 79)], NOW),
    null,
  );
});

// ── 스텝 ──────────────────────────────────────────────────────────────

test('단위별 스텝 상수 — kg ±0.1/0.5/1 · lb ±0.2/1/2', () => {
  assert.deepEqual([...BODYWEIGHT_STEPS.kg], [0.1, 0.5, 1]);
  assert.deepEqual([...BODYWEIGHT_STEPS.lb], [0.2, 1, 2]);
});

test('stepBodyweightKg — 표시 단위에서 더하고 0.1 로 맞춘다(lb 왕복 드리프트 없음)', () => {
  assert.equal(stepBodyweightKg(75, 0.1, 'kg'), 75.1);
  assert.equal(stepBodyweightKg(75.04, -0.5, 'kg'), 74.5);
  const k = stepBodyweightKg(lbToKg(165.4), 0.2, 'lb');
  assert.ok(Math.abs(k - lbToKg(165.6)) < 1e-9);
  assert.equal(stepBodyweightKg(0.05, -1, 'kg'), 0.1); // 바닥
  assert.equal(stepBodyweightKg(300, 1, 'kg'), 300); // 상한
});

// ── 미러 판정(D-10) ────────────────────────────────────────────────────

const P = (bodyweightKg: number | null, updatedAt: number, id = 'p1'): MirrorProfile => ({ id, bodyweightKg, updatedAt });

/** 판정을 적용한 결과(기기 한 대의 정리 한 번)를 흉내 낸다 */
function apply(profile: MirrorProfile, logs: BodyweightLogLike[], plan: MirrorPlan, now: number) {
  const nextLogs = plan.create
    ? [...logs, { id: plan.create.id, measuredAt: plan.create.measuredAt, weightKg: plan.create.weightKg, updatedAt: now }]
    : logs;
  const nextProfile = plan.updateMirror ? { ...profile, bodyweightKg: plan.mirrorKg, updatedAt: now } : profile;
  return { profile: nextProfile, logs: nextLogs };
}

test('초기 한 줄 — 이력 0 ∧ 프로필 값 → bw-init-<profileId>(measured_at = 프로필 updated_at · legacy)', () => {
  const plan = planBodyweightMirror(P(75, at(30)), []);
  assert.deepEqual(plan.create, { id: 'bw-init-p1', measuredAt: at(30), weightKg: 75, source: 'legacy', reason: 'init' });
  assert.equal(plan.mirrorKg, 75);
  assert.equal(plan.updateMirror, false);
  assert.equal(bodyweightInitLogId('p1'), 'bw-init-p1');
});

test('초기 한 줄 중복 없음 — 두 번째 정리·다른 기기(같은 id)는 아무것도 안 함', () => {
  const p = P(75, at(30));
  const first = planBodyweightMirror(p, []);
  const s1 = apply(p, [], first, NOW);
  const second = planBodyweightMirror(s1.profile, s1.logs);
  assert.equal(second.create, null);
  assert.equal(second.updateMirror, false);
  // 다른 기기도 같은 프로필에서 같은 id 를 만든다(동기되면 한 줄)
  assert.equal(planBodyweightMirror({ ...p }, []).create?.id, first.create?.id);
});

test('초기 한 줄 — 같은 id 가 지운 표시로 남아 있으면 legacy id 로, 그것도 막히면 심지 않음', () => {
  const p = P(75, at(30));
  const a = planBodyweightMirror(p, [], new Set(['bw-init-p1']));
  assert.equal(a.create?.id, bodyweightLegacyLogId('p1', at(30)));
  assert.equal(a.create?.reason, 'legacy');
  const b = planBodyweightMirror(p, [], new Set(['bw-init-p1', bodyweightLegacyLogId('p1', at(30))]));
  assert.equal(b.create, null);
  assert.equal(b.mirrorKg, 75);
});

test('이력 0 ∧ 프로필 값 없음 — 아무것도 안 함(마지막 기록 삭제 뒤 = 미설정 유지)', () => {
  const plan = planBodyweightMirror(P(null, at(1)), []);
  assert.deepEqual(plan, { create: null, mirrorKg: null, updateMirror: false });
});

test('두 기기 교차 기록 → pull 뒤 미러 = 측정 시각상 최신(마지막에 push 한 쪽이 아님)', () => {
  // 기기 A: 3일 전 80 · 1일 전 79 / 기기 B: 2일 전 81(늦게 적어 updated_at 은 가장 나중)
  const a1 = log(at(3), 80, at(3), 'a1');
  const a2 = log(at(1), 79, at(1), 'a2');
  const b1 = log(at(2), 81, NOW - 1000, 'b1');
  // B 가 마지막에 push 해서 서버 프로필 미러가 81 로 덮였다(updated_at = B 의 쓰기 시각)
  const profile = P(81, NOW - 1000);
  const plan = planBodyweightMirror(profile, [a1, a2, b1]);
  assert.equal(plan.create, null, '81 은 이력에 있는 값 — 옛 경로 수정이 아니다');
  assert.equal(plan.mirrorKg, 79);
  assert.equal(plan.updateMirror, true);
  // 두 기기가 같은 이력에서 같은 값을 계산 → 정리 뒤 다시 돌려도 핑퐁 없음
  const s = apply(profile, [a1, a2, b1], plan, NOW);
  const again = planBodyweightMirror(s.profile, s.logs);
  assert.equal(again.updateMirror, false);
  assert.equal(again.create, null);
});

test('다른 설정과 함께 올라온 낡은 미러(이력 값과 같음)는 흡수하지 않고 최신 측정으로 되돌린다', () => {
  const old = log(at(5), 82, at(5), 'old');
  const fresh = log(at(1), 80, at(1), 'fresh');
  // 낡은 기기가 알림음 설정을 바꾸며 프로필 행 전체(bodyweight_kg=82)를 올렸다 — updated_at 은 최신 이력보다 나중
  const plan = planBodyweightMirror(P(82, NOW), [old, fresh]);
  assert.equal(plan.create, null);
  assert.equal(plan.mirrorKg, 80);
  assert.equal(plan.updateMirror, true);
});

test('옛 경로 흡수 — 프로필 updated_at > 최신 이력 updated_at ∧ 처음 보는 값 → legacy 한 줄(결정적 id)', () => {
  const l1 = log(at(5), 80, at(5), 'l1');
  const profile = P(77.5, at(1)); // v25 화면이 프로필 칸을 직접 고침
  const plan = planBodyweightMirror(profile, [l1]);
  assert.deepEqual(plan.create, {
    id: bodyweightLegacyLogId('p1', at(1)),
    measuredAt: at(1),
    weightKg: 77.5,
    source: 'legacy',
    reason: 'legacy',
  });
  assert.equal(plan.mirrorKg, 77.5);
  assert.equal(plan.updateMirror, false);
  // 흡수 뒤 다시 정리 → 멱등
  const s = apply(profile, [l1], plan, NOW);
  const again = planBodyweightMirror(s.profile, s.logs);
  assert.equal(again.create, null);
  assert.equal(again.updateMirror, false);
});

test('옛 경로 흡수 아님 — 프로필이 최신 이력보다 먼저 고쳐졌으면 이력이 이긴다', () => {
  const plan = planBodyweightMirror(P(77.5, at(6)), [log(at(5), 80, at(5))]);
  assert.equal(plan.create, null);
  assert.equal(plan.mirrorKg, 80);
  assert.equal(plan.updateMirror, true);
});

test('lb 왕복 오차(<0.005kg)는 같은 값 — 흡수·쓰기 없음', () => {
  const kg = lbToKg(165.4);
  const plan = planBodyweightMirror(P(kg + 0.001, NOW), [log(at(1), kg, at(1))]);
  assert.equal(plan.create, null);
  assert.equal(plan.updateMirror, false);
});

test('백업 가져오기 뒤 — 프로필이 둘이어도 가장 오래된 프로필 하나에 최신 측정을 쓴다', () => {
  // 새 계정에 옛 백업을 가져오면: 이 기기 프로필(새, 값 없음) + 백업 프로필(옛, 72) · 백업 이력(70 → 72)
  // 정리는 「가장 오래된 프로필」(읽기와 같은 행 — 백업 쪽이 created_at 이 더 이르다) 하나만 넘긴다.
  const backupLogs = [log(at(20), 70, at(20), 'b1'), log(at(4), 72, at(4), 'b2')];
  const oldest = P(72, at(4) + 10, 'p-backup');
  const plan = planBodyweightMirror(oldest, backupLogs);
  assert.equal(plan.create, null);
  assert.equal(plan.mirrorKg, 72);
  assert.equal(plan.updateMirror, false);
  // 이 기기에 이미 더 최근 측정이 있었다면 그 값이 미러가 된다
  const plan2 = planBodyweightMirror(oldest, [...backupLogs, log(at(1), 71, at(1), 'here')]);
  assert.equal(plan2.mirrorKg, 71);
  assert.equal(plan2.updateMirror, true);
});

test('미러가 무효(0)인데 이력이 있으면 최신 측정으로 채운다', () => {
  const plan = planBodyweightMirror(P(0, at(0)), [log(at(1), 74, at(1))]);
  assert.equal(plan.create, null);
  assert.equal(plan.mirrorKg, 74);
  assert.equal(plan.updateMirror, true);
});

test('이력 쓰기 직후 미러 — 남은 최신값, 마지막 기록을 지우면 null', () => {
  assert.equal(mirrorAfterLogWrite([log(at(3), 80), log(at(1), 79)]), 79);
  assert.equal(mirrorAfterLogWrite([]), null);
});

test('v26 첫 동기 전(allowCreate=false) — 이력 0 이어도 bw-init 을 심지 않는다(서버 이력과 중복 방지) · 미러 그대로', () => {
  const plan = planBodyweightMirror(P(75, at(30)), [], new Set(), false);
  assert.deepEqual(plan, { create: null, mirrorKg: 75, updateMirror: false });
  // 동기 뒤(서버 이력을 받은 상태) 정리 — 받은 이력이 이기고 초기 줄은 생기지 않는다
  const after = planBodyweightMirror(P(75, at(30)), [log(at(2), 74, at(2), 'srv')], new Set(), true);
  assert.equal(after.create, null);
  assert.equal(after.mirrorKg, 74);
});

test('v26 첫 동기 전(allowCreate=false) — 옛 경로 흡수도 미러 쓰기도 보류(흡수할 증거를 지우지 않음)', () => {
  const plan = planBodyweightMirror(P(77.5, at(1)), [log(at(5), 80, at(5))], new Set(), false);
  assert.deepEqual(plan, { create: null, mirrorKg: 77.5, updateMirror: false });
  // 동기 뒤 정리에서 흡수된다
  assert.equal(planBodyweightMirror(P(77.5, at(1)), [log(at(5), 80, at(5))]).create?.reason, 'legacy');
});
