// 유산소 지표 매핑·입력 helper 순수 테스트 (SRS-030 확장) — `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cardioMetricsFor, inputToIncline, inputToLevel, cardioNumInput } from '../cardio';

test('cardioMetricsFor: 종목별 지표(러닝머신=경사, 사이클/천국의 계단=단계)', () => {
  assert.deepEqual(cardioMetricsFor({ nameEn: 'Treadmill Running' }), ['duration', 'distance', 'incline']);
  assert.deepEqual(cardioMetricsFor({ nameEn: 'Indoor Cycling' }), ['duration', 'distance', 'level']);
  assert.deepEqual(cardioMetricsFor({ nameEn: 'Stair Climber' }), ['duration', 'level']); // 천국의 계단
  assert.deepEqual(cardioMetricsFor({ nameEn: 'Jump Rope' }), ['duration']);
});

test('cardioMetricsFor: 미매핑/커스텀은 기본 [시간·거리]', () => {
  assert.deepEqual(cardioMetricsFor({ nameEn: '내 유산소' }), ['duration', 'distance']);
  assert.deepEqual(cardioMetricsFor({ nameEn: null }), ['duration', 'distance']);
  assert.deepEqual(cardioMetricsFor({}), ['duration', 'distance']);
});

test('inputToIncline: 소수 허용·0/음수/빈칸은 null', () => {
  assert.equal(inputToIncline('5'), 5);
  assert.equal(inputToIncline('2.5'), 2.5);
  assert.equal(inputToIncline('0'), null);
  assert.equal(inputToIncline(''), null);
  assert.equal(inputToIncline('-3'), null);
});

test('inputToLevel: 정수화·0/빈칸은 null', () => {
  assert.equal(inputToLevel('12'), 12);
  assert.equal(inputToLevel('8.9'), 8); // parseInt
  assert.equal(inputToLevel('0'), null);
  assert.equal(inputToLevel(''), null);
});

test('cardioNumInput: null/0은 빈칸, 값은 문자열', () => {
  assert.equal(cardioNumInput(null), '');
  assert.equal(cardioNumInput(0), '');
  assert.equal(cardioNumInput(12), '12');
  assert.equal(cardioNumInput(2.5), '2.5');
});
