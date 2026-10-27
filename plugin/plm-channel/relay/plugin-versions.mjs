// 플러그인 **버전 탐지** — 릴레이가 서버에 보고할 `plm-channel` · `plm-hub` 버전을 찾는다.
// (감사 Y1 · 치명 · R4 · plm-channel 0.1.31)
//
// ── 왜 이 파일이 생겼나 ──────────────────────────────────────────────────────
// 0.1.30은 형제 상대경로 하나로 plm-hub 버전을 읽었다:
//     `<relay>/../../plm-hub/.claude-plugin/plugin.json`
// 커밋 메시지는 "저장소 레이아웃과 설치 레이아웃이 같은 상대경로"라고 단언했지만 **틀렸다**.
// 실제 설치본은 버전 서브디렉터리를 하나 더 가진다(node로 실증 · 2026-07-31):
//     ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/…
// 그래서 릴레이가 설치본에서 도는 순간 그 경로는
//     …/cache/jwk-platform/plm-channel/plm-hub/.claude-plugin/plugin.json   ← 존재하지 않음
// 이 되어 **plm-hub는 영원히 미보고**였다. 서버 게이트는 미보고를 fail-closed로 처리하므로
// `enforce`로 올리는 순간 **정상 사용자가 100% 차단**된다(게이트를 켤 수도 끌 수도 없는 상태).
//
// ── 그래서 무엇을 하나 ───────────────────────────────────────────────────────
// 두 레이아웃을 **둘 다** 커버하고, 못 찾으면 그 사실을 사유와 함께 명확히 남긴다:
//   ① `PLM_HUB_VERSION`        직접 지정(최후 수단 · 파일럿 디버깅)
//   ② `PLM_HUB_PLUGIN_DIR`     플러그인 디렉터리 직접 지정
//   ③ **저장소 레이아웃**      `<relay>/../../plm-hub/.claude-plugin/plugin.json` (0.1.30의 그 경로)
//   ④ **설치 레이아웃**        `~/.claude/plugins/installed_plugins.json`의 `plm-hub@<marketplace>`
//                              항목 중 **이 프로젝트에 설치된 것**(projectPath 매칭) → user 스코프 → 최신
//   ⑤ 캐시 디렉터리 스캔       ④의 대장을 못 읽을 때만(마켓플레이스 캐시의 최신 버전 디렉터리)
// 순서가 계약이다 — ③이 ④보다 앞인 이유는 개발자가 저장소에서 릴레이를 직접 돌릴 때
// **지금 편집 중인 코드의 버전**이 진실이기 때문이다(설치본은 그때 옛 버전일 수 있다).
//
// ── 감사 Z3(높음 · R5) — 폴백 2종은 **위로 편향**한다 ────────────────────────
// `installed_plugins:newest`와 `cache-scan`은 "있는 것 중 가장 높은 버전"을 고른다. 그런데 캐시는
// 과거 버전을 누적 보관하고(실측 `plm-hub/{0.5.1 … 0.6.20}`), 대장의 다른-프로젝트 항목도 이 기계가
// **실제로 쓰는** 버전이 아니다. 그래서 실제 0.6.19를 쓰는 세션이 `0.6.30`을 보고하는 일이 일어난다
// (합성 레이아웃으로 실증). 이 방향의 오류는 **fail-closed 설계와 정반대**다 — 게이트가 옛 도구를
// 통과시켜(false pass) 정본 오염이 그대로 일어난다.
//
// 그래서 **추정은 보고하지 않는다**(미보고 = 게이트가 fail-closed로 안전하게 막는다):
//   · 두 폴백의 결과는 `version:""`으로 낮추고, 무엇을 찾았는지는 `guess`·`tried`에 남긴다.
//   · 사람이 값을 알면 `PLM_HUB_VERSION`(①)·`PLM_HUB_PLUGIN_DIR`(②)로 **사실을 명시**하면 된다.
//   · 그래도 옛 동작이 필요하면 `PLM_HUB_VERSION_ALLOW_GUESS=1`(명시적 옵트인).
// 판정 근거의 출처는 `plm-hub-src=<source>`로 서버에 함께 실어 보낸다 — 서버·운영자가
// "이 값이 사실인지 추정인지"를 구분할 수 있어야 한다(예전엔 로컬 로그에만 남았다).
//
// 이 파일은 부수효과가 없다(입력 = 경로·env · 출력 = 값). 그래서 테스트가 실제 임시 디렉터리로
// **설치 레이아웃을 시뮬레이션**해 왕복을 고정할 수 있다(tests/plugin-versions.test.mjs).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** `plugin.json` 1개에서 version 문자열을 읽는다. 없거나 형식이 아니면 "". */
export function readPluginVersion(pluginJsonPath) {
  try {
    const j = JSON.parse(fs.readFileSync(pluginJsonPath, "utf8"));
    const v = String(j?.version || "").trim();
    return /^\d+(\.\d+)*/.test(v) ? v : "";
  } catch {
    return "";
  }
}

