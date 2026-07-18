#!/usr/bin/env bash
# PostToolUse(Edit|Write) — .ouroboros/docs 기획 아티팩트 변경 시 PLM 즉시 upsert.
# graceful: 항상 exit 0. 비활성/미바인딩이면 조용히 종료.
set -uo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$DIR/scripts/plm_lib.sh"
CHANGED="$(plm_hook_changed)"   # A2: stdin JSON 우선, env fallback
case "$CHANGED" in
  # ADR-019 동형: .json 우선(canonical). .md는 이행기 레거시 호환. product/=PRD(미추적 싱글턴이나 대시보드 표시 위해 동기).
  *.ouroboros/docs/requirements/*.json|*.ouroboros/docs/design/*.json|*.ouroboros/docs/decisions/*.json|*.ouroboros/docs/roadmap/*.json|*.ouroboros/docs/product/*.json) : ;;
  *.ouroboros/docs/requirements/*.md|*.ouroboros/docs/design/*.md|*.ouroboros/docs/decisions/*.md|*.ouroboros/docs/roadmap/*.md|*.ouroboros/docs/product/*.md) : ;;
  *) exit 0 ;;
esac
[[ "$(basename "$CHANGED")" == _* ]] && exit 0
plm_active "$CHANGED" || exit 0
# TOP-01: stderr 경고(403 멤버십 거부 등)는 표면화 — 침묵 desync 방지. graceful exit 0 유지.
# OBS-11: 실패를 회전 로그(.ouroboros/log/plm-sync.log·최근 200줄)에 기록 — 누적 desync 사후추적.
if ! ERR="$(python3 "$DIR/scripts/plm_sync_one.py" --file "$CHANGED" 2>&1 >/dev/null)"; then
  ROOT="$(git -C "$(dirname "$CHANGED")" rev-parse --show-toplevel 2>/dev/null || echo .)"
  LOG="$ROOT/.ouroboros/log/plm-sync.log"
  mkdir -p "$(dirname "$LOG")" 2>/dev/null
  printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$CHANGED" "$ERR" >> "$LOG" 2>/dev/null
  tail -n 200 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" 2>/dev/null
  [ -n "$ERR" ] && echo "$ERR" >&2
fi
exit 0
