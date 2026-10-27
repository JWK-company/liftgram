// @plm SRS-077 SRS-078  체중 이력 계산 + 미러 규칙 판정(D-10) — `bun run test:core`
// 미러를 실제로 쓰는 data/bodyweightRepository 는 데코레이터 모델 때문에 node 에서 못 불러온다 —
// 판정부(planBodyweightMirror)를 순수 함수로 분리해 여기서 시나리오(두 기기 교차 · 백업 · 옛 경로 · 초기 한 줄)를 고정한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BODYWEIGHT_PROFILE_LOG_PREFIX,
  BODYWEIGHT_STEPS,
  bodyweightInitLogId,
  bodyweightLegacyLogId,
  goalGap,
  isBodyweightClearMarker,
  latest,
  latestEntry,
  mirrorAfterLogWrite,
  planBodyweightMirror,
  planProfileBodyweightWrite,
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

// [원본] 「다른 설정과 함께 올라온 낡은 미러(이력 값과 같음)는 흡수하지 않고 최신 측정으로 되돌린다」 — CD-1 의 되돌림을 의도로 굳힌
//        잘못된 기대였다. 같은 모양(이력에 있는 예전 값 + 프로필이 마지막 이력보다 나중)은 사람이 예전 값으로 되돌린 옛 경로 입력이다.
test('옛 경로로 예전 값(이력에 있는 값)으로 되돌린 입력도 흡수한다 — 직전 값으로 되돌리지 않는다(CD-1)', () => {
  const old = log(at(5), 82, at(5), 'old');
  const fresh = log(at(1), 80, at(1), 'fresh');
  // v25 화면이 프로필 칸을 82 로 직접 고쳤다(82 는 5일 전에 적은 적 있는 값) — updated_at 은 마지막 이력보다 나중
  const plan = planBodyweightMirror(P(82, NOW), [old, fresh]);
  assert.equal(plan.create?.reason, 'legacy');
  assert.equal(plan.create?.weightKg, 82);
  assert.equal(plan.mirrorKg, 82);
  assert.equal(plan.updateMirror, false);
});

test('두 기기 교차 — 다른 기기가 기록하며 올린 미러(그 기기가 마지막에 쓴 줄 값)는 흡수하지 않는다', () => {
  // B 가 b1(81)을 적으며 미러 81 을 같은 write 로 올렸다 — 프로필 updated_at 이 b1 보다 1ms 늦어도 흡수 아님
  const a2 = log(at(1), 79, at(1), 'a2');
  const b1 = log(at(2), 81, NOW - 1000, 'b1');
  const plan = planBodyweightMirror(P(81, NOW - 999), [log(at(3), 80, at(3), 'a1'), a2, b1]);
  assert.equal(plan.create, null);
  assert.equal(plan.mirrorKg, 79);
});

test('옛 측정을 늦게 적은 뒤(프로필은 안 바뀜) — 마지막에 쓴 줄보다 먼저 고쳐진 미러는 흡수하지 않는다', () => {
  const recent = log(at(1), 79, at(1), 'recent');
  const back = log(at(10), 85, NOW - 10, 'backfill'); // 늦게 적은 옛 측정
  const plan = planBodyweightMirror(P(81, at(1) + 5), [recent, back]);
  assert.equal(plan.create, null);
  assert.equal(plan.mirrorKg, 79);
});

// ── 프로필 체중 입력(CD-1 ① · CD-2) — 같은 write 안에서 이력 한 줄 + 미러, 그 뒤 정리를 돌려도 그대로 ─────────

/** 기기 한 대 — 프로필 입력(planProfileBodyweightWrite)과 정리(planBodyweightMirror)를 저장소처럼 적용한다 */
function device(profileKg: number | null, t0: number) {
  let profile: MirrorProfile = P(profileKg, t0);
  let logs: BodyweightLogLike[] = [];
  let n = 0;
  return {
    get profile() {
      return profile;
    },
    get logs() {
      return logs;
    },
    /** 프로필 스테퍼 한 번(같은 write: 줄 + 미러 — 미러 쓰기가 줄보다 1ms 늦다고 본다) */
    input(kg: number | null, now: number, historyComplete = true) {
      const w = planProfileBodyweightWrite(kg, logs, now, historyComplete);
      if (w.update) {
        const u = w.update;
        logs = logs.map((l) => (l.id === u.id ? { ...l, measuredAt: u.measuredAt, weightKg: u.weightKg, updatedAt: now } : l));
      }
      if (w.create) logs = [...logs, { id: `${BODYWEIGHT_PROFILE_LOG_PREFIX}${++n}`, ...w.create, updatedAt: now }];
      profile = { ...profile, bodyweightKg: w.mirrorKg, updatedAt: now + 1 };
      return w;
    },
    /** 동기 뒤·부팅 정리 한 번 */
    reconcile(now: number) {
      const plan = planBodyweightMirror(profile, logs);
      const s = apply(profile, logs, plan, now);
      profile = s.profile;
      logs = s.logs;
      return plan;
    },
  };
}

