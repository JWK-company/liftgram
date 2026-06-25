#!/bin/bash
# PostToolUse (Edit|Write) Hook — 기획 아티팩트 변경 시 orphan/dangling 증분 경고.
# requirements/design/decisions/roadmap 의 .md 변경만 대상. graceful: 항상 exit 0.
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
CHANGED="${CLAUDE_TOOL_INPUT_FILE_PATH:-}"
VALIDATOR="${CLAUDE_PLUGIN_ROOT}/scripts/trace_validate.py"

case "$CHANGED" in
  *.ouroboros/docs/requirements/*.md|*.ouroboros/docs/design/*.md|*.ouroboros/docs/decisions/*.md|*.ouroboros/docs/roadmap/*.md) : ;;
  *) exit 0 ;;
esac
base="$(basename "$CHANGED")"
[[ "$base" == _* ]] && exit 0
[[ -f "$VALIDATOR" ]] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

out="$(CLAUDE_PROJECT_DIR="$PROJECT_DIR" python3 "$VALIDATOR" --file "$CHANGED" 2>/dev/null || true)"
[[ -n "$out" ]] && echo "[trace-validator] $out"
exit 0
