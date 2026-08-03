// @plm SRS-008  설정 관리 — 스키마 · .env · .env.example 세 곳이 어긋나지 않게 한다
//
// 하는 일 네 가지:
//   1. **두 실행 단위**의 설정이 요구하는 키를 뽑는다(설정 코드가 원본이다)
//        backend/internal/config/config.go  백엔드가 읽는 설정(Go)
//        frontend/lib/env.ts                 화면·프록시가 읽는 설정(TS)
//      언어가 달라도 규칙은 같다: 설정을 읽는 곳은 각 단위에 하나뿐이다.
//   2. .env / .env.example 과 대조해 **빠진 키 · 문서에 없는 키**를 알려준다
//   3. 짝이 맞아야 하는 값(노출 포트 ↔ 접속 URL)을 대조한다
//   4. 현재 환경으로 실제 검증을 돌려 본다 — 지금 이 설정으로 두 단위가 뜨는지
//
// 사용: node scripts/env-check.mjs   (또는 make env-check)
// 종료 코드: 문제가 있으면 1. CI에서 그대로 쓸 수 있다.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

/** TS(zod) 스키마에서 키와 필수 여부를 읽는다(정규식 — 형식이 단순해서 충분하다). */
function zodKeys(file, unit) {
  const src = readFileSync(path.join(root, file), "utf8");
  const block = src.slice(src.indexOf("z.object({"), src.indexOf("});"));
  const keys = [];
  for (const line of block.split("\n")) {
    const m = line.match(/^\s{2}([A-Z0-9_]+):\s*(.+),\s*$/);
    if (!m) continue;
    // 선택 = 기본값이 있거나(.default) 없어도 되는 것(.optional). 둘 다 아니면 필수다.
    const optional = m[2].includes(".default(") || m[2].includes(".optional(");
    keys.push({ key: m[1], required: !optional, unit });
  }
  return keys;
}

/** Go 설정에서 키를 읽는다. envStr/envInt는 기본값이 있으니 선택, os.Getenv는 필수 후보다. */
function goKeys(file, unit) {
  const src = readFileSync(path.join(root, file), "utf8");
  const keys = [];
  for (const m of src.matchAll(/(os\.Getenv|envStr|envInt)\(\s*"([A-Z0-9_]+)"/g)) {
    const key = m[2];
    if (keys.some((k) => k.key === key)) continue;
    keys.push({ key, required: false, unit });
  }
  // 필수는 Load()의 누락 검사 목록에서 판정한다 — 기본값 없이 반드시 있어야 하는 것들.
  for (const m of src.matchAll(/missing = append\(missing,\s*"([A-Z0-9_]+)"\)/g)) {
    const found = keys.find((k) => k.key === m[1]);
    if (found) found.required = true;
  }
  return keys;
}

/**
 * .env 형식 파일에서 키를 뽑는다.
 * 주석으로 적힌 예시(`# IDEMPOTENCY_STORE=redis`)도 **문서로는 인정**한다 —
 * 선택 설정을 기본 비활성으로 두면서 존재를 알리는 정상적인 방식이기 때문이다.
 * 대신 실제로 설정됐는지는 따로 본다(아래 activeKeys).
 */
function fileKeys(file) {
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim().replace(/^#\s*/, ""))
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => l.split("=")[0].trim());
}

/** 실제로 값이 설정된 키(주석 제외) — "지금 이 환경이 무엇으로 도는가"를 볼 때 쓴다. */
function activeKeys(file) {
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => l.split("=")[0].trim());
}

const UNITS = [
  { unit: "backend", schema: "backend/internal/config/config.go", lang: "go" },
  { unit: "frontend", schema: "frontend/lib/env.ts", lang: "ts" },
];

// 같은 키를 두 단위가 함께 쓰기도 한다(SHUTDOWN_TIMEOUT_MS) — 한 줄로 합쳐 보여준다.
const merged = new Map();
for (const { unit, schema, lang } of UNITS) {
  for (const k of lang === "go" ? goKeys(schema, unit) : zodKeys(schema, unit)) {
    const prev = merged.get(k.key);
    if (prev) {
      prev.units.push(unit);
      prev.required = prev.required || k.required;
    } else merged.set(k.key, { key: k.key, required: k.required, units: [unit] });
  }
}
const keys = [...merged.values()];
const example = fileKeys(path.join(root, ".env.example"));
const dotenv = activeKeys(path.join(root, ".env"));
let bad = 0;

console.log("\n  설정 키 — 설정 코드 기준 (backend/internal/config/config.go · frontend/lib/env.ts)\n");
for (const { key, required, units } of keys) {
  const inExample = example?.includes(key);
  const inEnv = dotenv?.includes(key) || process.env[key] !== undefined;
  const mark = required && !inEnv ? red("✗") : green("✓");
  if (required && !inEnv) bad++;
  console.log(
    `    ${mark} ${key.padEnd(22)} ${dim(`[${units.join("·")}]`.padEnd(11))} ${required ? "필수" : dim("선택")}` +
      `  ${inExample ? "" : red("· .env.example에 없음")}` +
      `${inEnv ? "" : dim(" · 현재 미설정")}`,
  );
  if (!inExample) bad++;
}

