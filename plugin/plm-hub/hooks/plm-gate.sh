#!/usr/bin/env bash
# Stop — PLM 거버넌스 게이트(G1~G3·needs_review) 경고. 소프트·비차단·디바운스.
set -uo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$DIR/scripts/plm_lib.sh"
plm_active || exit 0
LAST="${CLAUDE_PROJECT_DIR:-.}/.ouroboros/context/.last_plm_gate"
now=$(date +%s)
if [[ -f "$LAST" ]]; then prev=$(cat "$LAST" 2>/dev/null || echo 0); [[ $((now-prev)) -lt 45 ]] && exit 0; fi
mkdir -p "$(dirname "$LAST")" 2>/dev/null || true; echo "$now" > "$LAST"
python3 "$DIR/scripts/plm_gate.py" 2>/dev/null || true
exit 0
