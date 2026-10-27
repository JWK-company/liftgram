// 플러그인 버전 탐지 단위 테스트 (감사 Y1 · 치명 · plm-channel 0.1.31).
//   실행: node --test plugin/plm-channel/tests/
//
// 이 테스트가 존재하는 이유는 **실측 하나**다: 0.1.30의 `../../plm-hub/.claude-plugin/plugin.json`은
// 저장소 체크아웃에서만 존재하고 **실제 설치본에서는 절대 존재하지 않는다**. 설치본은
//     ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/
// 구조라 릴레이(`…/plm-channel/0.1.31/relay/`) 기준 형제 경로가 `…/plm-channel/plm-hub/…`가 되기 때문이다.
// 그래서 여기서는 **그 디렉터리 구조를 진짜로 만들어** 왕복을 고정한다(모킹 아님 · 실제 fs).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  marketplaceAnchor,
  pickInstalledEntry,
  readPluginDirVersion,
  resolveHubVersion,
  resolvePluginVersions,
} from "../relay/plugin-versions.mjs";

/** 임시 디렉터리에 `.claude-plugin/plugin.json`을 가진 플러그인 디렉터리를 만든다. */
function mkPlugin(dir, name, version) {
  fs.mkdirSync(path.join(dir, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ name, version }));
  fs.mkdirSync(path.join(dir, "relay"), { recursive: true });
  return dir;
}

function tmp(label) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `plm-ver-${label}-`));
  return d;
}

/** 실제 설치 레이아웃 한 벌: `<root>/.claude/plugins/cache/<mkt>/<plugin>/<ver>/`. */
function installLayout({ mkt = "jwk-platform", channel = "0.1.31", hubs = ["0.6.20", "0.6.25"] } = {}) {
  const root = tmp("install");
  const cache = path.join(root, ".claude", "plugins", "cache", mkt);
  const chDir = mkPlugin(path.join(cache, "plm-channel", channel), "plm-channel", channel);
  const hubDirs = hubs.map((v) => mkPlugin(path.join(cache, "plm-hub", v), "plm-hub", v));
  return { root, cache, relayDir: path.join(chDir, "relay"), hubDirs, configDir: path.join(root, ".claude") };
}

function writeInstalledPlugins(configDir, doc) {
  fs.mkdirSync(path.join(configDir, "plugins"), { recursive: true });
  fs.writeFileSync(path.join(configDir, "plugins", "installed_plugins.json"), JSON.stringify(doc));
}

// ── 회귀의 핵심: 설치 레이아웃 ────────────────────────────────────────────────

test("[Y1] 설치 레이아웃 — 0.1.30의 형제 상대경로는 존재하지 않는다(버그 재현)", () => {
  const { relayDir } = installLayout();
  // 0.1.30이 읽던 바로 그 경로.
  const legacy = path.join(relayDir, "..", "..", "plm-hub", ".claude-plugin", "plugin.json");
  assert.equal(fs.existsSync(legacy), false, "설치 레이아웃에서 형제 경로가 존재하면 이 테스트의 전제가 깨진다");
  assert.equal(readPluginDirVersion(path.join(relayDir, "..", "..", "plm-hub")), "");
});

test("[Y1] 설치 레이아웃 — installed_plugins.json의 프로젝트 스코프 항목으로 plm-hub를 찾는다", () => {
  const { relayDir, cache, configDir } = installLayout();
  const projectPath = "/home/tester/workspace/demo";
  writeInstalledPlugins(configDir, {
    version: 2,
    plugins: {
      "plm-hub@jwk-platform": [
        { scope: "user", version: "0.6.20", installPath: path.join(cache, "plm-hub", "0.6.20") },
        { scope: "project", projectPath, version: "0.6.25", installPath: path.join(cache, "plm-hub", "0.6.25") },
      ],
    },
  });
  const r = resolveHubVersion({ relayDir, env: { CLAUDE_CONFIG_DIR: configDir }, cwd: `${projectPath}/sub/dir` });
  assert.equal(r.version, "0.6.25");
  assert.equal(r.source, "installed_plugins:project");
});

