// @plm SRS-004  WebSocket 터널링 — 브라우저는 web만 본다 (ADR-010)
// @plm SRS-008  SIGTERM에 연결을 정리하고 정해진 시간 안에 종료한다
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일의 책임: **프로세스의 입구.** HTTP는 Next에게 넘기고, `/ws` 업그레이드만 직접 받아
// 내부 api(NestJS 게이트웨이)로 **터널링**한다.
//
// 왜 아직도 커스텀 서버인가:
//   Route Handler는 요청→응답 모델이라 HTTP 업그레이드(101)를 만들 수 없다. REST·SSE는
//   `app/api/[...path]/route.ts` 프록시가 처리하지만 WebSocket만은 여기서 받아야 한다.
//   ADR-002 시절과 달리 여기는 **실시간의 종단이 아니다** — 종단은 api의 게이트웨이이고,
//   이 파일은 소켓 두 개를 이어 붙이는 일만 한다.
//
// 터널링 방식: 브라우저 소켓과 api 소켓을 각각 열고 프레임을 양방향으로 중계한다.
// 프로토콜을 해석하지 않으므로 메시지 종류가 늘어도 이 파일은 바뀌지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
import { createServer } from "node:http";
import next from "next";
import { WebSocket, WebSocketServer } from "ws";
import { assertEnv, env } from "./lib/env.ts";

const dev = process.env.NODE_ENV !== "production";
assertEnv(); // 설정 누락이면 부팅 실패 — 조용히 뜨지 않는다

const port = env.PORT;
const shutdownMs = env.SHUTDOWN_TIMEOUT_MS;
const apiWsUrl = `${env.API_URL.replace(/^http/, "ws").replace(/\/$/, "")}/ws`;
const log = (o) => console.log(JSON.stringify({ ts: new Date().toISOString(), svc: "web", ...o }));

let conf;
if (!dev) {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const rsf = JSON.parse(
    await readFile(path.join(process.cwd(), ".next", "required-server-files.json"), "utf8"),
  );
  conf = rsf.config;
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(conf);
}

const app = next(dev ? { dev } : { dev, conf, dir: process.cwd() });
const handle = app.getRequestHandler();
await app.prepare();

// 헬스체크는 몇 초마다 오므로 로그에서 뺀다 — 진짜 트래픽이 묻힌다.
const QUIET = new Set(["/healthz", "/readyz", "/api/healthz", "/api/readyz"]);

/**
 * **web 자신의** 헬스. api의 것(`/api/healthz`)과 경로를 나눈 이유가 있다.
 *
 * `/api/*`는 프록시라 `/api/healthz`는 **api의 상태**를 답한다. 그것을 web의 헬스체크로 쓰면
 * api가 아플 때 오케스트레이터가 멀쩡한 web을 재시작한다 — 장애를 옆으로 번지게 하는 짓이다.
 *   healthz  이 프로세스가 살아 있는가        → 실패하면 **재시작**
 *   readyz   지금 트래픽을 받아도 되는가       → 실패하면 **트래픽만 끊는다**
 * web은 api 없이는 화면을 그릴 수 없으므로, "준비됨"의 정의에 api 도달 가능성을 포함한다.
 */
async function ownHealth(req, res) {
  const path = (req.url ?? "").split("?")[0];
  if (path === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
    return true;
  }
  if (path === "/readyz") {
    try {
      const r = await fetch(`${env.API_URL.replace(/\/$/, "")}/api/healthz`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!r.ok) throw new Error(`api ${r.status}`);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ready", api: "up" }));
    } catch (e) {
      res.writeHead(503, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "degraded", api: "down", detail: String(e.message ?? e) }));
    }
    return true;
  }
  return false;
}

const server = createServer((req, res) => {
  const started = Date.now();
  const requestId = req.headers["x-request-id"] || crypto.randomUUID();
  res.setHeader("x-request-id", requestId);
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.setHeader("x-frame-options", "SAMEORIGIN");

  // web이 이 스택의 **가장자리**다 — 여기서 클라이언트 주소를 기록해 두지 않으면
  // api는 모든 요청을 "web이 보냈다"고 보게 되고, rate limit이 전원 한 키로 묶인다.
  // 이미 앞에 프록시(nginx·클라우드 LB)가 있으면 그쪽이 붙인 체인을 그대로 존중한다.
  if (!req.headers["x-forwarded-for"]) {
    const ip = req.socket.remoteAddress ?? "";
    if (ip) req.headers["x-forwarded-for"] = ip.replace(/^::ffff:/, "");
  }

  res.on("finish", () => {
    const path = (req.url ?? "").split("?")[0];
    if (QUIET.has(path) && res.statusCode < 400) return;
    log({
      level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      msg: "request",
      requestId,
      method: req.method,
      path,
      status: res.statusCode,
      ms: Date.now() - started,
    });
  });
  // 자기 헬스는 Next를 거치지 않는다 — 프레임워크가 아플 때도 답해야 하는 질문이다.
  ownHealth(req, res).then((handled) => {
    if (!handled) handle(req, res);
  });
});

