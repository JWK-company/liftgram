#!/usr/bin/env bash
# plm_lib.sh 단위 테스트 — 설정 해석(중첩 워크스페이스·env 우선·find_root).
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/../scripts/plm_lib.sh"
P=0; F=0
chk(){ if [[ "$1" == "$2" ]]; then P=$((P+1)); else F=$((F+1)); echo "  FAIL: $3 (기대 '$2', 실제 '$1')"; fi; }

# 임시 중첩 워크스페이스 구성
TMP="$(mktemp -d)"
mkdir -p "$TMP/root/.ouroboros/config" "$TMP/root/sub/.ouroboros/config" "$TMP/root/sub/src"
echo '{"project":"root-proj","api_url":"https://plm.shoi.ch"}' > "$TMP/root/.ouroboros/config/plm.json"
echo '{"project":"sub-proj","api_url":"https://plm.shoi.ch","code_root":"src"}' > "$TMP/root/sub/.ouroboros/config/plm.json"

export CLAUDE_PROJECT_DIR="$TMP/root"

# 1) 인자 없음 → 루트 바인딩
( unset PLM_PROJECT PLM_CODE_ROOT PLM_API_URL; plm_resolve; chk "$PLM_PROJECT" "root-proj" "인자없음=루트"; echo "$P $F" > "$TMP/r1" )
read P F < "$TMP/r1"

# 2) 중첩 파일 전달 → 가장 가까운 워크스페이스(sub) 라우팅
( unset PLM_PROJECT PLM_CODE_ROOT; plm_resolve "$TMP/root/sub/src/player.gd"; chk "$PLM_PROJECT" "sub-proj" "중첩파일=sub 라우팅"; echo "$P $F" > "$TMP/r2" )
read P F < "$TMP/r2"

# 3) code_root 상대경로 → 절대경로(sub 기준)
( unset PLM_PROJECT PLM_CODE_ROOT; plm_resolve "$TMP/root/sub/src/player.gd"; chk "$PLM_CODE_ROOT" "$TMP/root/sub/src" "code_root 절대화"; echo "$P $F" > "$TMP/r3" )
read P F < "$TMP/r3"

# 4) env 우선(환경변수가 config 무시)
( export PLM_PROJECT="env-override"; unset PLM_CODE_ROOT; plm_resolve "$TMP/root/sub/src/x.gd"; chk "$PLM_PROJECT" "env-override" "env 우선"; echo "$P $F" > "$TMP/r4" )
read P F < "$TMP/r4"

# 5) _plm_find_root 상향 탐색
FOUND="$(_plm_find_root "$TMP/root/sub/src/deep/x.gd" 2>/dev/null)"
chk "$FOUND" "$TMP/root/sub" "find_root 상향탐색"

# 6) plm_active — 바인딩 시 0
( unset PLM_PROJECT; plm_active "$TMP/root/sub/src/x.gd"; rc=$?; chk "$rc" "0" "plm_active 바인딩=0"; echo "$P $F" > "$TMP/r6" )
read P F < "$TMP/r6"

rm -rf "$TMP"
echo "test_lib: $P pass, $F fail"
[[ $F -eq 0 ]]