/** 플러그인 **디렉터리**(= `.claude-plugin/plugin.json`을 품은 디렉터리)에서 버전을 읽는다. */
export function readPluginDirVersion(dir) {
  return dir ? readPluginVersion(path.join(dir, ".claude-plugin", "plugin.json")) : "";
}

/** `"0.6.25"` → `[0,6,25]`. 비교용(정렬·최신 선택). 형식이 아니면 빈 배열. */
function nums(v) {
  const head = String(v || "").trim().replace(/^v/, "").split(/[-+]/)[0];
  if (!head) return [];
  const out = [];
  for (const p of head.split(".")) {
    const n = Number.parseInt(p, 10);
    if (!Number.isFinite(n)) return [];
    out.push(n);
  }
  return out;
}

/** a > b ? 1 : a < b ? -1 : 0 (자리수가 달라도 0으로 채워 비교). */
function cmp(a, b) {
  const [x, y] = [nums(a), nums(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const [p, q] = [x[i] || 0, y[i] || 0];
    if (p !== q) return p > q ? 1 : -1;
  }
  return 0;
}

/** `a`가 `b`의 하위 경로이거나 같은가(프로젝트 스코프 항목 매칭용). */
function isWithin(child, parent) {
  if (!child || !parent) return false;
  const c = path.resolve(child);
  const p = path.resolve(parent);
  return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}

/** 설치 레이아웃 앵커 해석 — `…/plugins/cache/<marketplace>/<plugin>/<version>/…` 인가.
 *  맞으면 `{cacheRoot, marketplace}`, 아니면 null. */
export function marketplaceAnchor(anyPathInsideInstall) {
  if (!anyPathInsideInstall) return null;
  const segs = path.resolve(anyPathInsideInstall).split(path.sep);
  for (let i = segs.length - 1; i >= 1; i--) {
    if (segs[i] === "cache" && segs[i - 1] === "plugins" && segs[i + 1]) {
      return { cacheRoot: segs.slice(0, i + 1).join(path.sep) || path.sep, marketplace: segs[i + 1] };
    }
  }
  return null;
}

/** Claude 설정 디렉터리(`~/.claude` · `CLAUDE_CONFIG_DIR`로 덮어씀). */
function configDir(env) {
  const c = String(env.CLAUDE_CONFIG_DIR || "").trim();
  return c || path.join(os.homedir(), ".claude");
}

/** `installed_plugins.json`에서 이 세션에 유효한 plm-hub 설치 항목을 고른다.
 *  우선순위: **cwd를 포함하는 project 스코프**(가장 깊은 매칭) → user 스코프 → 최신 버전.
 *  같은 이름의 플러그인이 여러 마켓플레이스에 있으면 `marketplace`가 일치하는 키를 먼저 본다. */
export function pickInstalledEntry(doc, { plugin = "plm-hub", marketplace = "", cwd = "" } = {}) {
  const plugins = doc && typeof doc === "object" ? doc.plugins || {} : {};
  const keys = Object.keys(plugins).filter((k) => k === plugin || k.startsWith(`${plugin}@`));
  if (keys.length === 0) return null;
  const preferred = marketplace && keys.includes(`${plugin}@${marketplace}`) ? [`${plugin}@${marketplace}`] : keys;
  const entries = [];
  for (const k of preferred) {
    for (const e of Array.isArray(plugins[k]) ? plugins[k] : []) {
      if (e && typeof e === "object") entries.push(e);
    }
  }
  if (entries.length === 0) return null;
  const scoped = entries
    .filter((e) => e.scope === "project" && e.projectPath && isWithin(cwd, e.projectPath))
    .sort((a, b) => String(b.projectPath).length - String(a.projectPath).length);
  if (scoped[0]) return { ...scoped[0], _match: "project" };
  const user = entries.find((e) => e.scope === "user");
  if (user) return { ...user, _match: "user" };
  const newest = [...entries].sort((a, b) => cmp(a.version, b.version)).pop();
  return newest ? { ...newest, _match: "newest" } : null;
}

/** 마켓플레이스 캐시(`<cacheRoot>/<mkt>/<plugin>/<ver>/`)에서 **가장 높은** 버전 디렉터리를 찾는다.
 *  `installed_plugins.json`을 못 읽을 때만 쓰는 최후 폴백이다(대장이 있으면 대장이 진실). */
function scanCache(cacheRoot, marketplace, plugin) {
  const base = path.join(cacheRoot, marketplace, plugin);
  let dirs = [];
  try {
    dirs = fs.readdirSync(base);
  } catch {
    return "";
  }
  const found = dirs
    .map((d) => ({ d, v: readPluginDirVersion(path.join(base, d)) }))
    .filter((x) => x.v)
    .sort((a, b) => cmp(a.v, b.v));
  return found.length ? found[found.length - 1].v : "";
}

/** 감사 Z3 — **추정**(위로 편향) 출처. 기본적으로 보고하지 않는다. */
export const GUESS_SOURCES = new Set(["installed_plugins:newest", "cache-scan"]);

/**
 * plm-hub 버전 해석. 반환 `{version, source, tried[], guess?}` — `version:""`이면 **미보고**(그 사실이 곧 값).
 * `tried`는 진단용(어디를 봤고 왜 실패했는지 로그 한 줄로 남긴다).
 * 추정 출처(Z3)는 `version:""` · `source:"<출처>:suppressed"` · `guess:"<찾은 값>"`으로 낮춰 돌려준다.
 */
export function resolveHubVersion({ relayDir, env = process.env, cwd = process.cwd() } = {}) {
  const tried = [];
  const take = (source, version, where) => {
    tried.push(`${source}${where ? `(${where})` : ""}=${version || "없음"}`);
    return version ? { version, source, tried } : null;
  };
  // 감사 Z3 — 추정은 사실로 승격되지 않는다. `PLM_HUB_VERSION_ALLOW_GUESS=1`로만 옛 동작 복원.
  const allowGuess = /^(1|true|yes|on)$/i.test(String(env.PLM_HUB_VERSION_ALLOW_GUESS || "").trim());
  const guard = (r) => {
    if (!r || allowGuess || !GUESS_SOURCES.has(r.source)) return r;
    tried.push(`${r.source}=${r.version} → 추정이므로 미보고(PLM_HUB_VERSION로 명시하거나 PLM_HUB_VERSION_ALLOW_GUESS=1)`);
    return { version: "", source: `${r.source}:suppressed`, guess: r.version, tried };
  };

  // ① 직접 지정
  const direct = String(env.PLM_HUB_VERSION || "").trim();
  if (direct && /^\d+(\.\d+)*/.test(direct)) return take("env:PLM_HUB_VERSION", direct);
  // ② 디렉터리 지정
  const dirEnv = String(env.PLM_HUB_PLUGIN_DIR || "").trim();
  if (dirEnv) {
    const r = take("env:PLM_HUB_PLUGIN_DIR", readPluginDirVersion(dirEnv), dirEnv);
    if (r) return r;
  }
  // ③ 저장소(형제) 레이아웃 — 0.1.30이 유일하게 알던 경로. 저장소 체크아웃에서만 존재한다.
  if (relayDir) {
    const sib = path.join(relayDir, "..", "..", "plm-hub");
    const r = take("repo-sibling", readPluginDirVersion(sib), sib);
    if (r) return r;
  }
  // ④ 설치 레이아웃 — 대장(installed_plugins.json)이 권위. 이 프로젝트에 설치된 항목을 고른다.
  const anchor = marketplaceAnchor(relayDir) || marketplaceAnchor(env.CLAUDE_PLUGIN_ROOT);
  const ipPath = path.join(configDir(env), "plugins", "installed_plugins.json");
  let doc = null;
  try {
    doc = JSON.parse(fs.readFileSync(ipPath, "utf8"));
  } catch {
    tried.push(`installed_plugins(${ipPath})=읽기실패`);
  }
  if (doc) {
    const e = pickInstalledEntry(doc, { plugin: "plm-hub", marketplace: anchor?.marketplace || "", cwd });
    // installPath의 plugin.json이 진실 — 대장의 version 필드는 갱신이 밀릴 수 있다.
    const v = (e && readPluginDirVersion(e.installPath)) || (e && String(e.version || "").trim()) || "";
    const r = guard(take(`installed_plugins:${e?._match || "none"}`, /^\d+(\.\d+)*/.test(v) ? v : "", e?.installPath));
    if (r) return r;
  } else if (anchor) {
    // ⑤ 대장을 못 읽을 때만 캐시 스캔(있는 것 중 최신). 대장이 있으면 여기까지 오지 않는다.
    const r = guard(take("cache-scan", scanCache(anchor.cacheRoot, anchor.marketplace, "plm-hub"), anchor.marketplace));
    if (r) return r;
  }
  return { version: "", source: "none", tried };
}

/**
 * 서버에 보고할 버전 묶음. `{text, channel, hub, hubSource, hubGuess, tried}`.
 * `text`는 `/channel/subscribe?versions=` 값(`plm-channel=…,plm-hub=…,plm-hub-src=…`) — **찾은 것만**
 * 싣는다(거짓 버전을 보고하느니 미보고가 낫다 · 게이트가 fail-closed로 판정한다).
 *
 * 감사 Z3 — `plm-hub-src`(출처)를 함께 싣는다. 서버 `capabilities.versions`에 그대로 남아,
 * 운영자가 "이 세션의 값이 사실(repo-sibling·installed_plugins:project/user·env)인지, 추정이라
 * 눌린 것(`…:suppressed`)인지"를 조회 하나로 구분할 수 있다. 게이트 판정은 `plm-hub`·`plm-channel`
 * 두 키만 읽으므로 이 키가 늘어도 판정에는 영향이 없다.
 */
export function resolvePluginVersions({ relayDir, env = process.env, cwd = process.cwd() } = {}) {
  const channel = readPluginDirVersion(relayDir ? path.join(relayDir, "..") : "");
  const hub = resolveHubVersion({ relayDir, env, cwd });
  const parts = [];
  if (channel) parts.push(`plm-channel=${channel}`);
  if (hub.version) parts.push(`plm-hub=${hub.version}`);
  // 출처는 40자 제한(서버 parse_versions)을 넘지 않게 자른다.
  if (hub.source) parts.push(`plm-hub-src=${String(hub.source).slice(0, 40)}`);
  return {
    text: parts.join(","),
    channel,
    hub: hub.version,
    hubSource: hub.source,
    hubGuess: hub.guess || "",
    tried: hub.tried,
  };
}
