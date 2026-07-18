#!/usr/bin/env bash
# profiles.sh — 배포 환경 프로파일 (setup.sh·update.sh가 source).
#
# 목적: jwk / jungmin 등 여러 배포가 URL·백엔드를 섞지 않도록, PLM_ENV 하나로 전 엔드포인트를
#   원자적으로 선택한다. 플러그인(스킬·훅)은 환경 무관 공유이고, 차이는 오직 이 URL 세트다.
#
# 사용:  PLM_ENV=<jwk|jungmin|custom>
#   - jwk     : jwk-*.shoi.ch (k0s 격리 생태계)
#   - jungmin : *.jungmin.kim (h2500-4 docker)
#   - custom  : 각 URL 을 개별 env(OURO_MCP_URL/PLM_MCP_URL/PLM_API_URL/OUROBOROS_URL)로 지정
#
# resolve_profile <env> → PROFILE_* 변수 채움(성공 0, 미지정/미지원 1).
# apply_profile <root> <ouro_dir> → .mcp.json / .env / config 에 원자적 반영 + PLM_ENV 핀.

resolve_profile(){
  PROFILE_ENV_NAME="${1:-}"
  case "$PROFILE_ENV_NAME" in
    jwk)
      PROFILE_OURO_MCP_URL="https://jwk-ouro.shoi.ch/mcp"
      PROFILE_PLM_MCP_URL="https://jwk-plm.shoi.ch/mcp"
      PROFILE_PLM_API_URL="https://jwk-plm.shoi.ch"
      PROFILE_PLM_DASH_URL="https://jwk-plm-dash.shoi.ch"
      PROFILE_OUROBOROS_URL="https://jwk-ouro.shoi.ch"
      PROFILE_MP="jwk-platform"
      ;;
    jungmin)
      PROFILE_OURO_MCP_URL="https://ouro.jungmin.kim/mcp"
      PROFILE_PLM_MCP_URL="https://plm.jungmin.kim/mcp"
      PROFILE_PLM_API_URL="https://plm.jungmin.kim"
      PROFILE_PLM_DASH_URL="https://plm-dash.jungmin.kim"
      PROFILE_OUROBOROS_URL="https://ouro.jungmin.kim"
      PROFILE_MP="jwk-platform"
      ;;
    custom)
      # 개별 env 로 지정(미지정 시 빈 값 → setup 이 프롬프트로 채움). PLM_DASH_URL 미지정 시 PLM_API_URL 의 plm.→plm-dash. 로 유도.
      PROFILE_OURO_MCP_URL="${OURO_MCP_URL:-}"
      PROFILE_PLM_MCP_URL="${PLM_MCP_URL:-}"
      PROFILE_PLM_API_URL="${PLM_API_URL:-}"
      PROFILE_PLM_DASH_URL="${PLM_DASH_URL:-$(printf '%s' "${PLM_API_URL:-}" | sed 's|plm\.|plm-dash.|')}"
      PROFILE_OUROBOROS_URL="${OUROBOROS_URL:-}"
      PROFILE_MP="${MP:-jwk-platform}"
      ;;
    *)
      return 1
      ;;
  esac
  return 0
}

profile_list(){ echo "jwk jungmin custom"; }

# .env 에 key=value 를 멱등 반영(있으면 치환, 없으면 추가). URL 안전 위해 sed 구분자 | 사용.
set_env_kv(){
  local f="$1" k="$2" v="$3" tmp
  [ -f "$f" ] || touch "$f"
  if grep -qE "^${k}=" "$f" 2>/dev/null; then
    tmp="$(mktemp)"; sed "s|^${k}=.*|${k}=${v}|" "$f" > "$tmp" && mv "$tmp" "$f"
  else
    printf '%s=%s\n' "$k" "$v" >> "$f"
  fi
}

# 해석된 PROFILE_* 를 프로젝트에 반영. .mcp.json default 를 프로파일 URL 로 박아 런타임 env 없이도
# 올바른 백엔드로 연결(= 섞임 방지). 사용자 데이터(.env 토큰·PROJECT_ID 등)는 치환된 키 외 보존.
apply_profile(){
  local root="$1" ouro="$2"
  # 1) .mcp.json — 프로파일 URL 을 ${VAR:-default} 의 default 로. (env override 도 여전히 가능)
  #    인증 = headersHelper(정적 토큰) — 헤드리스/채널 세션(브라우저 없음)에서도 OAuth loopback 없이
  #    붙는다. mcp-auth.sh 가 .ouroboros/env/.env 의 PLM_API_TOKEN·OURO_MCP_TOKEN 을 커넥트 시 읽어
  #    Bearer 헤더 생성(셸 export 불필요). 대화형에서 OAuth 를 쓰려면 이 블록을 oauth 로 되돌린다.
  if [ -n "${PROFILE_OURO_MCP_URL:-}" ] && [ -n "${PROFILE_PLM_MCP_URL:-}" ]; then
    cat > "$root/.mcp.json" <<EOF
{
  "mcpServers": {
    "ouroboros": {
      "type": "http",
      "url": "\${OURO_MCP_URL:-$PROFILE_OURO_MCP_URL}",
      "headersHelper": "bash .ouroboros/env/mcp-auth.sh ouro"
    },
    "plm": {
      "type": "http",
      "url": "\${PLM_MCP_URL:-$PROFILE_PLM_MCP_URL}",
      "headersHelper": "bash .ouroboros/env/mcp-auth.sh plm"
    }
  }
}
EOF
  fi
  # 2) .env — 환경 핀 + 백엔드 URL(hook 이 읽음).
  local envf="$ouro/env/.env"; mkdir -p "$ouro/env"
  set_env_kv "$envf" PLM_ENV "$PROFILE_ENV_NAME"
  [ -n "${PROFILE_OUROBOROS_URL:-}" ] && set_env_kv "$envf" OUROBOROS_URL "$PROFILE_OUROBOROS_URL"
  [ -n "${PROFILE_PLM_API_URL:-}" ]  && set_env_kv "$envf" PLM_API_URL  "$PROFILE_PLM_API_URL"
  [ -n "${PROFILE_PLM_DASH_URL:-}" ] && set_env_kv "$envf" PLM_DASH_URL "$PROFILE_PLM_DASH_URL"  # CLI 미디어 업로드(plm_upload.py → 대시보드 /api/upload)
  # 3) config/plm.json api_url (바인딩 존재 시만 — 환경 전환에도 프로젝트 slug 는 보존).
  local pj="$ouro/config/plm.json"
  if [ -f "$pj" ] && [ -n "${PROFILE_PLM_API_URL:-}" ] && command -v python3 >/dev/null 2>&1; then
    python3 - "$pj" "$PROFILE_PLM_API_URL" <<'PY'
import json,sys
p,url=sys.argv[1],sys.argv[2]
try:
    d=json.load(open(p)); d["api_url"]=url
    json.dump(d,open(p,"w"),ensure_ascii=False,indent=2)
except Exception:
    pass
PY
  fi
}
