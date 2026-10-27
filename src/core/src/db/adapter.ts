// 웹 DB 어댑터 — LokiJS + IndexedDB(영속). 웹은 네이티브 SQLite/JSI를 못 쓰므로 LokiJS로 대체.
// Metro가 웹 플랫폼 빌드에서 adapter.ts 대신 이 파일을 해석한다(.web.ts 우선).
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { mySchema, SCHEMA_VERSION } from './schema';
import migrations from './migrations';
import { checkSchemaGuardOnBoot } from './schemaGuard';

/** 진짜 기록 DB 이름 — 바꾸면 기기의 모든 기록을 잃는다. */
const DB_NAME = 'repset';
/**
 * 다운그레이드로 막혔을 때 대신 여는 **버리는** DB 이름(D-5).
 * 진짜 DB(`repset`)를 열면 LokiJS 가 「더 새 버전」을 보고 지워 버리므로, 아예 다른 이름을 연다.
 * 자동 저장도 끈다 — 이 실행에서 생기는 것은 남길 이유가 없다. @plm SRS-073 SAD-023
 */
const GUARD_DB_NAME = 'repset-schema-guard';

export function buildAdapter() {
  // 다운그레이드 가드 — **DB 를 열기 전에** 판정하고 이 기기에서 본 최고 스키마 버전을 남긴다(D-5). @plm SRS-073 SAD-023
  const guard = checkSchemaGuardOnBoot(SCHEMA_VERSION);
  if (guard.blocked) {
    console.warn(
      `[DB] 이 기기 DB 는 스키마 v${guard.seen} — 이 번들(v${SCHEMA_VERSION})은 옛 버전이라 열지 않는다(새로고침 필요)`,
    );
    return new LokiJSAdapter({
      schema: mySchema,
      migrations,
      useWebWorker: false,
      useIncrementalIndexedDB: true,
      dbName: GUARD_DB_NAME,
      extraLokiOptions: { autosave: false },
      onSetUpError: (error: Error) => {
        console.error('[DB] LokiJS(가드용 빈 DB) setup failed', error);
      },
    });
  }
  return new LokiJSAdapter({
    schema: mySchema,
    migrations,
    useWebWorker: false,
    useIncrementalIndexedDB: true,
    dbName: DB_NAME,
    onSetUpError: (error: Error) => {
      console.error('[DB] LokiJS setup failed', error);
    },
  });
}