test("[Y1] 설치 레이아웃 — 이 프로젝트 항목이 없으면 user 스코프를 쓴다(다른 프로젝트 값에 오염되지 않는다)", () => {
  const { relayDir, cache, configDir } = installLayout();
  writeInstalledPlugins(configDir, {
    version: 2,
    plugins: {
      "plm-hub@jwk-platform": [
        { scope: "project", projectPath: "/somewhere/else", version: "0.6.25", installPath: path.join(cache, "plm-hub", "0.6.25") },
        { scope: "user", version: "0.6.20", installPath: path.join(cache, "plm-hub", "0.6.20") },
      ],
    },
  });
  const r = resolveHubVersion({ relayDir, env: { CLAUDE_CONFIG_DIR: configDir }, cwd: "/home/tester/other" });
  assert.equal(r.version, "0.6.20");
  assert.equal(r.source, "installed_plugins:user");
});

test("[Y1] 설치 레이아웃 — installPath의 plugin.json이 대장 version보다 우선(대장 갱신 지연 방어)", () => {
  const { relayDir, cache, configDir } = installLayout({ hubs: ["0.6.25"] });
  writeInstalledPlugins(configDir, {
    version: 2,
    // 대장에는 옛 값이 남아 있고 디스크의 plugin.json은 0.6.25다.
    plugins: { "plm-hub@jwk-platform": [{ scope: "user", version: "0.6.19", installPath: path.join(cache, "plm-hub", "0.6.25") }] },
  });
  assert.equal(resolveHubVersion({ relayDir, env: { CLAUDE_CONFIG_DIR: configDir }, cwd: "/tmp" }).version, "0.6.25");
});

// ── 감사 Z3(높음 · R5): 폴백 2종은 위로 편향한다 → **추정은 보고하지 않는다** ─────

test("[Z3] cache-scan 폴백 — 캐시 최신값은 **추정**이므로 미보고로 낮춘다(거짓 통과 금지)", () => {
  // 캐시는 과거 버전을 누적 보관한다. 이 기계가 실제로 쓰는 것이 0.6.19여도 스캔은 0.6.30을 고른다.
  const { relayDir, configDir } = installLayout({ hubs: ["0.6.19", "0.6.30", "0.6.9"] });
  const r = resolveHubVersion({ relayDir, env: { CLAUDE_CONFIG_DIR: configDir }, cwd: "/tmp" });
  assert.equal(r.version, "", "추정값은 서버에 보고하지 않는다 → 게이트가 fail-closed로 안전하게 막는다");
  assert.equal(r.source, "cache-scan:suppressed");
  assert.equal(r.guess, "0.6.30", "무엇을 봤는지는 진단용으로 남는다(0.6.9 > 0.6.30 문자열 퇴행도 없다)");
  assert.ok(
    r.tried.some((t) => t.includes("PLM_HUB_VERSION")),
    "사용자가 무엇을 하면 되는지(명시 지정)가 사유에 있어야 한다",
  );
});

test("[Z3] 옵트인 — PLM_HUB_VERSION_ALLOW_GUESS=1이면 옛 동작(캐시 최신 보고)이 복원된다", () => {
  const { relayDir, configDir } = installLayout({ hubs: ["0.6.19", "0.6.25", "0.6.9"] });
  const env = { CLAUDE_CONFIG_DIR: configDir, PLM_HUB_VERSION_ALLOW_GUESS: "1" };
  const r = resolveHubVersion({ relayDir, env, cwd: "/tmp" });
  assert.equal(r.version, "0.6.25", "0.6.9 > 0.6.25 같은 문자열 비교로 퇴행하면 안 된다");
  assert.equal(r.source, "cache-scan");
});

