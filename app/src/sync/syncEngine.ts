// 오프라인-우선 동기 엔진 — WatermelonDB synchronize() ↔ 서버 /sync (ADR-002 · SAD-004). @plm SRS-006
// 서버는 비삭제 레코드를 전부 updated로 보내고(권장 패턴), 클라이언트는 sendCreatedAsUpdated로
// 미존재 레코드를 생성·경고 억제 → "record already exists" 회피.
import { synchronize } from '@nozbe/watermelondb/sync';
import { database } from '../db/database';
import { serverApi } from './serverApi';

export async function syncWithServer(): Promise<void> {
  await synchronize({
    database,
    sendCreatedAsUpdated: true,
    pullChanges: async ({ lastPulledAt }) => {
      const { changes, timestamp } = await serverApi.pull(lastPulledAt ?? 0);
      return { changes, timestamp };
    },
    pushChanges: async ({ changes }) => {
      await serverApi.push(changes);
    },
    migrationsEnabledAtVersion: 1,
  });
}
