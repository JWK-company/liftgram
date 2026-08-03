// 순수 계층 이전 — app/src/{domain,data,i18n} → src/core/src/ (ADR-032)
//
// 왜 복사인가: 이행 기간 동안 같은 계산 규칙을 app/(Expo Web)과 src/(Next)가 함께 쓴다.
// 손으로 두 번 적으면 그 순간 갈라지므로, **한쪽을 원본으로 못 박고 나머지를 파생**시킨다.
// (운동 카탈로그 시드를 gen-exercise-seed로 파생시킨 것과 같은 원칙)
//
// 실행:  make sync-core     원본 → 파생 복사
//        make core-check    어긋났는지만 확인(고치지 않는다 · make verify가 부른다)
//
// ── 허용목록으로 옮기는 이유 ────────────────────────────────────────────────
// "RN에 안 묶인 것 전부"를 자동 판별하면, 원본에 파일이 하나 늘 때 **의도치 않게** 딸려 온다.
// 무엇을 옮길지는 사람이 정하고(아래 목록), 실제로 순수한지는 타입 검사가 증명한다
// (빠진 의존이 있으면 `tsc -p core` 가 깨진다).
//
// 목록에 없는 것 — i18n/index.ts(react·RN 컨텍스트 의존) · data/*Repository.ts·data/index.ts·db/
// (WatermelonDB 의존 — 로컬 저장소 계층과 함께 다음 차례에 옮긴다).
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const FROM = join(REPO, "app", "src");
const TO = join(HERE, "..", "core", "src");

/** 디렉터리 통째로 옮길 것 — 하위 전부(.ts) */
const DIRS = ["domain", "i18n/locales", "data", "db", "theme"];
/** 파일 단위로 옮길 것 */
// 단일 파일로 옮기는 것들.
//
// `state/userContext.tsx` 는 **순수 React**다 — 저장소(userRepo)와 반응형 훅 위에 얹은 설정 컨텍스트라
// 네이티브 의존이 없다. 단위(kg/lb)·바 무게·체중·보유 기구·머신 라벨 같은 값을 전 화면이 여기서 읽으므로,
// 웹에서 다시 쓰면 두 구현이 갈라진다(ADR-032: 옮길 수 있는 것은 옮긴다).
const FILES = ["utils/id.ts", "state/userContext.tsx"];

/**
 * core가 **직접 소유하는** 파일 — 원본에서 옮겨온 것이 아니므로 "남은 파일"로 지우지 않는다.
 *
 * `sync/` 가 그렇다. app의 sync 계층은 옛 백엔드(NestJS)를 향하고 react-native·
 * expo-secure-store에 묶여 있어 **옮기는 대상이 아니라 다시 쓰는 대상**이다(ADR-032의 '서버 책임').
 * 규칙(WatermelonDB 프로토콜·계정 경계)은 두 스택이 같아야 하므로 core가 들고, 말하는 방법
 * (Connect·세션·localStorage)만 밖에서 꽂는다 — 그래서 원본과 **글자가 다른 것이 정상**이다.
 */
const OWNED = new Set(["sync/syncEngine.ts", "sync/syncOwner.ts"]);

/**
 * 옮기지 않을 것.
 *
 * `db/adapter.ts` 는 네이티브(iOS/Android)용 SQLite+JSI 어댑터다. src/ 는 웹 전용 스택이라
 * 쓸 일이 없고, 번들에 들어가면 브라우저에서 해석되지 않는 네이티브 모듈을 끌어온다.
 */
const SKIP = new Set(["db/adapter.ts"]);

/**
 * 이름을 바꿔 옮길 것.
 *
 * app에서는 Metro가 웹 빌드일 때 `./adapter` 를 `adapter.web.ts` 로 알아서 바꿔 해석한다.
 * Next에는 그 플랫폼 확장 해석이 없으므로, **웹판을 정본 이름으로** 옮긴다 —
 * 그래야 `database.ts` 의 `import { buildAdapter } from './adapter'` 를 한 글자도 고치지 않는다.
 * (드리프트 검사는 이 짝을 그대로 비교하므로 여전히 엄격하다)
 */
const RENAMES = new Map([["db/adapter.web.ts", "db/adapter.ts"]]);

/**
 * `src/` 밖에 있지만 테스트가 읽는 파일.
 *
 * catalogGap 테스트는 `../../../scripts/media-supplement.json` 을 읽어 **생성 데이터(RAW_MEDIA)와
 * 원본 보충 데이터가 어긋나지 않았는지** 확인한다. 패키지 구조를 app과 똑같이 맞춰 뒀으므로
 * 같은 상대경로가 성립하게 이 파일도 함께 옮긴다 — 안 옮기면 그 드리프트 가드만 조용히 죽는다.
 */
const EXTRA = [
  { from: join(REPO, "app", "scripts", "media-supplement.json"), to: "../scripts/media-supplement.json" },
];

/** 원본이 최소 이만큼은 있어야 한다 — 못 읽었는데 빈 목록으로 덮어쓰는 사고를 막는다. */
const MIN_FILES = 20;

