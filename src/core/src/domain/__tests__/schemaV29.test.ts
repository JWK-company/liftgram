// 로컬 스키마 v29(SPEC-049 · SRS-114 R5) — bodyweight_logs.skeletal_muscle_kg·body_fat_pct 추가 · v28 DB 를 열면 옛 기록은 null(안 적음).
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

test('v29: 스키마 버전 = 마지막 마이그레이션(29 이상) · 인바디 두 칸은 optional number', () => {
  assert.ok(SCHEMA_VERSION >= 29);
  assert.equal(mig.maxVersion, SCHEMA_VERSION);
  const steps = mig.sortedMigrations.find((m) => m.toVersion === 29)?.steps ?? [];
  const add = steps.find((s) => s.type === 'add_columns' && s.table === 'bodyweight_logs');
  assert.deepEqual(add?.columns?.map((c) => [c.name, c.type, !!c.isOptional]), [
    ['skeletal_muscle_kg', 'number', true],
    ['body_fat_pct', 'number', true],
  ]);
  for (const n of ['skeletal_muscle_kg', 'body_fat_pct']) {
    const col = mySchema.tables.bodyweight_logs.columns[n];
    assert.deepEqual([col?.type, !!col?.isOptional], ['number', true]);
  }
});

class BodyweightRaw extends Model {
  static table = 'bodyweight_logs';
}

function v28Schema() {
  const tables = Object.values(mySchema.tables).map((t) => {
    const columns = Object.values(t.columns).filter(
      (c) => !(t.name === 'bodyweight_logs' && (c.name === 'skeletal_muscle_kg' || c.name === 'body_fat_pct')),
    );
    return tableSchema({ name: t.name, columns });
  });
  return appSchema({ version: 28, tables });
}

function open(schema: ReturnType<typeof appSchema>, mem: unknown, withMigrations: boolean) {
  const adapter = new LokiJSAdapter({
    schema,
    ...(withMigrations ? { migrations } : {}),
    useWebWorker: false,
    useIncrementalIndexedDB: false,
    dbName: 'v29-migration',
    extraLokiOptions: { autosave: false, adapter: mem },
  } as ConstructorParameters<typeof LokiJSAdapter>[0]);
  return new Database({ adapter, modelClasses: [BodyweightRaw] });
}

async function save(db: Database) {
  const loki = (db.adapter as unknown as { underlyingAdapter: { _driver: { loki: { saveDatabase: (cb: (e?: unknown) => void) => void } } } })
    .underlyingAdapter._driver.loki;
  await new Promise<void>((res, rej) => loki.saveDatabase((e) => (e ? rej(e) : res())));
}

test('v28 → v29 이관: 옛 체중 기록은 그대로 · 인바디는 null · 새 값을 쓰고 읽는다', async () => {
  const mem = new Loki.LokiMemoryAdapter();
  const old = open(v28Schema(), mem, false);
  await old.write(async () => {
    await old.get<BodyweightRaw>('bodyweight_logs').create((r) => {
      const raw = r._raw as unknown as Record<string, unknown>;
      raw.measured_at = 1_700_000_000_000;
      raw.weight_kg = 72.4;
      raw.source = 'checkin';
    });
  });
  await save(old);

  const db = open(mySchema, mem, true);
  const rows = await db.get<BodyweightRaw>('bodyweight_logs').query().fetch();
  const drv = (db.adapter as unknown as { underlyingAdapter: { _driver: { _databaseVersion: number; loki: { getCollection: (n: string) => { data: Record<string, unknown>[] } } } } })
    .underlyingAdapter._driver;
  const doc = drv.loki.getCollection('bodyweight_logs').data[0];
  assert.ok(Object.hasOwn(doc, 'skeletal_muscle_kg') && Object.hasOwn(doc, 'body_fat_pct'), 'addColumns 가 두 키를 만들었다');
  assert.equal(doc.skeletal_muscle_kg, null);
  assert.equal(doc.body_fat_pct, null);
  assert.equal(drv._databaseVersion, SCHEMA_VERSION);
  assert.equal(rows.length, 1);
  assert.equal((rows[0]._raw as unknown as Record<string, unknown>).weight_kg, 72.4);
  await db.write(async () => {
    await rows[0].update((r) => {
      const raw = r._raw as unknown as Record<string, unknown>;
      raw.skeletal_muscle_kg = 33.1;
      raw.body_fat_pct = 18.5;
    });
  });
  const again = (await db.get<BodyweightRaw>('bodyweight_logs').find(rows[0].id))._raw as unknown as Record<string, unknown>;
  assert.deepEqual([again.skeletal_muscle_kg, again.body_fat_pct], [33.1, 18.5]);
});
