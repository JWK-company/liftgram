// @plm SRS-057  운영 기록 이관(카탈로그 개편 P2) — 서버 sync_records 의 운동·루틴 블록을 새 카탈로그 규칙으로 옮긴다
//
// ─────────────────────────────────────────────────────────────────────────────
// 왜 Go 가 아니라 이 스크립트인가: 「어디로 옮기나」는 기기 정규화(core/migrations/catalogNormalize.ts)와
// **같은 함수**(core/domain/catalogMigrationPlan.ts)가 정해야 서버·기기가 같은 결과로 수렴한다(QA H1·H2).
// 같은 규칙을 Go 로 다시 쓰면 둘이 조용히 갈라진다. 그래서 계획은 TypeScript 가 세우고, 데이터베이스에는
// psql 로 **한 트랜잭션짜리 SQL** 을 보낸다(서버에 런타임을 더 깔 필요가 없다).
//
// 자동 마이그레이션(0000~)에 넣지 않는다(QA B3): 검증 실패가 migrate 실패가 되면 백엔드가 뜨지 않는다.
// 실패하면 **이 트랜잭션만** 되돌아가고 API 는 그대로 돈다.
//
// 실행 (src/ 에서)
//   node --import tsx scripts/migrate-records.ts --psql "<psql 명령>" --dry-run   계획 + 실제로 돌려 보고 ROLLBACK
//   node --import tsx scripts/migrate-records.ts --psql "<psql 명령>" --apply     같은 것을 COMMIT
//   --report <파일>  사람이 읽는 리포트(markdown)를 쓴다
//   <psql 명령> 예: "docker exec -i lg-dryrun psql -U app -d app"
//                   "ssh h2500-3 'cd ~/liftgram/src && docker compose -p liftgram -f compose.yaml -f compose.prod.yaml exec -T db sh -c \"psql -U \\$POSTGRES_USER -d \\$POSTGRES_DB\"'"
//
// 지키는 것(같은 트랜잭션 안에서 검사 — 하나라도 어기면 RAISE → 전부 되돌림 · QA H7)
//   · 사용자별 수행 세트 수·raw 볼륨(무게×횟수×배수, 워밍업·실패·미체크·지운 것 제외) 불변
//   · (사용자 × 블록)별 세트 수 불변 · 지운 레코드 수 불변
//   · 머신 브랜드 칸: (사용자 × 브랜드) 블록 수가 줄지 않는다(병합이 브랜드를 더할 수는 있다)
//   · 보관 종목을 가리키는 블록 0 · 어디에도 없는 종목을 가리키는 블록이 늘지 않는다
//   · 기구 변형 칸(equip:바벨·덤벨…) 블록 수 = 계획이 남긴 수(예외 표·대상 없음)
//   · payload 의 `_status`/`_changed` 가 늘지 않는다(동기 전체를 죽이는 키 — 메모리 offline-data-loss)
// 계획 시점과 적용 시점 사이에 바뀐 레코드(사용자가 그새 동기)는 건너뛴다 — 기기 정규화가 뒤를 잇는다.
// 멱등: 두 번째 실행은 옮길 것이 없다.
// ─────────────────────────────────────────────────────────────────────────────
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { CATALOG, CATALOG_FAMILIES } from "../core/src/data/catalog/catalog.generated";
import { MIGRATION_OVERRIDES } from "../core/src/data/catalog/catalogMigration.data";
import {
  buildCatalogIndex,
  planBlockMigration,
  planDisplayNames,
  type BlockColumns,
} from "../core/src/domain/catalogMigrationPlan";
import { MACHINE_BRAND_KEYS } from "../core/src/domain/machineVariants";
import { IMPLEMENT_KEYS, dimsFromColumns } from "../core/src/domain/variants";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const PSQL = opt("--psql");
const APPLY = flag("--apply");
const DRY = flag("--dry-run");
const REPORT = opt("--report");
if (!PSQL || APPLY === DRY) {
  console.error('사용법: --psql "<psql 명령>" (--dry-run | --apply) [--report <파일>]');
  process.exit(2);
}

