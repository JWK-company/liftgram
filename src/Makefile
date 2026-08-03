# liftgram — 파트별 실행 entry point
#
# 이 Makefile은 "무엇을 어떤 순서로 띄우는가"를 한 곳에 모은 것이다.
# 파트는 넷으로 나뉘고, 각 파트는 독립적으로 올리고 내릴 수 있다.
#
#   1) 인프라   db(PostgreSQL 18+pgvector) · broker(Redis)   → make infra-up
#   2) 데이터   스키마 생성 · 마이그레이션 적용              → make migrate
#   3) 앱       backend(Go) + frontend(Next) 개발/프로덕션 서버 → make dev / make start
#   4) 검증     lint · 타입 · 테스트 · smoke test · runtime contract     → make verify / make smoke
#
# 실행 단위가 둘이다(ADR-010): **backend**가 도메인·DB·실시간을, **frontend**가 화면과 프록시를 맡는다.
# `make dev`는 둘을 함께 띄운다(backend :$(API_PORT) · frontend :$(PORT)). 하나만 띄우려면 dev-backend / dev-frontend.
#
# 규칙: 앱은 절대 마이그레이션을 스스로 돌리지 않는다(runtime contract). 순서는 항상 1 → 2 → 3.
# 도움말: make  또는  make help

SHELL := /bin/bash
.DEFAULT_GOAL := help

# .env가 있으면 읽어서 모든 타깃에 넘긴다(없어도 동작 — 각 타깃의 기본값 사용)
-include .env
export

# 프로젝트 이름 = 디렉터리 이름. 복제해서 이름을 바꿔도 이미지·네트워크·컨테이너 이름이 따라온다.
# (.env에 COMPOSE_PROJECT_NAME을 두면 그 값이 이긴다 — compose도 같은 변수를 본다)
PROJECT := $(if $(COMPOSE_PROJECT_NAME),$(COMPOSE_PROJECT_NAME),$(notdir $(CURDIR)))
export COMPOSE_PROJECT_NAME := $(PROJECT)

DEV_COMPOSE ?= compose.dev.yaml
COMPOSE     ?= compose.yaml
# 호스트에서 접근할 주소 — .env의 WEB_PORT를 따른다(컨테이너 내부는 항상 3000)
HOST_PORT   ?= $(if $(WEB_PORT),$(WEB_PORT),3000)
BASE        ?= http://127.0.0.1:$(HOST_PORT)
DB_URL      ?= $(DATABASE_URL)
IMAGE_FRONTEND ?= $(PROJECT)-frontend
IMAGE_BACKEND  ?= $(PROJECT)-backend
NETWORK     ?= $(PROJECT)_default
# 두 번째 인스턴스는 **api까지 한 벌 더** 띄운다 — 그래야 브로커를 통한 프로세스 간 propagation을 확인한다
# (web만 둘로 늘리면 같은 api를 보므로 propagation이 아니라 같은 프로세스 안의 일이 된다).
SIDECAR_BACKEND  ?= $(PROJECT)-backend-2
SIDECAR_FRONTEND ?= $(PROJECT)-frontend-2
# 사이드카 frontend가 호스트에 노출할 포트. backend 로컬 포트(3001)와 겹치지 않게 +2로 둔다.
SIDECAR_PORT ?= $(shell echo $$(( $(HOST_PORT) + 2 )))

