// @plm SRS-009  문서 드리프트 검사 — 사람이 매번 다시 읽지 않아도 되게
//
// ─────────────────────────────────────────────────────────────────────────────
// 왜 이 스크립트가 존재하나
//
// 이 저장소를 만드는 동안 같은 종류의 결함이 **세 번** 반복됐다:
//   1차 — 새 설정 키를 만들고 README에 안 적음
//   2차 — IDEMPOTENCY_STORE·lefthook을 만들고 README에 안 적음
//   3차 — 기획 문서가 실제 스택과 어긋남(Bun 2.x·Zustand·shadcn/ui…)
// 매번 사람이 다시 읽어서 찾았다. 사람이 찾는 결함은 사람이 지칠 때 다시 돌아온다.
//
// 그래서 **기계가 볼 수 있는 부분만** 골라 검사한다:
//   ① 설정 키   — 두 스키마(api=Go · web=TS) ⊆ .env.example ∩ README
//   ② make 타깃 — Makefile의 공개 타깃 ⊆ README ∪ 개발 가이드
//   ③ placeholder — 제너레이터가 남긴 요구번호 placeholder가 실제 코드에 남아 있는지
//   ④ 명령 스크립트 — package.json scripts ⊆ 문서(내부용은 제외 목록에)
//
// 기계가 볼 수 없는 것(문장이 사실인가)은 여전히 사람의 몫이다. 이 검사는 그 몫을 줄인다.
//
// 사용: node scripts/check-docs.mjs   (make docs-check · make verify에 포함 · CI 필수 단계)
// 종료 코드: 어긋난 것이 있으면 1.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p) => (existsSync(path.join(root, p)) ? readFileSync(path.join(root, p), "utf8") : "");
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

const README = read("README.md");
const GUIDE = read("docs/development-guide.html");
const DOCS = `${README}\n${GUIDE}`;
let bad = 0;
const fail = (msg) => {
  bad++;
  console.log(`    ${red("✗")} ${msg}`);
};
const ok = (msg) => console.log(`    ${green("✓")} ${msg}`);

