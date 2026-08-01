// @plm SRS-028  변형 버킷 정규화 — 같은 종목·같은 기구가 두 버킷(null vs equip:<고유기구>)으로
// 갈라져 루틴마다 이전기록·PR이 비어 보이던 회귀(2026-08-01 리포트)의 재발 방지.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalVariantKey,
  normalizeVariantDims,
  normalizeVariantEquipment,
  variantColumns,
} from '../variants';

test('고유 기구 선택은 기본 버킷(null)로 정규화 — 바벨 종목의 barbell', () => {
  assert.equal(normalizeVariantEquipment('barbell', 'barbell'), null);
  assert.equal(normalizeVariantEquipment('machine', 'machine'), null);
});

test('다른 기구(대체 변형)는 그대로 별도 버킷', () => {
  assert.equal(normalizeVariantEquipment('smith', 'barbell'), 'smith');
  assert.equal(normalizeVariantEquipment('dumbbell', 'barbell'), 'dumbbell');
  assert.equal(normalizeVariantEquipment('hammer', 'machine'), 'hammer'); // 머신 브랜드
});

test('빈 값·기준 없음 처리 — 빈 문자열은 null, 기준 미상이면 보존', () => {
  assert.equal(normalizeVariantEquipment(null, 'barbell'), null);
  assert.equal(normalizeVariantEquipment('   ', 'barbell'), null);
  assert.equal(normalizeVariantEquipment('barbell', null), 'barbell');
});

test('정규화는 기구 축만 — 그립·팔 차원은 보존', () => {
  const dims = normalizeVariantDims({ equipment: 'barbell', grip: 'over', arm: 'uni' }, 'barbell');
  assert.deepEqual(dims, { equipment: null, grip: 'over', arm: 'uni' });
});

test('두 경로(미지정 vs 고유기구 선택)가 같은 버킷 키를 낳는다', () => {
  const unspecified = canonicalVariantKey(normalizeVariantDims({ equipment: null }, 'barbell'));
  const intrinsic = canonicalVariantKey(normalizeVariantDims({ equipment: 'barbell' }, 'barbell'));
  assert.equal(unspecified, null);
  assert.equal(intrinsic, unspecified); // 같은 벤치프레스(바벨) → 한 버킷
  // 정규화 없이는 갈라진다(= 이 버그의 원인).
  assert.notEqual(canonicalVariantKey({ equipment: 'barbell' }), canonicalVariantKey({ equipment: null }));
});

test('정규화된 dims의 저장 컬럼 — 키·개별 차원이 모두 기본값', () => {
  const cols = variantColumns(normalizeVariantDims({ equipment: 'barbell' }, 'barbell'));
  assert.equal(cols.variantKey, null);
  assert.equal(cols.variantEquipment, null);
});

test('대체 기구는 정규화 후에도 자기 버킷 유지', () => {
  const cols = variantColumns(normalizeVariantDims({ equipment: 'smith' }, 'barbell'));
  assert.equal(cols.variantKey, 'equip:smith');
  assert.equal(cols.variantEquipment, 'smith');
});