// ── 옮기면서 고쳐야 하는 것 하나 ─────────────────────────────────────────────
//
// WatermelonDB 모델은 `@text('name_ko') nameKo!: string;` 처럼 **데코레이터 + 선언만 있는 필드**를 쓴다.
// 이 형태를 두 툴체인이 다르게 다룬다:
//
//   app  (Babel)  선언만 있는 필드를 **지운다** → 데코레이터가 프로토타입에 심은 접근자가 살아 있다
//   src  (SWC)    `Object.defineProperty(this, 'nameKo', {value: undefined})` 를 **낸다**
//                 → own 프로퍼티가 프로토타입 접근자를 **가려서** 모델이 전부 undefined가 된다
//
// 실측으로 확인한 증상이다: 저장은 되는데(`_raw.created_at` 은 채워짐) 읽으면 undefined이고,
// 쓰기도 `_raw` 에 도달하지 못했다(넣은 `isCustom=true` 가 원시값 false로 남음). 조용히 틀리는 종류다.
// tsconfig의 `useDefineForClassFields:false` 도, `target` 을 낮추는 것도 SWC에는 통하지 않았다.
//
// 해결은 `declare` 다 — TypeScript가 **코드를 아예 내지 않으므로** 두 툴체인 모두에서 접근자가 산다.
// 원본(app)에 넣는 것이 더 깔끔하지만, app의 Babel 플러그인 순서상 `declare` 가 거절된다
// (TS 변환이 클래스 기능 플러그인보다 나중에 돈다). 살아 있는 앱의 빌드 설정을 새 스택 때문에
// 흔드는 대신, **옮기는 순간 기계적으로 바꾼다.** 변환이 결정적이라 드리프트 검사는 그대로 엄격하다
// (`변환(원본) == 파생물` 을 비교한다).
//
// app이 은퇴하면 이 변환도 사라지고 `declare` 가 원본에 남는다.

/** 데코레이터가 붙은 `name!: T` 를 `declare name: T` 로. 데코레이터가 여러 개 쌓인 경우도 받는다. */
const DECORATED_FIELD = /^(\s*(?:@[A-Za-z_]+(?:\([^)]*\))?\s+)+)([A-Za-z_][A-Za-z0-9_]*)!:/gm;

const TRANSFORM_NOTE =
  "// [sync-core] 이 파일은 파생물이다 — 원본 app/src/db/models/ 에서 옮기며 데코레이터 필드를\n" +
  "// `declare` 형태로 바꿨다(SWC에서 class-fields가 접근자를 가리는 것을 막는다 · scripts/sync-core.mjs).\n";

/** 파일 하나를 옮길 때 적용할 변환. 대상이 아니면 원문 그대로 돌려준다. */
function transform(rel, body) {
  if (!rel.startsWith("db/models/")) return body;
  if (!DECORATED_FIELD.test(body)) return body;
  DECORATED_FIELD.lastIndex = 0;
  return TRANSFORM_NOTE + body.replace(DECORATED_FIELD, "$1declare $2:");
}

const check = process.argv.includes("--check");

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

// ── 원본 수집 ────────────────────────────────────────────────────────────────
const sources = [];
for (const d of DIRS) {
  const abs = join(FROM, d);
  if (!existsSync(abs)) {
    console.error(`  ✗ 원본이 없습니다: app/src/${d}`);
    process.exit(1);
  }
  sources.push(...walk(abs).filter((p) => !SKIP.has(relative(FROM, p))));
}
for (const f of FILES) {
  const abs = join(FROM, f);
  if (!existsSync(abs)) {
    console.error(`  ✗ 원본이 없습니다: app/src/${f}`);
    process.exit(1);
  }
  sources.push(abs);
}

if (sources.length < MIN_FILES) {
  console.error(`  ✗ 원본이 ${sources.length}개뿐입니다 — 최소 ${MIN_FILES}개를 기대합니다`);
  console.error("    복사하지 않고 멈춥니다(조용히 줄어든 파생물이 더 위험합니다).");
  process.exit(1);
}

// ── 비교 · 복사 ──────────────────────────────────────────────────────────────
const drift = [];
let copied = 0;

for (const abs of sources) {
  const rel = relative(FROM, abs);
  const dest = join(TO, RENAMES.get(rel) ?? rel);
  const body = transform(rel, readFileSync(abs, "utf8"));
  const current = existsSync(dest) ? readFileSync(dest, "utf8") : null;

  if (current === body) continue;

  if (check) {
    drift.push(current === null ? `없음: ${rel}` : `다름: ${rel}`);
    continue;
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, body);
  copied++;
}

// src/ 밖의 부속 파일(테스트가 읽는 것)도 같은 규칙으로 옮긴다.
for (const e of EXTRA) {
  if (!existsSync(e.from)) {
    console.error(`  ✗ 원본이 없습니다: ${relative(REPO, e.from)}`);
    process.exit(1);
  }
  const dest = join(TO, e.to);
  const body = readFileSync(e.from, "utf8");
  const current = existsSync(dest) ? readFileSync(dest, "utf8") : null;
  if (current === body) continue;
  if (check) {
    drift.push(current === null ? `없음: ${e.to}` : `다름: ${e.to}`);
    continue;
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, body);
  copied++;
}

