#!/usr/bin/env bash
# Stop hook — Claude Code 턴 종료 시 채널 세션을 'idle'로 표시.
# 목적(①): API 오류 등으로 Claude가 살아있는 채 응답 없이 턴이 끝나면, presence(프로세스 생존)만으론
#   "처리 중"이 계속 떠 사용자가 오인한다. 턴이 끝났다는 사실을 서버에 알려 대시보드가 "응답 없이 종료"를 인지하게 한다.
#   (릴레이가 메시지 주입 시 busy로 설정 → 이 훅이 턴 종료 시 idle로. 정상 응답이면 답장 메시지로 이미 '처리 중'이 해제됨.)
# self-contained(plm-hub 비의존): .ouroboros를 CWD에서 위로 자동발견. graceful: 항상 exit 0.
set -uo pipefail

cat >/dev/null 2>&1 || true  # stdin(JSON payload) 소비 — 사용 안 함.

find_up() {  # $1=시작dir $2=상대경로
  local dir="$1" i
  for i in $(seq 1 10); do
    [ -e "$dir/$2" ] && { echo "$dir/$2"; return 0; }
    local up; up="$(dirname "$dir")"; [ "$up" = "$dir" ] && break; dir="$up"
  done
  return 1
}
START="${CLAUDE_PROJECT_DIR:-$PWD}"
CFG="$(find_up "$START" .ouroboros/config/plm.json 2>/dev/null || true)"
ENVF="$(find_up "$START" .ouroboros/env/.env 2>/dev/null || true)"
[ -n "$CFG" ] || exit 0

API="${PLM_API_URL:-}"; PROJECT="${PLM_PROJECT:-}"; TOKEN="${PLM_API_TOKEN:-}"
if command -v python3 >/dev/null 2>&1; then
  [ -z "$API" ]     && API="$(python3 -c "import json;print(json.load(open('$CFG')).get('api_url',''))" 2>/dev/null)"
  [ -z "$PROJECT" ] && PROJECT="$(python3 -c "import json;print(json.load(open('$CFG')).get('project',''))" 2>/dev/null)"
fi
if [ -z "$TOKEN" ] && [ -n "$ENVF" ]; then
  TOKEN="$(grep -E '^\s*PLM_API_TOKEN\s*=' "$ENVF" 2>/dev/null | head -1 | sed -E 's/^[^=]*=\s*//; s/^["'"'"']//; s/["'"'"']\s*$//')"
fi
API="${API%/}"
[ -n "$API" ] && [ -n "$PROJECT" ] && [ -n "$TOKEN" ] || exit 0

curl -s -m 5 -o /dev/null \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -H "user-agent: plm-hook/1.0" \
  -X POST "$API/channel/activity" -d "{\"project\":\"$PROJECT\",\"state\":\"idle\"}" 2>/dev/null || true
exit 0
