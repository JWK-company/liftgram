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
//
// 변경 이력(지시문 계약에 영향 있는 것만):
//   0.1.21 빌더 3종 파일 첨부(payload.attachments → file_get 안내 임베드)
//   0.1.22 첨부 주소 본문 임베드 중복 제거([첨부 파일] 블록이 정본)
//   0.1.24 와이어프레임 **댓글 피드백** 전용 분기(isWfFeedback · payload.feedback.items 정본)
//   0.1.25 그 분기에 **작업용 사본(working copy) 인지** 추가 — 사본이 있으면 penpot 작업을 사본 페이지로
//          고정(`--page`)하고 **PLM 정본 push(`wfanno sync`)를 지시문에서 제거**한다(정본 반영은 승격 시점).
//          사본 상태를 확정하지 못하면 **정본을 건드리는 쪽으로 폴백하지 않고 보류**한다(안전 실패).
//          지시문 조립은 relay/wf-feedback.mjs(순수 함수) · 테스트 tests/wf-feedback.test.mjs.
//   0.1.26 **사본 강제** — 관리자 확정("댓글 반영은 무조건 사본 만들고 진행, 옵션이 아닌 강제").
//          사본이 없으면 **작업하지 않고 보류**한다(정본 직접 작업 분기 제거 — 0.1.25까지의 원문은
//          wf-feedback.mjs에 주석으로 보존). 사본 생성은 대시보드 전송 흐름이 보장한다.
//   0.1.27 **쓰기 직전 재확인**(감사 C1) — 아래 조회는 claim 시점 **1회**뿐이라, 그사이 승격되면 세션이
//          "사본"이라 믿고 **정본을 직접 고친다**. 지시문에 재확인 절차(③-b)를 넣고 render에 도구 가드
//          (`--expect-page-role working`)를 달아, 상태가 바뀌면 아무것도 쓰지 않고 사유를 회신한다.
//   0.1.30 **플러그인 버전 보고**(감사 X1 · 치명) — 구독 시 `versions=plm-channel=…,plm-hub=…`를 실어 보낸다.
//          서버가 기준 미만이면 사본 생성·승격을 거절한다(전달 스큐 = 정본 오염의 실제 원인이었다).
//          ⑤ 승격 후 절차에 `sync --page <사본 page uuid>` 복원(감사 X4 — --page 없는 sync는 항상 거부된다).
//   0.1.31 **버전 탐지 실사용 수정**(감사 Y1 · 치명) — 0.1.30의 형제 상대경로는 **설치 레이아웃에
//          존재하지 않아**(`~/.claude/plugins/cache/<mkt>/<plugin>/<ver>/`) plm-hub가 영원히 미보고였다
//          → enforce로 켜면 정상 사용자 전원 차단. 설치 대장(installed_plugins.json) 기반 탐지로 교체
//          (저장소 레이아웃도 그대로 동작 · relay/plugin-versions.mjs). + 반쪽 복제 사본에는 작업을
//          배정하지 않는다(감사 Y5 — 그 사본은 승격이 영구 거절이라 작업이 확정 폐기된다).
//   0.1.32 **추정 버전 미보고**(감사 Z3 · 높음) — 폴백 2종(`installed_plugins:newest`·`cache-scan`)이
//          "있는 것 중 최고 버전"을 골라 **위로 편향**한다(캐시는 과거 버전을 누적 보관 → 실제 0.6.19인
//          세션이 0.6.30을 보고). fail-closed 설계와 정반대 방향의 오류(false pass)라, 추정은 값을
//          싣지 않고 **미보고**로 낮춘다. 출처는 `plm-hub-src=`로 함께 보고(서버가 사실/추정 구분).
//          옛 동작은 `PLM_HUB_VERSION_ALLOW_GUESS=1` 옵트인.
//   0.1.33 **활동 신호 세션 스코프**(감사 Z2 · 치명) — `/channel/activity`에 `session`을 실어 보낸다.
//          서버가 세션을 모르면 그 사용자×프로젝트의 모든 행을 갱신해(구현 이전) 죽은 세션이 영원히
//          '살아 있는 busy'로 남았고, 버전 게이트가 그 좀비 20건을 세어 enforce에서 100% 차단됐다.
//          hook 2종(plm-activity·plm-idle)도 `PLM_SESSION`이 있으면 함께 보낸다.
//   0.1.28 사본 판정을 **파일이 아니라 대상 페이지**로 좁힘(감사 C6) — DB는 "원본당 사본 1개"만 강제하므로
//          한 파일에 서로 다른 화면의 사본 2개는 **정상 상태**인데, 그것만으로 그 파일의 모든 전송이
//          `unknown`(보류)으로 죽었다. 이 작업의 댓글이 어느 페이지 것인지는 payload에 이미 있다.
//   0.1.34 **지금 열어둔 페이지**를 지시문에 싣는다(관리자 요구 2026-07-31) — "사본을 열어놓고 그 안에서
//          피드백·보완을 한 다음 합칠 텐데, Claude가 어디서 작업해야 하는지 알려면 열려 있는 페이지가
//          정본인지 사본인지 알아야 한다". 대시보드 payload.open_page(가산 필드 · 브리지 미도달이면 없음)
//          → 지시문 첫머리 `지금 열려 있는 페이지: 사본 …`(없으면 **열린 페이지 미상**) + 사본 선택
//          우선순위 ①열어둔 페이지 → ②고른 댓글의 페이지. 둘이 다른 사본을 가리키면 **둘 다 적고**
//          열어둔 쪽으로 정한 사실을 회신에 남기게 한다. 서버 최소 요구 버전은 **올리지 않는다**
//          (구 릴레이는 필드를 무시할 뿐 정본을 건드리지 않는다 — 전원 재업데이트 유발 금지).
//   0.1.35 **목업 도형도 실제로 고친다**(실사용 지적 2026-07-31: "왜 주석만 고치고 그림은 안 고치냐").
//          지시문에 ③-c **목업 제자리 수정** 단계 신설 — 사본 페이지에서 옛 board 서브트리 del-obj +
//          새 board add-obj를 **한 update-file**로(부분 적용 금지 · board id 재사용으로 댓글 핀·loc 유지 ·
//          쓰기 전 겹침 계산 · ③-c → ④ 패널 재렌더 순서). 낡은 금지 문장("목업 파일을 만드는 작업이
//          아니다" · "목업을 바꿔야 하면 미반영")은 **새 파일 생성 금지**로 좁혀 대체. 회신·정산에는
//          `목업변경:` 줄을 강제해 "설명만 최신"인 상태가 즉시 드러난다. 보류 분기·서버 최소 요구 버전
//          **무변경**(지시문 텍스트만 바뀐다 — 구 릴레이도 정본을 건드리지 않는다).
//   0.1.36 **바뀐 프레임에 변경 칩을 붙인다**(관리자 요구 2026-07-31: "변경한 프레임에 확인할 수 있도록
//          표시를 해주면 좋겠다 — 별표시나 '변경했다'는 텍스트박스를 칩처럼 위에 붙여주거나").
//          지시문에 ④-c **변경 칩 부착** 단계 신설 — `wfanno.py mark --code … --items "12,13"`이
//          프레임 위에 `✱ 반영됨 · MM-DD · <CODE>.12, …` 칩(`chg:<CODE>` 그룹 · 멱등)을 얹는다.
//          순서는 ④(패널 재렌더) → ④-c(칩): 패널이 프레임 우변 기준이라 목업이 바뀌면 자리가 바뀐다.
//          승격 뒤 정리(`mark --clear`)를 관리자 절차 마지막 줄에 함께 넣는다 — 정본이 된 페이지에
//          "반영됨" 표시가 남으면 다음 리뷰어가 오해한다. 보류 분기·서버 최소 요구 버전 **무변경**.

