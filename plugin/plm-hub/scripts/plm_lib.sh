#!/usr/bin/env bash
# PLM 통합 공통 — 설정 해석(프로젝트·API·토큰). source 해서 사용.
# 우선순위: 환경변수 > .ouroboros/env/.env > .ouroboros/config/plm.json > 기본값.
# 비밀(토큰)은 .ouroboros/env/.env(gitignore). 프로젝트 바인딩은 config/plm.json(비밀 아님).

# 주어진 경로에서 상향 탐색해 가장 가까운 .ouroboros 워크스페이스 루트 반환(중첩 지원).
_plm_find_root() {
  local d="$1"
  # 존재하는 디렉토리가 될 때까지 부모로 상향(파일·미존재 중첩 새 경로 대응).
  while [[ -n "$d" && "$d" != "/" && ! -d "$d" ]]; do d="$(dirname "$d")"; done
  d="$(cd "$d" 2>/dev/null && pwd)" || return 1
  while [[ -n "$d" && "$d" != "/" ]]; do
    [[ -f "$d/.ouroboros/config/plm.json" || -d "$d/.ouroboros" ]] && { echo "$d"; return 0; }
    d="$(dirname "$d")"
  done
  return 1
}

# plm_resolve [편집파일경로] — 경로 주어지면 그 위치에서 상향 탐색한 워크스페이스를 우선(중첩 프로젝트 정확 라우팅).
plm_resolve() {
  local proj_dir="${CLAUDE_PROJECT_DIR:-.}"
  if [[ -n "${1:-}" ]]; then
    local found; found="$(_plm_find_root "$1" 2>/dev/null)"
    [[ -n "$found" ]] && proj_dir="$found"
  fi
  local env_file="$proj_dir/.ouroboros/env/.env"
  local cfg_file="$proj_dir/.ouroboros/config/plm.json"

  # .env 로드 (PLM_* 만)
  if [[ -f "$env_file" ]]; then
    # shellcheck disable=SC2046
    set -a; . <(grep -E '^PLM_(API_URL|API_TOKEN|PROJECT|ENABLED|CODE_ROOT|BRANCH)=' "$env_file" 2>/dev/null) 2>/dev/null; set +a
  fi
  # config/plm.json 에서 project/api_url/code_root 보강 (env 미설정 시)
  if [[ -f "$cfg_file" ]] && command -v python3 >/dev/null 2>&1; then
    [[ -z "${PLM_PROJECT:-}" ]] && PLM_PROJECT="$(python3 -c "import json,sys;print(json.load(open('$cfg_file')).get('project',''))" 2>/dev/null)"
    [[ -z "${PLM_API_URL:-}" ]] && PLM_API_URL="$(python3 -c "import json,sys;print(json.load(open('$cfg_file')).get('api_url',''))" 2>/dev/null)"
    [[ -z "${PLM_CODE_ROOT:-}" ]] && PLM_CODE_ROOT="$(python3 -c "import json,sys;print(json.load(open('$cfg_file')).get('code_root',''))" 2>/dev/null)"
  fi
  export PLM_API_URL="${PLM_API_URL:-https://jwk-plm.shoi.ch}"
  # 토큰 기본값 없음(공개 백도어 토큰 제거 — platform-build 보안). .env의 PLM_API_TOKEN 필수.
  export PLM_API_TOKEN="${PLM_API_TOKEN:-}"
  export PLM_PROJECT="${PLM_PROJECT:-}"
  export PLM_ENABLED="${PLM_ENABLED:-1}"
  # 코드 스캔 루트 — command·hook 키 일관성. 상대경로면 프로젝트 기준.
  if [[ -n "${PLM_CODE_ROOT:-}" && "${PLM_CODE_ROOT:0:1}" != "/" ]]; then
    PLM_CODE_ROOT="$proj_dir/$PLM_CODE_ROOT"
  fi
  export PLM_CODE_ROOT="${PLM_CODE_ROOT:-$proj_dir}"
}

# PostToolUse hook 입력에서 변경 파일 경로 추출 (platform-build A2 — ADR-005).
# 현행 Claude Code는 stdin JSON(.tool_input.file_path)으로 전달, 구버전은 CLAUDE_TOOL_INPUT_FILE_PATH env.
# env 미주입 시 hook이 발화하지 않던 결함을 stdin 파싱으로 복원.
plm_hook_changed() {
  local f="${CLAUDE_TOOL_INPUT_FILE_PATH:-}"
  if [[ -z "$f" && ! -t 0 ]]; then
    local input; input="$(cat)"
    if [[ -n "$input" ]]; then
      if command -v jq >/dev/null 2>&1; then
        f="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.path // empty' 2>/dev/null)"
      elif command -v python3 >/dev/null 2>&1; then
        f="$(printf '%s' "$input" | python3 -c 'import sys,json
try:
    ti=json.load(sys.stdin).get("tool_input",{}); print(ti.get("file_path") or ti.get("path") or "")
except Exception:
    print("")' 2>/dev/null)"
      fi
    fi
  fi
  printf '%s' "$f"
}

# PLM 통합 활성 + 프로젝트 바인딩 + python3 존재 여부. 비활성/미바인딩이면 1.
# plm_active [편집파일경로] — 경로 전달 시 중첩 워크스페이스 정확 라우팅.
plm_active() {
  plm_resolve "${1:-}"
  [[ "$PLM_ENABLED" == "1" || "$PLM_ENABLED" == "true" ]] || return 1
  [[ -n "$PLM_PROJECT" ]] || return 1
  command -v python3 >/dev/null 2>&1 || return 1
  return 0
}
