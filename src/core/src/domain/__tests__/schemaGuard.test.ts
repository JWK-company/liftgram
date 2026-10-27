// @plm SRS-073 SAD-023  다운그레이드 가드 판정(D-5) — `bun run test:core`
// 판정은 DB 를 열기 전에 도는 순수 코드라 WatermelonDB 없이 시험한다(db/schemaGuard.ts 는 Watermelon 을 import 하지 않는다).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_SCHEMA_SEEN_KEY,
  parseSchemaSeen,
  decideSchemaGuard,
  checkSchemaGuardOnBoot,
  isSchemaDowngradeBlocked,
  getSchemaGuardState,
  __resetSchemaGuardForTest,
  type GuardStore,
} from '../../db/schemaGuard';

const memStore = (init: Record<string, string> = {}): GuardStore & { data: Record<string, string> } => {
  const data = { ...init };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
};

test('parseSchemaSeen: 양의 정수만 — 깨진 값은 없는 것으로', () => {
  assert.equal(parseSchemaSeen('26'), 26);
  assert.equal(parseSchemaSeen(' 27 '), 27);
  assert.equal(parseSchemaSeen(null), null);
  assert.equal(parseSchemaSeen(''), null);
  assert.equal(parseSchemaSeen('abc'), null);
  assert.equal(parseSchemaSeen('0'), null);
  assert.equal(parseSchemaSeen('25.5'), null);
});

test('decideSchemaGuard: 낮은 번들만 막고, 저장값은 낮추지 않는다', () => {
  assert.deepEqual(decideSchemaGuard(null, 26), { blocked: false, seen: null, next: 26 });
  assert.deepEqual(decideSchemaGuard('25', 26), { blocked: false, seen: 25, next: 26 });
  assert.deepEqual(decideSchemaGuard('26', 26), { blocked: false, seen: 26, next: 26 });
  assert.deepEqual(decideSchemaGuard('27', 26), { blocked: true, seen: 27, next: 27 });
  assert.deepEqual(decideSchemaGuard('garbage', 26), { blocked: false, seen: null, next: 26 });
});

test('checkSchemaGuardOnBoot: 처음 도는 기기는 기록하고 upgraded', () => {
  __resetSchemaGuardForTest();
  const s = memStore();
  const st = checkSchemaGuardOnBoot(26, s);
  assert.equal(st.blocked, false);
  assert.equal(st.upgraded, true);
  assert.equal(s.data[MAX_SCHEMA_SEEN_KEY], '26');
  assert.equal(isSchemaDowngradeBlocked(), false);
});

test('checkSchemaGuardOnBoot: 같은 버전 재부팅은 upgraded 아님', () => {
  __resetSchemaGuardForTest();
  const s = memStore({ [MAX_SCHEMA_SEEN_KEY]: '26' });
  const st = checkSchemaGuardOnBoot(26, s);
  assert.equal(st.upgraded, false);
  assert.equal(st.blocked, false);
});

test('checkSchemaGuardOnBoot: v27 을 본 기기에서 v26 번들은 막히고 저장값 그대로', () => {
  __resetSchemaGuardForTest();
  const s = memStore({ [MAX_SCHEMA_SEEN_KEY]: '27' });
  const st = checkSchemaGuardOnBoot(26, s);
  assert.equal(st.blocked, true);
  assert.equal(st.upgraded, false);
  assert.equal(s.data[MAX_SCHEMA_SEEN_KEY], '27');
  assert.equal(isSchemaDowngradeBlocked(), true);
  assert.equal(getSchemaGuardState()?.seen, 27);
  __resetSchemaGuardForTest();
  assert.equal(isSchemaDowngradeBlocked(), false);
});

test('checkSchemaGuardOnBoot: 저장소가 없거나 던지면 막지 않는다', () => {
  __resetSchemaGuardForTest();
  assert.equal(checkSchemaGuardOnBoot(26, null).blocked, false);
  const throwing: GuardStore = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  assert.equal(checkSchemaGuardOnBoot(26, throwing).blocked, false);
  __resetSchemaGuardForTest();
});