.PHONY: help
help: ## 이 도움말
	@echo ""
	@echo "  $(PROJECT) — 파트별 실행   (앱 $(BASE))"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"} \
		/^## /       { printf "\n  \033[1m%s\033[0m\n", substr($$0,4) } \
		/^[a-zA-Z0-9_-]+:.*##/ { printf "    \033[36m%-16s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@echo ""

## 0. 전제조건 — 처음 받은 사람이 여기서 막히지 않게
.PHONY: doctor
doctor: ## 필요한 도구가 다 있는지 확인(없으면 설치 방법을 알려준다)
	@ok=1; \
	printf "  %-10s " "docker"; if command -v docker >/dev/null; then echo "✅ $$(docker --version | cut -d, -f1)"; else echo "❌ 없음 — https://docs.docker.com/get-docker/"; ok=0; fi; \
	printf "  %-10s " "bun";    if command -v bun >/dev/null;    then echo "✅ $$(bun --version)"; else echo "❌ 없음 — curl -fsSL https://bun.sh/install | bash"; ok=0; fi; \
	printf "  %-10s " "go";     if command -v go >/dev/null;     then echo "✅ $$(go version | cut -d' ' -f3)"; else echo "❌ 없음 — https://go.dev/dl/ (1.26+) 또는 asdf install golang 1.26.5"; ok=0; fi; \
	printf "  %-10s " "buf";    if command -v buf >/dev/null;    then echo "✅ $$(buf --version)"; else echo "⚠  없음 — 계약을 고칠 때만 필요(make proto). https://buf.build/docs/installation"; fi; \
	echo ""; \
	if [ $$ok -eq 1 ]; then echo "  준비 완료 — make bootstrap 으로 시작하세요"; else echo "  ❌ 표시된 도구를 설치한 뒤 다시 실행하세요"; exit 1; fi

## 1. 인프라 — 앱이 기대는 외부 자원만 띄운다
.PHONY: infra-up infra-down infra-logs infra-ps db-shell redis-cli
infra-up: ## db·broker 기동(개발용 · 앱은 로컬 실행)
	@docker compose -f $(DEV_COMPOSE) up -d --wait || { \
		echo ""; \
		echo "  기동 실패. 포트 충돌이라면 .env에서 아래 **두 쌍을 함께** 바꾸세요:"; \
		echo "    DB_PORT      ↔ DATABASE_URL 의 포트"; \
		echo "    BROKER_PORT  ↔ REDIS_URL 의 포트"; \
		echo "  바꾼 뒤 make env-check 로 짝이 맞는지 확인할 수 있습니다."; \
		echo ""; exit 1; }
	@echo "db → localhost:$(if $(DB_PORT),$(DB_PORT),5433) · broker → localhost:$(if $(BROKER_PORT),$(BROKER_PORT),6380)"

infra-down: ## db·broker 종료(데이터 유지)
	docker compose -f $(DEV_COMPOSE) down

infra-reset: ## db·broker 종료 + 볼륨까지 삭제(데이터 소멸)
	docker compose -f $(DEV_COMPOSE) down -v
	docker compose -f $(COMPOSE) down -v 2>/dev/null || true

infra-logs: ## 인프라 로그 따라가기
	docker compose -f $(DEV_COMPOSE) logs -f

infra-ps: ## 인프라 상태
	docker compose -f $(DEV_COMPOSE) ps

db-shell: ## psql 접속
	docker compose -f $(DEV_COMPOSE) exec db psql -U $(if $(POSTGRES_USER),$(POSTGRES_USER),app) -d $(if $(POSTGRES_DB),$(POSTGRES_DB),app)

redis-cli: ## redis-cli 접속
	docker compose -f $(DEV_COMPOSE) exec broker redis-cli

## 1.5 환경변수 — .env 하나가 로컬과 컨테이너를 모두 설정한다
.PHONY: env-init env-check env-diff env-print
env-init: ## .env가 없으면 .env.example에서 만든다(있으면 건드리지 않는다)
	@if [ -f .env ]; then echo ".env 이미 있음 — 건드리지 않음"; \
	else cp .env.example .env && echo ".env 생성됨 (.env.example 복사) — 필요한 값을 채우세요"; fi

env-check: ## 설정 코드(backend·frontend)·.env·.env.example 대조 + 현재 설정으로 실제 검증
	@node scripts/env-check.mjs

env-diff: ## .env와 .env.example의 키 차이만 빠르게 보기
	@diff <(grep -oE '^[A-Z0-9_]+' .env 2>/dev/null | sort) \
	      <(grep -oE '^[A-Z0-9_]+' .env.example | sort) \
	      && echo "키 구성 동일" || echo "(< 내 .env에만  |  > .env.example에만)"

env-print: ## 지금 적용되는 설정 값 확인(비밀번호는 가림)
	@# frontend 설정은 TS라 그대로 읽어서 보여준다.
	@node -e "const {assertEnv}=await import('./frontend/lib/env.ts'); const e={...assertEnv()}; if(e.DATABASE_URL) e.DATABASE_URL=String(e.DATABASE_URL).replace(/\/\/[^@]+@/,'//***@'); console.log('frontend', e);" --input-type=module
	@# backend 설정은 Go라 import할 수 없다 — 부팅 시 config.Load()가 검증하고, 키 목록은 make env-check가 대조한다.
	@echo "backend  → make env-check (누락은 부팅 시 config.Load가 즉시 알린다)"

## 2. 계약·데이터 — proto와 SQL이 각각의 single source of truth이다
.PHONY: proto sqlc gen-migration migrate migrate-check db-status
proto: ## proto → Go(backend/gen) + TypeScript(contracts/gen) 동시 생성
	buf lint
	buf generate
	@echo "생성물은 커밋한다 — 받는 사람이 buf 없이도 빌드되게"

sqlc: ## database/queries/*.sql → 타입 안전한 Go 코드 (호스트 설치 불필요 · go run으로 실행)
	@# 설정은 database/sqlc.yaml이고 그 안의 경로는 **설정 파일 기준**으로 풀린다.
	@# go run은 Go 모듈 안에서 돌아야 해서 backend에서 실행하되, -f 로 설정을 가리킨다.
	cd backend && go run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.30.0 -f ../database/sqlc.yaml generate
	@echo "생성물은 커밋한다"

gen-migration: ## 새 마이그레이션 파일 만들기 — 사용: make gen-migration NAME=add_index
	@test -n "$(NAME)" || { echo "NAME= 을 주세요.  예: make gen-migration NAME=add_index"; exit 1; }
	@n=$$(ls database/migrations/*.sql 2>/dev/null | wc -l); \
	f=$$(printf "database/migrations/%04d_%s.sql" $$n "$(NAME)"); \
	printf -- "-- %s\n--\n-- 규칙: 재실행해도 결과가 같도록 IF NOT EXISTS · ON CONFLICT 를 쓴다.\n-- 한 번 적용된 파일은 고치지 않는다 — 새 파일을 만든다.\n\n" "$(NAME)" > $$f; \
	echo "만들었습니다: $$f  (내용을 채운 뒤 make sqlc && make migrate)"

sync-core: ## 도메인·정적데이터·문자열을 app/에서 core/로 이전 (ADR-032 · 원본은 app/src/)
	@# 재작성이 아니라 복사다 — 같은 계산 규칙을 두 곳에 손으로 적으면 반드시 갈라진다.
	bun scripts/sync-core.mjs
	@echo "생성물은 커밋한다 — 검증은 make core-check"

core-check: ## core 파생물이 원본(app/src/)과 일치하는가 — make verify가 부른다
	bun scripts/sync-core.mjs --check

gen-exercise-seed: ## 운동 카탈로그 시드 SQL 재생성 (원본 = app/의 TypeScript 시드)
	@# node가 아니라 bun으로 돈다 — TS 시드를 변환 없이 그대로 import하기 위해서다.
	@# 시드가 줄었거나 키가 겹치면 파일을 쓰지 않고 죽는다(조용한 축소 방지).
	bun scripts/gen-exercise-seed.mjs
	@echo "생성물은 커밋한다 — 적용은 make migrate"

migrate: ## 마이그레이션 적용(몇 번 돌려도 결과 동일)
	@# DB_URL이 비어 있으면 넘기지 않는다 — 빈 값을 넘기면 env의 .env 로딩이 무력화된다.
	@# 러너는 backend의 바이너리지만 SQL은 database/ 가 소유한다 — 설정이 실행 위치를 보고 찾는다.
	cd backend && $(if $(DB_URL),DATABASE_URL="$(DB_URL)") go run ./cmd/migrate

migrate-check: ## idempotency 확인 — 두 번 연속 실행해 2회차가 skip인지 본다
	@cd backend && $(if $(DB_URL),DATABASE_URL="$(DB_URL)") go run ./cmd/migrate
	@echo "--- 재실행 ---"
	@cd backend && $(if $(DB_URL),DATABASE_URL="$(DB_URL)") go run ./cmd/migrate

db-status: ## 적용된 마이그레이션과 테이블 확인
	docker compose -f $(DEV_COMPOSE) exec db psql -U $(if $(POSTGRES_USER),$(POSTGRES_USER),app) -d $(if $(POSTGRES_DB),$(POSTGRES_DB),app) \
		-c "select name, applied_at from _migrations order by name" -c '\dt' 

## 2.4 새 프로젝트 — 이 템플릿에서 저장소를 만든다
.PHONY: create
create: ## 새 저장소 생성 — 사용: make create NAME=my-app [DIR=~/work] [BARE=1]
	@test -n "$(NAME)" || { echo "NAME= 을 주세요.  예: make create NAME=my-app"; exit 1; }
	@node scripts/create-app.mjs $(NAME) $(DIR)

## 2.5 코드 생성 — 레퍼런스와 같은 모양으로 시작한다
.PHONY: gen gen-page
gen-page: ## 새 화면 생성 — 사용: make gen-page NAME=posts [MODULE=post]
	@test -n "$(NAME)" || { echo "NAME= 을 주세요.  예: make gen-page NAME=posts MODULE=post"; exit 1; }
	@node scripts/gen-page.mjs $(NAME) $(MODULE)

gen: ## 새 도메인 모듈 생성 — 사용: make gen NAME=order SRS=SRS-014 (SRS는 선택이지만 권장)
	@test -n "$(NAME)" || { echo "NAME= 을 주세요.  예: make gen NAME=order SRS=SRS-014"; exit 1; }
	@node scripts/gen-module.mjs $(NAME) $(SRS)

## 3. 앱 — 개발 / 프로덕션 (backend + frontend)
.PHONY: dev dev-backend dev-frontend dev-container start build install hooks
install: ## 의존 설치 + git 훅 설치
	bun install
	@bunx lefthook install >/dev/null 2>&1 && echo "git 훅 설치됨(pre-commit: 포맷·타입·테스트)" || echo "lefthook 설치 건너뜀"

hooks: ## git 훅만 다시 설치
	bunx lefthook install

dev-container: ## 컨테이너 안에서 개발 서버 + 핫리로드(오버레이 — base 이미지는 그대로)
	docker compose -f $(COMPOSE) -f compose.override.dev.yaml build frontend backend
	docker compose -f $(COMPOSE) -f compose.override.dev.yaml up -d --wait db broker
	docker compose -f $(COMPOSE) -f compose.override.dev.yaml up backend frontend

dev: ## 개발 서버 — backend + frontend 동시(인프라가 떠 있어야 함 — make infra-up)
	@# 포트가 이미 쓰이면 **뜨기 전에** 알린다. 반쯤 뜬 상태로 디버깅하는 것이 가장 오래 걸린다.
	@for p in $(if $(PORT),$(PORT),3000) $(if $(API_PORT),$(API_PORT),3001); do \
		if command -v ss >/dev/null && ss -ltn 2>/dev/null | grep -q ":$$p "; then \
			echo "  포트 $$p 이 이미 쓰이고 있습니다 — .env의 PORT/API_PORT를 바꾸거나 make down-all 로 정리하세요."; exit 1; fi; done
	bun run dev

dev-backend: ## backend만 개발 서버로(백엔드만 만질 때)
	cd backend && go run ./cmd/server

dev-frontend: ## frontend만 개발 서버로(backend가 이미 떠 있어야 함 — 아니면 화면이 502를 표시한다)
	bun run --cwd frontend dev

build: ## 프로덕션 빌드(backend 정적 바이너리 + frontend standalone)
	bun run build

start: ## 빌드 결과로 프로덕션 서버 기동(backend + frontend)
	@echo "api → :$(if $(API_PORT),$(API_PORT),3001) · web → $(BASE)"
	bun run start:api & bun run start:web

## 4. 검증 — 로컬에서 CI와 같은 것을 돌린다
.PHONY: lint typecheck test verify docs-check go-vet proto-check smoke e2e e2e-install ratelimit-check contract ci
lint: ## Biome 검사
	bun run lint

typecheck: ## 타입 검사 — frontend(tsc) + backend(go build·vet)
	bun run typecheck

test: ## 유닛 테스트(DB 불필요 · e2e는 make e2e)
	bun run test

docs-check: ## 문서 드리프트 검사 — 설정 키·make 타깃·스크립트가 문서에 있는가
	@node scripts/check-docs.mjs

verify: lint typecheck test core-check docs-check ## lint + 타입 + 테스트 + core 드리프트 + 문서 검사 한 번에

go-vet: ## Go 정적 검사(빌드 + vet)
	cd backend && go build ./... && go vet ./...

proto-check: ## 계약 생성물이 proto와 일치하는가(커밋 누락 탐지)
	@buf generate && git diff --quiet -- backend/gen contracts/gen \
		|| { echo "  ✗ 생성물이 proto와 다릅니다 — make proto 후 커밋하세요"; exit 1; }
	@echo "  ✓ 계약 생성물이 최신입니다"

smoke: ## REST·SSE·WS 8종 smoke test(서버가 떠 있어야 함)
	BASE="$(BASE)" bash scripts/smoke.sh

e2e: ## 브라우저 e2e — 화면·채널 전환·두 탭·두 인스턴스 propagation(서버가 떠 있어야 함)
	BASE="$(BASE)" bunx playwright test -c frontend/playwright.config.ts

e2e-install: ## e2e용 브라우저 설치(처음 한 번)
	bunx playwright install chromium

ratelimit-check: ## rate limit이 실제로 막는지 확인(서버가 떠 있어야 함 · scale-2면 합산까지)
	@node scripts/check-ratelimit.mjs "$(BASE)" $(if $(wildcard /dev/null),,)

contract: ## 컨테이너 runtime contract 검증(frontend·backend 두 이미지)
	IMG="$(IMAGE_FRONTEND)" UNIT=frontend bash scripts/check-contract.sh
	IMG="$(IMAGE_BACKEND)" UNIT=backend bash scripts/check-contract.sh

ci: ## CI 전 과정(플랫폼 중립 — 러너에서도 이 한 줄)
	IMG_FRONTEND="$(IMAGE_FRONTEND)" IMG_BACKEND="$(IMAGE_BACKEND)" BASE="$(BASE)" DATABASE_URL="$(DB_URL)" bash scripts/ci.sh

## 5. 컨테이너 — 전부 이미지로 띄운다
.PHONY: image-free
image-free: ## 무료 호스트용 합본 이미지(화면+API 한 컨테이너) — deploy/README.md 참고
	docker build --target combined -t liftgram-combined:latest .

.PHONY: image up down logs logs-backend logs-frontend backend-shell ps restart scale-2 unscale
image: ## 프로덕션 이미지 빌드
	docker compose -f $(COMPOSE) build

up: ## 전체 스택 기동(frontend · backend · db · migrate one-shot · broker)
	docker compose -f $(COMPOSE) up -d --wait
	@echo "앱 → $(BASE)"

down: ## 전체 스택 종료
	docker compose -f $(COMPOSE) down

restart: ## 앱만 재기동(backend → frontend 순 · 인프라는 그대로)
	docker compose -f $(COMPOSE) restart backend frontend

logs: ## 앱 로그 따라가기(backend + frontend 함께 — 한 요청이 두 로그에 x-request-id로 이어진다)
	docker compose -f $(COMPOSE) logs -f backend frontend

logs-backend: ## backend 로그만
	docker compose -f $(COMPOSE) logs -f backend

logs-frontend: ## frontend 로그만
	docker compose -f $(COMPOSE) logs -f frontend

backend-shell: ## 내부 전용 backend에 직접 요청해 보기 — 사용: make backend-shell PATH_=/api/meta
	@# backend 이미지에는 curl·node가 없다(정적 바이너리 하나뿐) — 같은 네트워크에 일회용 컨테이너를 띄운다.
	docker run --rm --network $(NETWORK) curlimages/curl:8.11.1 -s \
		"http://backend:3001$(if $(PATH_),$(PATH_),/api/healthz)" 

ps: ## 컨테이너 상태
	docker compose -f $(COMPOSE) ps -a

scale-2: ## 두 번째 인스턴스(backend+frontend 한 벌)를 띄워 브로커 propagation을 눈으로 확인
	@docker rm -f $(SIDECAR_FRONTEND) $(SIDECAR_BACKEND) 2>/dev/null || true
	@# backend를 먼저 — frontend가 부팅 시 backend를 찾는다.
	docker run -d --name $(SIDECAR_BACKEND) --network $(NETWORK) \
		-e DATABASE_URL=postgres://$(if $(POSTGRES_USER),$(POSTGRES_USER),app):$(if $(POSTGRES_PASSWORD),$(POSTGRES_PASSWORD),app)@db:5432/$(if $(POSTGRES_DB),$(POSTGRES_DB),app) \
		-e REALTIME_BUS=redis -e REDIS_URL=redis://broker:6379 -e API_PORT=3001 \
		$(IMAGE_BACKEND) >/dev/null
	docker run -d --name $(SIDECAR_FRONTEND) --network $(NETWORK) \
		-e API_URL=http://$(SIDECAR_BACKEND):3001 -e PORT=3000 \
		-p $(SIDECAR_PORT):3000 $(IMAGE_FRONTEND) >/dev/null
	@echo "두 탭으로 열어 비교: $(BASE) 와 http://127.0.0.1:$(SIDECAR_PORT)"
	@echo "  (왼쪽 화면은 backend-1, 오른쪽 화면은 backend-2를 본다 — 값이 함께 움직이면 브로커 propagation이 동작한 것)"

unscale: ## 두 번째 인스턴스 제거
	@docker rm -f $(SIDECAR_FRONTEND) $(SIDECAR_BACKEND) >/dev/null 2>&1 || true
	@echo "$(SIDECAR_FRONTEND) · $(SIDECAR_BACKEND) 제거됨"

## 6. 한 번에 — 전부 올리고, 전부 내린다
.PHONY: up-all down-all restart-all status nuke
up-all: ## ⭐ 전부 올린다: env 확인 → 이미지 빌드 → db·broker·migrate·frontend → smoke test까지
	@$(MAKE) --no-print-directory env-init
	@echo "▶ 이미지 빌드"; docker compose -f $(COMPOSE) build
	@echo "▶ 스택 기동"; docker compose -f $(COMPOSE) up -d --wait
	@echo "▶ 기동 확인"; for i in $$(seq 1 40); do \
		curl -sf $(BASE)/readyz >/dev/null && break || sleep 1; done
	@$(MAKE) --no-print-directory status
	@echo "▶ smoke test"; BASE="$(BASE)" bash scripts/smoke.sh

down-all: ## ⭐ 전부 내린다: 프로덕션 스택 · 개발 인프라 · 추가 인스턴스 · 로컬 개발 서버
	-@docker rm -f $(SIDECAR_FRONTEND) $(SIDECAR_BACKEND) 2>/dev/null || true
	-@docker compose -f $(COMPOSE) down --remove-orphans
	-@docker compose -f $(DEV_COMPOSE) down --remove-orphans
	@# 로컬 개발 서버(make dev)는 **여기서 종료하지 않는다.** 예전에는 패턴 매칭으로 잡았는데,
	@# 패턴이 명령줄 전체와 맞아떨어져 같은 문자열을 가진 **다른 터미널·다른 프로젝트의 프로세스까지**
	@# 함께 사라지는 사고가 났다. 개발 서버는 그것을 띄운 터미널에서 Ctrl-C로 끄는 것이 맞다.
	@# 여기서는 포트를 누가 잡고 있는지만 알려주고 판단은 사람에게 남긴다.
	@busy=$$(ss -ltnp 2>/dev/null | grep -E ":($(if $(PORT),$(PORT),3000)|$(if $(API_PORT),$(API_PORT),3001))\\b" || true); \
	if [ -n "$$busy" ]; then \
		echo ""; echo "  아직 포트를 쓰는 프로세스가 있습니다(로컬 make dev 로 보입니다):"; \
		echo "$$busy" | sed 's/^/    /'; \
		echo "  → 그 터미널에서 Ctrl-C 로 끄세요."; \
	fi
	@echo "전부 내려갔습니다(데이터 볼륨은 남아 있습니다 — 지우려면 make nuke)."

restart-all: down-all up-all ## 전부 내렸다가 다시 올린다

status: ## 지금 무엇이 떠 있나 — 컨테이너 · 포트 · 헬스
	@echo ""
	@docker compose -f $(COMPOSE) ps -a --format 'table {{.Service}}\t{{.State}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true
	@docker ps --filter name=$(SIDECAR_FRONTEND) --filter name=$(SIDECAR_BACKEND) --format 'table {{.Names}}\t{{.State}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null | tail -n +2
	@echo ""
	@# 경로가 둘인 이유: /healthz 는 web 자신, /api/healthz 는 프록시 건너편의 api다(ADR-010).
	@printf "  web  healthz  "; curl -sf -m 3 $(BASE)/healthz     || echo "(응답 없음)"
	@printf "\n  frontend readyz   "; curl -sf -m 3 $(BASE)/readyz      || echo "(응답 없음)"
	@printf "\n  backend  healthz  "; curl -sf -m 3 $(BASE)/api/healthz || echo "(응답 없음 — web이 api에 닿지 못함)"
	@printf "\n  backend  readyz   "; curl -sf -m 3 $(BASE)/api/readyz  || echo "(응답 없음)"
	@echo ""

nuke: ## 전부 내리고 **데이터 볼륨까지** 삭제(되돌릴 수 없음)
	-@docker rm -f $(SIDECAR_FRONTEND) $(SIDECAR_BACKEND) 2>/dev/null || true
	-@docker compose -f $(COMPOSE) down -v --remove-orphans
	-@docker compose -f $(DEV_COMPOSE) down -v --remove-orphans
	@echo "볼륨까지 삭제했습니다. 다음 기동 때 스키마가 새로 적용됩니다."

## 7. 묶음 — 자주 쓰는 순서를 한 줄로
.PHONY: bootstrap all clean
bootstrap: ## 처음 클론했을 때: 도구 확인 → .env → 설치 → 인프라 → 마이그레이션
	@$(MAKE) --no-print-directory doctor
	@$(MAKE) --no-print-directory env-init
	@# .env를 방금 만들었으므로 make를 **다시 부른다** — Makefile은 시작 시점에 .env를 한 번만 읽는다.
	@# 이 재호출이 없으면 첫 복제에서 DATABASE_URL이 빈 채로 migrate가 돌아 실패한다(첫 실행에서만 나는 버그).
	@$(MAKE) --no-print-directory install infra-up migrate
	@echo "준비 완료. make dev 로 개발 서버를 띄우세요."

all: up-all ## up-all의 별칭

clean: ## 빌드 산출물 삭제(frontend standalone · backend 바이너리)
	rm -rf frontend/.next backend/dist contracts/dist tsconfig.tsbuildinfo