test("[Z3] installed_plugins:newest 폴백 — 다른 프로젝트의 최고 버전을 이 세션의 사실로 승격하지 않는다", () => {
  const { relayDir, cache, configDir } = installLayout({ hubs: ["0.6.19", "0.6.30"] });
  writeInstalledPlugins(configDir, {
    version: 2,
    plugins: {
      // cwd와 무관한 project 항목뿐 — user 스코프도 없다. 예전엔 여기서 '최신'을 골라 0.6.30을 보고했다.
      "plm-hub@jwk-platform": [
        { scope: "project", projectPath: "/somewhere/else", version: "0.6.30", installPath: path.join(cache, "plm-hub", "0.6.30") },
      ],
    },
  });
  const r = resolveHubVersion({ relayDir, env: { CLAUDE_CONFIG_DIR: configDir }, cwd: "/home/tester/here" });
  assert.equal(r.version, "", "실제로는 0.6.19를 쓰는 세션이 0.6.30을 보고하던 false pass를 막는다");
  assert.equal(r.source, "installed_plugins:newest:suppressed");
  assert.equal(r.guess, "0.6.30");
});

test("[Z3] 보고 문자열에 **출처**가 실린다 — 서버가 사실/추정을 구분할 수 있어야 한다", () => {
  const { relayDir, configDir } = installLayout({ hubs: ["0.6.30"] });
  const v = resolvePluginVersions({ relayDir, env: { CLAUDE_CONFIG_DIR: configDir }, cwd: "/tmp" });
  assert.match(v.text, /plm-channel=0\.1\.31/);
  assert.equal(/plm-hub=/.test(v.text), false, "추정은 값 자체를 싣지 않는다");
  assert.match(v.text, /plm-hub-src=cache-scan:suppressed/);
  assert.equal(v.hubGuess, "0.6.30");
  // 사실인 경우에도 출처가 실린다(저장소 체크아웃).
  const root = tmp("srcrepo");
  const chDir = mkPlugin(path.join(root, "plugin", "plm-channel"), "plm-channel", "0.1.31");
  mkPlugin(path.join(root, "plugin", "plm-hub"), "plm-hub", "0.6.26");
  const v2 = resolvePluginVersions({ relayDir: path.join(chDir, "relay"), env: {}, cwd: root });
  assert.match(v2.text, /plm-hub=0\.6\.26/);
  assert.match(v2.text, /plm-hub-src=repo-sibling/);
  // 서버 parse_versions의 40자 상한을 넘지 않아야 값이 버려지지 않는다.
  for (const kv of v2.text.split(",")) {
    const [k, val] = kv.split("=");
    assert.ok(k.length <= 40 && val.length <= 40, `서버가 버리지 않는 길이여야 한다: ${kv}`);
  }
});

test("[Y1] plm-hub가 아예 없으면 미보고('')이고 어디를 봤는지 사유가 남는다", () => {
  const root = tmp("nohub");
  const chDir = mkPlugin(path.join(root, "plugin", "plm-channel"), "plm-channel", "0.1.31");
  const r = resolveHubVersion({ relayDir: path.join(chDir, "relay"), env: { CLAUDE_CONFIG_DIR: path.join(root, "cfg") }, cwd: root });
  assert.equal(r.version, "");
  assert.equal(r.source, "none");
  assert.ok(r.tried.length > 0, "무엇을 시도했는지 남아야 사용자가 원인을 안다");
});

// ── 저장소 레이아웃(회귀 0) ───────────────────────────────────────────────────

test("[Y1] 저장소 레이아웃 — 형제 plm-hub를 그대로 읽는다(0.1.30 동작 보존)", () => {
  const root = tmp("repo");
  const chDir = mkPlugin(path.join(root, "plugin", "plm-channel"), "plm-channel", "0.1.31");
  mkPlugin(path.join(root, "plugin", "plm-hub"), "plm-hub", "0.6.25");
  const r = resolveHubVersion({ relayDir: path.join(chDir, "relay"), env: {}, cwd: root });
  assert.equal(r.version, "0.6.25");
  assert.equal(r.source, "repo-sibling");
});

