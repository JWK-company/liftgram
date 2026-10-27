// @plm SRS-081 SRS-082  가져오기 해시 — 순수 SHA-256 이 node:crypto·crypto.subtle(브라우저 Worker 와 같은 표준)과 같은 결과인가(D-7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';

import {
  importAliasId,
  importCustomExerciseId,
  importSetId,
  importWorkoutExerciseId,
  importWorkoutId,
  sha16,
  sha256Hex,
  utf8Bytes,
} from '../import/hash';

const SAMPLES = [
  '',
  'abc',
  '2026-08-25T10:10:00',
  '2026-08-25T10:10:00#2',
  'benchpressbarbell',
  '벤치프레스 🏋️ 가슴',
  'a'.repeat(55),
  'a'.repeat(56),
  'a'.repeat(63),
  'a'.repeat(64),
  'a'.repeat(65),
  'x'.repeat(1000),
  '\uD800 짝 없는 대리',
];

test('sha256Hex = node:crypto', () => {
  for (const s of SAMPLES) assert.equal(sha256Hex(s), createHash('sha256').update(s, 'utf8').digest('hex'), JSON.stringify(s.slice(0, 20)));
});

test('sha256Hex = crypto.subtle(브라우저·Worker 와 같은 API)', async () => {
  for (const s of SAMPLES) {
    const buf = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    assert.equal(sha256Hex(s), Buffer.from(buf).toString('hex'));
  }
});

test('utf8Bytes = TextEncoder', () => {
  for (const s of SAMPLES) assert.deepEqual([...utf8Bytes(s)], [...new TextEncoder().encode(s)]);
});

test('표준 벡터 고정', () => {
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha16('abc'), 'ba7816bf8f01cfea414140de5dae2223');
  assert.equal(sha16('2026-08-25T10:10:00').length, 32);
});

test('결정적 id 형식 — seed- 로 시작하지 않는다(동기에서 빠지지 않게)', () => {
  const w = importWorkoutId('strong', '2026-08-25T10:10:00');
  assert.match(w, /^imp-strong-[0-9a-f]{32}$/);
  assert.notEqual(importWorkoutId('strong', '2026-08-25T10:10:00', 2), w);
  assert.equal(importWorkoutId('strong', '2026-08-25T10:10:00', 1), w);
  assert.notEqual(importWorkoutId('hevy', '2026-08-25T10:10:00'), w);
  const we = importWorkoutExerciseId(w, 0);
  assert.equal(importSetId(we, 3), `${w}-e0-s3`);
  const cx = importCustomExerciseId('strong', 'Bench Press (Barbell)');
  assert.match(cx, /^cx-strong-[0-9a-f]{32}$/);
  assert.ok(!cx.startsWith('seed-'));
  // 정규화 이름 — 띄어쓰기·대소문자·괄호를 무시한다
  assert.equal(importCustomExerciseId('strong', 'bench press barbell'), cx);
  assert.equal(importAliasId('hevy', 'Bench Press (Barbell)'), importAliasId('hevy', 'BENCH  PRESS (barbell)'));
  assert.match(importAliasId('hevy', 'x'), /^ia-hevy-[0-9a-f]{32}$/);
});
