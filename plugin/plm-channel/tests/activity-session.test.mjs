// 활동 hook의 **세션 스코프** 회귀 테스트 (감사 Z2 · 치명 · plm-channel 0.1.33).
//   실행: node --test plugin/plm-channel/tests/
//
// 왜 이 테스트인가: 서버가 `session`을 못 받으면 그 사용자×프로젝트의 세션 중 하나를 골라야 하고,
// 예전(구현 이전)에는 **모든 행**을 갱신해 죽은 세션이 영원히 '살아 있는 busy'로 남았다 —
// 라이브에서 세션 20건이 전부 좀비가 되어 버전 게이트가 enforce에서 100% 차단됐다.
// 그래서 hook이 `PLM_SESSION`을 실어 보내는지는 **계약**이다. 문자열 grep이 아니라 진짜로 hook을
// 실행해 서버가 받은 본문을 검사한다(셸 인용 실수까지 잡힌다).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const HOOKS = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "hooks");

/** 요청 1건을 받아 본문을 돌려주는 일회용 서버. */
async function captureOnce(run) {
  const got = [];
  let resolveHit;
  const hit = new Promise((r) => (resolveHit = r));
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      got.push({ url: req.url, body, auth: req.headers.authorization });
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
      resolveHit();
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const api = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(api);
    // 활동 hook은 curl을 백그라운드로 detach하므로 요청 도착을 기다린다(최대 5초).
    await Promise.race([hit, new Promise((_, rej) => setTimeout(() => rej(new Error("요청이 오지 않았다")), 5000))]);
  } finally {
    server.close();
  }
  return got;
}

/** `.ouroboros` 설정을 갖춘 임시 프로젝트 디렉터리. */
function project(api) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plm-act-"));
  fs.mkdirSync(path.join(dir, ".ouroboros", "config"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".ouroboros", "env"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".ouroboros", "config", "plm.json"), JSON.stringify({ api_url: api, project: "P1" }));
  fs.writeFileSync(path.join(dir, ".ouroboros", "env", ".env"), "PLM_API_TOKEN=tok-1\n");
  return dir;
}

function runHook(script, dir, env) {
  return new Promise((resolve, reject) => {
    const p = spawn("bash", [path.join(HOOKS, script)], {
      cwd: dir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir, PLM_API_URL: "", PLM_PROJECT: "", PLM_API_TOKEN: "", ...env },
      stdio: ["pipe", "ignore", "ignore"],
    });
    p.stdin.end("{}");
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${script} exit ${code}`))));
  });
}

for (const [script, state] of [
  ["plm-activity.sh", "busy"],
  ["plm-idle.sh", "idle"],
]) {
  test(`[Z2] ${script} — PLM_SESSION이 있으면 **그 세션**을 실어 보낸다`, async () => {
    const got = await captureOnce(async (api) => {
      const dir = project(api);
      await runHook(script, dir, { PLM_SESSION: "box-42" });
    });
    assert.equal(got.length, 1);
    assert.equal(got[0].url, "/channel/activity");
    const b = JSON.parse(got[0].body);
    assert.deepEqual(b, { project: "P1", state, session: "box-42" }, "세션이 빠지면 서버가 대상을 특정할 수 없다");
    assert.equal(got[0].auth, "Bearer tok-1");
  });

  test(`[Z2] ${script} — PLM_SESSION이 없으면 필드를 생략한다(유효한 JSON · 서버가 1건만 갱신)`, async () => {
    const got = await captureOnce(async (api) => {
      const dir = project(api);
      await runHook(script, dir, { PLM_SESSION: "" });
    });
    const b = JSON.parse(got[0].body); // 빈 값을 그대로 넣으면 서버가 빈 세션을 찾다 아무것도 못 갱신한다.
    assert.deepEqual(b, { project: "P1", state });
  });
}