import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
// 0.1.26 — 와이어프레임 피드백 지시문 조립(순수 함수·단위 테스트 대상). 사본 있음=사본 모드 / 없음·판정불가=보류.
import {
  buildWfFeedbackInstruction,
  filesFromFeedbackItems,
  normalizeOpenPage,
  pagesFromFeedbackItems,
  pagesFromOpenPage,
  pickWorkingCopy,
} from "./wf-feedback.mjs";
// 0.1.31(감사 Y1) — 플러그인 버전 탐지(저장소·설치 레이아웃 둘 다). 순수 함수 · 단위 테스트 대상.
import { resolvePluginVersions } from "./plugin-versions.mjs";

const UA = "plm-channel-relay/0.2";

// ── 0.1.30(감사 X1 · 치명) — **플러그인 버전 보고** ────────────────────────────────────────
//
// 왜: 서버·대시보드는 "댓글 반영은 반드시 사본에서"를 강제하지만 실제로 penpot을 만지는 것은 이 기계의
// 플러그인이다. 마켓플레이스 전달이 수동이라 그 둘이 몇 버전 뒤처지는 일이 실제로 일어났고(라이브에서
// plm-hub 0.6.20 / plm-channel 0.1.24), 그 조합은 **배포 전보다 나쁘다**: 대시보드가 사본을 만들어
// 파일이 2페이지가 되는데 옛 도구엔 페이지 스코핑(`--page`)·역할 가드가 없어 정본을 오염시킨다.
// 서버가 그 사실을 알 수단이 **전혀 없었다** → 구독할 때 자기 버전과 형제 plm-hub 버전을 실어 보낸다.
// 서버(`wf_copy::version_gate`)가 기준 미만이면 사본 생성·승격을 거절한다(fail-closed).
//
// 읽는 곳(0.1.31 · 감사 Y1): 자기 버전은 `../.claude-plugin/plugin.json`.
// plm-hub는 **저장소 레이아웃과 설치 레이아웃이 다르다** — 설치본은 버전 서브디렉터리가 하나 더 있어
// (`~/.claude/plugins/cache/<mkt>/<plugin>/<ver>/`) 형제 상대경로가 **절대 존재하지 않았다**.
// 그래서 실제 사용자의 릴레이는 plm-hub를 영원히 미보고했고, 게이트를 enforce로 올리면 전원이 차단된다.
// 해석 순서·근거는 relay/plugin-versions.mjs 상단 주석 참조(저장소·설치 레이아웃 둘 다 커버).
// 못 읽으면 그 키를 **아예 빼서** 보낸다 — 거짓 버전을 보고하느니 미보고가 낫다(게이트가 fail-closed).
const RELAY_DIR = path.dirname(new URL(import.meta.url).pathname);
// [원본] 0.1.30 — 형제 상대경로 2개만 읽었다(설치 레이아웃에서 plm-hub가 늘 "" 였다 · 감사 Y1).
//   원복 시 아래 3줄을 주석 해제하고 [개선] 블록을 주석 처리한다.
// function pluginVersion(rel) { try { const j = JSON.parse(fs.readFileSync(path.join(RELAY_DIR, rel), "utf8"));
//   const v = String(j?.version || "").trim(); return /^\d+(\.\d+)*/.test(v) ? v : ""; } catch { return ""; } }
// const PLUGIN_VERSIONS = [pluginVersion("../.claude-plugin/plugin.json"), pluginVersion("../../plm-hub/.claude-plugin/plugin.json")].join(",");
// [개선] 설치 레이아웃 인지 탐지(저장소 레이아웃도 그대로 동작).
const PLUGIN_VERSION_INFO = resolvePluginVersions({ relayDir: RELAY_DIR, env: process.env, cwd: process.cwd() });
const PLUGIN_VERSIONS = PLUGIN_VERSION_INFO.text;

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
  // [원본] 0.1.29까지 — 버전을 싣지 않았다. 원복 시 `&versions=…`와 헤더를 지운다.
  // [개선] 감사 X1 — 서버가 세션 도구 버전을 알아야 사본 강제가 안전하다(위 PLUGIN_VERSIONS 주석).
  const url =
    `${API}/channel/subscribe?project=${encodeURIComponent(PROJECT)}&session=${encodeURIComponent(SESSION)}&label=${encodeURIComponent(SESSION)}` +
    (PLUGIN_VERSIONS ? `&versions=${encodeURIComponent(PLUGIN_VERSIONS)}` : "");
  let backoff = 1000;
  for (;;) {
    try {
      log(`구독: ${API}/channel/subscribe project=${PROJECT} session=${SESSION} versions=${PLUGIN_VERSIONS || "(미상)"}`);
      // 감사 Y1 — plm-hub를 못 찾으면 **왜 못 찾았는지**를 남긴다. 서버 게이트는 미보고를 거절로
      // 처리하므로, 사용자가 "왜 막혔나"를 로그 한 줄로 알 수 있어야 한다(예전엔 조용히 빈 값이었다).
      if (!PLUGIN_VERSION_INFO.hub) {
        // 감사 Z3 — 추정(캐시 최신·대장 최신)으로 찾은 값은 **일부러** 보고하지 않는다. 그 사실을
        // 사유로 분명히 말해 사용자가 "왜 미보고인가"를 오해하지 않게 한다(예전엔 그 값을 사실처럼 보고했다).
        const guess = PLUGIN_VERSION_INFO.hubGuess
          ? `추정값 ${PLUGIN_VERSION_INFO.hubGuess}(출처 ${PLUGIN_VERSION_INFO.hubSource})을 찾았지만 ` +
            `**위로 편향된 추정**이라 보고하지 않았습니다(거짓 통과 방지 · 감사 Z3). `
          : "";
        log(
          `경고: plm-hub 버전을 찾지 못했습니다 — 서버 버전 게이트가 이 세션을 거절할 수 있습니다. ` +
            guess +
            `탐색: ${(PLUGIN_VERSION_INFO.tried || []).join(" · ") || "(없음)"}. ` +
            `해결: /plm-hub:update 로 plm-hub 설치 후 재시작, 또는 PLM_HUB_PLUGIN_DIR=<plm-hub 디렉터리>(권장) · ` +
            `PLM_HUB_VERSION=<버전> 지정. 추정값을 그대로 쓰려면 PLM_HUB_VERSION_ALLOW_GUESS=1(비권장).`,
        );
      }
      const res = await fetch(url, {
        headers: {
          authorization: `Bearer ${TOKEN}`,
          accept: "text/event-stream",
          "user-agent": UA,
          // 구버전 서버는 쿼리를 무시하고, 헤더만 읽는 프록시 구성에서도 도달하게 둘 다 보낸다.
          ...(PLUGIN_VERSIONS ? { "x-plm-plugin-versions": PLUGIN_VERSIONS } : {}),
        },
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

// 0.1.25 — 와이어프레임 **작업용 사본** 상태 조회(GET /wireframe/working-copy · 작업당 1회).
//
// 반환은 3분기 중 하나다: {state:"copy",…} · {state:"none"} · {state:"unknown",reason}.
// ★ **안전 실패 원칙**: 조회 실패·권한 부족(401/403)·구버전 서버(404)·타임아웃은 전부 `unknown`이다.
//   0.1.26부터는 `none`도 **보류**이므로 두 값의 결과 행동은 같다(사유 문장만 다르다) — 그래도 구분해서
//   돌려준다. "사본이 없다"와 "모른다"는 사람이 취할 조치가 다르기 때문이다(전자=다시 보내기,
//   후자=권한·서버 확인). 어느 쪽이든 **정본을 건드리는 쪽으로는 절대 폴백하지 않는다**(QA 치명 #4).
async function fetchWorkingCopyState(project, fileHints, pageHints, openHints) {
  if (!API || !TOKEN || !project) {
    return { state: "unknown", reason: "릴레이 설정 부족(API/TOKEN/project 미설정) — 사본 상태를 조회할 수 없습니다" };
  }
  let res;
  try {
    res = await fetch(`${API}/wireframe/working-copy?project=${encodeURIComponent(project)}`, {
      headers: { authorization: `Bearer ${TOKEN}`, accept: "application/json", "user-agent": UA },
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    return { state: "unknown", reason: `작업용 사본 조회 실패(네트워크: ${e.message})` };
  }
  if (!res.ok) {
    const hint =
      res.status === 404
        ? " — 이 PLM 서버가 작업용 사본 미지원(구버전)일 수 있습니다. 관리자에게 서버 배포 확인을 요청하세요"
        : res.status === 401 || res.status === 403
          ? " — 토큰 권한이 부족합니다(프로젝트 멤버 View 필요)"
          : "";
    return { state: "unknown", reason: `작업용 사본 조회 실패(HTTP ${res.status})${hint}` };
  }
  let body;
  try {
    body = await res.json();
  } catch (e) {
    return { state: "unknown", reason: `작업용 사본 조회 응답 파싱 실패(${e.message})` };
  }
  if (!Array.isArray(body?.items)) {
    return { state: "unknown", reason: "작업용 사본 조회 응답 형식이 예상과 다릅니다(items 없음)" };
  }
  // 0.1.34 — 힌트 우선순위: ①열어둔 페이지 → ②고른 댓글의 페이지(pickWorkingCopy가 그 규칙의 정본).
  return pickWorkingCopy(body.items, fileHints, pageHints, openHints);
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
  // 와이어프레임 빌더 — build 안의 mode="wireframe"(와이어프레임 탭 전용 채팅). 헤드리스 penpot 생성·SAE 지시로 주입.
  const isWireframe = isBuild && buildInfo?.mode === "wireframe";
  // 0.1.24 — 와이어프레임 **댓글 피드백 반영** 모드(payload.feedback). 기존 7단계 생성 절차를 재사용하지 않는
  // **별도 분기**다: 같은 메시지에 `wfgen.py` 실행 명령이 남아 있으면 "하지 마라"는 부정문보다 구체 명령이
  // 이긴다(계획서 §3.1 C1). 이 분기의 지시문에는 wfgen 문자열이 아예 등장하지 않는다(isBpAsk 선례와 동일).
  // items(항목 본문)가 있어야 이 분기를 탄다 — id만 오는 payload로는 "0건이 전부"라는 빈 지시문이 나가므로
  // 그때는 기존 wireframe 분기(사용자 text의 💬 합성 라인이 정보를 나른다)로 떨어뜨린다.
  const isWfFeedback = isWireframe
    && Array.isArray(buildInfo?.feedback?.items)
    && buildInfo.feedback.items.length > 0;
  // 아키텍처 블루프린트 빌더 — build 안의 mode="blueprint"([아키텍처] 탭 전용 채팅). BP 모델 저작·bpcheck 지시로 주입.
  const isBlueprint = isBuild && buildInfo?.mode === "blueprint";
  // 블루프린트 질문 모드 — payload.intent="ask": 설계도에 대해 답변만(모델·파일 수정 금지 · 저작 플로우 미진입).
  const isBpAsk = isBlueprint && buildInfo?.intent === "ask";
  // 탐색 컨텍스트(payload.context) — 탭이 현재 보고 있는 노드/존/여정/뷰를 자동 첨부(저작·질문 양 모드).
  const bctx = buildInfo?.context;
  const bpCtxParts = [];
  if (bctx && typeof bctx === "object") {
    if (bctx.selectedNode?.id) bpCtxParts.push(`선택 노드=${bctx.selectedNode.id}(${bctx.selectedNode.label || ""})`);
    if (bctx.zone?.id) bpCtxParts.push(`선택 존(그룹)=${bctx.zone.id}(${bctx.zone.label || ""})`);
    if (bctx.scenario?.id) bpCtxParts.push(`활성 여정=${bctx.scenario.id}(${bctx.scenario.label || ""}) · 스텝=${bctx.scenario.step ?? "overview"}`);
    if (bctx.view) bpCtxParts.push(`뷰=${bctx.view === "docs" ? "컴포넌트 문서" : "설계도"}`);
  }
  const bpCtxLine = bpCtxParts.length
    ? `\n[탐색 컨텍스트 — 사용자가 지금 탭에서 보고 있는 대상] ${bpCtxParts.join(" · ")}\n`
    : "";
  // 첨부 파일(0.1.21 — 빌더 3종 파일 첨부): payload.attachments[{key,name,mime,size}]를 지시문에 임베드.
  // 열람 계약 = 메신저 첨부와 동일(SRS-030 2단): plm MCP file_get(key)로 단기 서명 URL 발급 → curl 다운로드.
  const batts = isBuild && Array.isArray(buildInfo?.attachments)
    ? buildInfo.attachments.filter((a) => a && typeof a.key === "string" && a.key)
    : [];
  const fmtSz = (n) =>
    typeof n === "number" && n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB`
    : typeof n === "number" && n >= 1024 ? `${Math.round(n / 1024)}KB`
    : typeof n === "number" ? `${n}B` : "?";
  const attachBlock = batts.length
    ? `\n[첨부 파일 ${batts.length}건 — 사용자가 요청과 함께 첨부(맥락·근거 자료 — 반드시 열람 후 반영)]\n` +
      batts
        .map((a) => `  - ${a.name || a.key} (${a.mime || "?"} · ${fmtSz(a.size)}) → plm MCP file_get(key="${a.key}")로 서명 URL을 받아 curl로 다운로드 (또는 ${DASH}/api/files/${a.key})`)
        .join("\n") + "\n"
    : "";
  // 0.1.22: 빌더가 구릴레이 호환으로 text에도 `📎 name\n/api/files/<key>` 라인을 임베드(글로벌 메신저와 대칭).
  // 신릴레이는 [첨부 파일] 블록(file_get 안내 포함)이 정본이므로 사용자 텍스트에서 중복 라인을 걷어낸다.
  // 블록이 없으면(구 대시보드·attachments 미포함) text 원문 유지 — 임베드 라인이 유일한 전달 경로.
  const bTextRaw = buildInfo?.text || "";
  const bText1 = batts.length
    ? bTextRaw.replace(/\n*📎 [^\n]*\n\/api\/files\/[^\n]*/g, "").trim()
    : bTextRaw;
  // 0.1.24: feedback 블록이 정본 → 사용자 text의 `💬 c<id>|u<id> …` 합성 라인(구릴레이 호환용)을 걷어내
  // 지시문 중복을 없앤다. 블록이 없으면(구 대시보드) 원문 유지 — 그 라인이 유일한 전달 경로.
  // ⚠ 순서: 첨부 strip 결과(bText1) 위에 체이닝한다(두 strip이 서로의 결과를 덮지 않도록 단계 분리).
  const bText = isWfFeedback
    ? bText1.replace(/\n*💬 [cu]\d+ [^\n]*/g, "").trim()
    : bText1;
  // ── 피드백 항목 블록(정본 = payload.feedback.items) ──
  const fbItems = isWfFeedback && Array.isArray(buildInfo.feedback.items) ? buildInfo.feedback.items : [];
  const fbCut = (s, n) => {
    const t = String(s ?? "").replace(/\s+$/, "");
    return t.length > n ? `${t.slice(0, n)}…[${n}자에서 절단됨 — 전문은 plm comments_get]` : t;
  };
  const fbLines = fbItems
    .map((it, i) => {
      const unmapped = !it.wf;
      const head = unmapped
        ? `**화면 미지정**(프레임 밖 캔버스 댓글)`
        : `${it.wf}${it.title ? ` "${it.title}"` : ""}`;
      const meta = [
        it.seqn != null ? `#${it.seqn}` : null,
        it.author || null,
        it.created_at ? String(it.created_at).replace("T", " ").replace(/(:\d\d)(\.\d+)?Z?$/, "") : null,
        it.origin === "penpot" ? "penpot" : "PLM",
        it.resolved ? "해결됨" : "미해결",
      ].filter(Boolean).join(" · ");
      const rows = [`${i + 1}) ${it.ref} · ${head} · ${meta}`, `   본문: ${fbCut(it.body, 600)}`];
      const reps = Array.isArray(it.replies) ? it.replies.slice(0, 3) : [];
      for (const r of reps) rows.push(`   ↳ 답글 ${r.author || "?"}: ${fbCut(r.body, 200)}`);
      if (!unmapped) {
        const pos = it.pos && typeof it.pos.x === "number" ? ` · 핀 절대좌표 (${it.pos.x}, ${it.pos.y})` : "";
        if (it.loc || pos) rows.push(`   위치: ${it.loc || "(프레임 미상)"}${pos}`);
        rows.push(`   명세: .ouroboros/docs/wireframes/${it.wf}.json${it.penpot_url ? `   열기: ${it.penpot_url}` : ""}`);
      } else {
        rows.push(`   파일: ${it.penpot_url || "(penpot 링크 없음)"}   (프레임 바인딩 없음 — 대상 화면을 본문에서 판정)`);
      }
      return rows.join("\n");
    })
    .join("\n\n");
  // 블루프린트 대상 — payload.code가 있으면 그 BP를 갱신, 없으면 BP-001부터 신규(다음 번호 승계).
  const bpTarget = buildInfo?.code
    ? `현재 탭의 BP **${buildInfo.code}** (\`.ouroboros/docs/blueprint/${buildInfo.code}.json\`)를 갱신`
    : "`.ouroboros/docs/blueprint/BP-001.json`부터 신규 저작(이미 있으면 다음 번호 `BP-<NNN>.json`)";
  // 적용 대상(targets) — 페이로드에 실려오면 직접 반영, 없으면 세션이 artifact_links로 조회하도록 안내(feedback 반영 보장).
  const btargets = Array.isArray(buildInfo?.targets) ? buildInfo.targets.filter(Boolean) : [];
  const targetsHint = btargets.length
    ? `**적용 대상(targets) = ${btargets.join(", ")}** — 각 대상을 doc_get으로 읽고 그 맥락 위에서 개선/피드백을 구체적으로 논의·제안한다.`
    : `**적용 대상(targets)** 은 plm artifact_links(project="${w.project}", code="${bc}")로 rel="targets" 대상을 조회해 확인한다(없으면 사용자에게 적용 대상 지정 또는 revise 절차 안내).`;
  // 방어적 상한(절단하지 않는다 — 절단은 대시보드 책임. 계획서 §2.3-6 C3): 과대 payload는 경고만 찍어
  // 사람이 알아채게 한다. 정상 경로에선 피커가 10건에서 체크박스를 잠그므로 발생하지 않는다.
  const fbWarn =
    (isWfFeedback && Number(buildInfo.feedback.truncated) > 0
      ? `⚠ 대시보드가 ${buildInfo.feedback.truncated}건을 잘라냈다고 보고했습니다(구 대시보드) — 사람에게 알리고 나머지는 다시 전달받으세요.\n`
      : "") +
    (fbLines.length > 9000 ? `⚠ payload 과대(${fbLines.length}자) — 대시보드 절단 실패 가능. 사람에게 알리세요.\n` : "");
  // 0.1.25 — 피드백 분기에서만 **작업당 1회** 사본 상태를 조회한다(다른 task_type은 호출 0 = 회귀 없음).
  //   0.1.26: 결과가 copy가 **아니면**(none·unknown 모두) 지시문이 '보류'로 바뀐다 — 정본 폴백 금지.
  //   0.1.27(감사 C1): 이 조회는 **여기 한 번뿐**이다 — 세션이 실제로 쓰는 것은 수 분 뒤라 그사이 승격되면
  //     이 판정은 낡는다. 그래서 지시문(③-b)과 render 가드가 **쓰기 직전에 다시 확인**한다. 여기서 더
  //     자주 조회해도 경합은 사라지지 않는다(조회와 쓰기 사이의 간격이 문제이므로 쓰기 지점에서 막는다).
  // 0.1.34 — 대시보드가 실어 보낸 **지금 열어둔 페이지**(정본/사본/보관본 판정 포함). 구 대시보드는
  //   안 보내므로 null이고, 그때는 예전처럼 고른 댓글의 페이지 힌트만으로 판정한다(회귀 0).
  const openPage = isWfFeedback ? normalizeOpenPage(buildInfo?.open_page) : null;
  const wcState = isWfFeedback
    ? await fetchWorkingCopyState(
        String(w.project),
        filesFromFeedbackItems(fbItems),
        pagesFromFeedbackItems(fbItems),
        pagesFromOpenPage(openPage),
      )
    : { state: "none" };
  if (isWfFeedback)
    log(
      `작업용 사본 판정: ${wcState.state}${wcState.page ? ` page=${wcState.page}` : ""}` +
        `${wcState.pickedBy && wcState.pickedBy !== "only" ? ` (판정 근거: ${wcState.pickedBy === "open" ? "열어둔 페이지" : "고른 댓글"})` : ""}` +
        `${wcState.alt ? ` ⚠ 댓글이 가리킨 다른 사본 page=${wcState.alt.page}` : ""}` +
        `${wcState.reason ? ` (${wcState.reason})` : ""}` +
        ` · 열어둔 페이지: ${openPage ? `${openPage.role} page=${openPage.page}` : "미상"}`,
    );
  const content = isWfFeedback
    // [원본] 0.1.24 인라인 지시문 — 사본(working copy) 개념이 없어 항상 `wfanno sync --force`로
    //   **PLM 정본 본문을 밀었다**(승인 전 사본 내용이 정본으로 새어나가던 지점 · QA 치명 #4).
    //   원복 시: 아래 주석 블록을 해제하고 [개선] 호출을 주석 처리한다.
    // ? `[와이어프레임 피드백 반영] project=${w.project} team=${buildInfo?.team || "?"} work_id=${w.work_id}\n` +
    //   `사용자: ${bText || "(선택한 댓글 참고)"}\n` +
    //   attachBlock +
    //   fbWarn +
    //   `\n— 이것은 **penpot 댓글 피드백을 SAE 명세에 반영**하는 요청입니다. 화면을 새로 도출하거나 목업 파일을\n` +
    //   `  새로 만드는 작업이 아닙니다. 아래 ${fbItems.length}건이 **이번 작업의 전부**이며, 추가 댓글을 스스로 수집하지 마세요.\n\n` +
    //   fbLines + `\n\n` +
    //   `— 반영 절차(SAE 명세가 SSOT · 목업은 렌더 결과물):\n` +
    //   `  ⓪ **워킹트리 최신화(필수)**: \`git pull --rebase\` — 명세(\`.ouroboros/docs/wireframes/*.json\`)는 git 추적 파일이고\n` +
    //   `     다른 세션이 이미 고쳤을 수 있습니다. 낡은 명세로 render 하면 **남의 반영을 캔버스에서 지웁니다**(패널 전체 교체).\n` +
    //   `     반영을 마친 뒤 반드시 **커밋**하세요(안 하면 다음 세션이 같은 사고를 냅니다).\n` +
    //   `  ① **명세 확보**: 각 항목의 \`.ouroboros/docs/wireframes/WF-<CODE>.json\`을 엽니다.\n` +
    //   `     ⚠ 파일이 없으면(penpot에만 알맹이가 있는 화면) 먼저\n` +
    //   `        python3 plugin/plm-hub/scripts/wfanno.py sync --project ${w.project} --code WF-<CODE>\n` +
    //   `     로 penpot 주석 패널을 역추출해 명세를 만든 뒤 진행합니다. 명세 없이 render 하면 **아무 일도 일어나지 않고\n` +
    //   `     조용히 끝납니다**("렌더 대상 프레임 없음(로컬 명세 매칭 0)").\n` +
    //   `  ② **대상 요소 특정**: 피드백이 가리키는 요소(<CODE>.NN)를 정합니다. 본문만으로 애매하면 penpot get-file로\n` +
    //   `     그 프레임의 x/y/width/height를 읽어 핀 절대좌표를 프레임 기준 상대 위치로 환산하세요(wfanno.py \`_frames()\` 방식).\n` +
    //   `     그래도 애매하면 **추측하지 말고 그 항목을 '미반영'으로 남기고 사유에 질문을 적으세요**(⑦).\n` +
    //   `     본문의 \`@[<uuid>]\`는 penpot 멘션 원문입니다 — 사람 이름이 아니니 무시하세요.\n` +
    //   `  ③ **명세 수정**: 요소 추가/수정, 상태·액션·이펙트 갱신. 화면 수준 의견은 note에.\n` +
    //   `  ④ **penpot 주석 패널 재렌더(in-place)**:\n` +
    //   `        python3 plugin/plm-hub/scripts/wfanno.py render --project ${w.project} --code WF-<CODE>\n` +
    //   `     → 기존 파일 안에서 \`anno:<CODE>\` 그룹만 교체(비파괴·멱등). 하이파이 프레임·댓글 핀은 건드리지 않습니다.\n` +
    //   `     ⚠ **출력을 반드시 읽으세요.** \`✖ update-file 실패(비차단)\`가 찍히면 **실패한 것입니다**(스크립트는 실패해도 exit 0).\n` +
    //   `       원인 대부분은 그 파일을 누가 penpot 에디터로 열고 있어 revn이 밀린 것 — 10초 뒤 1회 재시도하고,\n` +
    //   `       또 실패하면 그 항목을 '미반영'(사유: penpot 편집 중 충돌)으로 남기세요.\n` +
    //   `     ⚠ **화면이 여러 개면 \`--code\`를 화면마다 따로** 줍니다(단수 인자 · 파일당 1회 update-file · 부분 성공 가능).\n` +
    //   `  ④-b **렌더 자기검증(필수 · 중복 패널 탐지)**:\n` +
    //   `        python3 plugin/plm-hub/scripts/wfanno.py render --project ${w.project} --code WF-<CODE> --dry-run\n` +
    //   `     → 출력의 \`기존삭제 N\`이 **정확히 한 세트**여야 합니다. 다른 세션이 같은 파일을 동시에 렌더했으면 옛 패널과\n` +
    //   `       새 패널이 겹쳐 쌓여 N이 2배 이상으로 잡힙니다(update-file이 "성공"으로 끝나도 그렇습니다). 그 경우 render를\n` +
    //   `       한 번 더 실행해 수렴시키고(멱등), 그래도 안 맞으면 '미반영'(사유: 동시 렌더 충돌)으로 남기고 사람에게 알리세요.\n` +
    //   `  ⑤ **PLM 본문 갱신**:\n` +
    //   `        python3 plugin/plm-hub/scripts/wfanno.py sync --project ${w.project} --code WF-<CODE> --force\n` +
    //   `     ⚠ \`wfscan.py\`로는 갱신되지 않습니다 — 이미 표가 있는 본문을 비파괴 스킵합니다. \`--force\`가 필수입니다.\n` +
    //   `  ⑥ **렌더 검증**: get-file→SVG→PNG로 패널이 프레임 우측에 갱신됐는지 눈으로 확인.\n` +
    //   `  ⑦ **항목별 회신(사람용)**: message(kind="result", thread="wireframe:${w.project}", work_id="${w.work_id}")로\n` +
    //   `     \`c1234 반영: 정렬 툴바 LIST.07 추가 / c1247 미반영: 목업 재배치 필요\` 형태로 한 줄씩.\n` +
    //   `     (이건 사람이 읽는 용도입니다. 상태를 바꾸는 것은 아래 report의 result뿐입니다.)\n\n` +
    //   `— ⛔ **목업 생성 스크립트를 이 작업에서 실행하지 마세요.** 그 스크립트는 실행할 때마다 penpot 파일을 **새로 만듭니다**\n` +
    //   `  (create-file 무조건 · in-place 갱신 경로 없음). 실행하면 기존 댓글·핀이 옛 파일에 남아 목업과 분리되고,\n` +
    //   `  화면코드 충돌로 새 파일이 버려져 아무 데도 연결되지 않습니다. **목업 도형 자체(레이아웃·요소 배치)를 바꿔야 하는\n` +
    //   `  항목**은 명세만 고친 뒤 그 항목을 '미반영'으로 남기고 사유에 "목업 재생성 필요(관리자 승인 필요)"라고 적으세요.\n\n` +
    //   `— 완료 처리(중요 · **정산 형식을 반드시 지킬 것**):\n` +
    //   `  report(work_id="${w.work_id}", ok=true, result="<요약>\\n반영: …\\n미반영: … — 사유") 를 **정확히 한 번** 호출하세요.\n` +
    //   `  이 호출만이 댓글 상태를 바꿉니다. 호출하지 않으면 댓글이 '보내는 중'에 갇힙니다.\n` +
    //   `  ★ 두 목록은 **report의 result 인자** 안에 넣습니다(message 본문이 아닙니다 — 서버는 report.result만 파싱).\n` +
    //   `    형식(라인 선두 · \`c\`/\`u\` 접두 필수 · 두 줄 다 쓰세요):\n` +
    //   `        반영: c1234, c1250\n` +
    //   `        미반영: c1247, u345 — 목업 재배치 필요 / 대상 화면 불명확\n` +
    //   `  ★★ **\`반영:\` 줄에 적지 않은 항목은 '완료'가 되지 않고 '보류'로 남습니다**(사유: 세션 회신에 누락).\n` +
    //   `     빠뜨리면 완료로 묻히는 게 아니라 보류로 남습니다 — 안전한 쪽으로 실패합니다.\n` +
    //   `     ${fbItems.length}건을 받았으면 ${fbItems.length}건 전부가 \`반영:\` 또는 \`미반영:\` 어느 한쪽에 있어야 합니다.\n` +
    //   `  실패로 끝나면 report(ok=false) — 해당 댓글은 '할 일'로 되돌아가 다시 고를 수 있습니다.\n` +
    //   `  이 work_id를 **이미 처리한 적이 있다면 재실행하지 말고 report만 다시 시도**하세요(재배달 방지).\n` +
    //   `  애매한 항목은 **질문하지 말고 '미반영'으로 남기고 사유에 질문을 적으세요**(사람이 목록에서 사유를 읽고 판단).\n` +
    //   `  정말 전체를 막는 근본 질문일 때만 message(kind="question")로 묻고 턴을 종료하되, **답을 받은 뒤에는 반드시\n` +
    //   `  원래 work_id="${w.work_id}"로 report** 하세요(그래야 댓글이 닫힙니다).` +
    //   REMOTE_ASK_RULE(w.work_id)
    // [개선] 0.1.26 — 사본 인지 분기(wf-feedback.mjs · 순수 함수 · 단위 테스트 고정).
    //   copy=사본 페이지 고정(--page)·PLM push 제거 / none·unknown=**보류**(쓰기 0 · 위 원문은 도달 불가).
    ? buildWfFeedbackInstruction({
        project: w.project,
        workId: w.work_id,
        team: buildInfo?.team,
        userText: bText,
        attachBlock,
        fbWarn,
        fbLines,
        fbCount: fbItems.length,
        fbRefs: fbItems.map((it) => it?.ref).filter(Boolean),
        copy: wcState,
        open: openPage, // 0.1.34 — 지시문 첫머리 "지금 열려 있는 페이지: …" + 회신 고지
      }) + REMOTE_ASK_RULE(w.work_id)
    : isWireframe
    ? `[와이어프레임 빌더 요청] project=${w.project} team=${buildInfo?.team || "?"} work_id=${w.work_id}\n` +
      `사용자: ${bText}\n` +
      attachBlock +
      `\n` +
      `— 이것은 이 프로젝트의 penpot 와이어프레임을 대화로 만들고/수정하는 요청입니다(와이어프레임 탭 전용 채팅 — 전역 세션 지시나 문서 빌딩이 아님). **화면 수 제한 없음** — 이 제품에 필요한 만큼(고정 샘플 금지). 수행:\n` +
      `1. **화면 집합 도출(계획 주도)**: 먼저 이 프로젝트의 계획을 읽어(plm doc_get/artifact_get 로 BS·Roadmap·PRD·URS/UCS/SRS) **제품에 필요한 화면을 전부 도출**한다 — LIB/RDR/PIPE 같은 고정 샘플이 아니라 이 제품이 실제로 필요한 수만큼(3개일 수도, 12개일 수도). 각 화면에 SCREEN_CODE(대문자 토큰) 부여. 계획이 비었으면 사용자에게 어떤 화면이 필요한지 message(kind="question")로 먼저 확인.\n` +
      `2. **SAE 스펙 저작(화면마다 1개 · durable · SSOT)**: 도출한 각 화면에 대해 \`.ouroboros/docs/wireframes/WF-<CODE>.json\`(SAE 스펙 — 요소코드<SCREEN>.<NN> + 상태·액션·이펙트 + **note**(화면 수준 자유서술·wrapper 필드), _WIREFRAME-SAE-METHODOLOGY 준수)을 **반드시 저작**한다. 이 하나의 명세가 **penpot 주석 패널 + PLM 본문** 두 서피스의 SSOT다. 이미 있으면 갱신. **이 스펙 파일이 다음 사람이 이어서 채우는 유일한 근거**다 — 남기지 않으면 wfscan이 얇은 폴백 본문만 발급하고(book-tarae 같은 요소별 SAE 표 없음) 아무도 이어서 못 채운다.\n` +
      `3. **생성(목업 + 주석 패널 동시 · 헤드리스)**: \`python3 plugin/plm-hub/scripts/wfgen.py --project ${w.project}\` — **--screens 생략 시 저작된 WF-*.json 전량**을 Wireframes penpot에 SAE 화면 보드 **+ 프레임 우측 주석 패널**(SAE 요약 코드·라벨·유형·상태·액션·이펙트 + note, AnyC 형태)로 동시 생성(--anno 기본 on · --no-anno로 끔). 특정 화면만 재생성 시 \`--screens <CODE,...>\`. **기존(penpot에만 알맹이 있는) 와이어프레임**은 \`wfanno.py sync --project ${w.project}\`(명세 없으면 penpot anno-* 역추출→명세, 있으면 패널 재렌더·멱등) 또는 \`wfanno.py extract\`(penpot 읽기만→명세·PLM 본문 — 읽기전용 원천 보호). 주석 패널만 갱신은 \`wfanno.py render --project ${w.project} [--code WF-XXX]\`. penpot 팀 id=${buildInfo?.team || "(get-teams로 'PLM · " + w.project + "' 팀)"}. **대상 공간(SRS-044)=Wireframes 프로젝트**${buildInfo?.wireframesProject ? "(project-id=" + buildInfo.wireframesProject + ")" : ""}. (update-file은 vern 필수.)\n` +
      `4. **아티팩트 발급·추적**: \`python3 plugin/plm-hub/scripts/wfscan.py --project ${w.project}\`(프레임→WF-<CODE> 멱등 발급 · 본문=요소별 SAE 표 + **note 블록**) 후 covers→UCS/SRS 링크(relation_link)로 요구와 잇는다. **wfscan 출력의 'SAE 커버리지'를 반드시 확인** — '스펙없음'으로 뜬 화면은 step2로 돌아가 \`docs/wireframes/WF-<CODE>.json\`을 저작하고 재실행한다(그래야 본문이 book-tarae처럼 요소별 SAE 표로 채워짐). **얇은 본문으로 완료 보고 금지.**\n` +
      `5. **렌더 검증(필수)**: get-file→SVG→PNG로 **각 화면 + 우측 주석 패널**이 의도대로·도메인 정확한지 눈으로 확인(태그 나열/엉뚱 도메인이면 스펙·archetype 고쳐 재생성 · 패널은 프레임 우측 region까지 렌더). 개수만으로 완료 보고 금지.\n` +
      `6. **피드백 루프**: 사용자가 렌더를 보고 수정/보완/추가를 요청하면 → 해당 WF-<CODE>.json 스펙을 고치거나 새 화면 스펙을 추가 → 재생성(3) → 재렌더(5) → 회신. 반복. 변경은 penpot에 직접 반영되며 사용자는 미리보기(iframe) 새로고침으로 확인(문서 빌더와 달리 proposal/[반영] 없음).\n` +
      // 감사 2026-07-31 (D2·D3): 사본(작업용 페이지) 체제는 **댓글 피드백 분기에만** 실려 있었다.
      //   이 빌더 분기는 `fetchWorkingCopyState`를 호출하지 않으므로(위 :516 isWfFeedback 조건) 사본 존재를
      //   모른 채 `wfanno … --project` 를 시켰다. 파일에 사본 페이지가 생겨 2페이지가 된 순간
      //   wfanno 는 `--page` 없이는 **실행을 거부**하고(wfanno.py:313), 세션은 이유를 모른 채 막힌다.
      //   여기서 사본 판정을 하지는 않는다(이 분기엔 댓글 힌트가 없어 대상 페이지를 특정할 수 없다) —
      //   대신 **막혔을 때 무엇을 해야 하는지**를 미리 알려 준다.
      `⚠ **여러 페이지가 있는 파일(작업용 사본이 만들어진 파일)**: \`wfanno.py\` 는 페이지가 2개 이상이면 ` +
      `\`--page\` 없이 **실행을 거부**한다(다른 페이지의 주석 패널을 지우는 것을 막기 위해서다). ` +
      `그 메시지를 보면 추측하지 말고 \`python3 plugin/plm-hub/scripts/wfanno.py page-role --project ${w.project}\` 로 ` +
      `페이지별 역할(정본/사본/보관본)을 먼저 확인한 뒤, **정본 페이지 id**를 \`--page\` 로 명시해 다시 실행하라. ` +
      `\`wfscan.py\` 도 같은 이유로 다중 페이지 파일을 건너뛴다 — 이때도 \`--page <정본페이지>\`. ` +
      `**사본 페이지는 이 빌더 작업의 대상이 아니다**(사본은 댓글 피드백 작업 전용이며, 정본 반영은 승격 시점이다).\n` +
      `⚠ **\`wfgen.py\` 는 실행할 때마다 새 penpot 파일을 만든다**(create-file 고정 — 기존 파일·페이지를 ` +
      `제자리 갱신하는 옵션 자체가 없다). ` +
      `\`--screens\` 는 "그 화면만 제자리 갱신"이 아니라 "새 파일에 그 화면만 담기"다. 이미 댓글·핀이 달린 파일을 ` +
      `다시 돌리면 그것들이 옛 파일에 남아 목업과 영구히 분리된다 — 교체가 목적이면 \`--delete-file <구파일ID>\` 를 쓰고, ` +
      `아니면 \`wfanno render\` 로 제자리 갱신하라.\n` +
      `7. 진행상황·질문은 message(thread="wireframe:${w.project}", kind="progress"|"question", work_id="${w.work_id}", body="..."), 완료는 report(work_id="${w.work_id}", ok=true, result="...").` +
      REMOTE_ASK_RULE(w.work_id)
    : isBpAsk
    ? `[아키텍처 블루프린트 질문] project=${w.project} bp=${buildInfo?.code || "?"} work_id=${w.work_id}\n` +
      `사용자: ${bText}\n` +
      bpCtxLine +
      attachBlock +
      `\n— **질문 모드**: 이 프로젝트의 설계도(BP)에 대해 **답변만** 합니다 — **모델·파일 수정 금지**(저작 지시가 아님 · bpcheck/동기 불필요). 수행:\n` +
      `1. BP 모델을 읽는다 — 로컬 \`.ouroboros/docs/blueprint/${buildInfo?.code || "BP-001"}.json\`이 있으면 로컬, 아니면 plm doc_get(project="${w.project}", code="${buildInfo?.code || "BP-001"}")로 code_block(plm-blueprint) JSON을 확보. 프로젝트에 DR(DesignResearch — \`.ouroboros/docs/design-research/\`)이 있으면 함께 읽어 수치·트레이드오프 근거로 답한다.\n` +
      `2. 탐색 컨텍스트(선택 노드·존·활성 여정·스텝)가 있으면 **그 대상을 중심으로** 답한다 — 노드면 그 노드의 role/design/io/연결, 존(그룹)이면 구성 노드·그룹 경계 흐름, 여정이면 해당 스텝의 비즈니스 로직.\n` +
      `3. 근거 아티팩트 코드("SRS-011" 형태)를 답변 산문에 **인라인 인용**한다 — 탭이 자동 딥링크 칩으로 렌더. 불확실하면 plm doc_get으로 근거 문서를 실제 확인(추측 금지).\n` +
      `4. 답변은 message(kind="result", thread="blueprint:${w.project}", work_id="${w.work_id}", body="...")로 **간결하게**(질문에 맞는 분량 — 장문 보고서 금지). 완료는 report(work_id="${w.work_id}", ok=true, result="...").` +
      REMOTE_ASK_RULE(w.work_id)
    : isBlueprint
    ? `[아키텍처 블루프린트 빌더 요청] project=${w.project} bp=${buildInfo?.code || "(신규)"} work_id=${w.work_id}\n` +
      `사용자: ${bText}\n` +
      bpCtxLine +
      attachBlock +
      `\n— 이것은 이 프로젝트의 아키텍처 설계도(Blueprint·BP)를 대화로 만들고/수정하는 요청입니다([아키텍처] 탭 전용 채팅 — 전역 세션 지시나 문서 빌딩이 아님). payload.context(탐색 컨텍스트)가 있으면 **그 노드/존/여정을 중심 대상으로 해석**한다. 수행:\n` +
      `0. **설계 조사(DR) 선행 — BP 깊이의 원천**: 이 프로젝트에 DR(DesignResearch) 아티팩트가 없으면 **설계 조사를 먼저 수행**해 \`.ouroboros/docs/design-research/DR-001.json\`(CODE.json 래퍼 · type="DesignResearch" · status:"Draft")을 발급한다 — 요구 전체(URS/UCS/SRS·BS·PRD)를 읽고 심층 조사. doc 섹션 표준(H2): ①도메인 모델·비즈니스 로직 심층(핵심 엔티티·상태 흐름·도메인 규칙) ②기술 선택지·트레이드오프(대안 비교표·결정 후보→ADR 예고) ③수치·용량·성능 목표(추정 근거 명시) ④위험·미해결 질문 ⑤아키텍처 스케치(존·컴포넌트 후보·데이터 흐름 초안). 각 항목에 요구 코드(URS/UCS/SRS)를 인라인 인용하고, 필요하면 WebSearch로 외부 근거를 보강(출처 명시). 그 다음 BP를 저작하되 **노드 design·basis에 DR의 결론(수치·선택지·근거)을 인용**한다(basis에 DR-001 표기 → 탭이 딥링크 칩). **DR이 이미 있으면 읽고 근거로 사용**(재발급 금지 — 부족분만 DR 갱신).\n` +
      `1. **근거 수집(추측 금지)**: plm doc_get/artifact_get으로 이 프로젝트의 DR·SAD·ADR·SRS·Code(code_refs)·기존 BP를 읽고, 필요하면 소스 저장소 구조(디렉토리·주요 모듈)를 확인한다 — 설계도는 **실존 근거로만** 그린다(상상 컴포넌트·추측 연결 금지).\n` +
      `2. **모델 저작/갱신**: ${bpTarget}한다 — CODE.json 래퍼(id·type="Blueprint"·title·status:"Draft"·doc) · doc = H2 제목 + code_block(attrs.language="plm-blueprint") 모델 + 설명 문단(형식 정본 = \`.ouroboros/docs/blueprint/BP-001.json\` · \`_BLUEPRINT-METHODOLOGY.md\`). code_block 텍스트 = **모델 계약 v1.1** JSON(version은 1 유지 — persona/covers/desc 선택):\n` +
      `   {version:1, zones:[{id,label,hue?,desc?}], nodes:[{id,zone,label,kind?(client|service|db|queue|external|llm), role?, design?[], io?, basis?, artifacts?[], loc?, pos?{x,y,w?,h?}}], edges:[{id?,from,to,label?,kind?(sync|async|data)}], scenarios?:[{id,label,persona?,covers?[],note?,steps:[{text,nodes?[],edges?[]}]}]}\n` +
      `   pos 없으면 탭이 존별 자동배치. **존마다 desc 1~2문장 권장**(그룹 한눈 파악용 — 탭 존 라벨 클릭 시 그룹 개요 패널에 표시). **노드 role/design/io/basis를 실근거로 충실히**(빈 껍데기 금지) · **artifacts[]·covers[]는 이 프로젝트에 실존하는 아티팩트 코드만**(탭에서 딥링크 칩이 됨 — 없는 코드 금지). 스텝 text·노드 산문 속 "SRS-011" 같은 코드 표기는 탭이 자동 딥링크 칩으로 렌더 — 인라인 참조 활용.\n` +
      `   **시나리오 표준(ADR-033)**: 시나리오 = **페르소나별 엔드투엔드 여정** — 트리거→모듈 경유→데이터 축적→**다음 사이클 되먹임**까지, 각 스텝에 비즈니스 로직(무엇을·왜)을 서술. 기대 수준 예시(AnyC): "일기 작성→LLM 챗봇 인터뷰→일기 완성→어휘·문법 학습→음성 회화 인터뷰→학습 결과 누적이 다음 학습에 영향" 같은 6단계급 여정. **사용자 여정만이 아니라 운영·배치 여정**(인제스트 파이프라인·신규 도메인 온보딩 등)도 포함 — 개수는 제품이 필요한 만큼(2~3개로 끝내지 말 것). 프로젝트의 **UCS 전부 + BS 사용시나리오**를 커버(없으면 SRS 기능별 대표 여정+핵심 가치 루프). scenario.persona·covers(→UCS/SRS) 명시 · note에 여정별 LLM/비용 주석 권장.\n` +
      `   **갱신 규율(비파괴)**: 갱신 지시(탭 낡음 배너 "빌더로 갱신 지시"·[재생성·갱신]·기획 후속 반영) 시 **기존 노드·pos·설명을 보존**하고 변경분만 반영(전면 재생성 금지 — 필요한 엣지/시나리오 추가는 허용). DR 갱신분(새 수치·선택지 변경)이 있으면 해당 노드 design·basis에 반영한다.\n` +
      `3. **검증**: \`python3 plugin/plm-hub/scripts/bpcheck.py --project ${w.project}\` — 에러 0 될 때까지 수정(래퍼·모델 파스·zone/edge/시나리오 참조 무결성·artifacts/covers 실존·중복 id). 말미 **▍BP 커버리지 블록**(미커버 UCS·SRS·covers 없는 시나리오 — 비차단 경고)을 확인하고 여정 시나리오 covers로 좁힌다. 얇은 설계도로 완료 보고 금지.\n` +
      `4. **동기**: Write/Edit 도구로 저장하면 plm-sync 훅이 자동 upsert(래퍼 메타+doc). 훅 미작동 시 폴백: plm MCP import(래퍼 메타) + PUT /artifacts/{project}/{code}/doc.\n` +
      `5. **회신**: 변경 요약(존/노드/엣지/시나리오 수·무엇이 바뀌었나)과 함께 [아키텍처] 탭 새로고침으로 확인하라고 안내한다.\n` +
      `6. **피드백 루프**: 수정 요청 → 모델 고침 → bpcheck(3) → 재동기(4) → 회신(5) 반복.\n` +
      `7. 진행상황·질문은 message(thread="blueprint:${w.project}", kind="progress"|"question", work_id="${w.work_id}", body="..."), 완료는 report(work_id="${w.work_id}", ok=true, result="...").` +
      REMOTE_ASK_RULE(w.work_id)
    : isBuild
    ? `[문서 빌더 요청] project=${w.project} code=${bc} mode=${buildInfo?.mode || "doc"} work_id=${w.work_id}\n` +
      `사용자: ${bText}\n` +
      attachBlock +
      `\n` +
      `— 이것은 문서 "${bc}"를 대화로 빌딩하는 요청입니다(전역 세션 지시가 아닌 그 문서 전용 대화). 수행:\n` +
      `1. plm MCP doc_get(project="${w.project}", code="${bc}")로 현재 본문을 읽습니다.\n` +
      `2. mode="${buildInfo?.mode}"에 맞게:\n` +
      `   - **idea(BS 브레인스토밍)**: 아이디어 발산·초기 가설 구조화(일반 브레인스토밍).\n` +
      `   - **sim(BS 심화 · 역할별 사용 시나리오 시뮬레이션)**: idea 안의 심화 모드. BS의 "사용자 종류(role)" 섹션을 읽고, **각 역할 관점에서 실제 사용 시나리오를 대화로 함께 걸어본다**(이 역할이 언제·왜·어떻게 쓰나 → 어디서 막히나 → 뭐가 필요한가). 역할이 여럿이면 순회하고, 깊이가 필요하면 역할별 서브에이전트로 시뮬레이션. **그 결과로 BS를 강화**한다 — "사용 흐름"을 역할별 시나리오로 구체화하고, 드러난 니즈·빠진 기능·역할 보정을 본문에 반영 제안. (발산·질문은 message로 대화, 정리된 본문은 proposal로.)\n` +
      `   - **feedback(기존 아티팩트 개선 피드백)**: ${targetsHint} 실제 적용(대상의 세대 스냅샷 박제·재검토 전파·변경추적)은 사용자가 이 BS의 **[적용(스냅샷)]** 버튼으로 확정한다. / doc=문서 작성.\n` +
      `   - **revise(피드백 반영)**: 이 문서에 달린 피드백(댓글·토론·투표)을 반영해 개정한다. ① comments_get(project,code)로 댓글 전체(+미해결 우선), ideas_get(code)로 관련 아이디어·투표 수집 — 본문은 이미 1의 doc_get으로 확보. ② 피드백 정리(항목별 수용/보류 + 근거)를 message(kind="progress")로 보고. ③ **범위 판정**: (a) 이 문서만 수정하면 되는 경우 → 개정 본문 전체를 proposal로 회신(사용자가 [반영] — 문서는 라이브 갱신됨). (b) **다른 아티팩트도 연계 수정이 필요한 경우** → 정석 절차: BS 발급(artifact_issue type="BS", kind="feedback", code=기존 BS 다음 번호) + relation_link(rel="targets", src=BS, dst=이 문서와 영향 아티팩트 각각) + BS 본문(\`PUT /artifacts/{project}/{code}/doc\` — \`put_doc\`이라는 MCP 도구는 **없다**)에 변경 계획(피드백 요지→문서별 변경안→영향권) 작성 → 사용자에게 "생성된 BS 문서의 **[적용(스냅샷)]** 버튼으로 정식 적용하세요(원본 세대 백업·재검토 전파·변경 추적)"라고 안내. 판단이 애매하면 message(kind="question")로 (a)/(b) 확인.\n` +
      `3. 대화·질문은 message(kind="progress"|"question", thread="build:${bc}", work_id="${w.work_id}", body="...").\n` +
      `4. 본문 제안은 message(kind="proposal", thread="build:${bc}", work_id="${w.work_id}", body=<JSON>)로 회신하세요.\n` +
      `   body = JSON.stringify({ summary: "무엇을 바꿨는지 한 줄", doc: <문서 전체 ProseMirror doc JSON> }).\n` +
      `   ⚠ 본문을 직접 put_doc 하지 마세요 — 사용자가 빌더 탭 [반영] 버튼으로 확정합니다(Q2).\n` +
      `5. 완료는 report(work_id="${w.work_id}", ok=true, result="...").\n` +
      `6. 마무리 규약: 이 변경이 아키텍처(컴포넌트·연결·요구 구조)에 닿고 프로젝트에 Blueprint(BP)가 존재하면, 완료 회신에 "[아키텍처] 탭 BP 갱신 제안" 한 줄을 포함하세요(낡음 배너·bpcheck 커버리지가 표면화하는 항목 — ADR-033).` +
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
    // [원본] 0.1.32까지 — 세션을 싣지 않았다. 원복 시 `session` 필드를 지운다.
    // body: JSON.stringify({ project: PROJECT, state: "busy" }),
    // [개선] 감사 Z2 — **어느 세션의 활동인가**를 실어 보낸다. 서버가 세션을 모르면 그 사용자×프로젝트의
    //        모든 행을 갱신해(구현 이전) 죽은 세션이 영원히 '살아 있는 busy 세션'으로 남았고,
    //        버전 게이트가 그 좀비를 세어 enforce에서 100% 차단됐다.
    body: JSON.stringify({ project: PROJECT, state: "busy", session: SESSION }),
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
