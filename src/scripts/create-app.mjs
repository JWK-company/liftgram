// @plm SRS-011  스캐폴더 — 명령 한 줄로 새 저장소가 선다
//
// ─────────────────────────────────────────────────────────────────────────────
// 사용:
//   make create NAME=my-app              현재 위치 옆(../my-app)에 새 저장소
//   make create NAME=my-app DIR=~/work   위치를 지정
//   make create NAME=my-app BARE=1       카운터 레퍼런스를 걷어낸 상태로
//
// 하는 일 (P0에서 실측한 함정을 전부 피해간다):
//   1. 템플릿을 복사한다 — git 추적 파일만(.git·node_modules·.next·산출물 제외)
//   2. **이름을 치환한다** — package.json·README 제목·앱 헤더. 이름이 남으면 이미지·네트워크가 충돌한다
//   3. **.env를 만들고 포트를 정한다** — 이미 쓰는 포트를 피해 자동 선택하고,
//      DB_PORT↔DATABASE_URL / BROKER_PORT↔REDIS_URL **짝을 함께** 채운다(하나만 바꾸면 다른 DB에 붙는다)
//   4. git init + 첫 커밋 + 훅 설치
//   5. BARE=1이면 카운터 모듈·라우트·화면·e2e를 걷어내고 최소 골격만 남긴다
//
// 원본 저장소는 건드리지 않는다. 만든 뒤 곧바로 `make verify`가 통과해야 성공이다
// (scripts/check-scaffold.sh 가 CI에서 매번 그것을 확인한다).
// ─────────────────────────────────────────────────────────────────────────────
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const name = (process.argv[2] ?? "").trim();
const outDir = process.argv[3] || path.dirname(root);
const bare = process.env.BARE === "1";

if (!/^[a-z][a-z0-9-]{1,40}$/.test(name)) {
  console.error("이름은 소문자·숫자·하이픈만(2~41자).  예: make create NAME=my-app");
  process.exit(1);
}
const target = path.resolve(outDir.replace(/^~/, process.env.HOME ?? "~"), name);
if (existsSync(target)) {
  console.error(`${target} 이 이미 있습니다 — 다른 이름을 쓰거나 지우고 다시 하세요.`);
  process.exit(1);
}

const sh = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, encoding: "utf8" });

/** 비어 있는 포트를 찾는다 — 이미 다른 프로젝트가 쓰고 있으면 다음 번호로. */
async function freePort(start) {
  for (let p = start; p < start + 200; p++) {
    const busy = await new Promise((res) => {
      const s = createServer()
        .once("error", () => res(true))
        .once("listening", () => s.close(() => res(false)))
        .listen(p, "127.0.0.1");
    });
    if (!busy) return p;
  }
  return start;
}

// ── 1. 복사 — git이 아는 파일만(추적 + 아직 커밋 안 한 것, .gitignore 존중) ──
console.log(`\n  ${name} 을(를) 만듭니다 → ${target}`);
mkdirSync(target, { recursive: true });
// git 인덱스에는 있지만 **작업 트리에는 없는** 항목이 있을 수 있다(파일을 옮기고 아직 커밋 전).
// 그 항목에서 멈추면 스캐폴더가 "커밋 직전"이라는 흔한 상태에서 통째로 실패한다 — 건너뛰고 알린다.
const files = sh("git", ["ls-files", "-co", "--exclude-standard"]).split("\n").filter(Boolean);
let copied = 0;
const missing = [];
for (const f of files) {
  const src = path.join(root, f);
  if (!existsSync(src)) {
    missing.push(f);
    continue;
  }
  const dst = path.join(target, f);
  mkdirSync(path.dirname(dst), { recursive: true });
  cpSync(src, dst);
  copied++;
}
console.log(`    파일 ${copied}개 복사`);
if (missing.length)
  console.log(
    `    (인덱스에만 있고 작업 트리에 없는 ${missing.length}개는 건너뜀: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? " …" : ""})`,
  );

