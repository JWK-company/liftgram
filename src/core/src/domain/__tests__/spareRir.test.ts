// SPEC-055 Phase 3 — 세트 줄 「여유」 칸의 다음 값·글자(REV M-5) — `bun run test:core`
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nextSpareRir, normalizeRir, spareRirText } from '../effort';

test('누를 때마다 비움 → 0 → 1 → 2 → 3 → 4+ → 비움', () => {
  const seen: (number | null)[] = [];
  let v: number | null = null;
  for (let k = 0; k < 6; k++) {
    v = nextSpareRir(v);
    seen.push(v);
  }
  assert.deepEqual(seen, [0, 1, 2, 3, 4, null]);
  assert.deepEqual(seen.map(spareRirText), ['0', '+1', '+2', '+3', '4+', '–']);
});

test('옛 0.5 단위 값 — 「+0.5」 로 보이고 다음은 정수', () => {
  assert.equal(spareRirText(0.5), '+0.5');
  assert.equal(nextSpareRir(0.5), 1);
  assert.equal(spareRirText(2.5), '+2.5');
  assert.equal(nextSpareRir(2.5), 3);
  assert.equal(nextSpareRir(3.5), 4); // 「4+」
});

test('4 보다 큰 옛 값 — 「4+」 로 보이고 누르면 비움', () => {
  for (const v of [4, 4.5, 5, 10]) {
    assert.equal(spareRirText(v), '4+', `${v}`);
    assert.equal(nextSpareRir(v), null, `${v}`);
  }
});

test('저장값 정규화를 거친 값도 같은 규칙(normalizeRir 뒤)', () => {
  assert.equal(spareRirText(normalizeRir(12)), '4+'); // 10 으로 잘림 → 4+
  assert.equal(spareRirText(normalizeRir(undefined)), '–');
  assert.equal(spareRirText(normalizeRir(0.4)), '+0.5');
  assert.equal(spareRirText(normalizeRir(0.2)), '0');
});
