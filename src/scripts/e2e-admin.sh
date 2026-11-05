#!/usr/bin/env bash
# 운영 웹 e2e 전 과정(SPEC-033) — 새 DB · 백엔드 · 운영 빌드 · 시험 · 정리까지 한 번에.
#
#   E2E_PG=postgres://app:app@127.0.0.1:55450 bash scripts/e2e-admin.sh [playwright 인자]
#
# 포트: 웹 3320 · API 3321 · Access 시험 키 3322 · 입구 설정 빈 서버 3323 · 가짜 백엔드 3324 · 그 앞 웹 3325(TRUST=1) · 3326(TRUST=0).
# dev 3100 은 건드리지 않는다. 포트가 쓰이고 있으면 멈춘다(프로세스를 죽이지 않는다).
# E2E_PG 는 localhost 만 받는다. 시험이 관리자 계정을 만들기 때문이다.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${E2E_PG:?E2E_PG 가 필요하다(예: postgres://app:app@127.0.0.1:5434)}"
case "$E2E_PG" in *@127.0.0.1:*|*@localhost:*) ;; *) echo "!! E2E_PG 는 로컬 주소만 받는다"; exit 1 ;; esac
for p in 3320 3321 3322 3323 3324 3325 3326; do
  if lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1; then echo "!! 포트 $p 사용 중"; exit 1; fi
done

DB="e2e_admin_$(date +%s)"
WORK=$(mktemp -d)
PIDS=()
cleanup() {
  rc=$?
  # 실패 원인을 지우기 전에 남긴다.
  [ "$rc" = 0 ] || { echo "── 서버 로그 끝부분 ──"; tail -n 20 "$WORK/api.log" "$WORK/admin.log" 2>/dev/null || true; }
  for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done
  sleep 0.5
  psql "$E2E_PG/postgres" -qc "drop database if exists $DB with (force)" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

psql "$E2E_PG/postgres" -qc "create database $DB"
export DATABASE_URL="$E2E_PG/$DB?sslmode=disable" E2E_PSQL_URL="$E2E_PG/$DB"
export JWT_SECRET=0123456789abcdef0123456789abcdef0123456789abcdef
export REALTIME_BUS=memory RATE_LIMIT=100000 AUTH_RATE_LIMIT=0 MAIL_TRANSPORT=console MAIL_REQUIRE_TLS=false
export MEDIA_DIR="$WORK/media" API_PORT=3321 REDIS_URL=redis://127.0.0.1:1 STATS_CACHE_SEC=0 USAGE_JOB_INTERVAL_SEC=2 OPS_ALERT_MAIL_INTERVAL_SEC=0
export APP_URL=http://127.0.0.1:3320

(cd backend && go run ./cmd/migrate >/dev/null && go build -o "$WORK/server" ./cmd/server)
"$WORK/server" >"$WORK/api.log" 2>&1 </dev/null &
PIDS+=($!)

bun run --cwd admin build >"$WORK/build.log" 2>&1 || { tail -30 "$WORK/build.log"; exit 1; }
cp -R admin/.next/static admin/.next/standalone/admin/.next/static

node admin/e2e/access-fixture.mjs >/dev/null 2>&1 </dev/null & PIDS+=($!)
node admin/e2e/stub-backend.mjs >/dev/null 2>&1 </dev/null & PIDS+=($!)

ACCESS="CF_ACCESS_AUD=e2e-aud CF_ACCESS_TEAM_DOMAIN=e2e.cloudflareaccess.com CF_ACCESS_CERTS_URL=http://127.0.0.1:3322/certs"
web() { # 포트 API 로그파일 나머지환경…
  local port=$1 api=$2 log=$3; shift 3
  # exec: 하위 셸이 아니라 서버 자체의 PID 를 남겨 정리 때 함께 끝낸다.
  (cd admin/.next/standalone/admin && exec env HOSTNAME=127.0.0.1 PORT="$port" NODE_ENV=production API_URL="$api" \
    ADMIN_URL="http://localhost:$port" APP_URL=http://127.0.0.1:3320 "$@" node server.js >"$log" 2>&1 </dev/null) &
  PIDS+=($!)
}
export ADMIN_LOG="$WORK/admin.log"
# shellcheck disable=SC2086
web 3320 http://127.0.0.1:3321 "$ADMIN_LOG" TRUST_CF_CONNECTING_IP=1 $ACCESS
web 3323 http://127.0.0.1:3321 "$WORK/closed.log" TRUST_CF_CONNECTING_IP=1
# shellcheck disable=SC2086
web 3325 http://127.0.0.1:3324 "$WORK/stub1.log" TRUST_CF_CONNECTING_IP=1 $ACCESS
# shellcheck disable=SC2086
web 3326 http://127.0.0.1:3324 "$WORK/stub0.log" TRUST_CF_CONNECTING_IP=0 $ACCESS

for i in $(seq 1 40); do
  curl -sf -m 2 http://127.0.0.1:3320/readyz >/dev/null && curl -sf -m 2 http://127.0.0.1:3326/healthz >/dev/null && break
  [ "$i" = 40 ] && { echo "!! 기동 실패"; tail -5 "$WORK/api.log" "$ADMIN_LOG"; exit 1; }
  sleep 1
done

case " $* " in *" --workers"*|*" -j"*) echo "!! 시험들이 한 DB 를 함께 지우므로 동시 실행을 받지 않는다"; exit 1 ;; esac
BASE=http://localhost:3320 API=http://127.0.0.1:3321 bunx playwright test -c admin/playwright.config.ts "$@"
