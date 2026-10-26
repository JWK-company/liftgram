// @plm SRS-053  기기 백업 파일 — 이 기기의 기록을 파일로 꺼내고, 파일에서 되살린다 (2026-10-26)
//
// ─────────────────────────────────────────────────────────────────────────────
// 서버 동기가 있는데도 이것이 필요한 이유: 동기는 **실패할 수 있고**, 실패하면 기록은 기기에만 남는다.
// 2026-10 옛 앱이 정확히 그랬다 — 두 달 동안 동기가 조용히 실패했고, 주소를 옮기자 기기 안 기록을
// 꺼낼 방법이 없었다(옛 주소에 임시 복구 페이지를 올려 IndexedDB를 통째로 덤프해 되살렸다).
// 그 경로를 앱 안에 정식으로 둔다.
//
// ── 가져오기는 **지우지 않는다** ────────────────────────────────────────────
//   · 이 기기에 없는 기록 → 새로 만든다(서버로 올라갈 기록이 된다)
//   · 이미 있는 기록 → 파일 쪽이 **더 최근에 고친 것**일 때만 덮는다
//   · 파일에서 지워진 기록 → 무시한다(가져오기가 무언가를 없애는 일은 없다)
//   · 기본 카탈로그(seed- 종목) → 무시한다. 앱이 심는 재료이고, 옛 사본이 새 카탈로그를 덮는다
//
// 두 형식을 읽는다: 이 앱이 내보낸 `liftgram-backup` · 옛 앱 복구 페이지가 만든 LokiJS 덤프.
// ─────────────────────────────────────────────────────────────────────────────
import type { Model } from '@nozbe/watermelondb';
import { database } from '../db/database';
import { SCHEMA_VERSION } from '../db/schema';
import { USER_TABLES } from './pending';

const TABLES = ['exercises', ...USER_TABLES];
const SKIP_FIELDS = new Set(['$loki', 'meta', '_status', '_changed']);

type Raw = Record<string, unknown> & { id: string };

export interface BackupFile {
  format: 'liftgram-backup';
  version: 1;
  exportedAt: string;
  schemaVersion: number;
  /** 이 기기 주인(동기 소유자). 모르면 null */
  owner: string | null;
  tables: Record<string, Raw[]>;
}

export interface ImportReport {
  created: number;
  updated: number;
  skipped: number;
  /** 표마다 [만든 수, 덮은 수] */
  byTable: Record<string, [number, number]>;
}

/** 이 기기의 기록을 모두 꺼낸다(지운 표시가 된 것도 — 무엇이 일어났는지 남긴다). */
export async function exportBackup(owner: string | null): Promise<BackupFile> {
  const tables: Record<string, Raw[]> = {};
  for (const table of TABLES) {
    const rows = await database.get(table).query().fetch();
    tables[table] = rows.map((r) => ({ ...(r._raw as unknown as Raw) }));
  }
  return {
    format: 'liftgram-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    owner,
    tables,
  };
}

/** 파일 내용(JSON)을 표→레코드로 읽는다. 모르는 형식이면 오류. */
export function parseBackup(json: unknown): Record<string, Raw[]> {
  if (!json || typeof json !== 'object') throw new Error('백업 파일이 아니에요');
  const obj = json as Record<string, unknown>;
  if (obj.format === 'liftgram-backup' && obj.tables && typeof obj.tables === 'object') {
    return obj.tables as Record<string, Raw[]>;
  }
  // 옛 앱 복구 페이지(LokiJS 증분 IndexedDB 덤프): dbs.<이름>.LokiIncrementalData = [{key, value}]
  // key "<표>.chunk.N" 의 value 가 그 표의 문서 배열(JSON 문자열)이다.
  if (obj.dbs && typeof obj.dbs === 'object') {
    const out: Record<string, Raw[]> = {};
    for (const stores of Object.values(obj.dbs as Record<string, Record<string, unknown[]>>)) {
      for (const rows of Object.values(stores ?? {})) {
        for (const row of (rows ?? []) as Array<{ key?: unknown; value?: unknown }>) {
          let key = row.key;
          let val = row.value;
          if (val && typeof val === 'object' && 'key' in val && 'value' in val) {
            key = (val as { key: unknown }).key;
            val = (val as { value: unknown }).value;
          }
          const m = typeof key === 'string' ? /^(\w+)\.chunk\.\d+$/.exec(key) : null;
          if (!m) continue;
          const docs = typeof val === 'string' ? (JSON.parse(val) as unknown) : val;
          for (const d of (Array.isArray(docs) ? docs : []) as Raw[]) {
            if (d && typeof d === 'object' && typeof d.id === 'string') (out[m[1]] ??= []).push(d);
          }
        }
      }
    }
    if (Object.keys(out).length) return out;
  }
  throw new Error('백업 파일 형식을 알 수 없어요');
}

function updatedAt(r: Record<string, unknown>): number {
  const v = Number(r.updated_at ?? r.created_at ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/** 파일의 기록을 이 기기에 합친다. 지우지 않는다(머리말 참고). */
export async function importBackup(json: unknown): Promise<ImportReport> {
  const tables = parseBackup(json);
  const report: ImportReport = { created: 0, updated: 0, skipped: 0, byTable: {} };

  await database.write(async () => {
    const batch: Model[] = [];
    for (const table of TABLES) {
      const rows = tables[table] ?? [];
      if (!rows.length) continue;
      const collection = database.get(table);
      const existing = new Map<string, Model>();
      for (const m of await collection.query().fetch()) existing.set(m.id, m);
      let made = 0;
      let over = 0;

      for (const raw of rows) {
        const status = raw._status;
        if (status === 'deleted') {
          report.skipped++;
          continue;
        }
        if (table === 'exercises' && raw.id.startsWith('seed-') && !raw.is_custom) {
          report.skipped++;
          continue;
        }
        const clean: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(raw)) if (!SKIP_FIELDS.has(k)) clean[k] = v;

        const local = existing.get(raw.id);
        if (!local) {
          // 새 기록 — 서버로 올라갈 것으로 표시해 만든다.
          batch.push(collection.prepareCreateFromDirtyRaw({ ...clean, _status: 'created', _changed: '' }));
          made++;
          continue;
        }
        if (updatedAt(clean) <= updatedAt(local._raw as unknown as Record<string, unknown>)) {
          report.skipped++;
          continue;
        }
        batch.push(
          local.prepareUpdate((rec) => {
            const setRaw = (rec as unknown as { _setRaw(k: string, v: unknown): void })._setRaw.bind(rec);
            for (const [k, v] of Object.entries(clean)) if (k !== 'id') setRaw(k, v);
          }),
        );
        over++;
      }
      report.created += made;
      report.updated += over;
      report.byTable[table] = [made, over];
    }
    if (batch.length) await database.batch(...batch);
  });
  return report;
}