test("[Y1] 실제 저장소 체크아웃에서도 양쪽 버전이 실린다(이 저장소 자신으로 왕복)", () => {
  const relayDir = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "relay");
  const v = resolvePluginVersions({ relayDir, env: {}, cwd: process.cwd() });
  assert.match(v.text, /plm-channel=\d+\.\d+\.\d+/);
  assert.match(v.text, /plm-hub=\d+\.\d+\.\d+/);
  assert.equal(v.hubSource, "repo-sibling");
});

// ── env 탈출구 ────────────────────────────────────────────────────────────────

test("[Y1] PLM_HUB_PLUGIN_DIR·PLM_HUB_VERSION은 모든 탐색보다 우선한다(운영 탈출구)", () => {
  const { relayDir, cache, configDir } = installLayout();
  assert.equal(
    resolveHubVersion({ relayDir, env: { CLAUDE_CONFIG_DIR: configDir, PLM_HUB_VERSION: "9.9.9" }, cwd: "/tmp" }).version,
    "9.9.9",
  );
  const r = resolveHubVersion({
    relayDir,
    env: { CLAUDE_CONFIG_DIR: configDir, PLM_HUB_PLUGIN_DIR: path.join(cache, "plm-hub", "0.6.20") },
    cwd: "/tmp",
  });
  assert.equal(r.version, "0.6.20");
  assert.equal(r.source, "env:PLM_HUB_PLUGIN_DIR");
});

// ── 조각 함수 ────────────────────────────────────────────────────────────────

test("[Y1] marketplaceAnchor — plugins/cache/<mkt> 구조만 인식한다", () => {
  assert.deepEqual(marketplaceAnchor("/h/.claude/plugins/cache/jwk-platform/plm-channel/0.1.31/relay"), {
    cacheRoot: "/h/.claude/plugins/cache",
    marketplace: "jwk-platform",
  });
  assert.equal(marketplaceAnchor("/repo/plugin/plm-channel/relay"), null);
  assert.equal(marketplaceAnchor(""), null);
});

test("[Y1] pickInstalledEntry — 마켓플레이스가 일치하는 키를 먼저 보고, 없으면 최신", () => {
  const doc = {
    plugins: {
      "plm-hub@other": [{ scope: "user", version: "9.0.0", installPath: "/x" }],
      "plm-hub@jwk-platform": [{ scope: "user", version: "0.6.25", installPath: "/y" }],
    },
  };
  assert.equal(pickInstalledEntry(doc, { marketplace: "jwk-platform", cwd: "/tmp" }).version, "0.6.25");
  assert.equal(pickInstalledEntry({ plugins: {} }, { cwd: "/tmp" }), null);
  assert.equal(
    pickInstalledEntry({ plugins: { "plm-hub@a": [{ scope: "project", projectPath: "/p", version: "1.0.0" }] } }, { cwd: "/q" })
      ._match,
    "newest",
    "cwd와 무관한 project 항목뿐이면 최신으로 폴백한다(선택 자체는 유지 — 감사 Z3의 미보고 판정은 resolveHubVersion이 한다)",
  );
});

test("[Y1] 버전 문자열 파싱 — 형식이 아니면 미보고로 흐른다(거짓 보고 금지)", () => {
  const root = tmp("bad");
  const dir = path.join(root, "p");
  fs.mkdirSync(path.join(dir, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude-plugin", "plugin.json"), JSON.stringify({ version: "unknown" }));
  assert.equal(readPluginDirVersion(dir), "");
  fs.writeFileSync(path.join(dir, ".claude-plugin", "plugin.json"), "{ not json");
  assert.equal(readPluginDirVersion(dir), "");
});