const psql = (sql: string, extra = "-At") =>
  execSync(`${PSQL} -v ON_ERROR_STOP=1 -q ${extra}`, { input: sql, maxBuffer: 1 << 28, encoding: "utf8" });

type Rec = { id: string; u: string; c: string; r: string; p: Record<string, unknown>; d: boolean; t: string };

// ── ① 읽기 ──
const raw =
  psql(`SELECT json_build_object('id',id,'u',user_id,'c',collection,'r',record_id,'p',payload,'d',deleted,'t',updated_at::text)
FROM sync_records WHERE collection IN ('workout_exercises','routine_exercises','set_logs','exercise_user_prefs');`);
const recs: Rec[] = raw
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l));

const idx = buildCatalogIndex(CATALOG, CATALOG_FAMILIES, MIGRATION_OVERRIDES);
const now = Date.now();
const s = (v: unknown) => (typeof v === "string" ? v : null);

// ── ② 계획 ──
interface Patch {
  id: string;
  t: string;
  p: Record<string, unknown>;
}
const patches: Patch[] = [];
const moves = new Map<string, { blocks: number; sets: number; kind: Set<string> }>(); // "원 → 대상" 표
const kept = new Map<string, number>(); // 사유 × 종목
let rule0 = 0;
let expectedImplement = 0;
const armUniBlocks = new Map<string, string>(); // `${user}|${we id}` → user
const setsOfBlock = new Map<string, Rec[]>();
for (const r of recs)
  if (r.c === "set_logs" && !r.d) {
    const k = `${r.u}|${s(r.p.workout_exercise_id)}`;
    const list = setsOfBlock.get(k) ?? [];
    list.push(r);
    setsOfBlock.set(k, list);
  }

const usePerUser = new Map<string, Map<string, number>>();
const movedPerUser = new Map<string, Set<string>>();
const blocks = recs.filter((r) => !r.d && (r.c === "workout_exercises" || r.c === "routine_exercises"));
for (const b of blocks) {
  const cols: BlockColumns = {
    exerciseId: s(b.p.exercise_id) ?? "",
    variantKey: s(b.p.variant_key),
    variantEquipment: s(b.p.variant_equipment),
    variantGrip: s(b.p.variant_grip),
    variantArm: s(b.p.variant_arm),
    variantLoad: s(b.p.variant_load),
    variantAttach: s(b.p.variant_attach),
    machineVariant: s(b.p.machine_variant),
  };
  const use = usePerUser.get(b.u) ?? new Map<string, number>();
  use.set(cols.exerciseId, (use.get(cols.exerciseId) ?? 0) + 1);
  usePerUser.set(b.u, use);

  const plan = planBlockMigration(cols, idx);
  if (plan.steps.includes("0:legacy-mirror")) rule0 += 1;
  for (const k of plan.kept) {
    const key = `${k} · ${idx.byId.get(cols.exerciseId)?.nameKo ?? cols.exerciseId} · ${cols.variantKey ?? cols.variantEquipment ?? cols.machineVariant ?? "-"}`;
    kept.set(key, (kept.get(key) ?? 0) + 1);
  }
  const finalEq = plan.changed ? plan.columns.variantEquipment : (dimsFromColumns(cols).equipment ?? null);
  const finalEx = plan.changed ? plan.exerciseId : cols.exerciseId;
  const finalBase = idx.byId.get(finalEx)?.equipment;
  if (
    finalEq &&
    (IMPLEMENT_KEYS as string[]).includes(finalEq) &&
    !(finalEq === "machine" && finalBase === "machine")
  )
    expectedImplement += 1;
  if (!plan.changed) continue;
  if (plan.exerciseId !== cols.exerciseId) {
    const mv = movedPerUser.get(b.u) ?? new Set<string>();
    mv.add(plan.exerciseId);
    movedPerUser.set(b.u, mv);
  }

  patches.push({
    id: b.id,
    t: b.t,
    p: {
      exercise_id: plan.exerciseId,
      variant_key: plan.columns.variantKey,
      variant_equipment: plan.columns.variantEquipment,
      variant_grip: plan.columns.variantGrip,
      variant_arm: null, // 팔은 세트 속성(ADR-034) — 아래에서 세트로 내린다
      variant_load: plan.columns.variantLoad,
      variant_attach: plan.columns.variantAttach,
      machine_variant: null,
      updated_at: now,
    },
  });
  const sets = b.c === "workout_exercises" ? (setsOfBlock.get(`${b.u}|${b.r}`) ?? []) : [];
  const from = idx.byId.get(cols.exerciseId)?.nameKo ?? cols.exerciseId;
  const to = idx.byId.get(plan.exerciseId)?.nameKo ?? plan.exerciseId;
  const mk = `${from} → ${to}${plan.columns.variantKey ? ` [${plan.columns.variantKey}]` : ""}`;
  const m = moves.get(mk) ?? { blocks: 0, sets: 0, kind: new Set<string>() };
  m.blocks += 1;
  m.sets += sets.length;
  m.kind.add(b.c === "workout_exercises" ? "운동" : "루틴");
  moves.set(mk, m);
  if (plan.setArmUni && b.c === "workout_exercises") armUniBlocks.set(`${b.u}|${b.r}`, b.u);
}
// 원암 함축 → 세트의 arm
let armSets = 0;
for (const k of armUniBlocks.keys())
  for (const set of setsOfBlock.get(k) ?? []) {
    if (s(set.p.arm)) continue;
    patches.push({ id: set.id, t: set.t, p: { arm: "uni", updated_at: now } });
    armSets += 1;
  }

