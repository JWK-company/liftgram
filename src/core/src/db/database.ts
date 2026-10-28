// WatermelonDB 인스턴스 (ADR-003). 어댑터는 플랫폼별로 분기:
//   네이티브(iOS/Android) = SQLite + JSI (db/adapter.ts)
//   웹                    = LokiJS + IndexedDB (db/adapter.web.ts, Metro가 .web.ts 우선 해석)
import { Database } from '@nozbe/watermelondb';
import { buildAdapter } from './adapter';
import { models } from './models';
import { acceptsLocalDbWrites, LocalDbSealedError } from './writeGate';

export const database = new Database({
  adapter: buildAdapter(),
  modelClasses: models,
});

// @plm SRS-089  쓰기 문 — 봉인됐거나 쓰기 주인을 빼앗긴 탭은 새 database.write 를 받지 않는다(재검토 L-3).
// 디스크는 lokijs 패치·봉인이 지키고, 이것은 「반쯤 된 다단계 쓰기」와 봉인 탭의 계정 리셋(unsafeResetDatabase 는 write 안에서만)을 막는다.
const originalWrite = database.write.bind(database);
// [원본] (database.write 를 그대로 썼다)
// [개선] 문을 거친다
database.write = ((work: () => Promise<unknown>, description?: string) => {
  if (!acceptsLocalDbWrites()) return Promise.reject(new LocalDbSealedError());
  return originalWrite(work, description);
}) as typeof database.write;

/**
 * 대기열 장벽 — 문을 닫은 **뒤에** 부르면 이미 줄 선 쓰기가 끝날 때까지 기다린다(문을 거치지 않는다).
 * 쓰기 주인을 빼앗긴 탭이 마지막 내려쓰기 전에 쓴다.
 */
export function writeQueueBarrier(): Promise<void> {
  return originalWrite(async () => {}, 'tab-handover-barrier');
}

// 한 문서에 Database 가 둘이면(모듈 경로 차이로 두 번 평가) 같은 IDB 를 두 Loki 가 써서 서로를 낡게 만든다 — 안전망이 거짓 봉인한다(재검토 H-3 ③).
{
  const g = globalThis as typeof globalThis & { __liftgramDb?: Database };
  if (g.__liftgramDb && g.__liftgramDb !== database)
    console.error('[DB] Database 인스턴스가 한 문서에 둘이다 — 다중 탭 안전망이 거짓 봉인할 수 있다(모듈 경로 확인)');
  g.__liftgramDb = database;
}
