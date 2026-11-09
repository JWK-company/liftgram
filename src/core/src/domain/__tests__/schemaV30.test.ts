// 로컬 스키마 v30(SPEC-050 P3a) — routines.origin·coach_id·coach_name·coach_for 추가 · v29 DB 를 열면 옛 루틴은 null(= 내가 만든 것).
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

const NEW = ['origin', 'coach_id', 'coach_name', 'coach_for'];

test('v30: 스키마 버전 = 마지막 마이그레이션(30 이상) · 출처 네 칸은 optional string', () => {
  assert.ok(SCHEMA_VERSION >= 30);
  assert.equal(mig.maxVersion, SCHEMA_VERSION);
  const steps = mig.sortedMigrations.find((m) => m.toVersion === 30)?.steps ?? [];
  const add = steps.find((s) => s.type === 'add_columns' && s.table === 'routines');
  assert.deepEqual(
    add?.columns?.map((c) => [c.name, c.type, !!c.isOptional]),
    NEW.map((n) => [n, 'string', true]),
  );
  for (const n of NEW) {
    const col = mySchema.tables.routines.columns[n];
    assert.deepEqual([col?.type, !!col?.isOptional], ['string', true]);
  }
});

class RoutineRaw extends Model {
  static table = 'routines';
}

function v29Schema() {
  const tables = Object.values(mySchema.tables).map((t) => {
    const columns = Object.values(t.columns).filter((c) => !(t.name === 'routines' && NEW.includes(c.name)));
    return tableSchema({ name: t.name, columns });
  });
  return appSchema({ version: 29, tables });
}

function open(schema: ReturnType<typeof appSchema>, mem: unknown, withMigrations: boolean) {
  const adapter = new LokiJSAdapter({
    schema,
    ...(withMigrations ? { migrations } : {}),
    useWebWorker: false,
    useIncrementalIndexedDB: false,
    dbName: 'v30-migration',
    extraLokiOptions: { autosave: false, adapter: mem },
  } as ConstructorParameters<typeof LokiJSAdapter>[0]);
  return new Database({ adapter, modelClasses: [RoutineRaw] });
}

async function save(db: Database) {
  const loki = (db.adapter as unknown as { underlyingAdapter: { _driver: { loki: { saveDatabase: (cb: (e?: unknown) => void) => void } } } })
    .underlyingAdapter._driver.loki;
  await new Promise<void>((res, rej) => loki.saveDatabase((e) => (e ? rej(e) : res())));
}

test('v29 → v30 이관: 옛 루틴은 그대로 · 출처 네 칸은 null · 코치 값을 쓰고 읽는다', async () => {
  const mem = new Loki.LokiMemoryAdapter();
  const old = open(v29Schema(), mem, false);
  await old.write(async () => {
    await old.get<RoutineRaw>('routines').create((r) => {
      const raw = r._raw as unknown as Record<string, unknown>;
      raw.name = '내 상체';
      raw.sort_order = 0;
      raw.is_archived = false;
      raw.created_at = 1_700_000_000_000;
      raw.updated_at = 1_700_000_000_000;
    });
  });
  await save(old);

  const db = open(mySchema, mem, true);
  const rows = await db.get<RoutineRaw>('routines').query().fetch();
  const drv = (db.adapter as unknown as { underlyingAdapter: { _driver: { _databaseVersion: number; loki: { getCollection: (n: string) => { data: Record<string, unknown>[] } } } } })
    .underlyingAdapter._driver;
  const doc = drv.loki.getCollection('routines').data[0];
  for (const n of NEW) {
    assert.ok(Object.hasOwn(doc, n), `addColumns 가 ${n} 를 만들었다`);
    assert.equal(doc[n], null);
  }
  assert.equal(drv._databaseVersion, SCHEMA_VERSION);
  assert.equal(rows.length, 1);
  assert.equal((rows[0]._raw as unknown as Record<string, unknown>).name, '내 상체');
  await db.write(async () => {
    await rows[0].update((r) => {
      const raw = r._raw as unknown as Record<string, unknown>;
      raw.origin = 'coach';
      raw.coach_id = 'u-coach';
      raw.coach_name = '김코치';
    });
  });
  const again = (await db.get<RoutineRaw>('routines').find(rows[0].id))._raw as unknown as Record<string, unknown>;
  assert.deepEqual([again.origin, again.coach_id, again.coach_name, again.coach_for], ['coach', 'u-coach', '김코치', null]);
});
