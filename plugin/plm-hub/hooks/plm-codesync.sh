#!/usr/bin/env bash
# PostToolUse(Edit|Write) — 소스코드 변경 시 그 파일의 @plm 역링크를 PLM에 자동 동기(단일 파일 모드).
# doc↔PLM(plm-sync)와 일관되게 code↔PLM 도 자동 유지. 전체 GC 는 /plm-hub:codescan(수동).
# graceful: 항상 exit 0. 비활성/미바인딩/머신러리/비소스면 조용히 종료.
set -uo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
. "$DIR/scripts/plm_lib.sh"
CHANGED="$(plm_hook_changed)"   # A2: stdin JSON 우선, env fallback
[[ -n "$CHANGED" && -f "$CHANGED" ]] || exit 0
# 템플릿 머신러리·문서·산출물 제외 (사용자 소스만)
case "$CHANGED" in
  */.ouroboros/*|*/plm-hub/*|*/.target/*|*/.final/*|*/.test*|*/node_modules/*|*/target/*|*/.next/*|*/guide/*) exit 0 ;;
esac
# 소스 확장자만 + @plm 주석 존재할 때만
case "$CHANGED" in
  *.rs|*.ts|*.tsx|*.js|*.jsx|*.py|*.go|*.java|*.kt|*.sql|*.sh|*.rb|*.php|*.c|*.cpp|*.h|*.hpp|*.cs|*.swift|*.vue|*.svelte|*.html|*.htm|*.css|*.scss|*.dart|*.lua|*.ex|*.exs) : ;;
  *) exit 0 ;;
esac
grep -q '@plm' "$CHANGED" 2>/dev/null || exit 0
plm_active "$CHANGED" || exit 0
python3 "$DIR/scripts/plm_codescan.py" --file "$CHANGED" 2>/dev/null || true
exit 0
