// @plm SRS-055 SRS-057  종목 카탈로그 생성기 — 마스터 CSV(정본) 하나에서 시드·이관 매핑·서버 SQL을 만든다
//
// ─────────────────────────────────────────────────────────────────────────────
// 왜 한 곳에서 만드나: 종목 480행이 시드(TS)·서버(SQL)·이관 매핑(서버·기기 공용)에 따로 적히면
// 조용히 갈라진다. 기록 이관은 서버 SQL과 기기 부팅 정규화가 **같은 표**를 써야 수렴한다(ADR-033·SRS-057).
//
// 입력 (core/src/data/catalog/)
//   catalog.master.csv       종목 마스터 — 열 의미는 spec `_context.md` §2 (+ name_rule)
//   catalog.families.csv     동작 그룹 메타 — 허용 부착물·손 그립·적재 방식(ADR-034)·흔한 적재 방식 load_default(SRS-084)
//   migration-overrides.csv  같은 family 로 풀리지 않는 운영 칸의 명시 예외(QA H6)
// 출력
//   core/src/data/catalog/catalog.generated.ts       종목·family 표(시드 원천 — P2 에서 시드가 이것을 쓴다)
//   core/src/data/catalog/catalogMigration.data.ts   이관 예외 표(서버·기기 공용 매핑의 데이터)
//   core/src/data/catalog/catalogRevision.ts         번들 카탈로그 판(내용 해시) — 판이 바뀐 첫 부팅에 기기 시드를 맞춘다
//   database/migrations/0014_catalog_revamp.sql      서버 카탈로그 개편 SQL(P2 에서 켰다)
//
// 실행: make catalog        (생성)   ·   make catalog-check   (생성물이 정본과 같은가 — CI)
//
// 옛 생성기(gen-exercise-seed.mjs)는 입력이 은퇴한 app/ 경로이고 이미 적용된 0002 를 덮어써서 쓰지 않는다.
// 이 생성기가 지키는 것: 정본을 못 읽었거나 줄었으면(최소 행 수) **파일을 쓰지 않고** 종료 코드 1.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..");
const CAT = join(SRC, "core", "src", "data", "catalog");
const OUT_TS = join(CAT, "catalog.generated.ts");
const OUT_MIG = join(CAT, "catalogMigration.data.ts");
const OUT_REV = join(CAT, "catalogRevision.ts");
// P2: 서버 적용 경로로 옮겼다(파일명으로 한 번만 적용 — 이후 CSV 를 고치면 새 번호의 마이그레이션을 만든다).
// [원본] 출력이 0014 로 고정돼 CSV 를 고치면 이미 적용된 0014 를 덮어썼다 — 서버는 건너뛰고 기기만 바뀌었다(/qa code M-3)
// const OUT_SQL = join(SRC, "database", "migrations", "0014_catalog_revamp.sql");
// [개선] 카탈로그 SQL 은 가장 최근 카탈로그 마이그레이션과 내용이 다를 때만 **새 번호 파일**로 낸다(아래 catalogSqlOutput)
const MIGRATIONS = join(SRC, "database", "migrations");
const CATALOG_SQL_RE = /^(\d{4})_catalog_.*\.sql$/;

const MIN_ROWS = 450;
const CHECK = process.argv.includes("--check");

const die = (msg) => {
  console.error(`  ✗ ${msg}`);
  console.error("    파일을 쓰지 않고 멈춥니다.");
  process.exit(1);
};

// ── CSV (RFC 4180 — 따옴표·쉼표·줄바꿈 포함 필드) ──
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.length > 1 || r[0] !== "");
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const list = (v) =>
  (v ?? "")
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);

/** 시드 id — nameEn 슬러그. seedRunner.seedId 와 같은 규칙(바꾸면 모든 기록이 끊긴다). */
export function seedIdOf(nameEn) {
  const slug = nameEn
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `seed-${slug}`;
}

function parseAxes(v) {
  const out = {};
  for (const seg of list(v)) {
    const [k, val] = seg.split("=").map((x) => x.trim());
    if (k && val) out[k] = val;
  }
  return out;
}

