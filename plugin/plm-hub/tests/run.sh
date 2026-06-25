#!/usr/bin/env bash
# 플러그인 테스트 스위트 러너 — 단위(codescan·lib) 실행.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fail=0
echo "═══ PLM-Hub 플러그인 테스트 ═══"
python3 "$HERE/test_codescan.py" || fail=1
bash "$HERE/test_lib.sh" || fail=1
echo "─────────────────────────────"
[[ $fail -eq 0 ]] && echo "✅ 전체 통과" || echo "❌ 실패 있음"
exit $fail