// ── 디자인 토큰 → CSS ───────────────────────────────────────────────────────
//
// app의 `theme/tokens.ts`가 색의 **유일한 원본**이다(다크 팔레트 · PR 골드까지).
// 화면은 Tailwind의 `@theme` 변수를 쓰므로, 같은 값을 CSS에도 손으로 적으면 두 곳이 갈라진다.
// 그래서 여기서 만들어 낸다 — 토큰을 고치면 `make sync-core` 한 번으로 화면 색이 따라온다.
//
// 이름을 새로 짓지 않고 **템플릿이 이미 쓰던 변수명에 app 색을 꽂는다**. 그래야 이미 작성된
// 화면들(`text-(--color-ink3)` 등)을 한 줄도 고치지 않고 팔레트만 갈아끼울 수 있다.
const THEME_CSS = join(HERE, "..", "frontend", "app", "theme.generated.css");
{
  const { colors, radius, spacing, fontSize } = await import(join(TO, "theme", "tokens.ts"));
  const lines = [
    "/* 생성물이다 — 손으로 고치지 않는다. 원본: app/src/theme/tokens.ts · 재생성: make sync-core */",
    "@theme {",
    "  /* 템플릿이 쓰던 이름 ← app 팔레트 */",
    `  --color-bg: ${colors.bg};`,
    `  --color-card: ${colors.surface};`,
    `  --color-line: ${colors.border};`,
    `  --color-ink: ${colors.text};`,
    `  --color-ink2: ${colors.textMuted};`,
    `  --color-ink3: ${colors.textFaint};`,
    `  --color-brand: ${colors.primary};`,
    `  --color-ok: ${colors.success};`,
    `  --color-warn: ${colors.warning};`,
    `  --color-bad: ${colors.danger};`,
    "  /* app에만 있던 것 */",
    // app 코드가 부르는 이름 그대로도 둔다 — 화면을 옮길 때 `colors.surface` 를
    // `--color-surface` 로 그냥 읽으면 되도록(= card와 같은 값의 별칭).
    `  --color-surface: ${colors.surface};`,
    `  --color-surface-alt: ${colors.surfaceAlt};`,
    `  --color-brand-muted: ${colors.primaryMuted};`,
    `  --color-on-brand: ${colors.onPrimary};`,
    `  --color-pr: ${colors.pr};`,
    "  /* 간격·라운드·타이포 — app과 같은 리듬 */",
    ...Object.entries(spacing).map(([k, v]) => `  --spacing-${k}: ${v}px;`),
    ...Object.entries(radius).map(([k, v]) => `  --radius-${k}: ${v}px;`),
    ...Object.entries(fontSize).map(([k, v]) => `  --text-${k}: ${v}px;`),
    "}",
    "",
  ];
  const css = lines.join("\n");
  const currentCss = existsSync(THEME_CSS) ? readFileSync(THEME_CSS, "utf8") : null;
  if (currentCss !== css) {
    if (check)
      drift.push(
        currentCss === null
          ? "없음: frontend/app/theme.generated.css"
          : "다름: frontend/app/theme.generated.css",
      );
    else {
      writeFileSync(THEME_CSS, css);
      copied++;
    }
  }
}

// 원본에서 사라진 파일이 파생물에 남아 있으면 그것도 드리프트다(이름을 바꿔 옮긴 것은 바뀐 이름으로 센다).
const expected = new Set(
  sources.map((a) => {
    const rel = relative(FROM, a);
    return RENAMES.get(rel) ?? rel;
  }),
);
const stale = existsSync(TO)
  ? walk(TO)
      .map((a) => relative(TO, a))
      .filter((r) => !expected.has(r) && !OWNED.has(r))
  : [];
for (const r of stale) {
  if (check) {
    drift.push(`남음: ${r}`);
    continue;
  }
  rmSync(join(TO, r));
}

// ── 결과 ─────────────────────────────────────────────────────────────────────
if (check) {
  if (drift.length) {
    console.log(`\n  ✗ core 파생물이 원본과 어긋납니다 (${drift.length}건)`);
    for (const d of drift.slice(0, 10)) console.log(`      ${d}`);
    if (drift.length > 10) console.log(`      … 외 ${drift.length - 10}건`);
    console.log("\n    app/src/ 를 고쳤다면 `make sync-core` 로 파생물을 갱신하세요.");
    console.log("    src/core/src/ 를 직접 고쳤다면 되돌리세요 — 원본은 app/src/ 입니다(ADR-032).\n");
    process.exit(1);
  }
  console.log(`  ✓ core 파생물이 원본과 일치한다 (${sources.length}파일)`);
  process.exit(0);
}

console.log("  core 동기 완료");
console.log(`    원본 app/src/{${DIRS.join(",")}} + 파일 ${FILES.length}개 → src/core/src/`);
console.log(`    갱신 ${copied} · 삭제 ${stale.length} · 총 ${sources.length}파일`);
