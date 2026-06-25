#!/bin/bash
# common.sh -- Hook 공통 유틸리티
# macOS bash 3.2 호환 (nameref 미사용)

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
PROJECT_NAME="$(basename "$PROJECT_DIR")"
STATE_JSON="$PROJECT_DIR/.ouroboros/context/state.json"
CURRENT_MD="$PROJECT_DIR/.ouroboros/context/current.md"
CONFIG_DIR="$PROJECT_DIR/.ouroboros/config"

# --- 디버그 로깅 지원 ---

HOOK_DEBUG="${CLAUDE_HOOK_DEBUG:-0}"
HOOK_DEBUG_LOG="/tmp/.claude-hook-debug.log"
HOOK_DEBUG_MAX_LINES=2000

# 디버그 로그 출력 함수
debug_log() {
  if [ "$HOOK_DEBUG" = "1" ]; then
    local caller="${BASH_SOURCE[1]:-unknown}"
    local caller_name=$(basename "$caller" .sh)
    local timestamp=$(date -u +"%H:%M:%S.%3N" 2>/dev/null || date +"%H:%M:%S")
    echo "[$timestamp] [$caller_name] $*" >> "$HOOK_DEBUG_LOG" 2>/dev/null || true

    # 로그 로테이션
    if [ -f "$HOOK_DEBUG_LOG" ]; then
      local line_count=$(wc -l < "$HOOK_DEBUG_LOG" 2>/dev/null || echo "0")
      if [ "$line_count" -gt "$HOOK_DEBUG_MAX_LINES" ]; then
        tail -n $((HOOK_DEBUG_MAX_LINES / 2)) "$HOOK_DEBUG_LOG" > "${HOOK_DEBUG_LOG}.tmp" \
          && mv "${HOOK_DEBUG_LOG}.tmp" "$HOOK_DEBUG_LOG" 2>/dev/null || true
      fi
    fi
  fi
}

# 디버그 모드에서 stdin 내용 로깅
debug_stdin() {
  if [ "$HOOK_DEBUG" = "1" ]; then
    debug_log "stdin (${#1} bytes): ${1:0:500}"
  fi
}

# 디버그 모드에서 환경변수 로깅
debug_env() {
  if [ "$HOOK_DEBUG" = "1" ]; then
    debug_log "env: PROJECT_DIR=$PROJECT_DIR"
    debug_log "env: CLAUDE_TOOL_INPUT_FILE_PATH=${CLAUDE_TOOL_INPUT_FILE_PATH:-<unset>}"
    debug_log "env: CLAUDE_TOOL_INPUT_COMMAND=${CLAUDE_TOOL_INPUT_COMMAND:-<unset>}"
  fi
}

# --- jq 유틸리티 ---

# jq 존재 확인
has_jq() {
  command -v jq >/dev/null 2>&1
}

# state.json에서 스칼라 값 읽기
# Usage: VALUE=$(read_state '.active_skill')
read_state() {
  local jq_path="$1"
  if [ -f "$STATE_JSON" ] && has_jq; then
    jq -r "${jq_path} // empty" "$STATE_JSON" 2>/dev/null || echo ""
  fi
}

# state.json에서 배열 읽기 -> stdout (줄 단위)
# Usage: read_state_lines '.active_files[]'
# nameref 대신 stdout 파이프로 전달
read_state_lines() {
  local jq_path="$1"
  if [ -f "$STATE_JSON" ] && has_jq; then
    jq -r "${jq_path} // empty" "$STATE_JSON" 2>/dev/null || true
  fi
}

# state.json tasks 맵에서 첫 번째 task의 필드 읽기
# Usage: GRADE=$(read_first_task '.grade')
read_first_task() {
  local field="$1"
  if [ -f "$STATE_JSON" ] && has_jq; then
    jq -r "(.tasks | to_entries | first // {value:{}}).value${field} // empty" "$STATE_JSON" 2>/dev/null || echo ""
  fi
}

# current.md에서 섹션 추출 (HTML 마커 우선, 헤더 fallback)
# Usage: CONTENT=$(read_current_section "ACTIVE_TASK" "활성 작업")
read_current_section() {
  local marker_name="$1"
  local fallback_header="$2"
  [ -f "$CURRENT_MD" ] || return 0
  local content
  content=$(awk "/^<!-- ${marker_name}_START -->/{found=1; next} /^<!-- ${marker_name}_END -->/{found=0} found" "$CURRENT_MD" 2>/dev/null || echo "")
  if [ -z "$content" ] && [ -n "$fallback_header" ]; then
    content=$(awk "/^## (${fallback_header})/{found=1; next} /^## /{found=0} found" "$CURRENT_MD" 2>/dev/null || echo "")
  fi
  echo "$content"
}

# JSON 문자열 이스케이핑 (파일 경로 등에 특수문자 대응)
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="$(echo "$s" | tr '\n' ' ' | sed 's/[[:space:]]*$//')"
  echo "$s"
}

# .env 파일 로드 (존재 시)
load_env() {
  local env_file="$PROJECT_DIR/.ouroboros/env/.env"
  if [ -f "$env_file" ]; then
    set -a
    . "$env_file" 2>/dev/null || true
    set +a
  fi
}
