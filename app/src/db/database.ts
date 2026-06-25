// WatermelonDB 인스턴스 (ADR-003). 네이티브 SQLite + JSI.
// 주의: iOS/Android 네이티브 빌드(`npx expo prebuild` + dev client) 필요. Expo Go·웹 미지원.
import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { mySchema } from './schema';
import migrations from './migrations';
import { models } from './models';

const adapter = new SQLiteAdapter({
  schema: mySchema,
  migrations,
  jsi: true,
  dbName: 'repset',
  onSetUpError: (error: unknown) => {
    // DB 초기화 실패 — 사용자에게 재시작/로그아웃 안내(상위 ErrorBoundary에서 처리).
    console.error('[DB] WatermelonDB setup failed', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: models,
});
