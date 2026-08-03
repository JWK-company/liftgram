# @plm SRS-008  두 실행 단위(frontend · backend)를 한 파일에서 만든다 — 멀티스테이지 · non-root
#
# ─────────────────────────────────────────────────────────────────────────────
# 이 파일이 만드는 이미지는 두 개다(ADR-010 · ADR-011):
#
#   --target frontend   브라우저가 보는 화면 + 프록시(Next 16 · 커스텀 서버)  :3000
#   --target backend    화면이 부르는 API 서버(Go · Connect RPC)           :3001  내부 전용
#
# 왜 한 파일인가: 두 이미지가 **같은 소스 트리**에서 나온다. 계약(proto 생성물)이 양쪽에
# 걸쳐 있어서, 따로 빌드하면 두 이미지의 계약이 어긋난 채로 배포될 수 있다.
#
# backend가 Go가 되면서 얻은 것(ADR-011):
#   · 런타임 의존이 없다 — 정적 바이너리 하나. node_modules 심볼릭 링크 사고가 구조적으로 사라졌다
#   · 이미지가 작다 — alpine + 바이너리
#   · 마이그레이션 러너도 같은 소스에서 나온 두 번째 바이너리다(스키마와 코드가 어긋나지 않는다)
#
# 빌드:  docker build --target frontend -t app-frontend .
#        docker build --target backend -t app-backend .
#        (compose가 두 개를 함께 만든다 — `make image`)
# ─────────────────────────────────────────────────────────────────────────────

# ── backend 빌드 — 정적 바이너리 두 개(server · migrate) ─────────────────────
FROM golang:1.26-alpine AS backend-build
WORKDIR /src
# go.mod/go.sum 을 먼저 복사한다 — 소스가 바뀌어도 의존 다운로드 레이어는 캐시된다.
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
# CGO_ENABLED=0 — libc에 의존하지 않는 정적 바이너리라 어떤 베이스 이미지에서도 돈다.
# -w -s 는 디버그 심볼을 뺀다(크기 축소). 스택 추적은 남는다.
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-w -s" -o /out/server ./cmd/server \
 && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-w -s" -o /out/migrate ./cmd/migrate

# ── backend 이미지 ───────────────────────────────────────────────────────────
FROM alpine:3.21 AS backend
WORKDIR /app
# ca-certificates: 바깥으로 HTTPS를 걸 때 필요하다(지금은 안 쓰지만, 붙이는 순간 없으면 디버깅이 길어진다).
RUN apk add --no-cache ca-certificates \
 && addgroup -S app && adduser -S -G app app
COPY --from=backend-build /out/server /out/migrate /app/
# 마이그레이션 SQL — one-shot 마이그레이션 서비스가 같은 이미지로 돈다(compose의 migrate).
# 러너는 실행 위치 기준으로 migrations/ 를 본다.
COPY database/migrations /app/migrations
# 올라온 사진이 놓이는 자리. **이미지 안에 미리 만들어 소유자를 app으로 둔다** —
# 도커 named volume은 처음 붙을 때 이 경로의 소유자를 그대로 물려받는다. 없으면 root 소유로
# 만들어져 non-root 프로세스가 쓰지 못한다(실측: `permission denied`).
RUN mkdir -p /app/media && chown -R app:app /app/media
USER app
EXPOSE 3001
# 설정은 실행 시 환경변수로만 들어온다 — 이미지에 .env를 넣지 않는다(누락되면 부팅 실패 = runtime contract).
CMD ["/app/server"]

# ── frontend 의존 설치 ───────────────────────────────────────────────────────
FROM oven/bun:1 AS frontend-deps
WORKDIR /app
# 워크스페이스 매니페스트를 먼저 복사한다 — 소스가 바뀌어도 이 레이어는 캐시된다.
# **워크스페이스를 하나 늘리면 여기도 한 줄 늘려야 한다** — 빠뜨리면 `bun install` 이
# "Workspace not found" 로 죽는다(로컬은 멀쩡한데 이미지 빌드만 깨진다).
COPY package.json bun.lock* ./
COPY frontend/package.json ./frontend/
COPY contracts/package.json ./contracts/
COPY core/package.json ./core/
RUN bun install --frozen-lockfile 2>/dev/null || bun install

# ── frontend 빌드 ────────────────────────────────────────────────────────────
FROM oven/bun:1 AS frontend-build
WORKDIR /app
COPY --from=frontend-deps /app/node_modules ./node_modules
COPY --from=frontend-deps /app/frontend/node_modules ./frontend/node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# 계약은 **빌드하지 않는다**(ADR-011) — proto에서 생성된 TS를 Next가 직접 트랜스파일한다.
RUN bun run --cwd frontend build