// ── ① 설정 키 ────────────────────────────────────────────────────────────────
console.log("\n  설정 키 — 스키마가 만든 것은 예시와 문서에도 있어야 한다");
{
  // 실행 단위가 둘이라 스키마도 둘이다(ADR-010) — 언어가 달라도 규칙은 같다:
  // 설정을 읽는 곳은 각 단위에 하나뿐이고, 거기 있는 키는 예시와 문서에도 있어야 한다.
  const keys = [];
  // api(Go) — config.Load()가 os.Getenv로 읽는 키
  for (const m of read("backend/internal/config/config.go").matchAll(
    /(?:os\.Getenv|envStr|envInt)\(\s*"([A-Z0-9_]+)"/g,
  )) {
    if (!keys.includes(m[1])) keys.push(m[1]);
  }
  // web(TS) — zod 스키마
  {
    const src = read("frontend/lib/env.ts");
    const block = src.slice(src.indexOf("z.object({"), src.indexOf("});"));
    for (const m of block.matchAll(/^\s{2}([A-Z0-9_]+):/gm)) if (!keys.includes(m[1])) keys.push(m[1]);
  }
  const example = read(".env.example");
  for (const k of keys) {
    const inExample = example.includes(k);
    const inDocs = DOCS.includes(k);
    if (!inExample) fail(`${k} — .env.example에 없다(설정이 무엇인지 알 방법이 없다)`);
    if (!inDocs) fail(`${k} — README·가이드 어디에도 없다`);
  }
  if (!bad) ok(`${keys.length}개 키가 예시와 문서에 모두 있다`);
}

// ── ② make 타깃 ──────────────────────────────────────────────────────────────
console.log("\n  make 타깃 — 만들었으면 문서에 있어야 한다");
{
  const mk = read("Makefile");
  // `타깃: ## 설명` 형태만 공개 타깃으로 본다(## 없는 것은 내부용)
  const targets = [...mk.matchAll(/^([a-zA-Z0-9_-]+):.*##/gm)].map((m) => m[1]).filter((t) => t !== "help");
  const missing = targets.filter((t) => !DOCS.includes(`make ${t}`) && !DOCS.includes(`<code>${t}</code>`));
  if (missing.length) fail(`문서에 없는 타깃: ${missing.join(", ")}`);
  else ok(`공개 타깃 ${targets.length}개가 모두 문서에 있다`);
}

// ── ③ placeholder ─────────────────────────────────────────────────────────────
console.log("\n  placeholder — 제너레이터가 남긴 자리를 채웠는가");
{
  const { execSync } = await import("node:child_process");
  const files = execSync("git ls-files -co --exclude-standard", { cwd: root })
    .toString()
    .split("\n")
    // 제너레이터와 이 검사기는 placeholder **문자열 자체**를 담고 있으므로 대상에서 뺀다
    .filter((f) => /\.(ts|tsx|mjs|cjs)$/.test(f))
    .filter((f) => !f.startsWith("scripts/gen-module") && !f.startsWith("scripts/check-docs"));
  // 아래 문자열을 통째로 쓰면 codescan이 **이 파일 자체를** 추적 대상으로 오인해
  // 요구와 연결되지 않은 Code 아티팩트를 만든다(실제로 G3 orphan이 생겼다). 그래서 쪼개 만든다.
  const MARK = `@${"plm"} <SRS-코드>`;
  const left = files.filter((f) => read(f).includes(MARK));
  if (left.length)
    fail(
      `요구 번호를 안 채운 파일 ${left.length}건: ${left.join(", ")}\n` +
        `      → 각 파일 첫 줄의 <SRS-코드>를 실제 번호로 바꾸세요(예: SRS-014).\n` +
        `      → 다음부터는 make gen NAME=<이름> SRS=SRS-014 처럼 함께 주면 이 단계가 없습니다.\n` +
        `      → 방치하면 codescan이 이 코드를 추적하지 못해 요구↔구현 연결(G3)에 구멍이 생깁니다.`,
    );
  else ok("남은 placeholder 없음");
}

// ── ④ 명령 스크립트 ──────────────────────────────────────────────────────────
console.log("\n  package.json 스크립트 — 사람이 직접 부르는 것은 문서에 있어야 한다");
{
  const INTERNAL = new Set([
    "build",
    "start",
    "start:api",
    "start:web",
    "lint",
    "typecheck",
    "test",
    "hooks",
    "db:generate",
    "contracts", // 다른 스크립트가 앞서 부르는 준비 단계 — 사람이 직접 부를 일이 없다
  ]);
  const pkg = JSON.parse(read("package.json"));
  const missing = Object.keys(pkg.scripts ?? {})
    .filter((s) => !INTERNAL.has(s))
    .filter((s) => !DOCS.includes(s));
  if (missing.length) fail(`문서에 없는 스크립트: ${missing.join(", ")}`);
  else ok("문서화 대상 스크립트가 모두 있다");
}

// ── ⑤ 설정 접근 규칙 ─────────────────────────────────────────────────────────
// "process.env를 직접 읽는 코드는 각 단위의 스키마 말고 없다"는 규칙을 기계가 지킨다.
// 예외는 파일 상단에 이유를 적고 아래 목록에 넣는다 — 예외가 늘어나면 규칙이 사라진다.
console.log("\n  설정 접근 — process.env를 직접 읽는 곳이 한 곳인가");
{
  const { execSync } = await import("node:child_process");
  const ALLOW = [
    "frontend/lib/env.ts", // web 스키마 자신
    "scripts/", // 검사·유틸 스크립트
    "frontend/next.config.ts",
    "frontend/e2e/",
    "frontend/playwright.config.ts",
  ];
  const NODE_ENV_OK = /process\.env\.(NODE_ENV|__NEXT_|CI)/; // 런타임 모드 판별은 스키마 대상이 아니다
  const files = execSync("git ls-files -co --exclude-standard", { cwd: root })
    .toString()
    .split("\n")
    // Go 쪽은 config 패키지만 os.Getenv를 쓴다 — 같은 규칙을 두 언어에 건다.
    .filter((f) => /\.(ts|tsx|mjs|cjs|go)$/.test(f))
    .filter((f) => !ALLOW.some((a) => f.startsWith(a)))
    .filter((f) => f !== "backend/internal/config/config.go")
    .filter((f) => !f.startsWith("backend/gen/"));
  const offenders = files.filter((f) =>
    read(f)
      .split("\n")
      .some((l) => (l.includes("process.env.") || l.includes("os.Getenv(")) && !NODE_ENV_OK.test(l)),
  );
  if (offenders.length)
    fail(
      `스키마 밖에서 설정을 읽는다: ${offenders.join(", ")} —` +
        ` 해당 단위의 설정(backend/internal/config/config.go · frontend/lib/env.ts)에 키를 추가하고 거기서만 읽으세요`,
    );
  else ok("설정은 스키마를 통해서만 읽는다");
}

console.log(
  bad === 0
    ? `\n  ${green("문서와 코드가 일치한다")}\n`
    : `\n  ${red(`드리프트 ${bad}건`)} ${dim("— 문서를 고치거나, 문서에 넣지 않을 것이면 내부용으로 표시하세요")}\n`,
);
process.exit(bad === 0 ? 0 : 1);
