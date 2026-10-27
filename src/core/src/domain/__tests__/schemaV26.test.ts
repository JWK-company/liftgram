// @plm SRS-073 SRS-077 SRS-081 SRS-082  로컬 스키마 v26 — 스키마와 마이그레이션이 같은 칸을 말하고, 새 칸이 전부 optional 인가
// (non-optional number 는 WatermelonDB 가 0 으로 채워 옛 행에 거짓 값이 생긴다 — ADR-037 QA B1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { mySchema, SCHEMA_VERSION } from '../../db/schema';
import migrations from '../../db/migrations';

type Col = { name: string; type: string; isOptional?: boolean; isIndexed?: boolean };
type Step = { type: string; table?: string; schema?: { name: string; columns: Record<string, Col> }; columns?: Col[] };
const mig = migrations as unknown as { maxVersion: number; sortedMigrations: { toVersion: number; steps: Step[] }[] };

const v26 = () => mig.sortedMigrations.find((m) => m.toVersion === 26);
const NEW_TABLES = ['bodyweight_logs', 'import_batches', 'import_aliases'];
const ADDED: Record<string, string[]> = {
  set_logs: ['rir'],
  workouts: ['source', 'import_batch_id'],
  exercises: ['import_batch_id'],
};

test('v26: 스키마 버전 = 마지막 마이그레이션', () => {
  assert.equal(SCHEMA_VERSION, 26);
  assert.equal(mig.maxVersion, 26);
  assert.ok(v26(), 'toVersion 26 마이그레이션이 있어야 한다');
});

test('v26: 새 표 3개가 스키마에 있고, 마이그레이션 createTable 칸과 같다', () => {
  const steps = v26()?.steps ?? [];
  for (const name of NEW_TABLES) {
    const table = mySchema.tables[name];
    assert.ok(table, `스키마에 ${name}`);
    const created = steps.find((s) => s.type === 'create_table' && s.schema?.name === name);
    assert.ok(created, `마이그레이션에 createTable ${name}`);
    assert.deepEqual(
      Object.values(created?.schema?.columns ?? {}).map((c) => [c.name, c.type, !!c.isOptional, !!c.isIndexed]),
      Object.values(table.columns).map((c) => [c.name, c.type, !!c.isOptional, !!c.isIndexed]),
      `${name} 칸이 스키마와 마이그레이션에서 다르다`,
    );
  }
});

test('v26: 추가 칸이 스키마·마이그레이션 양쪽에 같고 전부 optional', () => {
  const steps = v26()?.steps ?? [];
  for (const [table, cols] of Object.entries(ADDED)) {
    const add = steps.find((s) => s.type === 'add_columns' && s.table === table);
    assert.ok(add, `addColumns ${table}`);
    assert.deepEqual(
      add?.columns?.map((c) => c.name),
      cols,
    );
    for (const c of add?.columns ?? []) {
      const inSchema = mySchema.tables[table].columns[c.name];
      assert.ok(inSchema, `${table}.${c.name} 스키마에`);
      assert.equal(inSchema.type, c.type);
      assert.equal(!!inSchema.isIndexed, !!c.isIndexed, `${table}.${c.name} 인덱스`);
      assert.equal(c.isOptional, true, `${table}.${c.name} 는 optional`);
      assert.equal(inSchema.isOptional, true, `${table}.${c.name} 는 optional(스키마)`);
    }
  }
});

test('v26: 새 표의 created_at·updated_at 말고는 전부 optional', () => {
  for (const name of NEW_TABLES) {
    for (const c of Object.values(mySchema.tables[name].columns)) {
      if (c.name === 'created_at' || c.name === 'updated_at') continue;
      assert.equal(c.isOptional, true, `${name}.${c.name} 는 optional`);
    }
  }
});

test('v26: 새 표가 USER_TABLES(대기 수·계정 전환·백업)에 들어 있다', () => {
  // pending.ts 는 database 를 import 해 node 에서 불러올 수 없다 — 소스 글자로 확인한다.
  const src = readFileSync(fileURLToPath(new URL('../../sync/pending.ts', import.meta.url)), 'utf8');
  const block = src.slice(src.indexOf('export const USER_TABLES'), src.indexOf('];', src.indexOf('export const USER_TABLES')));
  for (const name of NEW_TABLES) assert.ok(block.includes(`'${name}'`), `USER_TABLES 에 ${name}`);
});