// ── 2. 이름 치환 ────────────────────────────────────────────────────────────
const TEMPLATE = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).name;
// 어느 세대의 템플릿에서 나왔는지 남긴다 — 나중에 업스트림 변경을 흘려보낼 때의 기준점(RM-004).
const templateVersion = (() => {
  try {
    return sh("git", ["describe", "--tags", "--always"]).trim();
  } catch {
    return "unknown";
  }
})();
const subst = [
  ["package.json", (t) => t.replace(`"name": "${TEMPLATE}"`, `"name": "${name}"`)],
  [
    "README.md",
    (t) => {
      const stamp = `> 이 저장소는 **${TEMPLATE}** 템플릿에서 생성됐다(${new Date().toISOString().slice(0, 10)} · ${templateVersion}).\n> 업스트림 변경을 받아올 때 이 버전을 기준으로 비교한다.\n`;
      return t
        .replace(new RegExp(`^# ${TEMPLATE}`, "m"), `# ${name}\n\n${stamp}`)
        .replaceAll(`${TEMPLATE}/`, `${name}/`); // 소스 트리 다이어그램의 루트 이름
    },
  ],
  ["frontend/app/layout.tsx", (t) => t.replaceAll(TEMPLATE, name)],
  // Claude Code가 세션마다 읽는 색인 — 첫 줄의 프로젝트 이름을 새 이름으로 바꾼다.
  ["CLAUDE.md", (t) => t.replaceAll(TEMPLATE, name)],
  ["compose.yaml", (t) => t],
];
for (const [rel, fn] of subst) {
  const p = path.join(target, rel);
  if (existsSync(p)) writeFileSync(p, fn(readFileSync(p, "utf8")));
}
console.log(`    이름 치환: ${TEMPLATE} → ${name}`);

// ── 3. .env — 포트를 자동으로 고르고 짝을 함께 채운다 ────────────────────────
const dbPort = await freePort(5433);
const brokerPort = await freePort(6380);
const webPort = await freePort(3000);
// api는 web 바로 다음 번호가 아니라 **web보다 뒤에서** 비어 있는 것을 고른다 —
// web이 3000을 못 잡아 3001로 밀렸을 때 api가 같은 번호를 잡으면 둘이 충돌한다.
const apiPort = await freePort(webPort + 1);
let envText = readFileSync(path.join(target, ".env.example"), "utf8");
envText = envText
  .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=postgres://app:app@localhost:${dbPort}/app`)
  .replace(/^REDIS_URL=.*$/m, `REDIS_URL=redis://localhost:${brokerPort}`)
  // ^PORT= 는 API_PORT까지 잡지 않는다(정규식 앵커) — 두 포트는 따로 고른다.
  .replace(/^PORT=.*$/m, `PORT=${webPort}`)
  .replace(/^API_PORT=.*$/m, `API_PORT=${apiPort}`)
  .replace(/^API_URL=.*$/m, `API_URL=http://127.0.0.1:${apiPort}`)
  .replace(/^APP_URL=.*$/m, `APP_URL=http://localhost:${webPort}`)
  .replace(/^DB_PORT=.*$/m, `DB_PORT=${dbPort}`)
  .replace(/^BROKER_PORT=.*$/m, `BROKER_PORT=${brokerPort}`)
  .replace(/^WEB_PORT=.*$/m, `WEB_PORT=${webPort}`);
writeFileSync(path.join(target, ".env"), envText);
console.log(
  `    포트 선택: web ${webPort} · api ${apiPort} · db ${dbPort} · broker ${brokerPort} (짝 맞춰 기록)`,
);

