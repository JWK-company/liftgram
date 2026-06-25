#!/usr/bin/env bash
# PostToolUse(Edit|Write) — 기획 산문 아티팩트 본문 충실도 경고(비차단).
# graceful: 항상 exit 0.
set -uo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$DIR/scripts/plm_lib.sh"
CHANGED="$(plm_hook_changed)"   # A2: stdin JSON 우선, env fallback
case "$CHANGED" in
  *.ouroboros/docs/requirements/*.md|*.ouroboros/docs/design/*.md|*.ouroboros/docs/decisions/*.md) : ;;
  *) exit 0 ;;
esac
[[ "$(basename "$CHANGED")" == _* ]] && exit 0
python3 "$DIR/scripts/plm_body_lint.py" --file "$CHANGED" 2>/dev/null || true
exit 0
