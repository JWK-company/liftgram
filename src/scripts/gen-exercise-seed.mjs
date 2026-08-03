// @plm SRS-001  운동 카탈로그 시드 생성기 — TS 시드(원본) → SQL 마이그레이션(파생물)
//
// 왜 생성하나: 이행 기간 동안 카탈로그의 원본은 app/의 TypeScript 시드 한 곳이다.
// 여기서 SQL을 손으로 다시 쓰면 336종이 두 곳에 적혀 조용히 갈라진다. 그래서 파생시킨다 —
// app/이 사라지는 날 이 스크립트를 지우고 SQL이 원본이 된다.
//
// 실행: make gen-exercise-seed   (node가 아니라 bun으로 돈다 — TS 시드를 그대로 import한다)
// 산출: database/migrations/0002_seed_exercises.sql
//
// ── 이 스크립트가 지키는 것 ──────────────────────────────────────────────────
// 재생성 코드젠에서 가장 위험한 실패는 **조용한 축소**다(원본을 못 읽었는데 빈 파일을 써서
// 다음 마이그레이션이 카탈로그를 지워 버리는 것). 그래서 아래 불변식이 하나라도 깨지면
// 파일을 쓰지 않고 종료 코드 1로 죽는다.
//   · 시드가 최소 300종 이상인가        (원본을 실제로 읽었는가)
//   · name_ko · name_en · id 가 유일한가 (name_ko는 커서 정렬 키다)
//   · 대체운동 참조가 전부 해소되는가    (미해소가 있으면 조용히 빈 배열이 된다)
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SEED_TS = join(REPO, "app", "src", "data", "seed", "exercises.seed.ts");
const SUBS_TS = join(REPO, "app", "src", "data", "seed", "substitutes.seed.ts");
const OUT = join(HERE, "..", "database", "migrations", "0002_seed_exercises.sql");

const MIN_EXPECTED = 300;

const { SEED_EXERCISES } = await import(SEED_TS);
const { SUBSTITUTES } = await import(SUBS_TS);

const die = (msg) => {
  console.error(`  ✗ ${msg}`);
  console.error("    파일을 쓰지 않고 멈춥니다 — 조용히 줄어든 시드가 카탈로그를 지우는 것을 막습니다.");
  process.exit(1);
};

if (!Array.isArray(SEED_EXERCISES) || SEED_EXERCISES.length < MIN_EXPECTED) {
  die(`시드가 ${SEED_EXERCISES?.length ?? 0}종입니다 — 최소 ${MIN_EXPECTED}종을 기대합니다`);
}

