#!/usr/bin/env bash
# PreToolUse hook — Claude가 도구를 실행할 때마다 채널 세션을 'busy'로 갱신(activity_at heartbeat).
# 목적(①): presence(프로세스 생존)·busy(턴 시작)만으론 '살아있으나 도구를 안 돌리는 멈춤/행'을 구분 못 한다.
#   실제 도구 활동 시각을 서버에 남겨, 대시보드가 "busy인데 활동이 오래 멈춤 = 멈춤/응답대기"를 **정확히** 판정
#   (시간 기반 3분 타이머의 '돌아도 뜨는' 오탐 제거). 도구가 활발하면 activity_at이 계속 신선 → 긴 작업도 오탐 0.
# ★ 경량·비차단: 도구마다 실행되므로 python 회피(grep/sed 파싱) + 전송은 백그라운드 curl(도구 지연 0).
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
[ -n "$CFG" ] || exit 0
ENVF="$(find_up "$START" .ouroboros/env/.env 2>/dev/null || true)"

API="${PLM_API_URL:-}"; PROJECT="${PLM_PROJECT:-}"; TOKEN="${PLM_API_TOKEN:-}"
# 경량 JSON 파싱(파이썬 회피 — 도구마다 실행되므로 빠르게). api_url·project는 단순 문자열 필드.
[ -z "$API" ]     && API="$(grep -oE '"api_url"[[:space:]]*:[[:space:]]*"[^"]*"' "$CFG" 2>/dev/null | head -1 | sed -E 's/.*"api_url"[[:space:]]*:[[:space:]]*"//; s/"$//')"
[ -z "$PROJECT" ] && PROJECT="$(grep -oE '"project"[[:space:]]*:[[:space:]]*"[^"]*"' "$CFG" 2>/dev/null | head -1 | sed -E 's/.*"project"[[:space:]]*:[[:space:]]*"//; s/"$//')"
if [ -z "$TOKEN" ] && [ -n "$ENVF" ]; then
  TOKEN="$(grep -E '^\s*PLM_API_TOKEN\s*=' "$ENVF" 2>/dev/null | head -1 | sed -E 's/^[^=]*=\s*//; s/^["'"'"']//; s/["'"'"']\s*$//')"
fi
API="${API%/}"
[ -n "$API" ] && [ -n "$PROJECT" ] && [ -n "$TOKEN" ] || exit 0

# 비차단: 백그라운드 서브셸로 detach → 도구 실행을 지연시키지 않음(서버 지연·다운이어도 도구 안 느려짐).
( curl -s -m 3 -o /dev/null \
    -H "authorization: Bearer $TOKEN" \
    -H "content-type: application/json" \
    -H "user-agent: plm-hook/1.0" \
    -X POST "$API/channel/activity" -d "{\"project\":\"$PROJECT\",\"state\":\"busy\"}" >/dev/null 2>&1 & )
exit 0
