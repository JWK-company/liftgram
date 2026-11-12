// 원암/원레그 표시(사용자 지시 2660) — 저장 값은 arm 그대로, 글만 종목 주 부위로 가른다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limbOfMuscles, uniShortLabel } from '../variants';

test('다리 주 부위면 다리', () => {
  assert.equal(limbOfMuscles(['hamstrings']), 'leg');
  assert.equal(limbOfMuscles(['quads', 'glutes']), 'leg');
  assert.equal(limbOfMuscles(['calves']), 'leg');
});
test('팔·상체·없음·반반은 팔', () => {
  assert.equal(limbOfMuscles(['biceps']), 'arm');
  assert.equal(limbOfMuscles([]), 'arm');
  assert.equal(limbOfMuscles(null), 'arm');
  assert.equal(limbOfMuscles(['back', 'glutes']), 'arm');
});
test('짧은 글', () => {
  assert.equal(uniShortLabel('leg', 'ko'), '원레그');
  assert.equal(uniShortLabel('arm', 'ko'), '원암');
  assert.equal(uniShortLabel('leg', 'en'), '1-leg');
});
