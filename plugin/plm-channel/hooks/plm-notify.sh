#!/usr/bin/env bash
# [비활성 — 2026-07] hooks.json에서 등록 해제됨. Notification은 세션 idle(정상)마다 발화해
# "⚠ 세션이 멈춰 있습니다" 알람을 스팸했고 에러처럼 보였다. 실제 블록 원인(AskUserQuestion)은
# no-ask.sh(PreToolUse)가 차단하고, 연결 상태는 대시보드 presence 지표('세션 미연결')가 표시한다.
# 파일은 보존(향후 순화된 안전망 필요 시 참고). 재활성하려면 hooks.json Notification에 다시 등록.
#
# Notification 훅 (안전망) — Claude Code가 사용자 입력을 기다리며 알림을 낼 때(터미널 대화형 질문·
# 권한 프롬프트·idle 대기 등), 그 사실을 PLM 대시보드 메신저에 kind="question"으로 표면화한다.
#
# 목적: 원격(채널) 구동 세션에서 Claude가 터미널에서 막혀버리면 사용자는 터미널을 열기 전까지
# 멈춘 사실조차 모른다 → 이 훅이 "터미널 입력 대기"를 메신저에 띄워 최소한 '인지'하게 한다.
# (정식 왕복은 message(kind="question")+턴종료 규칙이 담당 — 이 훅은 사고 대비 안전망.)
#
# self-contained(plm-hub 비의존): plm-channel 릴레이와 동일하게 .ouroboros를 CWD에서 위로 자동발견.
# graceful: 항상 exit 0. 설정/토큰 없으면 조용히 종료. Cloudflare 회피 위해 user-agent 명시.
set -uo pipefail

# stdin(JSON) 읽기 — Notification payload({session_id,message,hook_event_name,...}).
INPUT="$(cat 2>/dev/null || true)"

# .ouroboros 자동발견 (CWD → 위로 10단계). CLAUDE_PROJECT_DIR 우선.
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

# 알림 메시지 추출(있으면). message > 없으면 event 이름. jq 없으면 python/grep 폴백.
MSG=""
if command -v python3 >/dev/null 2>&1; then
  MSG="$(printf '%s' "$INPUT" | python3 -c "import sys,json
try:
    d=json.load(sys.stdin); print(d.get('message') or d.get('hook_event_name') or '')
except Exception: print('')" 2>/dev/null)"
fi
[ -n "$MSG" ] || MSG="입력 대기 중"

# 대시보드에 질문으로 표면화. direction=in → BE가 session=본인으로 강제(본인 스레드). 멱등 msg_id.
BODY="$(printf '⚠ 터미널에서 입력 대기 중\n%s\n\n(원격이라면 이 세션이 멈춰 있습니다. 터미널을 확인하거나, Claude에게 대시보드로 다시 질문하도록 하세요.)' "$MSG")"
MSG_ID="notify-$(date +%s)-$$"
# session은 direction=in이면 BE가 본인 user.id로 강제(무시) — 하지만 필드 자체는 필수(없으면 422).
PAYLOAD="$(PROJECT="$PROJECT" BODY="$BODY" MSG_ID="$MSG_ID" python3 -c "
import json,os
print(json.dumps({'project':os.environ['PROJECT'],'session':'terminal','direction':'in','kind':'question','body':os.environ['BODY'],'msg_id':os.environ['MSG_ID']}))" 2>/dev/null)"
[ -n "$PAYLOAD" ] || exit 0

curl -s -m 8 -o /dev/null \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -H "user-agent: plm-notify/0.1" \
  -X POST "$API/channel/message" -d "$PAYLOAD" 2>/dev/null || true
exit 0