const master = parseCsv(readFileSync(join(CAT, "catalog.master.csv"), "utf8"));
const families = parseCsv(readFileSync(join(CAT, "catalog.families.csv"), "utf8"));
const overrides = parseCsv(readFileSync(join(CAT, "migration-overrides.csv"), "utf8"));
if (master.length < MIN_ROWS) die(`마스터가 ${master.length}행입니다 — 최소 ${MIN_ROWS}행을 기대합니다`);

const idByEn = new Map(master.map((r) => [r.id_en, seedIdOf(r.id_en)]));
const resolve = (en, where) => {
  const id = idByEn.get(en);
  if (!id) die(`${where}: 마스터에 없는 종목을 가리킵니다 — ${en}`);
  return id;
};

const rows = master.map((r) => {
  const archived = r.status === "merge" || r.status === "delete";
  return {
    id: seedIdOf(r.id_en),
    nameEn: r.id_en,
    // 병합·삭제 행은 옛 이름을 유지하고 보관한다(QA M2 — 대상 이름과 UNIQUE 충돌 방지).
    nameKo: archived ? r.old_name_ko : r.new_name_ko,
    oldNameKo: r.old_name_ko || null,
    status: r.status,
    nameRule: r.name_rule,
    equipment: r.equipment,
    primaryMuscles: list(r.primary),
    secondaryMuscles: list(r.secondary),
    kind: r.kind === "cardio" ? "cardio" : null,
    loadMode: r.load_mode === "assisted" || r.load_mode === "bodyweight" ? r.load_mode : null,
    family: r.family,
    aliasesKo: list(r.aliases_ko),
    aliasesEn: list(r.aliases_en),
    mergeInto: r.merge_into ? resolve(r.merge_into, `${r.id_en} merge_into`) : null,
    impliedAxes: parseAxes(r.implied_axes),
    similar: list(r.similar),
    media: r.media || null,
    usageSets: r.usage_sets ? Number(r.usage_sets) : 0,
    isArchived: archived,
  };
});

// [원본] 적재 축 유무만 실었다
// const fams = families.map((f) => ({ family: f.family, equipments: …, attachments: …, grips: …, load: list(f.load).length > 0 }));
// [개선] 적재 축이 있는 family 는 「흔한 적재 방식」(load_default = plate|pin)도 싣는다 — 빈 적재 칸의 기본(피드백 #63 · SRS-084).
// 축이 없는 family 줄은 예전과 같은 모양(생성물 diff 를 줄인다). 키 축(ADR-034)은 바뀌지 않는다.
const fams = families.map((f) => {
  const load = list(f.load).length > 0;
  const def = (f.load_default ?? "").trim();
  if (def && !["plate", "pin"].includes(def)) die(`family ${f.family}: load_default 는 plate|pin — ${def}`);
  if (load && !def) die(`family ${f.family}: 적재 축이 있으면 load_default(plate|pin)가 필요합니다`);
  if (!load && def) die(`family ${f.family}: 적재 축이 없는데 load_default 가 있습니다`);
  return {
    family: f.family,
    equipments: list(f.equipments),
    attachments: list(f.attachments),
    grips: list(f.grips),
    load,
    ...(load ? { loadDefault: def } : {}),
  };
});

const ovr = overrides.map((o) => ({
  sourceId: resolve(o.source_id_en, "override source"),
  variantEquipment: o.variant_equipment,
  targetId: resolve(o.target_id_en, "override target"),
  axes: parseAxes(o.axes),
  note: o.note,
}));

// ── TS ── 한 행 한 줄(리뷰 diff 가 종목 단위로 보이게)
const lines = (a) => a.map((x) => `  ${JSON.stringify(x)},`).join("\n");
const HEADER =
  "// 생성물이다 — 손으로 고치지 않는다. 정본: core/src/data/catalog/*.csv · 재생성: make catalog\n";
