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
  penpot)
    # penpot MCP(oauth2-proxy 게이트) — Keycloak client-credentials로 매 호출 fresh 토큰(만료 대응).
    # 게이트가 Bearer JWT(aud=penpot-mcp)를 검증. secret은 .env(PENPOT_MCP_CLIENT_SECRET).
    ISS="${PENPOT_MCP_ISSUER:-https://jwk-auth.shoi.ch/realms/ouroboros}"
    CID="${PENPOT_MCP_CLIENT_ID:-penpot-mcp}"
    if [ -n "${PENPOT_MCP_CLIENT_SECRET:-}" ] && command -v curl >/dev/null 2>&1; then
      TOKEN="$(curl -fsS -m 6 -d "client_id=$CID&client_secret=$PENPOT_MCP_CLIENT_SECRET&grant_type=client_credentials" \
        "$ISS/protocol/openid-connect/token" 2>/dev/null \
        | sed -n 's/.*"access_token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' || true)"
    fi
    ;;
  *)    TOKEN="" ;;
esac

# ouro 토큰 self-heal — "인증하면 없다가도 생기게": OURO_MCP_TOKEN 이 없고 PLM 인증(PLM_API_TOKEN)이
# 있으면, PLM 의 /ouro-token 에서 대행 발급받아 .env 에 자동 기입한다(다음부터는 로컬 값 사용).
# 실패(구서버·미설정 배포·네트워크)해도 조용히 기존 흐름(빈 헤더 → 401)으로 폴백.
if [ "${1:-}" = "ouro" ] && [ -z "$TOKEN" ] && [ -n "${PLM_API_TOKEN:-}" ] && command -v curl >/dev/null 2>&1; then
  CFG="$HERE/../config/plm.json"
  API=""
  if [ -f "$CFG" ] && command -v python3 >/dev/null 2>&1; then
    API="$(python3 -c "import json;print(json.load(open('$CFG')).get('api_url',''))" 2>/dev/null || true)"
  fi
  API="${API%/}"
  if [ -n "$API" ]; then
    NEW="$(curl -fsS -m 6 -H "authorization: Bearer $PLM_API_TOKEN" -H "user-agent: mcp-auth/1.0" \
      "$API/ouro-token" 2>/dev/null | sed -n 's/.*"token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' || true)"
    if [ -n "$NEW" ]; then
      TOKEN="$NEW"
      printf 'OURO_MCP_TOKEN=%s\n' "$NEW" >> "$ENV_FILE" 2>/dev/null || true
    fi
  fi
fi

# 토큰이 없으면 빈 객체(헤더 없음) — 서버가 401 로 명확히 실패하게 두어 조용한 오작동을 막는다.
# (해결: plm 은 /plm-hub:link. ouro 는 위 self-heal 이 자동 처리 — PLM 인증만 돼 있으면 된다.)
if [ -z "$TOKEN" ]; then
  printf '{}'
else
  printf '{"Authorization":"Bearer %s"}' "$TOKEN"
fi
