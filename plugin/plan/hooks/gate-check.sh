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

# 평가할 아티팩트가 없으면 조용히 종료 (ADR-019: .json canonical + .md 이행기 레거시)
have="$(ls "$DOCS"/requirements/*.json "$DOCS"/design/*.json "$DOCS"/requirements/*.md "$DOCS"/design/*.md 2>/dev/null | head -1)"
[[ -z "$have" ]] && exit 0

now=$(date +%s)
if [[ -f "$LAST" ]]; then
  prev=$(cat "$LAST" 2>/dev/null || echo 0)
  # GOV-09: 디바운스 중이라도 requirements/design 아티팩트(.json/.md)가 .last_gate보다 최신이면 재평가(변경 무효화).
  # 직후 변경이 게이트에 미반영되던 것 방지. 변경 없으면 디바운스 유지.
  changed=$(find "$PROJECT_DIR/.ouroboros/docs/requirements" "$PROJECT_DIR/.ouroboros/docs/design" \
              \( -name '*.json' -o -name '*.md' \) -newer "$LAST" -print -quit 2>/dev/null)
  [[ $((now - prev)) -lt $DEBOUNCE && -z "$changed" ]] && exit 0
fi
echo "$now" > "$LAST"

out="$(CLAUDE_PROJECT_DIR="$PROJECT_DIR" python3 "$VALIDATOR" --update-state --full 2>/dev/null)"
warn="$(echo "$out" | grep -E '⚠|G1\(요구\)=(warn|pending)|G2\(설계\)=(warn|pending)' || true)"
if [[ -n "$warn" ]]; then
  echo "[gate-check] 요구→설계 게이트 경고 (소프트 — 작업은 계속):"
  echo "$out" | grep -E '⚠|G1|G2' | sed 's/^/  /'
fi
exit 0
