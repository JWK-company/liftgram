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
  // 스택 표준 env(PLM_API_URL·PLM_API_TOKEN) 우선, 구 이름(PLM_API·PLM_TOKEN)은 폴백.
  let api = process.env.PLM_API_URL || process.env.PLM_API;
  let project = process.env.PLM_PROJECT;
  let token = process.env.PLM_API_TOKEN || process.env.PLM_TOKEN;
  let dash = process.env.PLM_DASH_URL;
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
  if (!token || !dash) {
    const ep = findUp(cwd, path.join(".ouroboros", "env", ".env"));
    if (ep) {
      try {
        for (const ln of fs.readFileSync(ep, "utf8").split("\n")) {
          const mt = ln.match(/^\s*PLM_API_TOKEN\s*=\s*(.+?)\s*$/);
          if (mt && !token) token = mt[1].replace(/^["']|["']$/g, "");
          const md = ln.match(/^\s*PLM_DASH_URL\s*=\s*(.+?)\s*$/);
          if (md && !dash) dash = md[1].replace(/^["']|["']$/g, "");
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
    dash: (dash || "").replace(/\/$/, ""),
  };
}

const CFG = discoverConfig();
const API = CFG.api;
let TOKEN = CFG.token; // ONB-06: 401 시 .env 재로딩으로 갱신 가능하도록 mutable.

// ONB-06: .env(PLM_API_TOKEN)를 다시 발견해 토큰 갱신(relay 기동 후 /plm-hub:link로 토큰이 생긴 경우 등).
function reloadToken() {
  try {
    const c = discoverConfig();
    if (c.token && c.token !== TOKEN) {
      TOKEN = c.token;
      log("PLM_API_TOKEN 재로딩(.env 변경 감지) — 새 토큰으로 재구독");
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}
const PROJECT = CFG.project;
const SESSION = process.env.PLM_SESSION || `${os.hostname()}-${process.pid}`;
// 대시보드 base URL — PLM_DASH_URL(env/.env) 우선, 없으면 API host의 첫 'plm.'→'plm-dash.' 유도
// (plm_upload.py와 동일 규약: https://jwk-plm.shoi.ch → https://jwk-plm-dash.shoi.ch).
const DASH = CFG.dash || API.replace("plm.", "plm-dash.");
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

// ★ 원격 질문 규칙 — 채널로 원격 구동되는 세션에서 사용자 입력이 필요할 때의 핵심 규칙.
// 터미널 대화형 질문(AskUserQuestion 등)은 원격 사용자에게 보이지 않고 세션을 무기한 블록시킨다
// (사용자는 터미널을 직접 열기 전까지 멈춘 사실조차 모름). 따라서 반드시 message(kind="question")로
// 대시보드 메신저에 물은 뒤 '턴을 종료'하고 답을 기다린다. 답은 채널로 다시 주입된다.
function REMOTE_ASK_RULE(workId) {
  const w = workId ? `, work_id="${workId}"` : "";
  return (
    `\n\n★ 원격 질문 규칙(중요): 이 세션은 웹 대시보드에서 원격 구동됩니다. 사용자의 판단·선택·정보가 필요하면` +
    `\n  절대 터미널 대화형 질문(AskUserQuestion 등)을 쓰지 마세요 — 원격 사용자에게 안 보이고 세션이 멈춥니다.` +
    `\n  대신: message(body="구체적 질문+선택지", kind="question"${w}) 로 대시보드에 묻고 → 즉시 턴을 종료(대기)하세요.` +
    `\n  사용자가 대시보드에서 답하면 그 답이 [PLM 사용자 메시지]로 다시 도착합니다. 그때 작업을 이어가세요.` +
    `\n\n★ 장시간·서브에이전트 작업 규칙: main이 서브에이전트(Task)·오래 걸리는 작업을 돌려 **대기만 하는 상태면 침묵하지 마세요** —` +
    ` 착수·중간 진행을 message(kind="progress"${w})로 먼저 알린 뒤 최종 결과를 기다리세요(작업이 길면 단계마다 중간보고).` +
    ` 사용자가 응답 없는 빈 대기 상태로 방치되지 않고, 대시보드가 '멈춤'으로 오인하지 않게 합니다(진행 heartbeat 유지).`
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
      // ONB-06: 401(토큰 무효/누락) 시 .env를 재로딩 — /plm-hub:link로 토큰을 relay 기동 후 발급한 경우
      // 재시작 없이 회복. 토큰이 바뀌면 다음 루프에서 새 토큰으로 재구독.
      if (res.status === 401) reloadToken();
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
          await handleSse(buf.slice(0, i));
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

async function handleSse(raw) {
  let event = "message";
  const data = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (data.length === 0) return;
  // 취소 신호(별도 SSE 이벤트) — 사용자가 방금 보낸 요청을 취소. 세션에 취소 안내를 주입(작업 claim 아님).
  //   서버는 queued(미전달)면 이미 실제 취소했고, 여기 오는 건 dispatched(이미 전달)라 되돌릴 수 없는 경우 →
  //   세션이 진행 중 작업을 자발적으로 중단하도록 안내(best-effort). HMAC 검증 불필요(claim/작업 주입 아님).
  if (event === "cancel") {
    let c;
    try { c = JSON.parse(data.join("\n")); } catch { return; }
    const content =
      `[PLM 취소 요청] project=${c.project} work_id=${c.work_id}\n` +
      `— 사용자가 방금 보낸 요청(work_id=${c.work_id})의 **취소**를 요청했습니다. 아직 그 작업을 시작하지 않았다면 진행하지 마세요. ` +
      `이미 진행 중이라면 가능한 지점에서 안전하게 중단하고, 사용자에게 중단했음을 message로 알려주세요. (이미 완료됐다면 무시)`;
    pushToSession(content, { source: "plm", work_id: String(c.work_id), task_type: "cancel", project: String(c.project), requester: String(c.requester || "") });
    log(`취소 주입: work_id=${c.work_id}`);
    return;
  }
  if (event !== "sync_work") return;
  let w;
  try {
    w = JSON.parse(data.join("\n"));
  } catch {
    return;
  }
  // SYNC-02: HMAC 위임 검증 — 릴레이는 키가 없으므로 받은 작업(sig)을 백엔드 /sync/verify에 위임.
  // 위조·payload 변조 주입을 sig 불일치로 차단(과거 검증 부재 → dead control). 검증 실패/오류 시 주입 거부.
  try {
    const vr = await fetch(`${API}/sync/verify`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", "user-agent": UA },
      body: JSON.stringify({ work_id: w.work_id, project: w.project, task_type: w.task_type, payload: w.payload ?? null, sig: w.sig || "" }),
    });
    const ok = vr.ok && (await vr.json().catch(() => ({}))).valid === true;
    if (!ok) {
      log(`⚠ HMAC 검증 실패 — 작업 주입 거부: work_id=${w.work_id} (위조/변조 의심)`);
      return;
    }
  } catch (e) {
    log(`⚠ /sync/verify 호출 실패(${e.message}) — 안전을 위해 주입 거부: work_id=${w.work_id}`);
    return;
  }
  // work_id → project 기억 — message 답신 시 '받은 작업의 project'로 정확히 회신(plm.json PROJECT와
  // 대시보드 project가 달라도 답이 올바른 스레드에 도달). 최근 200개만 유지.
  if (w.work_id && w.project) {
    workProject.set(String(w.work_id), String(w.project));
    if (workProject.size > 200) workProject.delete(workProject.keys().next().value);
  }
  // task_type="message" = 대시보드에서 온 사용자 대화/답변(작업 지시 아님). 대화체로 깔끔히 주입.
  // 그 외(echo/update_artifact_body/plm_pull/sync_docs) = 실작업 지시 → 작업 안내 포함.
  const isBuild = String(w.task_type) === "build";
  const isUserMsg = String(w.task_type) === "message";
  // 문서 빌더(스토리빌더) — payload{code,mode,text}를 파싱해 문서 빌딩 지시로 주입.
  let buildInfo = null;
  if (isBuild) { try { buildInfo = JSON.parse(w.payload || "{}"); } catch { buildInfo = {}; } }
  const bc = buildInfo?.code || "?";
  // 적용 대상(targets) — 페이로드에 실려오면 직접 반영, 없으면 세션이 artifact_links로 조회하도록 안내(feedback 반영 보장).
  const btargets = Array.isArray(buildInfo?.targets) ? buildInfo.targets.filter(Boolean) : [];
  const targetsHint = btargets.length
    ? `**적용 대상(targets) = ${btargets.join(", ")}** — 각 대상을 doc_get으로 읽고 그 맥락 위에서 개선/피드백을 구체적으로 논의·제안한다.`
    : `**적용 대상(targets)** 은 plm artifact_links(project="${w.project}", code="${bc}")로 rel="targets" 대상을 조회해 확인한다(없으면 사용자에게 적용 대상 지정 또는 revise 절차 안내).`;
  const content = isBuild
    ? `[문서 빌더 요청] project=${w.project} code=${bc} mode=${buildInfo?.mode || "doc"} work_id=${w.work_id}\n` +
      `사용자: ${buildInfo?.text || ""}\n\n` +
      `— 이것은 문서 "${bc}"를 대화로 빌딩하는 요청입니다(전역 세션 지시가 아닌 그 문서 전용 대화). 수행:\n` +
      `1. plm MCP doc_get(project="${w.project}", code="${bc}")로 현재 본문을 읽습니다.\n` +
      `2. mode="${buildInfo?.mode}"에 맞게:\n` +
      `   - **idea(BS 브레인스토밍)**: 아이디어 발산·초기 가설 구조화(일반 브레인스토밍).\n` +
      `   - **sim(BS 심화 · 역할별 사용 시나리오 시뮬레이션)**: idea 안의 심화 모드. BS의 "사용자 종류(role)" 섹션을 읽고, **각 역할 관점에서 실제 사용 시나리오를 대화로 함께 걸어본다**(이 역할이 언제·왜·어떻게 쓰나 → 어디서 막히나 → 뭐가 필요한가). 역할이 여럿이면 순회하고, 깊이가 필요하면 역할별 서브에이전트로 시뮬레이션. **그 결과로 BS를 강화**한다 — "사용 흐름"을 역할별 시나리오로 구체화하고, 드러난 니즈·빠진 기능·역할 보정을 본문에 반영 제안. (발산·질문은 message로 대화, 정리된 본문은 proposal로.)\n` +
      `   - **feedback(기존 아티팩트 개선 피드백)**: ${targetsHint} 실제 적용(대상의 세대 스냅샷 박제·재검토 전파·변경추적)은 사용자가 이 BS의 **[적용(스냅샷)]** 버튼으로 확정한다. / doc=문서 작성.\n` +
      `   - **revise(피드백 반영)**: 이 문서에 달린 피드백(댓글·토론·투표)을 반영해 개정한다. ① comments_get(project,code)로 댓글 전체(+미해결 우선), ideas_get(code)로 관련 아이디어·투표 수집 — 본문은 이미 1의 doc_get으로 확보. ② 피드백 정리(항목별 수용/보류 + 근거)를 message(kind="progress")로 보고. ③ **범위 판정**: (a) 이 문서만 수정하면 되는 경우 → 개정 본문 전체를 proposal로 회신(사용자가 [반영] — 문서는 라이브 갱신됨). (b) **다른 아티팩트도 연계 수정이 필요한 경우** → 정석 절차: BS 발급(artifact_issue type="BS", kind="feedback", code=기존 BS 다음 번호) + relation_link(rel="targets", src=BS, dst=이 문서와 영향 아티팩트 각각) + BS 본문(put_doc)에 변경 계획(피드백 요지→문서별 변경안→영향권) 작성 → 사용자에게 "생성된 BS 문서의 **[적용(스냅샷)]** 버튼으로 정식 적용하세요(원본 세대 백업·재검토 전파·변경 추적)"라고 안내. 판단이 애매하면 message(kind="question")로 (a)/(b) 확인.\n` +
      `3. 대화·질문은 message(kind="progress"|"question", thread="build:${bc}", work_id="${w.work_id}", body="...").\n` +
      `4. 본문 제안은 message(kind="proposal", thread="build:${bc}", work_id="${w.work_id}", body=<JSON>)로 회신하세요.\n` +
      `   body = JSON.stringify({ summary: "무엇을 바꿨는지 한 줄", doc: <문서 전체 ProseMirror doc JSON> }).\n` +
      `   ⚠ 본문을 직접 put_doc 하지 마세요 — 사용자가 빌더 탭 [반영] 버튼으로 확정합니다(Q2).\n` +
      `5. 완료는 report(work_id="${w.work_id}", ok=true, result="...").` +
      REMOTE_ASK_RULE(w.work_id)
    : isUserMsg
    ? `[PLM 사용자 메시지] project=${w.project}` +
      (w.payload ? `\n${w.payload}` : "") +
      `\n\n— 위는 사용자가 웹 대시보드 메신저에서 보낸 메시지입니다(당신이 앞서 message(kind="question")로 물었다면 그 답변일 수 있음).` +
      `\n  이어서 작업을 계속하세요. 추가 입력이 필요하면 아래 '원격 질문 규칙'을 따르세요.` +
      REMOTE_ASK_RULE(w.work_id)
    : `[PLM 메신저] work_id=${w.work_id} task_type=${w.task_type} project=${w.project}` +
      (w.payload ? `\n${w.payload}` : "") +
      `\n\n— 대화: 진행상황·질문·중간결과는 'message' 도구로 여러 번 회신하세요(대시보드 메신저에 실시간 표시):` +
      `\n    message(body="...", kind="progress"|"question"|"result", work_id="${w.work_id}")` +
      `\n— 작업 완료(최종)는 'report' 도구로 한 번: report(work_id="${w.work_id}", ok=true, result="...").` +
      `\n  (message는 대화용·watermark 무관 / report는 작업 완료·watermark 전진. 진행보고를 report로 보내지 마세요.)` +
      REMOTE_ASK_RULE(w.work_id);
  setBusy(); // ① 턴 시작(메시지 주입) → busy 표시. 턴 종료 시 Stop hook이 idle로 → 응답 없이 끝나도 대시보드가 인지.
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
      reason: { type: "string", description: "차단 사유(ok=false + reason → blocked 상태·재디스패치 가능. 예: git-apply 충돌)" },
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
      reason: args.reason || null, // SYNC-12: blocked 사유 전달(백엔드가 blocked 상태로 표면화)
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
    "watermark/작업완료와 무관(완료 보고는 'report' 사용). " +
    "★ 사용자 입력/판단이 필요하면 터미널 질문 대신 kind='question'으로 물은 뒤 턴을 종료해 대기하세요 — " +
    "답은 채널로 [PLM 사용자 메시지]로 도착합니다(원격 세션 무기한 블록 방지).",
  inputSchema: {
    type: "object",
    properties: {
      body: { type: "string", description: "회신 본문(마크다운 가능)" },
      kind: {
        type: "string",
        enum: ["progress", "question", "result", "text", "proposal"],
        description: "메시지 종류(기본 progress). proposal=문서 빌더 본문 제안(body=JSON{summary,doc}) — thread 필수.",
      },
      work_id: { type: "string", description: "관련 작업 work_id(옵션·상관용)" },
      thread: {
        type: "string",
        description:
          "논리 스레드(스토리빌더) — 'build:<code>'면 그 문서의 빌더 탭에 회신(문서 대화). 미지정=전역 메신저('session'). " +
          "빌더 요청(task_type=build) 처리 시 payload의 code로 thread='build:<code>'를 지정해 회신하세요.",
      },
      files: {
        type: "array",
        items: { type: "string" },
        description:
          "첨부할 로컬 파일 경로(이미지·PDF·HTML·zip 등, 최대 8개·개당 25MB). 대시보드 스토리지에 업로드 후 " +
          "메시지에 첨부되어 메신저에 미리보기/다운로드 카드로 표시(HTML은 CSP sandbox로 열람 — 스크립트 무시됨).",
      },
    },
    required: ["body"],
  },
};

// 첨부 업로드가 허용하는 확장자→MIME(대시보드 /api/upload 허용목록과 정합 — 실행형 제외).
const MIME_BY_EXT = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  svg: "image/svg+xml", avif: "image/avif", pdf: "application/pdf", html: "text/html", txt: "text/plain", csv: "text/csv",
  md: "text/markdown", json: "application/json", zip: "application/zip", gz: "application/gzip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

// 로컬 파일들을 대시보드 /api/upload(MinIO)로 올리고 첨부 메타 [{key,name,mime,size}]를 반환.
// project를 함께 보내 파일 레지스트리에 등록(SRS-030 — file_get 인가 근거).
async function uploadFiles(paths, project) {
  const out = [];
  for (const p of paths.slice(0, 8)) {
    const name = path.basename(p);
    const ext = (name.match(/\.([a-z0-9]{1,8})$/i)?.[1] || "").toLowerCase();
    const mime = MIME_BY_EXT[ext];
    if (!mime) {
      throw new Error(`첨부 불가 확장자: ${name} — 허용: ${Object.keys(MIME_BY_EXT).join("/")}`);
    }
    const buf = fs.readFileSync(p);
    const form = new FormData();
    if (project) form.append("project", project);
    form.append("file", new Blob([buf], { type: mime }), name);
    const res = await fetch(`${DASH}/api/upload`, {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "user-agent": UA },
      body: form,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`업로드 실패 ${name}: HTTP ${res.status} ${text} (dash=${DASH})`);
    const j = JSON.parse(text);
    out.push({ key: j.key, name: j.name || name, mime: j.mime || mime, size: j.size ?? buf.length });
  }
  return out;
}

async function doMessage(args) {
  // 답신 project — 받은 작업(work_id)의 project 우선(대시보드와 정확 매칭), 없으면 plm.json PROJECT.
  const project = (args.work_id && workProject.get(String(args.work_id))) || PROJECT;
  // 파일 첨부(옵션) — 업로드 실패는 메시지 전송 자체를 중단(무성 누락 방지 — 에러로 표면화).
  const attachments = Array.isArray(args.files) && args.files.length ? await uploadFiles(args.files, project) : [];
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
      thread: args.thread || "session",
      msg_id: `relay-${SESSION}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      attachments,
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
  return `메시지 전송됨 (project=${project} kind=${args.kind || "progress"}${attachments.length ? ` 첨부=${attachments.length}건` : ""})`;
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

// ① 세션 종료 감지 — Claude Code가 죽으면(터미널 닫힘) stdin이 닫혀 readline 'close'가 뜬다.
//   orphan으로 남지 않게 즉시 offline 표시(대시보드가 "멈춤" 인지) 후 종료. 시그널도 동일.
//   (안 그러면 열린 SSE가 이벤트루프를 붙잡아 릴레이가 살아남고 presence가 계속 online → 오탐 "처리 중".)
// ① 턴 시작 표시(메시지 주입 시) — busy. Stop hook(plm-idle.sh)이 턴 종료 시 idle로 되돌린다.
function setBusy() {
  if (!API || !TOKEN || !PROJECT) return;
  fetch(`${API}/channel/activity`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, "user-agent": UA },
    body: JSON.stringify({ project: PROJECT, state: "busy" }),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}

let _offlineSent = false;
async function markOffline() {
  if (_offlineSent || !API || !TOKEN || !PROJECT) return;
  _offlineSent = true;
  try {
    await fetch(`${API}/channel/offline`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, "user-agent": UA },
      body: JSON.stringify({ project: PROJECT, session: SESSION }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* best-effort — SSE 단절로 백엔드가 TTL(30s)로도 offline 처리 */
  }
}
rl.on("close", () => {
  log("stdin 닫힘(Claude Code 종료 추정) — offline 표시 후 종료");
  markOffline().finally(() => process.exit(0));
});
for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(sig, () => {
    markOffline().finally(() => process.exit(0));
  });
}

log(`기동 — session=${SESSION} project=${PROJECT || "(미설정)"} api=${API || "(미설정)"}`);
