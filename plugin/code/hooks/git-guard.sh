#!/bin/bash
# git-guard.sh -- git으로 파일을 변경하는 명령어 실행 전 사용자 확인
# 트리거: PreToolUse (matcher: Bash)
# 출력: JSON {"decision":"block","reason":"..."} 또는 빈 출력(허용)

STDIN_DATA=$(cat)
COMMAND="${CLAUDE_TOOL_INPUT_COMMAND:-}"
if [ -z "$COMMAND" ]; then
  COMMAND=$(echo "$STDIN_DATA" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1 2>/dev/null || echo "")
fi

# git 명령어가 아니면 즉시 허용
echo "$COMMAND" | grep -q "git " || exit 0

# 읽기 전용 git 명령어 → 허용
if echo "$COMMAND" | grep -qE '^\s*git\s+(status|log|diff|branch|show|remote|fetch|ls-files|blame|stash list|tag -l)'; then
  exit 0
fi

# 파일 변경 git 명령어 → 차단 (사용자 확인 필요)
if echo "$COMMAND" | grep -qE 'git\s+(commit|push|reset|checkout\s+--|restore|clean|rebase|merge|cherry-pick|revert|stash\s+(drop|pop|clear)|tag\s+-d|branch\s+-[dD])'; then
  ESCAPED=$(echo "$COMMAND" | sed 's/"/\\"/g' | head -c 200)
  cat << EOF
{
  "decision": "ask",
  "message": "git 변경 명령어 감지: ${ESCAPED}\n\n이 명령어를 실행하시겠습니까?"
}
EOF
  exit 0
fi

# 그 외 git 명령어 (add, init 등) → 허용
exit 0