# ── frontend 이미지 ──────────────────────────────────────────────────────────
FROM node:24-slim AS frontend
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN groupadd -r app && useradd -r -g app app
# standalone 출력은 저장소 루트 기준의 트리를 만든다(next.config의 outputFileTracingRoot):
#   /app/frontend/server.js · /app/node_modules/...
COPY --from=frontend-build /app/frontend/.next/standalone ./
COPY --from=frontend-build /app/frontend/.next/static ./frontend/.next/static
# entry point은 Next가 만든 server.js가 아니라 우리 커스텀 서버다(/ws 업그레이드를 받아야 하므로).
COPY --from=frontend-build /app/frontend/server.mjs ./frontend/server.mjs
COPY --from=frontend-build /app/frontend/lib/env.ts ./frontend/lib/env.ts
# Next의 파일 트레이싱은 **앱 코드만** 따라간다. 커스텀 서버는 빌드 밖의 entry point이라
# 그 의존(ws·zod)은 standalone에 실리지 않는다 — 명시적으로 싣는다.
# 경로에 주의: bun 워크스페이스는 의존을 **워크스페이스 안**(frontend/node_modules)에 둔다.
# 목록 확인: node scripts/runtime-deps.mjs
COPY --from=frontend-deps /app/frontend/node_modules/ws ./frontend/node_modules/ws
COPY --from=frontend-deps /app/frontend/node_modules/zod ./frontend/node_modules/zod
USER app
WORKDIR /app/frontend
EXPOSE 3000
CMD ["node", "server.mjs"]

# ── 합본 이미지 — 무료 호스트용(웹 서비스 1개에 둘 다) ───────────────────────
#
# 왜 있는가: 무료 티어는 대개 **상시 프로세스 1개**만 준다(Render 무료 웹 서비스 등).
# 두 서비스로 나누면 슬립·콜드 스타트를 두 번 겪고, 무료 한도도 두 배로 쓴다.
# 화면이 `/api/*`를 백엔드로 넘기는 구조라 **같은 컨테이너의 localhost**로 넘기면 그대로 돈다.
#
# 운영 배포(여러 인스턴스·독립 스케일)에서는 이걸 쓰지 않는다 — 그때는 frontend·backend를
# 따로 띄우는 것이 맞다. 이 타깃은 **개발 단계의 무료 배포** 전용이다.
#
#   docker build --target combined -t app-combined .
#   docker run -e DATABASE_URL=... -e PORT=8080 app-combined
FROM node:24-slim AS combined
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    # 백엔드는 바깥에 열지 않는다 — 화면만 공개 포트를 잡는다.
    API_PORT=3001 API_URL=http://127.0.0.1:3001 \
    # 인스턴스가 하나뿐이므로 브로커 없이 프로세스 안에서 전파한다(Redis 불필요).
    REALTIME_BUS=memory
# JWT_SECRET은 **이미지에 넣지 않는다** — 실행 시 환경변수로만 들어온다(호스트가 생성한 값).
RUN groupadd -r app && useradd -r -g app app

# 화면(standalone) — frontend 타깃과 같은 구성
COPY --from=frontend-build /app/frontend/.next/standalone ./
COPY --from=frontend-build /app/frontend/.next/static ./frontend/.next/static
COPY --from=frontend-build /app/frontend/server.mjs ./frontend/server.mjs
COPY --from=frontend-build /app/frontend/lib/env.ts ./frontend/lib/env.ts
COPY --from=frontend-deps /app/frontend/node_modules/ws ./frontend/node_modules/ws
COPY --from=frontend-deps /app/frontend/node_modules/zod ./frontend/node_modules/zod

# API 서버 + 마이그레이션 러너(같은 소스에서 나온 정적 바이너리)
COPY --from=backend-build /out/server /out/migrate /app/bin/
COPY database/migrations /app/migrations

# 시작 순서: 마이그레이션 → 백엔드 → 화면.
# 한 프로세스가 죽으면 컨테이너도 죽어야 한다(호스트가 다시 띄우게) — `wait -n`이 그 역할이다.
COPY scripts/start-combined.sh /app/start.sh
# 사진 자리 — 무료 호스트의 디스크는 재배포에서 비워진다. 오래 남기려면 STORAGE_PROVIDER=s3.
RUN mkdir -p /app/media && chown -R app:app /app/media
USER app
EXPOSE 8080
CMD ["/app/start.sh"]