// 표시 이름 연속성(QA M3) — 선호 레코드가 이미 있으면(지운 것 포함) 건드리지 않는다
const havePref = new Set(recs.filter((r) => r.c === "exercise_user_prefs").map((r) => `${r.u}|${r.r}`));
const prefInserts: { u: string; r: string; p: Record<string, unknown> }[] = [];
for (const [u, use] of usePerUser) {
  for (const [exerciseId, displayName] of planDisplayNames(use, idx, movedPerUser.get(u) ?? [])) {
    const r = `pref-${exerciseId}`;
    if (havePref.has(`${u}|${r}`)) continue;
    prefInserts.push({
      u,
      r,
      p: {
        id: r,
        exercise_id: exerciseId,
        display_name: displayName,
        plate_one_side: null,
        created_at: now,
        updated_at: now,
      },
    });
  }
}

// load_mode 가 바뀌는 이동(앱 화면 볼륨이 정당하게 달라지는 것 — 리포트에만 표시)
const loadModeChanges = [...moves.keys()].filter((k) => {
  const [from, rest] = k.split(" → ");
  const to = rest.replace(/ \[.*\]$/, "");
  const a = CATALOG.find((r) => r.nameKo === from);
  const b = CATALOG.find((r) => r.nameKo === to);
  return (
    a &&
    b &&
    (a.loadMode ?? (a.equipment === "bodyweight" ? "bodyweight" : null)) !==
      (b.loadMode ?? (b.equipment === "bodyweight" ? "bodyweight" : null))
  );
});

// ── ③ SQL (한 트랜잭션) ──
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const brandList = MACHINE_BRAND_KEYS.map(lit).join(",");
const implList = IMPLEMENT_KEYS.map(lit).join(",");
const effEq = (alias: string) =>
  `coalesce(substring(${alias}.payload->>'variant_key' from 'equip:([^|]+)'), CASE WHEN ${alias}.payload->>'variant_key' IS NULL THEN coalesce(nullif(${alias}.payload->>'variant_equipment',''), nullif(${alias}.payload->>'machine_variant','')) END)`;
