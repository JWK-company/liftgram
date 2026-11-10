// @plm SRS-050  WebSocket 터널링 — 브라우저는 web만 본다 (ADR-010)
// @plm SRS-049  SIGTERM에 연결을 정리하고 정해진 시간 안에 종료한다
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
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { isIP } from "node:net";
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
const QUIET = new Set(["/healthz", "/readyz", "/api/healthz", "/api/readyz", "/app-version"]);

// 배포된 화면의 버전 — 필수 업데이트 판정에서 「서버가 그 버전을 실제로 갖고 있나」를 본다(SRS-085 · QA H-1).
// 못 읽으면 null(화면은 필수가 아니라고 본다 — fail-open).
let webVersion = null;
try {
  const { readFile } = await import("node:fs/promises");
  webVersion = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8")).version ?? null;
} catch {
  webVersion = null;
}

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
  // @plm SRS-085  공개 버전 확인 — { version, minClientVersion }. Next·프록시·DB 를 거치지 않는다(가볍고, 아플 때도 답한다).
  // 서비스워커는 이 주소를 가로채지 않는다(navigate·미리받기 아님) — 늘 네트워크의 값이다.
  if (path === "/app-version" && (req.method === "GET" || req.method === "HEAD")) {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ version: webVersion, minClientVersion: env.MIN_CLIENT_VERSION || "" }));
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

  // web이 이 스택의 **가장자리**다 — 여기서 클라이언트 주소를 **한 번** 정하고, api는 그 값만 쓴다.
  //
  // ⚠ 예전에는 "XFF가 없으면 소켓 주소를 넣는다"였다. 그러면 **클라이언트가 보낸 XFF가 그대로** 내려가
  //   헤더 하나로 요청 제한을 우회할 수 있었다(2026-10-26 발견). 이제 받은 XFF는 버리고 다시 세운다:
  //   ① TRUST_CF_CONNECTING_IP=1 이고 CF-Connecting-IP가 유효한 IP면 그것(운영 — Cloudflare 터널 뒤)
  //   ② 아니면 소켓 주소. 운영은 터널이 루프백으로 붙으므로 ②면 전원이 한 주소가 된다 — 그래서 ①이 필요하다.
  //   쓰지 않는 CF 헤더는 지운다(아래에서 누가 읽기 시작하면 위조 통로가 된다). booktarae lib/client-ip.ts와 같은 판단.
  {
    const socket = (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
    const cfRaw = req.headers["cf-connecting-ip"];
    const cf = String(Array.isArray(cfRaw) ? cfRaw[0] : (cfRaw ?? ""))
      .split(",")[0]
      .trim()
      .replace(/^::ffff:/, "");
    const ip = env.TRUST_CF_CONNECTING_IP && isIP(cf) ? cf : socket;
    if (ip) req.headers["x-forwarded-for"] = ip;
    else delete req.headers["x-forwarded-for"];
    delete req.headers["cf-connecting-ip"];
    delete req.headers["x-real-ip"];
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
  // SPEC-018 앱 설치 파일 — 없는 이름이면 Next 의 404 HTML 이 next.config 의 APK 헤더(형식·attachment·immutable)를 달고
  // 「.apk」로 저장된다(Phase 1 qa 웹 M-1). 파일이 없으면 여기서 짧은 404(no-store)로 끝낸다. 이름은 한 단계·점 두 개 금지.
  {
    const path = (req.url ?? "").split("?")[0];
    if (path.startsWith("/downloads/")) {
      const name = path.slice("/downloads/".length);
      const ok =
        /^[A-Za-z0-9._-]+$/.test(name) &&
        !name.includes("..") &&
        existsSync(new URL(`./public/downloads/${name}`, import.meta.url));
      if (!ok) {
        // [원본] res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
        // [원본] res.end("not found");
        // [개선] 화면 지도 #T17 — 브라우저로 연 사람에게 영어 「not found」 대신 자연어 HTML. 404·no-store 는 그대로,
        // 형식은 text/html 이고 attachment 가 없어 「.apk」로 저장되지 않는다(M-1). Next 를 거치지 않으니 APK 헤더도 안 붙는다.
        const body = downloadMissingHtml(req.headers["accept-language"]);
        res.writeHead(404, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
          "content-length": Buffer.byteLength(body),
        });
        res.end(req.method === "HEAD" ? undefined : body);
        return;
      }
    }
  }
  // 자기 헬스는 Next를 거치지 않는다 — 프레임워크가 아플 때도 답해야 하는 질문이다.
  ownHealth(req, res).then((handled) => {
    if (!handled) handle(req, res);
  });
});

/**
 * 화면 지도 #T17 — `/downloads/` 에 없는 파일을 브라우저로 연 사람에게 보여 줄 짧은 안내.
 * Next 밖이라 사전(core i18n)을 못 쓴다 — 문구 두 벌을 여기 둔다(지금은 앱과 같이 ko).
 * 테마는 기기 설정(prefers-color-scheme)만 따른다 — 서버 HTML 이라 프로필의 라이트/다크 선택은 모른다(REV-108 #3).
 * 색은 theme.generated.css 의 bg·ink·ink3·brand·on-brand·line 과 같은 값(라이트/다크). 사용자 값은 하나도 넣지 않는다.
 */
function downloadMissingHtml(acceptLanguage) {
  // 앱(lib/i18n.ts)이 지금 ko 고정이라 여기도 ko 를 낸다 — 앱이 언어 설정을 붙일 때 같이 연다(REV-108 #2).
  // 영어 문구는 그때 쓸 수 있게 둔다. Accept-Language 로 고르면 앱은 한국어인데 이 화면만 영어가 된다.
  void acceptLanguage;
  const lang = "ko";
  const tx =
    lang === "en"
      ? {
          title: "Sorry, we can't find this install file",
          message: "A newer version may have replaced it. Get the latest app from the app page.",
          app: "Get the latest app",
          home: "Go to Liftgram",
        }
      : {
          title: "죄송해요. 이 설치 파일을 찾을 수 없어요",
          message: "새 버전이 나와 파일이 바뀌었을 수 있어요. 앱 안내 화면에서 최신 앱을 받아 주세요.",
          app: "최신 앱 받기",
          home: "리프트그램 홈으로",
        };
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${tx.title}</title>
<style>
:root{color-scheme:light dark;--bg:#F7F7F7;--ink:#141619;--ink3:#6A737B;--brand:#C8381C;--on:#FFFFFF;--line:#DBDBDB}
@media (prefers-color-scheme:dark){:root{--bg:#161616;--ink:#F5F7F9;--ink3:#98A1AD;--brand:#FF7A57;--on:#161616;--line:#424242}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--ink);
font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif;padding:24px 16px}
main{max-width:420px;width:100%;text-align:center}h1{font-size:20px;line-height:1.4;margin:0 0 8px;word-break:keep-all}
p{font-size:14px;line-height:1.6;color:var(--ink3);margin:0 0 24px;word-break:keep-all}
.a{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
a{display:inline-flex;align-items:center;min-height:44px;padding:0 20px;border-radius:12px;font-weight:600;text-decoration:none;font-size:15px}
.p{background:var(--brand);color:var(--on)}.s{border:1px solid var(--line);color:var(--ink)}
</style></head>
<body><main data-testid="download-missing"><h1>${tx.title}</h1><p>${tx.message}</p>
<div class="a"><a class="p" href="/app" data-testid="download-missing-app">${tx.app}</a><a class="s" href="/" data-testid="download-missing-home">${tx.home}</a></div>
</main></body></html>`;
}

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
