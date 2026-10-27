// @plm SRS-073 SRS-074 ADR-038  힘든 정도(RIR) 계산 경계 — `bun run test:core`
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeRir,
  rirFromRpe,
  effectiveRir,
  isRirConverted,
  rirBucket,
  isEffortTarget,
  summarizeEffort,
  type EffortInputSet,
} from '../effort';

// 로컬 날짜 부품으로 ms 구성 → 러너 타임존과 무관하게 결정적.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m, d, h, min).getTime();
const set = (rir: number | null, extra: Partial<EffortInputSet> = {}): EffortInputSet => ({
  completedAt: at(2026, 9, 21),
  rir,
  rpe: null,
  done: true,
  isWarmup: false,
  setType: null,
  ...extra,
});

test('normalizeRir: 0·0.5·4·10.5·null 경계', () => {
  assert.equal(normalizeRir(0), 0);
  assert.equal(normalizeRir(0.5), 0.5);
  assert.equal(normalizeRir(4), 4);
  assert.equal(normalizeRir(10.5), 10); // 위로 자름
  assert.equal(normalizeRir(-1), 0); // 아래로 자름
  assert.equal(normalizeRir(1.3), 1.5); // 0.5 단위로
  assert.equal(normalizeRir(null), null);
  assert.equal(normalizeRir(undefined), null);
  assert.equal(normalizeRir(Number.NaN), null);
  assert.equal(normalizeRir(Number.POSITIVE_INFINITY), null);
});

test('rirFromRpe: 10 − rpe, 0~10 으로 자름', () => {
  assert.equal(rirFromRpe(8), 2);
  assert.equal(rirFromRpe(9.5), 0.5);
  assert.equal(rirFromRpe(10), 0);
  assert.equal(rirFromRpe(10.5), 0); // 음수가 되지 않는다
  assert.equal(rirFromRpe(0), 10);
  assert.equal(rirFromRpe(-2), 10);
  assert.equal(rirFromRpe(null), null);
  assert.equal(rirFromRpe(undefined), null);
});

test('effectiveRir: 적은 rir 우선, 없으면 rpe 환산', () => {
  assert.equal(effectiveRir({ rir: 2, rpe: 6 }), 2);
  assert.equal(effectiveRir({ rir: 0, rpe: 6 }), 0); // 0 은 「없음」이 아니다
  assert.equal(effectiveRir({ rir: null, rpe: 7 }), 3); // rpe 만 있는 옛 세트
  assert.equal(effectiveRir({ rpe: 8 }), 2);
  assert.equal(effectiveRir({ rir: null, rpe: null }), null);
  assert.equal(effectiveRir({}), null);
  assert.equal(isRirConverted({ rir: null, rpe: 7 }), true);
  assert.equal(isRirConverted({ rir: 1, rpe: 7 }), false);
  assert.equal(isRirConverted({ rir: null, rpe: null }), false);
});

test('rirBucket: 0·1·2·3·4+ — 칸 k 는 (k−1, k]', () => {
  assert.equal(rirBucket(0), 0);
  assert.equal(rirBucket(0.5), 1);
  assert.equal(rirBucket(1), 1);
  assert.equal(rirBucket(3), 3);
  assert.equal(rirBucket(3.5), 4);
  assert.equal(rirBucket(4), 4); // 「4+」 는 4 로 저장
  assert.equal(rirBucket(10), 4);
});

test('isEffortTarget: 미완료·워밍업·처방 워밍업은 뺀다, done null(레거시)은 넣는다', () => {
  assert.equal(isEffortTarget(set(2)), true);
  assert.equal(isEffortTarget(set(2, { done: null })), true);
  assert.equal(isEffortTarget(set(2, { done: undefined })), true);
  assert.equal(isEffortTarget(set(2, { done: false })), false);
  assert.equal(isEffortTarget(set(2, { isWarmup: true })), false);
  assert.equal(isEffortTarget(set(2, { setType: 'warmup' })), false);
  assert.equal(isEffortTarget(set(2, { setType: 'top' })), true);
});

test('summarizeEffort: 빈 입력은 null·0', () => {
  const r = summarizeEffort([]);
  assert.equal(r.avg, null);
  assert.equal(r.shareAtOrBelow3, null);
  assert.deepEqual(r.buckets, [0, 0, 0, 0, 0]);
  assert.deepEqual(r.weekly, []);
  assert.deepEqual(r.coverage, { total: 0, rated: 0, fromRpe: 0, share: null });
});

