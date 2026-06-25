#!/usr/bin/env bash
# PostToolUse(Edit|Write) — .ouroboros/docs 기획 아티팩트 변경 시 PLM 즉시 upsert.
# graceful: 항상 exit 0. 비활성/미바인딩이면 조용히 종료.
set -uo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$DIR/scripts/plm_lib.sh"
CHANGED="$(plm_hook_changed)"   # A2: stdin JSON 우선, env fallback
case "$CHANGED" in
  *.ouroboros/docs/requirements/*.md|*.ouroboros/docs/design/*.md|*.ouroboros/docs/decisions/*.md|*.ouroboros/docs/roadmap/*.md) : ;;
  *) exit 0 ;;
esac
[[ "$(basename "$CHANGED")" == _* ]] && exit 0
plm_active "$CHANGED" || exit 0
python3 "$DIR/scripts/plm_sync_one.py" --file "$CHANGED" 2>/dev/null || true
exit 0