test('회귀 CD-1 — 80 → 82 → 80: 입력마다 정리를 돌려도 80 이 유지된다(이력 최신 80)', () => {
  const d = device(80, at(30));
  assert.equal(d.reconcile(at(20)).create?.reason, 'init'); // v26 첫 정리: bw-init(80)
  d.input(82, at(10));
  assert.equal(d.reconcile(at(10) + 5000).updateMirror, false);
  assert.equal(d.profile.bodyweightKg, 82);
  d.input(80, at(3)); // 며칠 뒤 다시 80(이력에 이미 있는 값)
  const plan = d.reconcile(at(3) + 5000);
  assert.equal(plan.create, null);
  assert.equal(plan.updateMirror, false);
  assert.equal(d.profile.bodyweightKg, 80);
  assert.equal(latest(d.logs)?.weightKg, 80);
  assert.equal(resolveBodyweightKg(d.profile, d.logs), 80);
  // 다음 부팅 정리도 그대로(멱등)
  assert.deepEqual(d.reconcile(NOW), { create: null, mirrorKg: 80, updateMirror: false });
});

test('회귀 CD-1(옛 경로 · v25 클라이언트) — 프로필 칸 직접 수정 80 → 82 → 80 도 흡수되어 80 이 유지된다', () => {
  let profile = P(80, at(30));
  let logs: BodyweightLogLike[] = [];
  const step = (now: number) => {
    const s = apply(profile, logs, planBodyweightMirror(profile, logs), now);
    profile = s.profile;
    logs = s.logs;
  };
  step(at(20)); // bw-init(80)
  profile = { ...profile, bodyweightKg: 82, updatedAt: at(10) };
  step(at(10) + 5000); // bw-legacy(82)
  profile = { ...profile, bodyweightKg: 80, updatedAt: at(3) };
  const plan = planBodyweightMirror(profile, logs);
  assert.equal(plan.create?.reason, 'legacy');
  assert.equal(plan.mirrorKg, 80);
  step(at(3) + 5000);
  assert.equal(profile.bodyweightKg, 80);
  assert.equal(latest(logs)?.weightKg, 80);
  assert.deepEqual(planBodyweightMirror(profile, logs), { create: null, mirrorKg: 80, updateMirror: false });
});

test('회귀 CD-2 — 0(설정 안 함)은 표식 한 줄 · 미러 null · 정리가 이력 최신값으로 되살리지 않는다', () => {
  const d = device(80, at(30));
  d.reconcile(at(20));
  d.input(82, at(10));
  const w = d.input(0, at(2)); // 스테퍼를 0 까지 — 화면은 null 을 넘긴다(0 도 같다)
  assert.equal(w.create?.weightKg, 0);
  assert.equal(w.mirrorKg, null);
  assert.equal(d.profile.bodyweightKg, null);
  assert.deepEqual(d.reconcile(at(2) + 5000), { create: null, mirrorKg: null, updateMirror: false });
  assert.deepEqual(d.reconcile(NOW), { create: null, mirrorKg: null, updateMirror: false });
  assert.equal(resolveBodyweightKg(d.profile, d.logs), null);
  // 표식은 그래프·주간 변화에 나오지 않는다(유효 행만)
  assert.equal(sortBodyweightLogs(d.logs).some((l) => l.weightKg === 0), false);
  assert.equal(latest(d.logs)?.weightKg, 82);
  // 표식 뒤 새 입력 → 그 값이 다시 내 체중
  d.input(79, at(1));
  assert.equal(d.reconcile(at(1) + 5000).updateMirror, false);
  assert.equal(resolveBodyweightKg(d.profile, d.logs), 79);
});