const BLOCK = `collection IN ('workout_exercises','routine_exercises') AND NOT deleted`;
const VOLUME = `SELECT st.user_id, count(*) AS n,
  coalesce(sum((st.payload->>'weight_kg')::numeric * (st.payload->>'reps')::numeric * coalesce(nullif((st.payload->>'load_multiplier')::numeric, 0), 1)), 0) AS v
FROM sync_records st JOIN sync_records b ON b.user_id = st.user_id AND b.collection = 'workout_exercises' AND b.record_id = st.payload->>'workout_exercise_id' AND NOT b.deleted
WHERE st.collection = 'set_logs' AND NOT st.deleted
  AND coalesce(st.payload->>'done', '') <> 'false' AND coalesce(st.payload->>'is_warmup', '') <> 'true' AND coalesce(st.payload->>'is_failed', '') <> 'true'
GROUP BY st.user_id`;
const DANGLING = `SELECT count(*) FROM sync_records b WHERE ${BLOCK}
  AND NOT EXISTS (SELECT 1 FROM exercises e WHERE e.id = b.payload->>'exercise_id')
  AND NOT EXISTS (SELECT 1 FROM sync_records c WHERE c.user_id = b.user_id AND c.collection = 'exercises' AND c.record_id = b.payload->>'exercise_id' AND NOT c.deleted)`;

const patchValues = patches
  .map((p) => `(${lit(p.id)}, ${lit(p.t)}, ${lit(JSON.stringify(p.p))}::jsonb)`)
  .join(",\n");
const prefValues = prefInserts
  .map(
    (x) =>
      `(gen_random_uuid()::text, ${lit(x.u)}, 'exercise_user_prefs', ${lit(x.r)}, ${lit(JSON.stringify(x.p))}::jsonb, false, now(), now())`,
  )
  .join(",\n");

