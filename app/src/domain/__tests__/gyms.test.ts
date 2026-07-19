// 주변 헬스장 거리·정렬·표기 순수 도메인 테스트 (SRS-035) — `npm test`. RN 불필요.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { haversineM, rankGyms, formatDistance, isValidPoint, type Gym } from '../gyms';

const seoul = { lat: 37.5665, lon: 126.978 }; // 서울시청 근방

test('haversineM: 알려진 거리 근사(강남역~서울시청 직선 ≈ 8.8km)', () => {
  const gangnam = { lat: 37.4979, lon: 127.0276 };
  const d = haversineM(seoul, gangnam);
  assert.ok(d > 8500 && d < 9100, `got ${d}`);
});

test('haversineM: 동일 지점은 0', () => {
  assert.equal(Math.round(haversineM(seoul, seoul)), 0);
});

test('isValidPoint: NaN·범위밖 거절', () => {
  assert.equal(isValidPoint({ lat: 37.5, lon: 127 }), true);
  assert.equal(isValidPoint({ lat: NaN, lon: 127 }), false);
  assert.equal(isValidPoint({ lat: 91, lon: 127 }), false);
  assert.equal(isValidPoint({ lat: 37, lon: 181 }), false);
});

function g(id: string, name: string | null, lat: number, lon: number): Gym {
  return { id, name, lat, lon, address: null, brand: null };
}

test('rankGyms: 가까운 순 정렬 + 거리 부여', () => {
  const far = g('a', '먼짐', 37.6, 127.05);
  const near = g('b', '가까운짐', 37.567, 126.979);
  const mid = g('c', '중간짐', 37.58, 126.99);
  const ranked = rankGyms([far, near, mid], seoul);
  assert.deepEqual(ranked.map((r) => r.id), ['b', 'c', 'a']);
  assert.ok(ranked[0].distanceM < ranked[1].distanceM);
});

test('rankGyms: 무효 좌표 제외', () => {
  const bad = g('x', '무효', NaN, 127);
  const ok = g('y', '정상', 37.567, 126.979);
  const ranked = rankGyms([bad, ok], seoul);
  assert.deepEqual(ranked.map((r) => r.id), ['y']);
});

test('rankGyms: 거의 동거리면 이름 있는 곳 우선', () => {
  // 같은 지점(동거리) — 이름 없는 곳보다 이름 있는 곳이 앞.
  const noName = g('n', null, 37.567, 126.979);
  const named = g('m', '이름짐', 37.567, 126.979);
  const ranked = rankGyms([noName, named], seoul);
  assert.equal(ranked[0].id, 'm');
});

test('formatDistance: m/km 표기', () => {
  assert.equal(formatDistance(120), '120m');
  assert.equal(formatDistance(1234), '1.2km');
  assert.equal(formatDistance(950), '950m');
  assert.equal(formatDistance(-5), '');
});
