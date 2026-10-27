// @plm SRS-082  pull 보호 — 원격 삭제 표시가 이 기기에서 새로 가져온(아직 올리지 않은) 행을 지우지 않게 한다(P5-2).
//
// Watermelon applyRemote 는 원격 `deleted` 의 id 를 로컬 상태와 상관없이 destroy 한다. 가져온 행은 결정적 id 라서
// (`imp-…`·`cx-…`·`ia-…`) 예전에 되돌린 같은 파일의 삭제 표시가 나중에 와도 같은 id 의 새 행을 지운다 —
//   · 다른 기기가 오프라인으로 되돌리고 나중에 올린 경우
//   · 이 기기가 오프라인으로 가져온 뒤 그 삭제 표시를 받는 경우
//   · 서버 커서 겹침(cursorOverlap=1s)으로 방금 받은 삭제 표시가 다음 pull 에 또 오는 경우
// 로컬 행이 `_status='created'` 면 「이 기기가 그 삭제를 알기 전에 새로 쓴 것」이다 → 그 삭제는 적용하지 않는다.
// 다음 push 가 서버에서 같은 record_id 를 deleted=false 로 되살리고(서버 upsert · push_idempotency_test ②), 다른 기기에도 퍼진다.
// 가져온 id 가 아니거나 로컬 행이 synced·updated·없음이면 지금까지처럼 적용한다(기존 동작 불변).
import { Q } from '@nozbe/watermelondb';
import type { SyncDatabaseChangeSet } from '@nozbe/watermelondb/sync';
import type { Database } from '@nozbe/watermelondb';

type RawRec = Record<string, unknown>;
type Tbl = { created?: RawRec[]; updated?: RawRec[]; deleted?: string[] };

/** 가져오기가 결정적 id 로 쓰는 표 */
export const IMPORT_GUARDED_TABLES = ['workouts', 'workout_exercises', 'set_logs', 'exercises', 'import_aliases'] as const;

/** 가져오기가 만든 결정적 id 인가(운동·종목 줄·세트 `imp-` · 커스텀 종목 `cx-` · 별칭 `ia-`) */
export function isImportedId(id: string): boolean {
  return id.startsWith('imp-') || id.startsWith('cx-') || id.startsWith('ia-');
}

/** 보호 대상 후보 — 표별로 원격 삭제 표시 중 가져온 id */
export function importedDeletedIds(changes: SyncDatabaseChangeSet): Map<string, string[]> {
  const all = changes as unknown as Record<string, Tbl>;
  const out = new Map<string, string[]>();
  for (const table of IMPORT_GUARDED_TABLES) {
    const ids = (all[table]?.deleted ?? []).filter(isImportedId);
    if (ids.length) out.set(table, ids);
  }
  return out;
}

/** 순수 함수 — `keep`(표 → 로컬 created 인 id)에 든 삭제 표시만 뺀다. 그 밖은 그대로 둔다. */
export function dropDeletesOfLocallyCreated(
  changes: SyncDatabaseChangeSet,
  keep: ReadonlyMap<string, ReadonlySet<string>>,
): SyncDatabaseChangeSet {
  if (keep.size === 0) return changes;
  const all = changes as unknown as Record<string, Tbl>;
  const out: Record<string, Tbl> = { ...all };
  for (const [table, ids] of keep) {
    const t = all[table];
    if (!t || ids.size === 0) continue;
    out[table] = { ...t, deleted: (t.deleted ?? []).filter((id) => !ids.has(id)) };
  }
  return out as unknown as SyncDatabaseChangeSet;
}

/** DB 를 보고 로컬 created 인 가져온 행의 원격 삭제 표시를 뺀다. 보호한 수를 같이 돌려준다. */
export async function protectLocallyCreatedImports(
  db: Database,
  changes: SyncDatabaseChangeSet,
): Promise<{ changes: SyncDatabaseChangeSet; protectedCount: number }> {
  const candidates = importedDeletedIds(changes);
  if (candidates.size === 0) return { changes, protectedCount: 0 };
  const keep = new Map<string, Set<string>>();
  let protectedCount = 0;
  for (const [table, ids] of candidates) {
    if (!db.schema.tables[table]) continue;
    const rows = await db.get(table).query(Q.where('id', Q.oneOf(ids))).fetch();
    const created = rows.filter((m) => (m._raw as unknown as { _status?: string })._status === 'created').map((m) => m.id);
    if (created.length) {
      keep.set(table, new Set(created));
      protectedCount += created.length;
    }
  }
  return { changes: dropDeletesOfLocallyCreated(changes, keep), protectedCount };
}