const sql = `BEGIN;
SET LOCAL lock_timeout = '10s';
CREATE TEMP TABLE pre_vol ON COMMIT DROP AS ${VOLUME};
CREATE TEMP TABLE pre_sets ON COMMIT DROP AS SELECT user_id, payload->>'workout_exercise_id' AS we, count(*) AS n FROM sync_records WHERE collection = 'set_logs' AND NOT deleted GROUP BY 1, 2;
CREATE TEMP TABLE pre_del ON COMMIT DROP AS SELECT collection, count(*) AS n FROM sync_records WHERE deleted GROUP BY 1;
CREATE TEMP TABLE pre_brand ON COMMIT DROP AS SELECT user_id, ${effEq("b")} AS brand, count(*) AS n FROM sync_records b WHERE ${BLOCK} AND ${effEq("b")} IN (${brandList}) GROUP BY 1, 2;
CREATE TEMP TABLE pre_misc ON COMMIT DROP AS SELECT (${DANGLING}) AS dangling, (SELECT count(*) FROM sync_records WHERE payload ? '_status' OR payload ? '_changed') AS internal;

CREATE TEMP TABLE patch (id text PRIMARY KEY, t text, p jsonb) ON COMMIT DROP;
${patches.length ? `INSERT INTO patch VALUES\n${patchValues};` : ""}
CREATE TEMP TABLE applied ON COMMIT DROP AS SELECT id FROM patch WHERE false;
WITH u AS (
  UPDATE sync_records s SET payload = s.payload || patch.p, updated_at = now()
  FROM patch WHERE s.id = patch.id AND s.updated_at = patch.t::timestamptz AND NOT s.deleted
  RETURNING s.id
) INSERT INTO applied SELECT id FROM u;
${prefInserts.length ? `INSERT INTO sync_records (id, user_id, collection, record_id, payload, deleted, created_at, updated_at) VALUES\n${prefValues}\nON CONFLICT (user_id, collection, record_id) DO NOTHING;` : ""}

DO $$
DECLARE bad text := '';
DECLARE x record;
BEGIN
  FOR x IN SELECT coalesce(a.user_id, b.user_id) AS u, a.n AS n0, b.n AS n1, a.v AS v0, b.v AS v1
           FROM pre_vol a FULL JOIN (${VOLUME}) b ON a.user_id = b.user_id
           WHERE a.n IS DISTINCT FROM b.n OR a.v IS DISTINCT FROM b.v LOOP
    bad := bad || format('볼륨/세트 수 달라짐 %s: %s/%s → %s/%s; ', x.u, x.n0, x.v0, x.n1, x.v1);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pre_sets a FULL JOIN (SELECT user_id, payload->>'workout_exercise_id' AS we, count(*) AS n FROM sync_records WHERE collection = 'set_logs' AND NOT deleted GROUP BY 1, 2) b
             ON a.user_id = b.user_id AND a.we IS NOT DISTINCT FROM b.we WHERE a.n IS DISTINCT FROM b.n) THEN
    bad := bad || '블록별 세트 수 달라짐; ';
  END IF;
  IF EXISTS (SELECT 1 FROM pre_del a FULL JOIN (SELECT collection, count(*) AS n FROM sync_records WHERE deleted GROUP BY 1) b
             ON a.collection = b.collection WHERE a.n IS DISTINCT FROM b.n) THEN
    bad := bad || '지운 레코드 수 달라짐; ';
  END IF;
  FOR x IN SELECT a.user_id, a.brand, a.n AS n0, coalesce(b.n, 0) AS n1 FROM pre_brand a
           LEFT JOIN (SELECT user_id, ${effEq("b")} AS brand, count(*) AS n FROM sync_records b WHERE ${BLOCK} AND ${effEq("b")} IN (${brandList}) GROUP BY 1, 2) b
           ON a.user_id = b.user_id AND a.brand = b.brand WHERE coalesce(b.n, 0) < a.n LOOP
    bad := bad || format('브랜드 칸 줄어듦 %s %s: %s → %s; ', x.user_id, x.brand, x.n0, x.n1);
  END LOOP;
  IF (SELECT count(*) FROM sync_records b JOIN exercises e ON e.id = b.payload->>'exercise_id' WHERE ${BLOCK} AND e.is_archived) > 0 THEN
    bad := bad || format('보관 종목을 가리키는 블록 %s; ', (SELECT count(*) FROM sync_records b JOIN exercises e ON e.id = b.payload->>'exercise_id' WHERE ${BLOCK} AND e.is_archived));
  END IF;
  IF (${DANGLING}) > (SELECT dangling FROM pre_misc) THEN
    bad := bad || '없는 종목을 가리키는 블록이 늘었다; ';
  END IF;
  IF (SELECT count(*) FROM sync_records b JOIN exercises e ON e.id = b.payload->>'exercise_id'
      WHERE ${BLOCK} AND ${effEq("b")} IN (${implList}) AND NOT (${effEq("b")} = 'machine' AND e.equipment = 'machine')) <> ${expectedImplement} THEN
    bad := bad || format('기구 변형 칸 %s (기대 ${expectedImplement}); ', (SELECT count(*) FROM sync_records b JOIN exercises e ON e.id = b.payload->>'exercise_id'
      WHERE ${BLOCK} AND ${effEq("b")} IN (${implList}) AND NOT (${effEq("b")} = 'machine' AND e.equipment = 'machine')));
  END IF;
  IF (SELECT count(*) FROM sync_records WHERE payload ? '_status' OR payload ? '_changed') > (SELECT internal FROM pre_misc) THEN
    bad := bad || '_status/_changed 가 늘었다; ';
  END IF;
  IF bad <> '' THEN
    RAISE EXCEPTION '이관 검증 실패 — 되돌린다: %', bad;
  END IF;
  RAISE NOTICE 'OK 계획 % · 적용 % · 건너뜀(그새 바뀜) % · 표시 이름 % · 기구 변형 칸 ${expectedImplement}',
    (SELECT count(*) FROM patch), (SELECT count(*) FROM applied), (SELECT count(*) FROM patch) - (SELECT count(*) FROM applied),
    ${prefInserts.length};
END $$;
SELECT 'vol', user_id, n, v FROM pre_vol ORDER BY user_id;
${APPLY ? "COMMIT;" : "ROLLBACK;"}
`;