const ts = `${HEADER}// @plm SRS-055  종목 카탈로그 표(${rows.length}행 · family ${fams.length}) — 시드·검색·기구 바꾸기·이관이 함께 읽는다.
import type { CatalogFamily, CatalogRow } from './catalogTypes';

export const CATALOG: CatalogRow[] = [
${lines(rows)}
];

export const CATALOG_FAMILIES: CatalogFamily[] = [
${lines(fams)}
];
`;
const mig = `${HEADER}// @plm SRS-057  이관 예외 표 — 같은 family 의 형제 종목으로 풀리지 않는 운영 칸(QA H6). 서버·기기 공용.
import type { MigrationOverride } from './catalogTypes';

export const MIGRATION_OVERRIDES: MigrationOverride[] = [
${lines(ovr)}
];
`;

// ── SQL (P2 에서 켠다) ──
const sq = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const arr = (a) => `'{${a.map((x) => `"${x.replace(/"/g, '\\"')}"`).join(",")}}'`;
const values = rows
  .map(
    (r) =>
      `  (${sq(r.id)}, ${sq(r.nameKo)}, ${sq(r.nameEn)}, ${arr(r.primaryMuscles)}, ${arr(r.secondaryMuscles)}, ${sq(r.equipment)}, ${sq(r.kind)}, ${sq(r.loadMode)}, ${r.isArchived}, ${arr([...r.aliasesKo, ...r.aliasesEn])}, ${sq(r.family)}, ${arr(r.similar)}, ${sq(r.media)})`,
  )
  .join(",\n");
const sql = `-- @plm SRS-055  종목 카탈로그 개편 — **생성물이다. 손으로 고치지 않는다.** (scripts/gen-catalog.mjs)
--
-- 멱등: 몇 번 돌려도 같다. 실제로 달라진 행만 updated_at 을 올린다(상태와 무관하게 전 필드 비교 — QA L5).
-- name_ko UNIQUE 충돌(이름 교환)을 피하려고, 이름이 바뀌는 행을 먼저 임시 이름으로 옮긴다(2단계).
-- 커스텀 종목(is_custom)은 만들지도 덮지도 않는다.

ALTER TABLE exercises ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS family text;
-- similar 는 PostgreSQL 예약어(SIMILAR TO)라 열 이름을 similar_refs 로 둔다(계약·로컬 이름은 similar).
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS similar_refs text[] NOT NULL DEFAULT '{}';
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS media_ref text;

CREATE TEMP TABLE catalog_new (
  id text PRIMARY KEY, name_ko text NOT NULL, name_en text, primary_muscles text[], secondary_muscles text[],
  equipment text, kind text, load_mode text, is_archived boolean, aliases text[], family text, similar_refs text[], media_ref text
) ON COMMIT DROP;

INSERT INTO catalog_new VALUES
${values};

-- 1단계: 이름이 바뀌는 기존 행을 임시 이름으로(UNIQUE(name_ko) 교환 충돌 방지)
UPDATE exercises e SET name_ko = '__catalog_tmp__' || e.id
  FROM catalog_new n
 WHERE n.id = e.id AND e.is_custom = false AND e.name_ko IS DISTINCT FROM n.name_ko;

-- 2단계: 전 필드 upsert(달라진 행만)
INSERT INTO exercises AS e (id, name_ko, name_en, primary_muscles, secondary_muscles, equipment, kind, load_mode, is_archived, aliases, family, similar_refs, media_ref)
SELECT id, name_ko, name_en, primary_muscles, secondary_muscles, equipment, kind, load_mode, is_archived, aliases, family, similar_refs, media_ref FROM catalog_new
ON CONFLICT (id) DO UPDATE SET
  name_ko = EXCLUDED.name_ko, name_en = EXCLUDED.name_en,
  primary_muscles = EXCLUDED.primary_muscles, secondary_muscles = EXCLUDED.secondary_muscles,
  equipment = EXCLUDED.equipment, kind = EXCLUDED.kind, load_mode = EXCLUDED.load_mode,
  is_archived = EXCLUDED.is_archived, aliases = EXCLUDED.aliases, family = EXCLUDED.family,
  similar_refs = EXCLUDED.similar_refs, media_ref = EXCLUDED.media_ref, updated_at = now()
WHERE e.is_custom = false AND (
  e.name_ko, e.name_en, e.primary_muscles, e.secondary_muscles, e.equipment, e.kind, e.load_mode,
  e.is_archived, e.aliases, e.family, e.similar_refs, e.media_ref
) IS DISTINCT FROM (
  EXCLUDED.name_ko, EXCLUDED.name_en, EXCLUDED.primary_muscles, EXCLUDED.secondary_muscles, EXCLUDED.equipment,
  EXCLUDED.kind, EXCLUDED.load_mode, EXCLUDED.is_archived, EXCLUDED.aliases, EXCLUDED.family, EXCLUDED.similar_refs,
  EXCLUDED.media_ref
);
`;

