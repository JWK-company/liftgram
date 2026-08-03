// 유산소 지표 매핑·입력 helper 순수 테스트 (SRS-030 확장) — `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cardioMetricsFor, inputToIncline, inputToLevel, inputToSpeed, formatSpeed, cardioNumInput } from '../cardio';

test('cardioMetricsFor: 종목별 지표(러닝머신=경사·속도, 사이클/천국의 계단=단계)', () => {
  assert.deepEqual(cardioMetricsFor({ nameEn: 'Treadmill Running' }), ['duration', 'distance', 'incline', 'speed']);
  assert.deepEqual(cardioMetricsFor({ nameEn: 'Indoor Cycling' }), ['duration', 'distance', 'level']);
  assert.deepEqual(cardioMetricsFor({ nameEn: 'Stair Climber' }), ['duration', 'level']); // 천국의 계단
  assert.deepEqual(cardioMetricsFor({ nameEn: 'Jump Rope' }), ['duration']);
});

test('cardioMetricsFor: 실외 러닝·걷기는 경사·속도 미기록(시간·거리만)', () => {
  assert.deepEqual(cardioMetricsFor({ nameEn: 'Running' }), ['duration', 'distance']);
  assert.deepEqual(cardioMetricsFor({ nameEn: 'Walking' }), ['duration', 'distance']);
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

test('inputToSpeed: 소수1자리 허용·0/음수/빈칸은 null (러닝머신 km/h)', () => {
  assert.equal(inputToSpeed('10'), 10);
  assert.equal(inputToSpeed('8.5'), 8.5);
  assert.equal(inputToSpeed('12.34'), 12.3); // 소수1자리 반올림
  assert.equal(inputToSpeed('0'), null);
  assert.equal(inputToSpeed(''), null);
  assert.equal(inputToSpeed('-5'), null);
});

test('formatSpeed: km/h 표기', () => {
  assert.equal(formatSpeed(10), '10km/h');
  assert.equal(formatSpeed(8.5), '8.5km/h');
});

test('cardioNumInput: null/0은 빈칸, 값은 문자열', () => {
  assert.equal(cardioNumInput(null), '');
  assert.equal(cardioNumInput(0), '');
  assert.equal(cardioNumInput(12), '12');
  assert.equal(cardioNumInput(2.5), '2.5');
});