let out: string;
try {
  out = execSync(`${PSQL} -v ON_ERROR_STOP=1 -q -At 2>&1`, {
    input: sql,
    maxBuffer: 1 << 28,
    encoding: "utf8",
  });
} catch (e) {
  // 검증 실패(RAISE) — 트랜잭션은 이미 되돌아갔다. 무엇이 어긋났는지 그대로 보인다.
  console.error(String((e as { stdout?: string }).stdout ?? e));
  process.exit(1);
}
console.log(out.trim());

// ── ④ 리포트 ──
const userBlocks = new Map<string, number>();
for (const b of blocks) userBlocks.set(b.u, (userBlocks.get(b.u) ?? 0) + 1);
const lines: string[] = [];
lines.push(`# 운영 기록 이관 ${APPLY ? "적용" : "드라이런"} 리포트`, "");
lines.push(
  `- 시각: ${new Date(now).toISOString()} · 대상: sync_records 의 **모든 사용자**(${usePerUser.size}명 · 블록 ${blocks.length})`,
);
lines.push(
  `- 옮길 블록 ${patches.length - armSets} · 원암을 세트로 내린 세트 ${armSets} · 표시 이름 심기 ${prefInserts.length}`,
);
lines.push(`- 규칙 0(레거시 미러만 있던 블록) ${rule0} · 계획 후 남는 기구 변형 칸 ${expectedImplement}`);
lines.push(
  `- psql 결과: \`${out
    .trim()
    .split("\n")
    .filter((l) => l.includes("OK") || l.includes("실패") || l.includes("ERROR"))
    .join(" / ")}\``,
  "",
);
lines.push("## 원 → 대상 (블록 · 세트)", "", "| 이동 | 블록 | 세트 | 출처 |", "|---|---:|---:|---|");
for (const [k, v] of [...moves].sort((a, b) => b[1].sets - a[1].sets))
  lines.push(`| ${k} | ${v.blocks} | ${v.sets} | ${[...v.kind].join("·")} |`);
lines.push("", "## 옮기지 않고 남긴 칸", "", "| 사유 · 종목 · 칸 | 블록 |", "|---|---:|");
for (const [k, v] of [...kept].sort((a, b) => b[1] - a[1])) lines.push(`| ${k} | ${v} |`);
lines.push("", "## 표시 이름(옛 이름 유지)", "", "| 종목 | 표시 이름 |", "|---|---|");
for (const x of prefInserts)
  lines.push(`| ${idx.byId.get(String(x.p.exercise_id))?.nameKo} | ${x.p.display_name ?? "(대표 이름)"} |`);
lines.push("", "## 앱 화면 볼륨이 정당하게 달라지는 이동(load_mode 변경)", "");
lines.push(loadModeChanges.length ? loadModeChanges.map((k) => `- ${k}`).join("\n") : "- 없음");
lines.push(
  "",
  "## 사용자별 수행 세트·raw 볼륨(이관 전 — 검증은 트랜잭션 안에서 전후 비교)",
  "",
  "| 사용자 | 세트 | 볼륨(kg) |",
  "|---|---:|---:|",
);
for (const l of out.split("\n").filter((x) => x.startsWith("vol|"))) {
  const [, u, n, v] = l.split("|");
  lines.push(`| ${u.slice(0, 8)}… | ${n} | ${v} |`);
}
if (REPORT) writeFileSync(REPORT, `${lines.join("\n")}\n`);
console.log(lines.slice(0, 6).join("\n"));