const rev = createHash("sha1")
  .update(JSON.stringify([rows, fams]))
  .digest("hex")
  .slice(0, 10);
const revTs = `${HEADER}// @plm SRS-055  번들 카탈로그 판 — 표 내용의 해시. 바뀌면 기기가 한 번 시드 종목을 새 표에 맞춘다(refreshSeedCatalog).
export const CATALOG_REVISION = '${rev}';
`;

/**
 * 카탈로그 SQL 을 어디에 쓸지 — **이미 있는 마이그레이션 파일은 절대 고치지 않는다**(서버는 파일명으로 한 번만 적용한다).
 * 가장 최근 카탈로그 마이그레이션(NNNN_catalog_*.sql)과 내용이 같으면 쓸 것 없음, 다르면 「가장 큰 번호 + 1」 새 파일.
 * SQL 은 카탈로그 전체 상태의 멱등 upsert 라 새 파일 하나로 서버가 정본에 맞춰진다.
 */
function catalogSqlOutput(content) {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const catalogFiles = files.filter((f) => CATALOG_SQL_RE.test(f));
  const latest = catalogFiles[catalogFiles.length - 1];
  if (latest && readFileSync(join(MIGRATIONS, latest), "utf8") === content) return null;
  const maxNo = Math.max(0, ...files.map((f) => Number(f.slice(0, 4))).filter(Number.isFinite));
  return join(MIGRATIONS, `${String(maxNo + 1).padStart(4, "0")}_catalog_rev_${rev}.sql`);
}

/** 이미 커밋된 카탈로그 마이그레이션을 손으로(또는 옛 생성기로) 고쳤는가 — 적용된 파일은 바뀌면 안 된다. git 이 없으면 건너뛴다. */
function editedAppliedCatalogMigrations() {
  const out = [];
  for (const f of readdirSync(MIGRATIONS).filter((n) => CATALOG_SQL_RE.test(n))) {
    const rel = `database/migrations/${f}`;
    try {
      const committed = execFileSync("git", ["show", `HEAD:src/${rel}`], {
        cwd: SRC,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      if (committed !== readFileSync(join(MIGRATIONS, f), "utf8")) out.push(rel);
    } catch {
      // 아직 커밋 안 된 새 파일이거나 git 이 없다 — 검사 대상이 아니다
    }
  }
  return out;
}

const OUT_SQL = catalogSqlOutput(sql);
const outputs = [[OUT_TS, ts], [OUT_REV, revTs], [OUT_MIG, mig], ...(OUT_SQL ? [[OUT_SQL, sql]] : [])];

if (CHECK) {
  const drift = outputs.filter(([p, c]) => {
    try {
      return readFileSync(p, "utf8") !== c;
    } catch {
      return true;
    }
  });
  const edited = editedAppliedCatalogMigrations();
  for (const p of edited)
    console.error(
      `  ✗ 이미 적용된 카탈로그 마이그레이션이 바뀌었습니다: ${p} — 되돌리고 make catalog 로 새 번호 파일을 만드세요`,
    );
  if (edited.length) process.exit(1);
  if (drift.length) {
    for (const [p] of drift) console.error(`  ✗ 생성물이 정본과 다릅니다: ${p.replace(`${SRC}/`, "")}`);
    console.error("    make catalog 로 다시 만드세요.");
    process.exit(1);
  }
  console.log(`  ✓ 카탈로그 생성물 = 정본 (${rows.length}행 · family ${fams.length} · 예외 ${ovr.length})`);
} else {
  for (const [p, c] of outputs) {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, c);
  }
  console.log(`  ✓ 카탈로그 생성 (${rows.length}행 · family ${fams.length} · 예외 ${ovr.length})`);
}
