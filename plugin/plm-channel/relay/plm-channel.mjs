#!/usr/bin/env node
// PLM Channels(B) 로컬 릴레이 — claude/channel MCP 서버 (SAD-006 · SRS-020).
//
// 역할: PLM 백엔드의 SSE `/channel/subscribe`에 사용자 OIDC 토큰으로 구독 → 받은 [Sync] 작업을
// `notifications/claude/channel`로 세션에 주입(<channel> 태그) → Claude가 처리 후 `report` 도구로
// 결과를 `/sync/report`에 회신(양방향). 라우팅·큐·presence·레지스트리는 전부 백엔드 소유.
//
// ★ Zero-config: 환경변수 미설정 시 프로젝트의 `.ouroboros/config/plm.json`(api_url·project)과
//   `.ouroboros/env/.env`(PLM_API_TOKEN)에서 자동 발견 → /plm-hub:link 직후 바로 동작.
//   (CWD에서 위로 탐색. 명시 환경변수가 항상 우선.)
//
// 실행: claude --channels server:plm-channel --dangerously-load-development-channels
// (.mcp.json 등록은 /plm-hub:channel 또는 /plm-hub:link가 자동 수행.)
//
// 의존성 0(순수 Node ≥18, 내장 fetch 스트리밍). MCP stdio = 줄단위 JSON-RPC.

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const UA = "plm-channel-relay/0.2";

const LOGFILE = process.env.PLM_CHANNEL_LOG || ""; // 디버그: 설정 시 로그를 파일로도 기록.
function log(...a) {
  const line = `[plm-channel] ${a.join(" ")}\n`;
  process.stderr.write(line); // stdout은 MCP 전용 → 로그는 stderr.
  if (LOGFILE) {
    try {
      fs.appendFileSync(LOGFILE, line);
    } catch {
      /* ignore */
    }
  }
}

// ── .ouroboros/ 자동 발견 (CWD에서 위로) ──
function findUp(start, rel) {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    const p = path.join(dir, rel);
    if (fs.existsSync(p)) return p;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}
