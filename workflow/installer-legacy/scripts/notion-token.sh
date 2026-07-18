#!/bin/bash
# notion-token.sh — Notion 변경감지 토큰(read-only) 발급 가이드 + .env 기입 (대화형).
# 하이브리드 sync: 이 토큰은 "변경 감지(읽기)" 전용. push/pull/provision 은 MCP(OAuth)가 수행.
# .env 의 다른 키(OUROBOROS_* 등)는 보존하고 NOTION_TOKEN·NOTION_ROOT_PAGE_URL 만 upsert.
set -euo pipefail

ENV_FILE="${1:-.ouroboros/env/.env}"
VER="2025-09-03"

echo ""
echo "=== Notion 변경감지 토큰 설정 (read-only) ==="
echo ""
echo "  1) https://www.notion.so 로그인"
echo "  2) https://www.notion.so/my-integrations → [New integration]"
echo "     - Type: Internal"
echo "     - Capabilities: ⚠️  'Read content' 만 체크 (Insert/Update 불필요 — 감지 전용)"
echo "     - 토큰(ntn_... 또는 secret_...) 복사"
echo "  3) 동기화할 root page 생성 → 우상단 ⋯ → Connections → 위 integration 공유"
echo "     (워크스페이스 전체 공유 금지 — 이 페이지 한 곳만)"
echo "  4) root page URL 복사"
echo ""

# --- 입력 ---
printf "NOTION_TOKEN (입력 숨김): "
read -rs token; echo ""
if [ -z "$token" ]; then echo "오류: 토큰은 필수입니다."; exit 1; fi
case "$token" in
  ntn_*|secret_*) ;;
  *) echo "  ⚠️  토큰이 ntn_/secret_ 로 시작하지 않습니다. 그대로 진행합니다." ;;
esac

printf "NOTION_ROOT_PAGE_URL: "
read -r rooturl
if ! echo "$rooturl" | grep -qiE 'notion\.(so|site)'; then
  echo "  ⚠️  notion URL 형식이 아닌 것 같습니다. 그대로 진행합니다."
fi

# --- 검증 (curl 있을 때, graceful) ---
if command -v curl >/dev/null 2>&1; then
  echo ""; echo "토큰 검증 중..."
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -H "Authorization: Bearer ${token}" -H "Notion-Version: ${VER}" \
    "https://api.notion.com/v1/users/me" 2>/dev/null || echo "000")
  case "$code" in
    200) echo "  ✅ 인증 성공 (200)";;
    401) echo "  ✗ 401 — 토큰이 유효하지 않습니다."; printf "그래도 저장할까요? (y/N) "; read -r yn; [ "${yn:-N}" = "y" ] || exit 1;;
    *)   echo "  ⚠️  검증 미완(HTTP ${code}) — 네트워크/버전 문제일 수 있어 저장은 진행합니다.";;
  esac
fi

# --- .env upsert (다른 키 보존) ---
mkdir -p "$(dirname "$ENV_FILE")"
if [ ! -f "$ENV_FILE" ]; then
  echo ""; echo "  ⚠️  $ENV_FILE 없음. Ouroboros 코어는 'make env' 로 먼저 만드는 것을 권장."
  printf "  Notion 키만 든 새 파일을 만들까요? (y/N) "; read -r yn
  [ "${yn:-N}" = "y" ] || { echo "취소됨."; exit 0; }
  : > "$ENV_FILE"
fi

upsert() { # key value file
  local k="$1" v="$2" f="$3"
  if grep -qE "^${k}=" "$f"; then
    local tmp; tmp="$(mktemp)"
    grep -vE "^${k}=" "$f" > "$tmp"; mv "$tmp" "$f"
  fi
  printf '%s=%s\n' "$k" "$v" >> "$f"
}

grep -qE '^# --- Notion ---' "$ENV_FILE" || printf '\n# --- Notion (변경감지 read-only 토큰) ---\n' >> "$ENV_FILE"
upsert NOTION_TOKEN "$token" "$ENV_FILE"
upsert NOTION_ROOT_PAGE_URL "$rooturl" "$ENV_FILE"
chmod 600 "$ENV_FILE" 2>/dev/null || true

echo ""
echo "=== 기입 완료: $ENV_FILE (권한 600) ==="
echo "  NOTION_TOKEN=$(echo "$token" | sed -E 's/(ntn_|secret_).*/\1***/')"
echo "  NOTION_ROOT_PAGE_URL=$rooturl"
echo ""
echo "다음: /notion-setup 으로 root page 아래 DB provision (MCP)."
