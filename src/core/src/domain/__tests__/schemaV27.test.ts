// 로컬 스키마 v27(SPEC-017 Phase 2 · SRS-096) — set_logs.value_source 추가 · v26 DB 를 열면 옛 세트는 null 로 남는다.
// node 이관: LokiMemoryAdapter 하나를 두 Loki 인스턴스가 나눠 쓰고 saveDatabase 를 명시한다(메모리 「WatermelonDB 이관 node 검증」).
// 데코레이터 모델은 쓰지 않는다(빈 Model + _raw) — tsx 가 읽지 못한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database, Model, appSchema, tableSchema } from '@nozbe/watermelondb';
import LokiJSAdapterMod from '@nozbe/watermelondb/adapters/lokijs';
import { createRequire } from 'node:module';

import { mySchema, SCHEMA_VERSION } from '../../db/schema';
import migrations from '../../db/migrations';

const LokiJSAdapter = ((LokiJSAdapterMod as unknown as { default?: unknown }).default ?? LokiJSAdapterMod) as typeof LokiJSAdapterMod;
// lokijs 는 워터멜론의 의존성이라 최상위에 없다 — 워터멜론 옆에서 찾는다
const wmReq = createRequire(createRequire(import.meta.url).resolve('@nozbe/watermelondb'));
const Loki = wmReq('lokijs') as { LokiMemoryAdapter: new () => unknown };
// 워터멜론 로그를 끈다 — 이관 로그가 node --test 의 직렬화 보고와 섞여 가끔 「Unable to deserialize cloned data」로 깨졌다
(wmReq('@nozbe/watermelondb/utils/common/logger') as { default?: { silence(): void }; silence?: () => void }).default?.silence?.();

type Col = { name: string; type: string; isOptional?: boolean };
type Step = { type: string; table?: string; columns?: Col[] };
const mig = migrations as unknown as { maxVersion: number; sortedMigrations: { toVersion: number; steps: Step[] }[] };

test('v27: 스키마 버전 = 마지막 마이그레이션 = 27 · value_source 는 optional string', () => {
  assert.equal(SCHEMA_VERSION, 27);
  assert.equal(mig.maxVersion, 27);
  const steps = mig.sortedMigrations.find((m) => m.toVersion === 27)?.steps ?? [];
  const add = steps.find((s) => s.type === 'add_columns' && s.table === 'set_logs');
  assert.deepEqual(add?.columns?.map((c) => [c.name, c.type, !!c.isOptional]), [['value_source', 'string', true]]);
  const col = mySchema.tables.set_logs.columns.value_source;
  assert.deepEqual([col?.type, !!col?.isOptional], ['string', true]);
});

class SetLogRaw extends Model {
  static table = 'set_logs';
}

function v26Schema() {
  const tables = Object.values(mySchema.tables).map((t) => {
    const columns = Object.values(t.columns).filter((c) => !(t.name === 'set_logs' && c.name === 'value_source'));
    return tableSchema({ name: t.name, columns });
  });
  return appSchema({ version: 26, tables });
}

function open(schema: ReturnType<typeof appSchema>, mem: unknown, withMigrations: boolean) {
  const adapter = new LokiJSAdapter({
    schema,
    ...(withMigrations ? { migrations } : {}),
    useWebWorker: false,
    useIncrementalIndexedDB: false,
    dbName: 'v27-migration',
    extraLokiOptions: { autosave: false, adapter: mem },
  } as ConstructorParameters<typeof LokiJSAdapter>[0]);
  return new Database({ adapter, modelClasses: [SetLogRaw] });
}

async function save(db: Database) {
  const loki = (db.adapter as unknown as { underlyingAdapter: { _driver: { loki: { saveDatabase: (cb: (e?: unknown) => void) => void } } } })
    .underlyingAdapter._driver.loki;
  await new Promise<void>((res, rej) => loki.saveDatabase((e) => (e ? rej(e) : res())));
}

test('v26 → v27 이관: 옛 세트는 그대로 · value_source 는 null · 새 값을 쓰고 읽는다', async () => {
  const mem = new Loki.LokiMemoryAdapter();
  const old = open(v26Schema(), mem, false);
  await old.write(async () => {
    await old.get<SetLogRaw>('set_logs').create((r) => {
      const raw = r._raw as unknown as Record<string, unknown>;
      raw.workout_exercise_id = 'we1';
      raw.set_number = 1;
      raw.weight_kg = 60;
      raw.reps = 8;
      raw.user_edited = false;
    });
  });
  await save(old);

  const db = open(mySchema, mem, true);
  const rows = await db.get<SetLogRaw>('set_logs').query().fetch();
  // 마이그레이션이 정말 돌았나 — Loki 는 스키마가 없어 읽기·쓰기만으로는 증명되지 않는다(REV-005 테스트 M-1)
  const drv = (db.adapter as unknown as { underlyingAdapter: { _driver: { _databaseVersion: number; loki: { getCollection: (n: string) => { data: Record<string, unknown>[] } } } } })
    .underlyingAdapter._driver;
  const doc = drv.loki.getCollection('set_logs').data[0];
  assert.ok(Object.hasOwn(doc, 'value_source'), 'addColumns 가 value_source 키를 만들었다');
  assert.equal(doc.value_source, null);
  assert.equal(drv._databaseVersion, 27);
  assert.equal(rows.length, 1);
  const raw = rows[0]._raw as unknown as Record<string, unknown>;
  assert.equal(raw.weight_kg, 60);
  assert.equal(raw.reps, 8);
  assert.equal(raw.value_source ?? null, null);
  await db.write(async () => {
    await rows[0].update((r) => {
      (r._raw as unknown as Record<string, unknown>).value_source = 'default';
    });
  });
  const again = await db.get<SetLogRaw>('set_logs').find(rows[0].id);
  assert.equal((again._raw as unknown as Record<string, unknown>).value_source, 'default');
});
