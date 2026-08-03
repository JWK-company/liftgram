// 웹 DB 어댑터 — LokiJS + IndexedDB(영속). 웹은 네이티브 SQLite/JSI를 못 쓰므로 LokiJS로 대체.
// Metro가 웹 플랫폼 빌드에서 adapter.ts 대신 이 파일을 해석한다(.web.ts 우선).
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { mySchema } from './schema';
import migrations from './migrations';

export function buildAdapter() {
  return new LokiJSAdapter({
    schema: mySchema,
    migrations,
    useWebWorker: false,
    useIncrementalIndexedDB: true,
    dbName: 'repset',
    onSetUpError: (error: Error) => {
      console.error('[DB] LokiJS setup failed', error);
    },
  });
}
