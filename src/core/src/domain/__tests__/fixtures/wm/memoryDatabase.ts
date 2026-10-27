// 테스트 전용 — db/database.ts 대신 끼우는 메모리 DB(loader.mjs). 스키마·마이그레이션·모델은 앱 것 그대로.
import { Database } from '@nozbe/watermelondb';
import LokiJSAdapterMod from '@nozbe/watermelondb/adapters/lokijs';
import { mySchema } from '../../../../db/schema';
import migrations from '../../../../db/migrations';
import { models } from '../../../../db/models';

const LokiJSAdapter = ((LokiJSAdapterMod as unknown as { default?: unknown }).default ?? LokiJSAdapterMod) as typeof LokiJSAdapterMod;

export const database = new Database({
  adapter: new LokiJSAdapter({
    schema: mySchema,
    migrations,
    useWebWorker: false,
    useIncrementalIndexedDB: false,
    dbName: `test-${Math.random().toString(36).slice(2)}`,
    extraLokiOptions: { autosave: false },
  }),
  modelClasses: models,
});
