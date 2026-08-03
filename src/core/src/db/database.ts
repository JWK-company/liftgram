// WatermelonDB 인스턴스 (ADR-003). 어댑터는 플랫폼별로 분기:
//   네이티브(iOS/Android) = SQLite + JSI (db/adapter.ts)
//   웹                    = LokiJS + IndexedDB (db/adapter.web.ts, Metro가 .web.ts 우선 해석)
import { Database } from '@nozbe/watermelondb';
import { buildAdapter } from './adapter';
import { models } from './models';

export const database = new Database({
  adapter: buildAdapter(),
  modelClasses: models,
});
