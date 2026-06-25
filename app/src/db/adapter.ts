// 네이티브(iOS/Android) DB 어댑터 — SQLite + JSI (ADR-003).
// 웹 빌드 시 Metro가 이 파일 대신 adapter.web.ts(LokiJS)를 자동 해석한다(플랫폼 확장).
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { mySchema } from './schema';
import migrations from './migrations';

export function buildAdapter() {
  return new SQLiteAdapter({
    schema: mySchema,
    migrations,
    jsi: true,
    dbName: 'repset',
    onSetUpError: (error: Error) => {
      console.error('[DB] SQLite setup failed', error);
    },
  });
}
