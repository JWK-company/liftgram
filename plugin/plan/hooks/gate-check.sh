#!/bin/bash
# Stop Hook — 요구→설계 게이트(G1/G2) 기계조건 자동 평가 (소프트 경고).
# trace_validate 로 state.gates 갱신 + orphan/dangling 경고. 차단 아님(exit 0).
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
VALIDATOR="${CLAUDE_PLUGIN_ROOT}/scripts/trace_validate.py"
DOCS="$PROJECT_DIR/.ouroboros/docs"
LAST="$PROJECT_DIR/.ouroboros/context/.last_gate"
DEBOUNCE=60

[[ -f "$VALIDATOR" ]] || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

# 평가할 아티팩트가 없으면 조용히 종료
have="$(ls "$DOCS"/requirements/*.md "$DOCS"/design/*.md 2>/dev/null | head -1)"
[[ -z "$have" ]] && exit 0

now=$(date +%s)
if [[ -f "$LAST" ]]; then
  prev=$(cat "$LAST" 2>/dev/null || echo 0)
  [[ $((now - prev)) -lt $DEBOUNCE ]] && exit 0
fi
echo "$now" > "$LAST"

out="$(CLAUDE_PROJECT_DIR="$PROJECT_DIR" python3 "$VALIDATOR" --update-state --full 2>/dev/null)"
warn="$(echo "$out" | grep -E '⚠|G1\(요구\)=(warn|pending)|G2\(설계\)=(warn|pending)' || true)"
if [[ -n "$warn" ]]; then
  echo "[gate-check] 요구→설계 게이트 경고 (소프트 — 작업은 계속):"
  echo "$out" | grep -E '⚠|G1|G2' | sed 's/^/  /'
fi
exit 0
