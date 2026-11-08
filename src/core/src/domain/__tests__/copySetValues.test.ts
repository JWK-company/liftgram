// SRS-106 「다른 세트도 똑같이」 — 대상 고르기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyTargetIndexes, isPrepSetType } from '../copySetValues';

type V = { w: number; r: number };
const same = (a: V, b: V) => a.w === b.w && a.r === b.r;
const item = (w: number, r: number, open = true, prep = false) => ({ prep, open, value: { w, r } });

test('일반 3세트 — 첫 세트 값을 나머지 두 세트에', () => {
  assert.deepEqual(copyTargetIndexes([item(60, 10), item(0, 0), item(0, 0)], 0, same), [1, 2]);
});

test('체크한 세트·이미 같은 세트는 빠진다', () => {
  assert.deepEqual(copyTargetIndexes([item(60, 10, false), item(60, 10), item(50, 8, false), item(40, 8)], 1, same), [3]);
});

test('준비 세트는 준비 세트끼리 · 작업 세트는 작업 세트끼리(세트 방식과 상관없이)', () => {
  const rows = [item(20, 10, true, true), item(40, 5, true, true), item(80, 5), item(0, 0), item(0, 0)];
  assert.deepEqual(copyTargetIndexes(rows, 2, same), [3, 4]);
  assert.deepEqual(copyTargetIndexes(rows, 0, same), [1]);
});

test('바뀔 세트가 없으면 빈 목록 · 없는 자리도 빈 목록', () => {
  assert.deepEqual(copyTargetIndexes([item(60, 10), item(60, 10)], 0, same), []);
  assert.deepEqual(copyTargetIndexes([item(60, 10)], 5, same), []);
});

test('준비 세트 판정 — 웜업·피더', () => {
  assert.equal(isPrepSetType('warmup'), true);
  assert.equal(isPrepSetType('feeder'), true);
  assert.equal(isPrepSetType('normal'), false);
  assert.equal(isPrepSetType('drop'), false);
  assert.equal(isPrepSetType(null), false);
});