// app/의 seedRunner.ts와 **같은 규칙**이어야 한다. 여기서 갈라지면 로컬 기록과 서버 종목이 어긋난다.
const seedId = (nameEn) =>
  `seed-${nameEn
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;

const dupes = (values) => {
  const seen = new Set();
  const dup = new Set();
  for (const v of values) (seen.has(v) ? dup : seen).add(v);
  return [...dup];
};

const dupKo = dupes(SEED_EXERCISES.map((s) => s.nameKo));
if (dupKo.length)
  die(`name_ko 중복 ${dupKo.length}건: ${dupKo.slice(0, 5).join(", ")} — 커서 정렬 키라 유일해야 합니다`);
const dupEn = dupes(SEED_EXERCISES.map((s) => s.nameEn));
if (dupEn.length)
  die(`name_en 중복 ${dupEn.length}건: ${dupEn.slice(0, 5).join(", ")} — 안정 키라 유일해야 합니다`);
const dupId = dupes(SEED_EXERCISES.map((s) => seedId(s.nameEn)));
if (dupId.length) die(`파생 id 중복 ${dupId.length}건: ${dupId.slice(0, 5).join(", ")}`);

// 대체운동은 nameKo로 적혀 있다 — id로 해소한다(app/의 syncSubstitutes와 같은 절차).
const idByKo = new Map(SEED_EXERCISES.map((s) => [s.nameKo, seedId(s.nameEn)]));
const unresolved = [];
const subsById = new Map();
for (const [ko, names] of Object.entries(SUBSTITUTES)) {
  if (!idByKo.has(ko)) {
    unresolved.push(`KEY:${ko}`);
    continue;
  }
  const ids = [];
  for (const n of names) {
    const id = idByKo.get(n);
    if (!id) unresolved.push(`VAL:${n}`);
    else ids.push(id);
  }
  subsById.set(idByKo.get(ko), ids);
}
if (unresolved.length) {
  die(
    `대체운동 미해소 참조 ${unresolved.length}건: ${unresolved.slice(0, 5).join(", ")} — 조용히 빈 배열이 됩니다`,
  );
}

// ── SQL 조립 ────────────────────────────────────────────────────────────────
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const qOrNull = (s) => (s == null || s === "" ? "NULL" : q(s));
// text[] 리터럴. 값은 슬러그·enum 문자열이라 특수문자가 없지만, 원본이 바뀔 수 있으니 큰따옴표로 감싼다.
const arr = (xs) => q(`{${(xs ?? []).map((x) => `"${String(x).replace(/(["\\])/g, "\\$1")}"`).join(",")}}`);

const rows = SEED_EXERCISES.map((s) => {
  const id = seedId(s.nameEn);
  return `  (${q(id)}, ${q(s.nameKo)}, ${q(s.nameEn)}, ${arr(s.primaryMuscles)}, ${arr(s.secondaryMuscles)}, ${q(s.equipment)}, ${qOrNull(s.kind)}, ${qOrNull(s.loadMode)}, ${arr(subsById.get(id))})`;
}).join(",\n");

const sql = `-- @plm SRS-001  운동 카탈로그 시드 ${SEED_EXERCISES.length}종 — **생성물이다. 손으로 고치지 않는다.**
--
-- 원본: app/src/data/seed/exercises.seed.ts · app/src/data/seed/substitutes.seed.ts
-- 재생성: make gen-exercise-seed   (scripts/gen-exercise-seed.mjs)
--
-- 멱등하다: id가 같으면 갱신하되, **실제로 달라진 행만** 건드린다(updated_at이 매번 튀면
-- WatchCatalog 구독자가 바뀌지도 않은 카탈로그를 계속 다시 읽는다).
-- 커스텀 종목(is_custom)은 이 문장이 만들지도 덮지도 않는다.

INSERT INTO exercises (id, name_ko, name_en, primary_muscles, secondary_muscles, equipment, kind, load_mode, substitute_ids)
VALUES
${rows}
ON CONFLICT (id) DO UPDATE SET
  name_ko = EXCLUDED.name_ko,
  name_en = EXCLUDED.name_en,
  primary_muscles = EXCLUDED.primary_muscles,
  secondary_muscles = EXCLUDED.secondary_muscles,
  equipment = EXCLUDED.equipment,
  kind = EXCLUDED.kind,
  load_mode = EXCLUDED.load_mode,
  substitute_ids = EXCLUDED.substitute_ids,
  updated_at = now()
WHERE (
  exercises.name_ko, exercises.name_en, exercises.primary_muscles, exercises.secondary_muscles,
  exercises.equipment, exercises.kind, exercises.load_mode, exercises.substitute_ids
) IS DISTINCT FROM (
  EXCLUDED.name_ko, EXCLUDED.name_en, EXCLUDED.primary_muscles, EXCLUDED.secondary_muscles,
  EXCLUDED.equipment, EXCLUDED.kind, EXCLUDED.load_mode, EXCLUDED.substitute_ids
);
`;

writeFileSync(OUT, sql);
console.log(`  운동 카탈로그 시드 생성`);
console.log(`    종목 ${SEED_EXERCISES.length}종 · 대체운동 ${subsById.size}종 해소 · 미해소 0`);
console.log(`    → ${OUT.replace(`${REPO}/`, "")}`);