test('표식 규칙 — 무게가 정확히 0 이고 측정 시각이 있는 줄만 표식(null·음수는 깨진 행)', () => {
  assert.equal(isBodyweightClearMarker({ id: 'm', measuredAt: at(1), weightKg: 0, updatedAt: at(1) }), true);
  assert.equal(isBodyweightClearMarker({ id: 'x', measuredAt: at(1), weightKg: null, updatedAt: at(1) }), false);
  assert.equal(isBodyweightClearMarker({ id: 'x', measuredAt: null, weightKg: 0, updatedAt: at(1) }), false);
  assert.equal(isBodyweightClearMarker({ id: 'x', measuredAt: at(1), weightKg: -1, updatedAt: at(1) }), false);
  // 표식보다 나중 측정이 있으면 그 값 · 표식이 가장 최근이면 null · 이력 쓰기 직후 미러도 같은 규칙
  const m = { id: 'm', measuredAt: at(2), weightKg: 0, updatedAt: at(2) };
  assert.equal(resolveBodyweightKg({ bodyweightKg: 70 }, [log(at(5), 80), m]), null);
  assert.equal(resolveBodyweightKg({ bodyweightKg: 70 }, [log(at(5), 80), m, log(at(1), 78)]), 78);
  assert.equal(mirrorAfterLogWrite([log(at(5), 80), m]), null);
  assert.equal(latestEntry([log(at(5), 80), m])?.id, 'm');
});

test('스테퍼 연타 — 1분 안의 입력은 프로필 입력 줄 하나를 고친다(줄이 쌓이지 않는다) · 1분 뒤는 새 줄', () => {
  const d = device(null, at(30));
  d.input(80, NOW - 120_000);
  d.input(80.5, NOW - 119_000);
  d.input(81, NOW - 118_000);
  assert.equal(d.logs.length, 1);
  assert.equal(d.logs[0].weightKg, 81);
  assert.equal(d.profile.bodyweightKg, 81);
  d.input(81.5, NOW);
  assert.equal(d.logs.length, 2);
  // 다른 화면이 적은 측정(체크인 등)은 합치지 않는다
  const w = planProfileBodyweightWrite(70, [log(NOW - 1000, 71, NOW - 1000, 'checkin-1')], NOW);
  assert.equal(w.update, null);
  assert.equal(w.create?.weightKg, 70);
});

test('같은 값·이미 미설정 — 줄을 쓰지 않는다 · 이력을 아직 못 받은 기기의 미설정은 표식을 남긴다', () => {
  assert.deepEqual(planProfileBodyweightWrite(80, [log(at(1), 80)], NOW), { create: null, update: null, mirrorKg: 80 });
  assert.deepEqual(planProfileBodyweightWrite(null, [], NOW), { create: null, update: null, mirrorKg: null });
  const m = { id: 'm', measuredAt: at(1), weightKg: 0, updatedAt: at(1) };
  assert.deepEqual(planProfileBodyweightWrite(0, [m], NOW), { create: null, update: null, mirrorKg: null });
  assert.equal(planProfileBodyweightWrite(null, [], NOW, false).create?.weightKg, 0);
});

test('미래 시각 측정이 있으면 미러는 규칙대로 그 값 — 정리가 이 입력을 흡수·되돌림하지 않는다', () => {
  const future = log(NOW + 3 * DAY, 90, NOW - 5000, 'skew'); // 시계가 빠른 다른 기기
  const w = planProfileBodyweightWrite(80, [future], NOW);
  assert.equal(w.create?.weightKg, 80);
  assert.equal(w.mirrorKg, 90);
  const logs = [future, { id: 'bw-profile-x', ...(w.create as NonNullable<typeof w.create>), updatedAt: NOW }];
  assert.deepEqual(planBodyweightMirror(P(90, NOW + 1), logs), { create: null, mirrorKg: 90, updateMirror: false });
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

test('로그인 안 한 기기(allowInit=false) — 첫 줄을 심지 않는다 · 옛 경로 흡수는 그대로(CD-5)', () => {
  assert.deepEqual(planBodyweightMirror(P(70, at(30)), [], new Set(), true, false), {
    create: null,
    mirrorKg: 70,
    updateMirror: false,
  });
  assert.equal(planBodyweightMirror(P(77.5, at(1)), [log(at(5), 80, at(5))], new Set(), true, false).create?.reason, 'legacy');
});
