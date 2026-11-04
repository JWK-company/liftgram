import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adGuard, feedAdAfter } from '../adPolicy';

test('운동이 없다고 읽어 냈을 때만 슬롯을 연다', () => {
  assert.equal(adGuard({ activeKnown: true, activeWorkoutId: null }), true);
});

test('운동 중이면 비운다', () => {
  assert.equal(adGuard({ activeKnown: true, activeWorkoutId: 'w1' }), false);
});

test('읽기 전이거나 읽기에 실패하면 비운다', () => {
  assert.equal(adGuard({ activeKnown: false, activeWorkoutId: null }), false);
});

test('피드 광고는 6개마다 — 0부터 세어 5, 11', () => {
  const hits = Array.from({ length: 13 }, (_, i) => i).filter(feedAdAfter);
  assert.deepEqual(hits, [5, 11]);
  assert.equal(feedAdAfter(-1), false);
});