function discoverConfig() {
  const cwd = process.cwd();
  let api = process.env.PLM_API;
  let project = process.env.PLM_PROJECT;
  let token = process.env.PLM_TOKEN;
  if (!api || !project) {
    const pj = findUp(cwd, path.join(".ouroboros", "config", "plm.json"));
    if (pj) {
      try {
        const j = JSON.parse(fs.readFileSync(pj, "utf8"));
        api = api || j.api_url;
        project = project || j.project;
        log(`config 발견: ${pj} (project=${j.project})`);
      } catch (e) {
        log(`plm.json 파싱 실패: ${e.message}`);
      }
    }
  }
  if (!token) {
    const ep = findUp(cwd, path.join(".ouroboros", "env", ".env"));
    if (ep) {
      try {
        for (const ln of fs.readFileSync(ep, "utf8").split("\n")) {
          const m = ln.match(/^\s*PLM_API_TOKEN\s*=\s*(.+?)\s*$/);
          if (m) {
            token = m[1].replace(/^["']|["']$/g, "");
            break;
          }
        }
      } catch {
        /* ignore */
      }
    }
  }
  return {
    api: (api || "").replace(/\/$/, ""),
    project: project || "",
    token: token || "",
  };
}

const CFG = discoverConfig();
const API = CFG.api;
const TOKEN = CFG.token;
const PROJECT = CFG.project;
const SESSION = process.env.PLM_SESSION || `${os.hostname()}-${process.pid}`;
// 받은 작업의 work_id → project (message 답신을 올바른 project 스레드로 라우팅).
const workProject = new Map();

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
if (!API || !TOKEN || !PROJECT) {
  log(
    `치명: 설정 부족(API=${!!API} TOKEN=${!!TOKEN} PROJECT=${!!PROJECT}). ` +
      `/plm-hub:link 실행 또는 PLM_API/PLM_TOKEN/PLM_PROJECT 설정. (MCP는 뜨되 구독 비활성)`,
  );
}

// ── 세션에 채널 이벤트 주입 ──
function pushToSession(content, meta) {
  send({ jsonrpc: "2.0", method: "notifications/claude/channel", params: { content, meta } });
}

// ── 백엔드 SSE 구독 (재접속 백오프) ──
let started = false;
async function subscribe() {
  if (started || !API || !TOKEN || !PROJECT) return;
  started = true;
  const url = `${API}/channel/subscribe?project=${encodeURIComponent(PROJECT)}&session=${encodeURIComponent(SESSION)}&label=${encodeURIComponent(SESSION)}`;
  let backoff = 1000;
  for (;;) {
    try {
      log(`구독: ${API}/channel/subscribe project=${PROJECT} session=${SESSION}`);
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${TOKEN}`, accept: "text/event-stream", "user-agent": UA },
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      backoff = 1000;
      log("구독 성립 — 이벤트 대기");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          handleSse(buf.slice(0, i));
          buf = buf.slice(i + 2);
        }
      }
      log("스트림 종료 — 재연결");
    } catch (e) {
      log(`구독 오류: ${e.message} — ${backoff}ms 후 재시도`);
    }
    await new Promise((r) => setTimeout(r, backoff));
    backoff = Math.min(backoff * 2, 30000);
  }
}

function handleSse(raw) {
  let event = "message";
  const data = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (event !== "sync_work" || data.length === 0) return;
  let w;
  try {
    w = JSON.parse(data.join("\n"));
  } catch {
    return;
  }
  // work_id → project 기억 — message 답신 시 '받은 작업의 project'로 정확히 회신(plm.json PROJECT와
  // 대시보드 project가 달라도 답이 올바른 스레드에 도달). 최근 200개만 유지.
  if (w.work_id && w.project) {
    workProject.set(String(w.work_id), String(w.project));
    if (workProject.size > 200) workProject.delete(workProject.keys().next().value);
  }
  const content =
    `[PLM 메신저] work_id=${w.work_id} task_type=${w.task_type} project=${w.project}` +
    (w.payload ? `\n${w.payload}` : "") +
    `\n\n— 대화: 진행상황·질문·중간결과는 'message' 도구로 여러 번 회신하세요(대시보드 메신저에 실시간 표시):` +
    `\n    message(body="...", kind="progress"|"question"|"result", work_id="${w.work_id}")` +
    `\n— 작업 완료(최종)는 'report' 도구로 한 번: report(work_id="${w.work_id}", ok=true, result="...").` +
    `\n  (message는 대화용·watermark 무관 / report는 작업 완료·watermark 전진. 진행보고를 report로 보내지 마세요.)`;
  pushToSession(content, {
    source: "plm",
    work_id: String(w.work_id),
    task_type: String(w.task_type),
    project: String(w.project),
    requester: String(w.requester || ""),
  });
  log(`주입: work_id=${w.work_id} (${w.task_type})`);
}

// ── report 도구 (세션 → 백엔드 회신) ──
const REPORT_TOOL = {
  name: "report",
  description:
    "PLM [Sync] 작업 결과를 백엔드에 회신한다. 채널로 받은 작업(work_id) 처리 후 호출. ok=false면 실패 보고.",
  inputSchema: {
    type: "object",
    properties: {
      work_id: { type: "string", description: "채널로 받은 작업의 work_id" },
      ok: { type: "boolean", description: "성공 여부" },
      result: { type: "string", description: "결과/요약 텍스트" },
    },
    required: ["work_id", "ok"],
  },
};
async function doReport(args) {
  const res = await fetch(`${API}/sync/report`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify({
      work_id: args.work_id,
      session_id: SESSION,
      ok: !!args.ok,
      result: args.result || "",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`report HTTP ${res.status}: ${text}`);
  return `reported work_id=${args.work_id} ok=${!!args.ok}`;
}

// ── message 도구 (세션 → 대시보드 대화 회신, 다중 가능 — report와 분리) ──
const MESSAGE_TOOL = {
  name: "message",
  description:
    "PLM 메신저 대화 회신. 진행상황·질문·중간결과를 대시보드 우측 메신저에 실시간 표시한다. 작업 중 여러 번 호출 가능. " +
    "watermark/작업완료와 무관(완료 보고는 'report' 사용).",
  inputSchema: {
    type: "object",
    properties: {
      body: { type: "string", description: "회신 본문(마크다운 가능)" },
      kind: {
        type: "string",
        enum: ["progress", "question", "result", "text"],
        description: "메시지 종류(기본 progress)",
      },
      work_id: { type: "string", description: "관련 작업 work_id(옵션·상관용)" },
    },
    required: ["body"],
  },
};
async function doMessage(args) {
  // 답신 project — 받은 작업(work_id)의 project 우선(대시보드와 정확 매칭), 없으면 plm.json PROJECT.
  const project = (args.work_id && workProject.get(String(args.work_id))) || PROJECT;
  const res = await fetch(`${API}/channel/message`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", "user-agent": UA },
    body: JSON.stringify({
      project,
      session: SESSION,
      direction: "in",
      kind: args.kind || "progress",
      body: args.body || "",
      work_id: args.work_id || null,
      msg_id: `relay-${SESSION}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(
        `message HTTP 404 — '${API}'에 메신저 엔드포인트(/channel/message)가 없습니다. ` +
          `이 서버가 메신저 미배포(구버전)이거나 plm.json의 api_url이 잘못됨. ` +
          `대시보드와 같은 인스턴스(예: jwk-plm.shoi.ch)를 가리키는지 .ouroboros/config/plm.json 확인.`,
      );
    }
    if (res.status === 403) {
      throw new Error(
        `message HTTP 403 — 이 토큰 사용자가 project='${PROJECT}' 멤버가 아닙니다. ` +
          `대시보드에서 보는 project와 plm.json의 project가 일치하는지, 멤버 권한이 있는지 확인.`,
      );
    }
    throw new Error(`message HTTP ${res.status}: ${text}`);
  }
  return `메시지 전송됨 (project=${project} kind=${args.kind || "progress"})`;
}

// ── MCP stdio 서버 (줄단위 JSON-RPC) ──
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  const reply = (result) => send({ jsonrpc: "2.0", id, result });
  const error = (code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });
  switch (method) {
    case "initialize":
      reply({
        protocolVersion: params?.protocolVersion || "2025-06-18",
        capabilities: { experimental: { "claude/channel": {} }, tools: {} },
        serverInfo: { name: "plm-channel", version: "0.2.0" },
      });
      break;
    case "notifications/initialized":
      subscribe();
      break;
    case "tools/list":
      reply({ tools: [REPORT_TOOL, MESSAGE_TOOL] });
      break;
    case "tools/call":
      if (params?.name === "report" || params?.name === "message") {
        const fn = params.name === "report" ? doReport : doMessage;
        try {
          reply({ content: [{ type: "text", text: await fn(params.arguments || {}) }] });
        } catch (e) {
          reply({ content: [{ type: "text", text: `오류: ${e.message}` }], isError: true });
        }
      } else {
        error(-32601, `unknown tool: ${params?.name}`);
      }
      break;
    case "ping":
      reply({});
      break;
    default:
      if (id !== undefined) error(-32601, `method not found: ${method}`);
  }
});

log(`기동 — session=${SESSION} project=${PROJECT || "(미설정)"} api=${API || "(미설정)"}`);