test('summarizeEffort: 평균·여유 3개 이하 비율·분포·커버리지', () => {
  const r = summarizeEffort([
    set(0),
    set(0.5),
    set(2),
    set(4), // 4+
    set(null, { rpe: 7 }), // 옛 세트 → 3
    set(null), // 모름 — 대상이지만 rated 아님
    set(1, { isWarmup: true }), // 워밍업 제외
    set(1, { done: false }), // 미완료 제외
  ]);
  assert.equal(r.coverage.total, 6);
  assert.equal(r.coverage.rated, 5);
  assert.equal(r.coverage.fromRpe, 1);
  assert.equal(r.coverage.share, 5 / 6);
  assert.equal(r.avg, (0 + 0.5 + 2 + 4 + 3) / 5);
  assert.equal(r.shareAtOrBelow3, 4 / 5);
  assert.deepEqual(r.buckets, [1, 1, 1, 1, 1]);
  // 0~3 칸 합 = 여유 3개 이하 수
  assert.equal(r.buckets.slice(0, 4).reduce((a, b) => a + b, 0), 4);
});

test('summarizeEffort: 기간 [start, end) — 끝은 빠진다', () => {
  const start = at(2026, 9, 1, 0, 0);
  const end = at(2026, 9, 8, 0, 0);
  const r = summarizeEffort(
    [
      set(1, { completedAt: start }), // 포함
      set(2, { completedAt: end - 1 }), // 포함
      set(3, { completedAt: end }), // 제외
      set(4, { completedAt: start - 1 }), // 제외
    ],
    { startMs: start, endMs: end },
  );
  assert.equal(r.coverage.total, 2);
  assert.equal(r.avg, 1.5);
});

test('summarizeEffort: 주 경계는 로컬 날짜 월요일 자정', () => {
  // 2026-10-25 는 일요일, 10-26 은 월요일
  const sunLate = at(2026, 9, 25, 23, 59);
  const monEarly = at(2026, 9, 26, 0, 1);
  const r = summarizeEffort([set(1, { completedAt: sunLate }), set(3, { completedAt: monEarly })]);
  assert.equal(r.weekly.length, 2);
  assert.equal(r.weekly[0].weekStartMs, at(2026, 9, 19, 0, 0)); // 그 전 주 월요일
  assert.equal(r.weekly[0].avg, 1);
  assert.equal(r.weekly[1].weekStartMs, at(2026, 9, 26, 0, 0));
  assert.equal(r.weekly[1].avg, 3);
});

test('summarizeEffort: 주별 추이는 빈 주를 채운다(count 0 · avg null)', () => {
  const r = summarizeEffort([
    set(2, { completedAt: at(2026, 9, 5) }), // 10-05 주
    set(4, { completedAt: at(2026, 9, 21) }), // 10-19 주
  ]);
  assert.equal(r.weekly.length, 3);
  assert.deepEqual(
    r.weekly.map((w) => [w.count, w.avg]),
    [
      [1, 2],
      [0, null],
      [1, 4],
    ],
  );
});

test('summarizeEffort: rpe 만 있는 옛 세트만 있어도 카드가 그릴 값이 나온다(U-22)', () => {
  const r = summarizeEffort([set(null, { rpe: 8 }), set(null, { rpe: 9 })]);
  assert.equal(r.avg, 1.5);
  assert.equal(r.coverage.fromRpe, 2);
  assert.equal(r.shareAtOrBelow3, 1);
});

test('분포 칸 이름 = 실제 범위 — 0~10 의 모든 0.5 값이 자기 칸 이름의 범위 안(QA CU-3 · ko·en)', async () => {
  const { ko } = await import('../../i18n/locales/ko');
  const { en } = await import('../../i18n/locales/en');
  const range = (label: string): [number, number] => {
    const nums = (label.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
    if (/이상|\+/.test(label)) return [nums[0], Number.POSITIVE_INFINITY];
    return nums.length === 2 ? [nums[0], nums[1]] : [nums[0], nums[0]];
  };
  for (const dict of [ko, en] as Record<string, string>[]) {
    for (let v = 0; v <= 10; v += 0.5) {
      const label = dict[`effort.bucket${rirBucket(v)}`];
      const [lo, hi] = range(label);
      assert.ok(v >= lo && v <= hi, `${v} → 「${label}」`);
    }
  }
  assert.equal(rirBucket(3.5), 4); // 3.5 → 마지막 칸(「3.5개 이상」)
});
