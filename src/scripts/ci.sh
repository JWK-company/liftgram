#!/usr/bin/env bash
# @plm SRS-009  플랫폼 중립 CI — 어떤 러너에서도 이 한 줄이면 같은 검증이 돈다
# 사용: bash scripts/ci.sh  (GitHub Actions·GitLab CI·Jenkins 어디서든 동일)
set -euo pipefail
step(){ echo; echo "▶ $1"; }

# .env가 있으면 읽는다 — 이미 설정된 환경변수(CI가 넘긴 값)가 우선이다.
if [ -f .env ]; then set -a; . <(grep -vE '^\s*#' .env | grep -E '^[A-Z0-9_]+='); set +a; fi
: "${DATABASE_URL:?DATABASE_URL 필요 — .env를 만들거나(make env-init) 환경변수로 넘기세요}"
# 이미지·네트워크 이름은 프로젝트(디렉터리) 이름에서 파생한다 — 복제해서 이름을 바꿔도 따라온다.
PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}"
export COMPOSE_PROJECT_NAME="$PROJECT"
# 실행 단위가 둘이라 이미지도 둘이다(ADR-010).
IMG_FRONTEND="${IMG_FRONTEND:-$PROJECT-frontend}"
IMG_BACKEND="${IMG_BACKEND:-$PROJECT-backend}"
BASE="${BASE:-http://127.0.0.1:${WEB_PORT:-3000}}"

# CI는 환경을 **소유한다** — 이전 실행의 잔재가 남아 있으면 테스트가 흔들린다.
# (실제로 사이드카가 남은 채 e2e가 돌아 SSE 테스트가 간헐 실패한 적이 있다)
step "0/9 이전 실행 정리"
docker rm -f "$PROJECT-web-2" "$PROJECT-api-2" >/dev/null 2>&1 || true
docker compose -f compose.yaml down --remove-orphans >/dev/null 2>&1 || true
docker compose -f compose.dev.yaml down --remove-orphans >/dev/null 2>&1 || true
echo "  정리 완료"

step "1/9 의존 설치"
bun install --frozen-lockfile

step "2/9 정적 검사 (lint) + 계약 생성물 최신 여부"
bun run lint
# 계약이 바뀌었는데 생성물을 커밋하지 않으면 여기서 걸린다(frontend·backend가 조용히 어긋나는 것을 막는다).
if command -v buf >/dev/null 2>&1; then
  buf lint
  buf generate
  git diff --quiet -- backend/gen contracts/gen \
    || { echo "  ✗ 계약 생성물이 proto와 다릅니다 — make proto 후 커밋하세요"; exit 1; }
  echo "  계약 생성물 최신"
else
  echo "  (buf 없음 — 계약 검사 건너뜀)"
fi

step "3/9 타입 검사 + 문서 드리프트"
bun run typecheck
node scripts/check-docs.mjs

step "4/9 유닛 테스트 (DB 불필요 · Go)"
bun run test

step "5/9 인프라 기동 + 마이그레이션 (idempotency 확인 — 2회 실행)"
docker compose -f compose.dev.yaml up -d --wait
(cd backend && go run ./cmd/migrate)
(cd backend && go run ./cmd/migrate)

step "6/9 프로덕션 이미지 빌드 + runtime contract 검증 (frontend·backend 두 이미지)"
# **전 서비스**를 빌드한다. migrate도 api와 같은 target을 쓰지만 compose는 별도 이미지로 관리하므로,
# frontend·backend만 빌드하면 migrate가 옛 이미지로 남아 조용히 실패한다(실측).
docker compose build
IMG="$IMG_FRONTEND" UNIT=frontend bash scripts/check-contract.sh
IMG="$IMG_BACKEND" UNIT=backend bash scripts/check-contract.sh

step "6.5/9 첫 복제 경험 — 문서의 퀵스타트가 처음 받는 사람에게 도는가"
bash scripts/check-firstrun.sh

step "6.7/9 스캐폴더 — 만든 저장소가 검증·빌드를 통과하는가"
bash scripts/check-scaffold.sh scaffold-probe
BARE=1 bash scripts/check-scaffold.sh scaffold-bare

step "7/9 제너레이터 — 생성물이 타입·테스트를 통과하는가"
bash scripts/check-generator.sh probe

step "8/9 smoke test + e2e"
# 브라우저 한 세션이 만드는 요청은 생각보다 많다(델타마다 목록을 다시 읽는다).
# 기본 한도(120/분)로 e2e를 돌리면 **테스트가 자기 자신을 막아** 간헐 실패한다(실측: 429 54건).
# 그래서 이 단계는 넉넉한 한도로 띄우고, 제한 자체의 검증은 9단계에서 낮은 한도로 따로 한다.
RATE_LIMIT=2000 docker compose up -d --wait frontend backend
BASE="$BASE" bash scripts/smoke.sh

# 브라우저가 설치돼 있으면 e2e까지. 없으면 건너뛴다(러너에 브라우저를 강요하지 않는다).
if bunx playwright --version >/dev/null 2>&1 && [ -d "${HOME}/.cache/ms-playwright" ]; then
  # 교차 propagation 테스트를 켜려면 두 번째 인스턴스가 필요하다 — CI가 직접 띄우고 직접 내린다.
  # 실패를 삼키지 않는다: 포트가 이미 쓰이면 조용히 넘어가는 대신 이유를 말한다.
  if make --no-print-directory scale-2; then
    for _ in $(seq 1 30); do curl -sf "http://127.0.0.1:${BASE2_PORT:-3002}/healthz" >/dev/null 2>&1 && break; sleep 1; done
  else
    echo "  ⚠ 두 번째 인스턴스를 띄우지 못했습니다(포트 점유?) — 교차 propagation 테스트는 건너뜁니다"
  fi
  set +e
  # 설정 경로를 명시한다 — 루트에는 playwright 설정이 없어서, 생략하면 저장소 전체를 뒤지다가
  # api의 유닛 테스트(bun:test)까지 집어삼켜 "Cannot find module 'bun:test'"로 죽는다(실측).
  BASE="$BASE" bunx playwright test -c frontend/playwright.config.ts
  e2e_rc=$?
  set -e
  make --no-print-directory unscale >/dev/null 2>&1 || true
  [ $e2e_rc -eq 0 ] || { docker compose down; exit $e2e_rc; }
else
  echo "  (e2e 건너뜀 — bunx playwright install chromium 으로 활성화)"
fi

# rate limit 검사는 **맨 마지막**에 둔다 — 한도를 일부러 소진시키므로 다른 검사와 섞이면 서로 방해한다
# (실제로 e2e가 429를 받아 실패했다). 뒤에 아무것도 없으니 남은 카운터를 정리할 필요도 없다.
step "9/9 rate limit — 실제로 막는가"
# 낮은 한도로 api만 다시 띄운다 — 2000번 두드리는 대신 20번으로 같은 것을 확인한다.
RATE_LIMIT=20 docker compose up -d --force-recreate --wait backend
node scripts/check-ratelimit.mjs "$BASE"

docker compose down

echo; echo "CI 전 단계 통과"