// ── WebSocket 터널 ──────────────────────────────────────────────────────────
const wss = new WebSocketServer({ noServer: true });
const tunnels = new Set();

wss.on("connection", (client) => {
  // 브라우저 소켓 하나당 api 소켓 하나. 둘 중 하나가 닫히면 나머지도 닫는다.
  const upstream = new WebSocket(apiWsUrl);
  const pair = { client, upstream };
  tunnels.add(pair);

  // 프레임을 옮길 때 **텍스트/바이너리 구분을 반드시 보존한다.**
  //   ws 라이브러리는 수신 데이터를 항상 Buffer로 준다. 그대로 send하면 텍스트였던 프레임이
  //   바이너리로 바뀌고, 브라우저의 `event.data`가 문자열이 아니라 Blob이 된다 —
  //   화면의 JSON.parse가 "[object Blob]"에서 터진다(node 클라이언트는 Buffer를 문자열로
  //   읽으므로 멀쩡해 보인다. 실제로 브라우저 e2e에서만 드러난 결함이다).
  const queue = []; // upstream이 열리기 전에 온 프레임을 잃지 않게 잠깐 담아 둔다
  const flush = () => {
    while (queue.length && upstream.readyState === WebSocket.OPEN) {
      const [data, isBinary] = queue.shift();
      upstream.send(data, { binary: isBinary });
    }
  };

  upstream.on("open", flush);
  upstream.on("message", (data, isBinary) => {
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
  });
  client.on("message", (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
    else queue.push([data, isBinary]);
  });

  const close = (code = 1000, reason = "") => {
    tunnels.delete(pair);
    try {
      client.close(code, reason);
    } catch {}
    try {
      upstream.close(code, reason);
    } catch {}
  };
  client.on("close", (c) => close(c === 1005 ? 1000 : c));
  upstream.on("close", (c) => close(c === 1005 ? 1000 : c));
  client.on("error", () => close(1011, "client error"));
  upstream.on("error", () => {
    // api가 죽었다 — 클라이언트에 알리고 닫는다(조용히 멈추면 화면이 영원히 기다린다).
    try {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "error", detail: "실시간 서버에 연결할 수 없습니다" }));
      }
    } catch {}
    close(1011, "upstream error");
  });
});

// 업그레이드는 둘로 갈린다: `/ws`는 우리가 받아 api로 터널링하고, **나머지는 Next에게 넘긴다.**
//
// 넘기는 것이 중요하다. 예전에는 `/ws`가 아니면 socket.destroy()로 끊었는데, 개발 모드의
// HMR 소켓(`/_next/webpack-hmr`)이 바로 그 길로 와서 매번 끊겼다 — 그러면 `make dev`에서
// 핫리로드가 죽고 화면이 하이드레이션되지 않은 채로 남는다(실측: 버튼이 안 먹고 구독도 안 붙었다).
// 프로덕션에는 HMR이 없어 컨테이너에서는 멀쩡했기 때문에 오래 눈에 띄지 않았다.
const upgradeToNext = app.getUpgradeHandler();
server.on("upgrade", (req, socket, head) => {
  if (req.url?.startsWith("/ws")) {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    return;
  }
  void upgradeToNext(req, socket, head);
});

server.listen(port, () => log({ level: "info", msg: "listening", port, dev, api: env.API_URL }));

// 정상 종료 — 터널을 1001(going away)로 닫아 클라이언트가 재연결을 알게 한다.
let closing = false;
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    if (closing) return;
    closing = true;
    log({ level: "info", msg: "shutdown 시작", sig });
    for (const { client, upstream } of tunnels) {
      try {
        client.close(1001, "server shutting down");
      } catch {}
      try {
        upstream.close(1001, "server shutting down");
      } catch {}
    }
    server.close(() => {
      log({ level: "info", msg: "shutdown 완료" });
      process.exit(0);
    });
    setTimeout(() => {
      log({ level: "warn", msg: "shutdown 타임아웃 강제 종료" });
      process.exit(1);
    }, shutdownMs).unref();
  });
}
