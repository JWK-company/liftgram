// 사용자 동기 필터 — 순수 함수(DB 없음 · 테스트 가능). syncEngine 이 pull·push 양쪽에서 부른다.
import type { SyncDatabaseChangeSet } from '@nozbe/watermelondb/sync';

type RawRec = Record<string, unknown>;
type Tbl = { created?: RawRec[]; updated?: RawRec[]; deleted?: string[] };

// ── 시드 종목 행은 사용자 동기에 싣지 않는다 (D10 · 2026-10-26) ──────────────
// 카탈로그의 정본은 서버 카탈로그(catalogSync)다. 예전에는 기기가 받아 둔 시드 행까지 사용자 기록처럼
// 올리고 받아서, 운영 sync_records 에 시드 행이 999개 쌓였고 그중 18개는 **옛 이름**이었다 — 다른 기기가
// pull 하면 고친 이름이 옛 이름으로 되돌아간다. 이제 커스텀 종목(is_custom)만 오간다. @plm SRS-055
const isSeedExerciseId = (id: unknown) => typeof id === 'string' && id.startsWith('seed-');

/** 받은 변화분에서 시드 종목 행과 이 기기가 모르는 표를 뺀다. */
export function dropCatalogRows(changes: SyncDatabaseChangeSet, knownTables?: Set<string>): SyncDatabaseChangeSet {
  const all = changes as unknown as Record<string, Tbl>;
  const out: Record<string, Tbl> = {};
  for (const [table, t] of Object.entries(all)) {
    // 새 스키마의 표(예: v22 exercise_user_prefs)가 옛 앱에 오면 동기 전체가 실패한다 — 모르는 표는 건너뛴다.
    if (knownTables && !knownTables.has(table)) continue;
    if (table !== 'exercises') {
      out[table] = t;
      continue;
    }
    const keep = (r: RawRec) => r.is_custom === true && !isSeedExerciseId(r.id);
    out[table] = {
      created: (t.created ?? []).filter(keep),
      updated: (t.updated ?? []).filter(keep),
      deleted: (t.deleted ?? []).filter((id) => !isSeedExerciseId(id)),
    };
  }
  return out as unknown as SyncDatabaseChangeSet;
}