// 스키마엔 없는데 .env.example에만 있는 키 — compose 전용 값이라면 정상이다.
const containerOnly = new Set([
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
  "DB_PORT",
  "BROKER_PORT",
  "WEB_PORT",
  // compose/Makefile이 컨테이너·볼륨 이름을 짓는 데만 쓴다(앱 코드는 읽지 않는다).
  "COMPOSE_PROJECT_NAME",
  // 컨테이너에서만 다른 값을 쓰는 항목(compose가 덮어쓴다)
  "REALTIME_BUS_CONTAINER",
]);
const extra = (example ?? []).filter((k) => !merged.has(k) && !containerOnly.has(k));
if (extra.length)
  console.log(`\n  ${dim("스키마에 없는 키(compose 전용이 아니면 확인 필요):")} ${extra.join(", ")}`);

if (!dotenv) console.log(`\n  ${red(".env 없음")} — make env-init 으로 만드세요.`);

// ── 짝이 맞아야 하는 값들 ──────────────────────────────────────────────────
// 포트가 두 곳에 적힌다: 노출할 포트(DB_PORT·API_PORT)와 접속 주소(DATABASE_URL·API_URL).
// 하나만 바꾸면 **조용히 엉뚱한 곳에 붙는다** — 에러가 아니라 잘못된 성공이라 더 위험하다.
function envValue(key) {
  if (process.env[key] !== undefined) return process.env[key];
  const line = existsSync(path.join(root, ".env"))
    ? readFileSync(path.join(root, ".env"), "utf8")
        .split("\n")
        .find((l) => l.trim().startsWith(`${key}=`))
    : null;
  return line ? line.slice(line.indexOf("=") + 1).trim() : undefined;
}
function portOf(url) {
  try {
    return new URL(url).port || null;
  } catch {
    return null;
  }
}
function isLocal(url) {
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

console.log("\n  짝 검사 — 같은 포트를 가리켜야 하는 값들");
for (const [portKey, urlKey, fallback] of [
  ["DB_PORT", "DATABASE_URL", "5433"],
  ["BROKER_PORT", "REDIS_URL", "6380"],
  // web이 api를 찾아가는 주소는 api가 실제로 듣는 포트여야 한다(ADR-010).
  ["API_PORT", "API_URL", "3001"],
]) {
  const url = envValue(urlKey);
  const hostPort = envValue(portKey) ?? fallback;
  if (!url) continue;
  if (!isLocal(url)) {
    console.log(`    ${dim("–")} ${urlKey} 는 원격 주소 — ${portKey}와 무관`);
    continue;
  }
  const up = portOf(url);
  if (up === hostPort) console.log(`    ${green("✓")} ${portKey}=${hostPort} ↔ ${urlKey} 포트 ${up}`);
  else {
    bad++;
    console.log(
      `    ${red("✗")} ${portKey}=${hostPort} 인데 ${urlKey} 는 ${up} 을 가리킵니다 —` +
        ` 이대로면 ${red("엉뚱한 곳에 조용히 접속")}합니다. 둘을 같게 맞추세요.`,
    );
  }
}
{
  // WEB_PORT(호스트 노출)와 PORT(앱이 듣는 포트)는 다를 수 있지만, 로컬 개발에선 같아야 헷갈리지 않는다.
  const web = envValue("WEB_PORT");
  const app = envValue("PORT");
  if (web && app && web !== app)
    console.log(
      `    ${dim("!")} WEB_PORT=${web} · PORT=${app} — 컨테이너는 ${web}, 로컬 개발 서버는 ${app}로 뜹니다(의도한 것인지 확인)`,
    );
}

// 실제 검증 — 지금 이 설정으로 두 단위가 뜨는지. 스키마가 던지면 여기서 잡힌다.
console.log("\n  현재 환경으로 검증");
for (const { unit, schema, lang } of UNITS) {
  if (lang === "go") {
    // Go 설정은 import할 수 없다 — 필수 키가 실제로 채워졌는지로 판정한다.
    // (진짜 검증은 부팅 시 config.Load()가 한다 — 누락이면 즉시 죽는다)
    const missing = keys
      .filter((k) => k.required && k.units.includes(unit))
      .filter((k) => !(dotenv?.includes(k.key) || process.env[k.key] !== undefined));
    if (missing.length) {
      bad++;
      console.log(
        `    ${red("실패")} ${unit.padEnd(8)} 필수 키 누락: ${missing.map((m) => m.key).join(", ")}`,
      );
    } else {
      console.log(
        `    ${green("통과")} ${unit.padEnd(8)} ${dim("필수 키가 모두 채워져 있습니다(실검증은 부팅 시 config.Load)")}`,
      );
    }
    continue;
  }
  try {
    const mod = await import(path.join(root, schema));
    const shown = { ...mod.assertEnv() };
    for (const k of ["DATABASE_URL", "REDIS_URL"]) {
      if (shown[k]) shown[k] = String(shown[k]).replace(/\/\/[^@]+@/, "//***@");
    }
    console.log(`    ${green("통과")} ${unit.padEnd(8)} ${dim(JSON.stringify(shown))}`);
  } catch (e) {
    bad++;
    console.log(`    ${red("실패")} ${unit.padEnd(8)} ${String(e.message ?? e).split("\n")[0]}`);
  }
}

console.log(bad === 0 ? `\n  ${green("설정 이상 없음")}\n` : `\n  ${red(`문제 ${bad}건`)}\n`);
process.exit(bad === 0 ? 0 : 1);
