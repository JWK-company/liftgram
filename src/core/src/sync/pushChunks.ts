// @plm SRS-081 SRS-082  push 나눠 보내기(D-1 · ADR-043 개정) — 서버는 한 번에 5000건까지만 받는다(service.go maxRecordsPerPush).
//
// 가져오기(1만 세트 ≈ 1.6만 건)·되돌리기·백업 가져오기 뒤 첫 push 가 통째로 거부되면 WatermelonDB 는 아무것도 synced 로
// 표시하지 않아 **그 뒤 모든 동기가 같은 이유로 실패한다**. 그래서 ≤2000건씩 순서대로 보낸다(컬렉션 경계와 무관).
// 중간 묶음이 실패해도 괜찮다: 서버 upsert·삭제 표시는 멱등이라, 다음 회차에 WatermelonDB 가 전부 다시 보내면 결과가 같다.
// (이 성질은 서버 쪽 Go 테스트 주석으로도 고정한다 — 보고서 참고.)
//
// 순수 함수다(database 를 import 하지 않는다) — node 테스트가 바로 부른다.

/** 한 컬렉션의 변화분 — syncEngine.SyncTableChanges 와 같은 모양 */
export interface ChunkTableChanges<T = string> {
  created?: T[];
  updated?: T[];
  deleted?: string[];
}

export const PUSH_CHUNK_MAX = 2000;

export function countChangeRecords<T>(changes: Record<string, ChunkTableChanges<T>>): number {
  let n = 0;
  for (const t of Object.values(changes)) n += (t.created?.length ?? 0) + (t.updated?.length ?? 0) + (t.deleted?.length ?? 0);
  return n;
}

/**
 * 변화분을 ≤max 건씩 자른다. 순서 = 컬렉션 순서 → created → updated → deleted(원래 순서 유지).
 * 전체가 max 이하면 **받은 객체 그대로 하나**를 돌려준다(작은 동기는 예전과 똑같이 한 번).
 * 빈 변화분도 한 번(예전처럼 빈 push 한 번 — 서버는 아무 일도 하지 않는다).
 */
export function splitSyncChanges<T>(
  changes: Record<string, ChunkTableChanges<T>>,
  max = PUSH_CHUNK_MAX,
): Record<string, ChunkTableChanges<T>>[] {
  if (!(max >= 1)) throw new Error('max 는 1 이상');
  if (countChangeRecords(changes) <= max) return [changes];
  const out: Record<string, ChunkTableChanges<T>>[] = [];
  let cur: Record<string, ChunkTableChanges<T>> = {};
  let room = max;
  const slot = (table: string): ChunkTableChanges<T> => {
    let t = cur[table];
    if (!t) {
      t = { created: [], updated: [], deleted: [] };
      cur[table] = t;
    }
    return t;
  };
  const flush = () => {
    out.push(cur);
    cur = {};
    room = max;
  };
  for (const [table, t] of Object.entries(changes)) {
    for (const kind of ['created', 'updated', 'deleted'] as const) {
      const list = (t[kind] ?? []) as unknown[];
      let i = 0;
      while (i < list.length) {
        if (room === 0) flush();
        const take = Math.min(room, list.length - i);
        (slot(table)[kind] as unknown[]).push(...list.slice(i, i + take));
        i += take;
        room -= take;
      }
    }
  }
  if (Object.keys(cur).length) out.push(cur);
  return out;
}