// ── 5. BARE — 레퍼런스 슬라이스를 걷어낸다 ──────────────────────────────────
if (bare) {
  const drop = [
    // 레퍼런스 도메인 = 운동 카탈로그. 새 저장소는 이걸 걷어내고 자기 첫 도메인부터 시작한다.
    "proto/exercise",
    "backend/gen/exercise",
    "backend/internal/exercise",
    "database/queries/exercise.sql",
    "backend/internal/db/sqlcgen",
    "contracts/gen/exercise",
    "frontend/app/components/CatalogClient.tsx",
    "frontend/app/exercise",
    "frontend/lib/labels.ts",
    "frontend/e2e/catalog.spec.ts",
    "scripts/gen-exercise-seed.mjs",
    "scripts/check-stream.mjs",
    "scripts/check-ws.mjs",
    "scripts/check-cross.mjs",
    "scripts/check-concurrency.mjs",
    "scripts/check-shutdown.mjs",
  ];
  for (const d of drop) rmSync(path.join(target, d), { recursive: true, force: true });

  // composition root을 빈 상태로 다시 쓴다.
  // 정규식으로 카운터 줄만 걷어내는 방식은 import 하나만 놓쳐도 빌드가 깨진다(실측) —
  // 그래서 **알려진 최소 골격을 통째로** 쓴다. 첫 도메인은 make gen 이 네 줄을 넣는다.
  writeFileSync(
    path.join(target, "backend/cmd/server/main.go"),
    `// @plm SRS-008  api entry point — 설정 검증 · 조립 · 정상 종료
// @plm SRS-010  헬스 — 생존과 준비를 나눈다
//
// 이 파일이 이 서비스의 **composition root**이다. 인스턴스가 만들어지는 곳은 여기 하나뿐이고,
// 도메인 패키지는 자기가 무엇을 주입받았는지 모른다(인터페이스로만 안다).
//
// 새 도메인을 붙이는 순서(전부 여기 네 줄 — make gen 이 자동으로 넣는다):
//   repo := <도메인>.NewRepo(pool)
//   svc  := <도메인>.NewService(repo, bus)
//   p, h := <도메인>v1connect.New<X>ServiceHandler(<도메인>.NewHandler(svc), opts)
//   mount(mux, p, h)
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"connectrpc.com/connect"
	"connectrpc.com/validate"

	"github.com/JWK-company/liftgram/src/backend/internal/config"
	"github.com/JWK-company/liftgram/src/backend/internal/db"
	"github.com/JWK-company/liftgram/src/backend/internal/middleware"
	"github.com/JWK-company/liftgram/src/backend/internal/realtime"
)

// 헬스체크 모드 — 이미지에 curl을 넣지 않기 위해 **서버 자신이** 확인한다.
var healthcheckMode = flag.Bool("healthcheck", false, "자기 자신의 /api/healthz 를 확인하고 종료 코드로 답한다")

func main() {
	flag.Parse()
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	if *healthcheckMode {
		os.Exit(runHealthcheck())
	}

	// 설정이 없으면 **여기서 죽는다.** 조용히 떠서 첫 요청에 500을 내는 것이 가장 나쁜 실패 모드다.
	cfg, err := config.Load()
	if err != nil {
		slog.Error("설정 검증 실패", "err", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("DB 연결 실패", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	bus, err := realtime.New(cfg.RealtimeBus, cfg.RedisURL)
	if err != nil {
		slog.Error("propagation 버스 초기화 실패", "err", err)
		os.Exit(1)
	}
	defer bus.Close()

	limiter, err := middleware.NewLimiter(cfg.RateLimitMode(), cfg.RedisURL, cfg.RateLimit, cfg.RateLimitWindowSec)
	if err != nil {
		slog.Error("rate limit 초기화 실패", "err", err)
		os.Exit(1)
	}

	// 계약(.proto)에 선언한 검증 규칙을 자동으로 적용한다 — 핸들러에 검증 코드가 없는 이유다.
	validator := validate.NewInterceptor()

	// 순서가 의미를 갖는다: 로그(바깥) → 요청제한 → 검증 → 오류변환 → 핸들러.
	opts := connect.WithInterceptors(
		middleware.RequestLogInterceptor(),
		limiter.Interceptor(),
		validator,
		middleware.ErrorInterceptor(),
	)
	_ = opts // 첫 도메인을 만들면 여기서 쓰인다(make gen)

	mux := http.NewServeMux()

	// ── 도메인 조립 ──
	// make gen NAME=<도메인> SRS=<요구번호> 가 **이 표식 바로 아래**에 네 줄을 넣는다.
	// 표식을 지우면 생성기가 자리를 못 찾고 멈춘다(scripts/gen-module.mjs).
	// GEN-ANCHOR:domains

	started := time.Now()
	mux.HandleFunc("/api/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "uptime": time.Since(started).Seconds()})
	})
	mux.HandleFunc("/api/readyz", func(w http.ResponseWriter, r *http.Request) {
		pingCtx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := pool.Ping(pingCtx); err != nil {
			// 준비되지 않음은 **오류가 아니라 상태다** — 오케스트레이터가 읽을 모양을 그대로 준다.
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "degraded", "db": "down"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "ready", "db": "up"})
	})

	srv := &http.Server{
		Addr:              ":" + strconv.Itoa(cfg.APIPort),
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		// WriteTimeout을 두지 않는다 — 스트리밍·WebSocket이 오래 열려 있어야 하기 때문이다.
	}

	go func() {
		slog.Info("api listening", "port", cfg.APIPort, "bus", bus.Kind(), "instance", cfg.InstanceID)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("bootstrap 실패", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("shutdown 시작")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Duration(cfg.ShutdownTimeoutSec)*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Warn("shutdown 타임아웃 — 강제 종료", "err", err)
	}
	slog.Info("shutdown 완료")
}

// mount는 Connect가 준 경로 앞에 /api를 붙여 등록한다 —
// 브라우저는 web만 보고 web이 /api/* 를 통째로 넘기기 때문이다(ADR-010).
func mount(mux *http.ServeMux, path string, h http.Handler) {
	mux.Handle("/api"+path, http.StripPrefix("/api", h))
	mux.Handle(path, h)
}

var _ = mount // 첫 도메인을 만들면 쓰인다(make gen)

// runHealthcheck는 자기 포트로 한 번 요청해 본다. 0=정상, 1=비정상.
func runHealthcheck() int {
	cfg, err := config.Load()
	if err != nil {
		return 1
	}
	client := &http.Client{Timeout: 3 * time.Second}
	res, err := client.Get("http://127.0.0.1:" + strconv.Itoa(cfg.APIPort) + "/api/healthz")
	if err != nil {
		return 1
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
`,
  );

  writeFileSync(
    path.join(target, "frontend/app/page.tsx"),
    `// 첫 화면. 서버 컴포넌트가 데이터를 확정해 클라이언트에 넘기는 자리다.
// (레퍼런스 카운터는 걷어냈다 — make gen NAME=<도메인> SRS=<요구번호> 로 첫 모듈을 만드세요)
export const dynamic = "force-dynamic";

export default async function Page() {
  return (
    <div className="rounded-xl border border-(--color-line) bg-(--color-card) p-8">
      <h1 className="text-xl font-bold">${name}</h1>
      <p className="mt-2 text-sm text-(--color-ink2)">
        빈 골격입니다. <code>make gen NAME=&lt;도메인&gt; SRS=&lt;요구번호&gt;</code> 로 첫 모듈을 만드세요.
      </p>
    </div>
  );
}
`,
  );

  // 화면의 api 클라이언트도 비운다 — 카운터 서비스 기술자를 지웠으므로 그대로 두면 import가 깨진다.
  writeFileSync(
    path.join(target, "frontend/lib/api.ts"),
    `// @plm SRS-008  api 접근 — 서버에서만 쓰는 내부 주소
//
// 브라우저는 이 파일을 쓰지 않는다. 클라이언트 코드는 상대 경로(\`/api\`)로 web을 부르고,
// web(프록시)이 api로 넘긴다 — 그래야 api를 외부에 노출하지 않는다(ADR-010).
//
// 첫 도메인을 만들면(make gen) 여기에 서버 전용 클라이언트를 추가한다:
//   import { createClient } from "@connectrpc/connect";
//   import { createConnectTransport } from "@connectrpc/connect-node";
//   export function serverClient() {
//     return createClient(<도메인>Service, createConnectTransport({ baseUrl: apiBaseUrl(), httpVersion: "1.1" }));
//   }
import { env } from "@/lib/env";

/** 내부 api의 절대 URL. 경로 접두사(/api)까지 포함한다 — 서버·브라우저가 같은 경로를 쓴다. */
export function apiBaseUrl(): string {
  return \`\${env.API_URL.replace(/\\/$/, "")}/api\`;
}
`,
  );

  // 계약 entry point도 비운다 — 카운터 생성물을 지웠으므로 그대로 두면 import가 깨진다.
  writeFileSync(
    path.join(target, "contracts/src/index.ts"),
    `// @plm SRS-001  계약 entry point — 화면이 import 하는 단 하나의 문
//
// gen/ 아래는 buf가 proto에서 만들어낸다(make proto). 첫 도메인을 만들면
// 여기에 \`export * from "../gen/<도메인>/v1/<도메인>_pb";\` 한 줄이 늘어난다.

/** 브라우저가 보는 경로. Connect RPC 앞에 /api 를 붙여 프록시 규칙을 하나로 유지한다(ADR-010). */
export const routes = {
  apiPrefix: "/api",
  health: "/healthz",
  ready: "/readyz",
  apiHealth: "/api/healthz",
  apiReady: "/api/readyz",
  ws: "/ws",
} as const;
`,
  );

  // 마이그레이션과 SQL 쿼리를 비운다 — 첫 도메인이 make gen 으로 자기 것을 만든다.
  rmSync(path.join(target, "database/migrations"), { recursive: true, force: true });
  mkdirSync(path.join(target, "database/migrations"), { recursive: true });
  writeFileSync(
    path.join(target, "database/migrations/0000_init.sql"),
    `-- @plm SRS-008  첫 마이그레이션 — 빈 골격
--
-- 테이블은 make gen NAME=<도메인> 이 여기에 파일을 추가한다.
-- 이 디렉터리는 sqlc가 **schema의 source of truth**으로도 읽는다(sqlc.yaml) — 정의가 두 곳에 생기지 않는다.

CREATE EXTENSION IF NOT EXISTS vector;
`,
  );
  rmSync(path.join(target, "database/queries"), { recursive: true, force: true });
  mkdirSync(path.join(target, "database/queries"), { recursive: true });

  console.log("    카운터 레퍼런스 제거(BARE) — 빈 골격");
}

// ── 4. git 초기화 + 훅 ──────────────────────────────────────────────────────
sh("git", ["init", "-q"], target);
sh("git", ["add", "-A"], target);
try {
  sh("git", ["-c", "commit.gpgsign=false", "commit", "-q", "-m", `${name} 시작 — liftgram에서 생성`], target);
} catch {
  console.log("    (첫 커밋 건너뜀 — git 사용자 설정이 없습니다)");
}
console.log("    git 초기화 + 첫 커밋");

console.log(`
  준비됐습니다.

    cd ${target}
    make bootstrap        의존 설치 · 인프라 기동 · 마이그레이션
    make dev              http://localhost:${webPort}
${bare ? `    make gen NAME=<도메인> SRS=<요구번호>   첫 모듈\n` : ""}
  포트는 비어 있는 것으로 골라 .env에 기록해 두었습니다(짝까지 맞춰서).
`);
