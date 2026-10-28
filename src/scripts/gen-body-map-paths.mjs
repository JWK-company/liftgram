// @plm SRS-090  MuscleMap(Melih Colpan · MIT) Swift 경로 → 근육 지도 데이터(frontend/app/components/ui/bodyMapPaths.ts)
//
// 쓰는 법: git clone https://github.com/melihcolpan/MuscleMap /tmp/MuscleMap
//          node scripts/gen-body-map-paths.mjs /tmp/MuscleMap/Sources/MuscleMap/Data
// 남성 앞·뒤만 쓴다. 세부 구역(윗가슴·바깥 대퇴…)은 큰 근육 그림을 잘라 낸 겹침이라 버리고(openGym 과 같은 선택),
// 큰 근육을 앱 12구역에 대응시킨다. 대응이 없는 부위는 회색 바탕(base)으로만 그린다(ADR-044).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = process.argv[2];
if (!src) {
  console.error("MuscleMap Sources/MuscleMap/Data 경로를 주세요");
  process.exit(1);
}

/** MuscleMap slug → 앱 MapMuscle */
const ZONE = {
  chest: "chest",
  upperBack: "back",
  lowerBack: "back",
  rotatorCuff: "back",
  deltoids: "shoulders",
  biceps: "biceps",
  triceps: "triceps",
  forearm: "forearms",
  quadriceps: "quads",
  hamstring: "hamstrings",
  gluteal: "glutes",
  calves: "calves",
  abs: "abs",
  obliques: "abs",
  trapezius: "traps",
};
/** 근육이 아니거나 앱 구역이 없는 부위 — 늘 회색 */
const BASE = new Set([
  "head",
  "neck",
  "hands",
  "feet",
  "knees",
  "ankles",
  "tibialis",
  "adductors",
  "hipFlexors",
]);
/** 세부 구역·겹침 영역 — 버린다 */
const DROP = new Set([
  "upperChest",
  "lowerChest",
  "innerQuad",
  "outerQuad",
  "upperAbs",
  "lowerAbs",
  "frontDeltoid",
  "rearDeltoid",
  "upperTrapezius",
  "lowerTrapezius",
  "rhomboids",
  // 원본이 obliques 와 같은 경로를 그대로 쓴다(복근 색에 덮임 · 중복 3KB) — QA L-1
  "serratus",
]);

function parse(file) {
  const text = readFileSync(file, "utf8");
  const out = [];
  // 한 항목 = `BodyPartPathData(slug: .x, ...)` — 다음 항목(또는 배열 끝 `]`)까지를 본문으로 본다(들여쓰기에 기대지 않음)
  const starts = [...text.matchAll(/BodyPartPathData\(\s*slug:\s*\.(\w+),/g)];
  starts.forEach((m, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : text.indexOf("\n    ]", m.index);
    const paths = [...text.slice(m.index, end).matchAll(/"(M[^"]+)"/g)].map((x) => x[1]);
    if (!paths.length) throw new Error(`${file}: ${m[1]} 경로 0개 — 원본 형식이 바뀌었는지 확인`);
    out.push([m[1], paths]);
  });
  // 원본 항목 수와 대조 — 정규식이 놓친 항목이 있으면 멈춘다
  const total = (text.match(/BodyPartPathData\(/g) ?? []).length;
  if (total !== out.length) throw new Error(`${file}: 항목 ${total}개 중 ${out.length}개만 읽음`);
  return out;
}

/** 원본 커밋(재현용) — 클론 폴더에서 git rev-parse 로 읽는다 */
let rev = "unknown";
try {
  rev = execFileSync("git", ["-C", src, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
} catch {}

const result = {};
for (const [side, file, vb] of [
  ["front", "MaleFrontPaths.swift", [0, 95, 727, 1280]],
  ["back", "MaleBackPaths.swift", [718, 95, 727, 1280]],
]) {
  const zones = {};
  const base = [];
  const hair = [];
  for (const [slug, paths] of parse(join(src, file))) {
    if (ZONE[slug]) zones[ZONE[slug]] = [...(zones[ZONE[slug]] ?? []), ...paths];
    else if (slug === "hair") hair.push(...paths);
    else if (BASE.has(slug)) base.push(...paths);
    else if (!DROP.has(slug)) throw new Error(`모르는 부위 ${side}/${slug} — 대응표를 고치세요`);
  }
  result[side] = { viewBox: vb, base, hair, zones };
}

const header = `// 생성물이다 — 손으로 고치지 않는다. 재생성: node scripts/gen-body-map-paths.mjs <MuscleMap>/Sources/MuscleMap/Data
//   → 이어서 biome format --write (한 줄 JSON 을 줄바꿈)
// @plm SRS-090  근육 지도 경로 — MuscleMap by Melih Colpan(https://github.com/melihcolpan/MuscleMap @ ${rev}) · MIT License.
// 고지 전문은 /licenses(app/licenses/page.tsx). 남성 앞·뒤 · 세부 구역 제외 · 큰 근육 → 앱 12구역(ADR-044).
import type { MapMuscle } from "@app/core/domain/muscleLoad";

export interface BodySidePaths {
  /** 원본 viewBox(참고용 — 화면은 BodyMap 의 REAL_CROP 실측값으로 자른다) */
  viewBox: [number, number, number, number];
  /** 회색 바탕(머리·목·손·발·무릎·정강이·내전근…) */
  base: string[];
  hair: string[];
  zones: Partial<Record<MapMuscle, string[]>>;
}

`;
const here = dirname(fileURLToPath(import.meta.url));
const dst = join(here, "../frontend/app/components/ui/bodyMapPaths.ts");
writeFileSync(
  dst,
  `${header}export const BODY_PATHS: Record<"front" | "back", BodySidePaths> = ${JSON.stringify(result)};\n`,
);
console.log("wrote", dst);
