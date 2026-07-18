#!/usr/bin/env bash
# MCP 인증 헤더 생성기 — Claude Code .mcp.json 의 `headersHelper` 가 서버 커넥트 시 호출한다.
# .ouroboros/env/.env 의 정적 토큰을 읽어 Bearer 인증 헤더(JSON)를 stdout 으로 출력한다.
#
# 목적: 헤드리스/채널 세션(브라우저 없음 → OAuth loopback 불가)에서도 plm·ouroboros MCP 인증.
#   .mcp.json 의 ${VAR} 확장은 "실행 셸의 프로세스 env" 만 참조하고 .env 를 자동 로드하지 않는다.
#   이 스크립트는 .env 를 직접 읽으므로 claude 실행 방법(셸 export 여부)과 무관하게 동작한다.
#
# 사용(.mcp.json):
#   "headersHelper": "bash .ouroboros/env/mcp-auth.sh plm"
#   "headersHelper": "bash .ouroboros/env/mcp-auth.sh ouro"
#
# 인자: plm | ouro — 어느 서버용 토큰을 낼지.
#   plm  → PLM_API_TOKEN   (/plm-hub:link 가 자동 발급·기입)
#   ouro → OURO_MCP_TOKEN  (ouro 서버 env 와 동일한 정적 공유 토큰. 배포 운영자가 배부)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ENV_FILE="$HERE/.env"
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }

case "${1:-}" in
  plm)  TOKEN="${PLM_API_TOKEN:-}" ;;
  ouro) TOKEN="${OURO_MCP_TOKEN:-}" ;;
  *)    TOKEN="" ;;
esac

# 토큰이 없으면 빈 객체(헤더 없음) — 서버가 401 로 명확히 실패하게 두어 조용한 오작동을 막는다.
# (해결: .env 에 해당 토큰을 채운다. plm 은 /plm-hub:link, ouro 는 OURO_MCP_TOKEN 설정.)
if [ -z "$TOKEN" ]; then
  printf '{}'
else
  printf '{"Authorization":"Bearer %s"}' "$TOKEN"
fi
