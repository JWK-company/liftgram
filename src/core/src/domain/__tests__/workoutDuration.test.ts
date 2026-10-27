// @plm SRS-071  운동 소요시간 — 1분 미만·없음은 표시하지 않는다(화면 정리 P3 QA M1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workoutDurationParts } from '../workoutDuration';

test('없음·0·1분 미만은 null — 「-」·「00:00」 을 그리지 않는다', () => {
  assert.equal(workoutDurationParts(null), null);
  assert.equal(workoutDurationParts(undefined), null);
  assert.equal(workoutDurationParts(0), null);
  assert.equal(workoutDurationParts(59), null);
  assert.equal(workoutDurationParts(Number.NaN), null);
});

test('1분 이상은 분으로 반올림 — 60초=1분, 3900초=1시간 5분', () => {
  assert.deepEqual(workoutDurationParts(60), { hours: 0, minutes: 1 });
  assert.deepEqual(workoutDurationParts(2730), { hours: 0, minutes: 46 });
  assert.deepEqual(workoutDurationParts(3600), { hours: 1, minutes: 0 });
  assert.deepEqual(workoutDurationParts(3900), { hours: 1, minutes: 5 });
});
