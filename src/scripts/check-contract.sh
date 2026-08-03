#!/usr/bin/env bash
# @plm SRS-008  컨테이너 runtime contract 검증 — 템플릿이 약속한 것을 이미지가 실제로 지키는가
#
# 실행 단위가 둘이라(ADR-010) 이미지도 둘이다. 약속의 대부분은 같지만 포트·entry point이 다르므로
# UNIT으로 무엇을 보는지 알려 준다:
#   UNIT=frontend  IMG=<이미지>   포트 3000 · entry point server.mjs
#   UNIT=backend   IMG=<이미지>   포트 3001 · entry point /app/server
# 사용: IMG=myapp-frontend UNIT=frontend bash scripts/check-contract.sh   (make contract 가 둘 다 부른다)
set -uo pipefail
UNIT="${UNIT:-frontend}"
IMG="${IMG:-${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}-$UNIT}"
case "$UNIT" in
  frontend) PORT=3000; ENTRY="server.mjs" ;;
  backend)  PORT=3001; ENTRY="/app/server" ;;
  *) echo "UNIT은 frontend 또는 backend 여야 합니다 (받은 값: $UNIT)"; exit 2 ;;
esac
fail=0
ok(){ echo "  ✅ $1"; }; ng(){ echo "  ❌ $1"; fail=1; }
echo "  [$UNIT] $IMG"

u=$(docker image inspect "$IMG" --format '{{.Config.User}}' 2>/dev/null)
[ -n "$u" ] && [ "$u" != "root" ] && ok "non-root 실행 ($u)" || ng "root로 실행됨"

p=$(docker image inspect "$IMG" --format '{{range $k,$v := .Config.ExposedPorts}}{{$k}} {{end}}')
echo "$p" | grep -q "$PORT" && ok "포트 $PORT 노출" || ng "포트 미노출 ($p)"

c=$(docker image inspect "$IMG" --format '{{json .Config.Cmd}}')
echo "$c" | grep -q "$ENTRY" && ok "entry point = $ENTRY ($c)" || ng "entry point 이상 ($c)"

# 크기는 압축 기준(inspect)과 실제 디스크 기준(image ls)이 다르다 — 둘 다 남긴다
s=$(docker image inspect "$IMG" --format '{{.Size}}')
disk=$(docker image ls "$IMG" --format '{{.Size}}' | head -1)
echo "  ℹ 이미지 크기 — 압축 $((s/1024/1024)) MB · 디스크 ${disk}"

# ── 설정 취급 — 두 단위가 서로 다른 것을 약속한다 ────────────────────────────
#   backend  : 필수 설정(DATABASE_URL)이 없으면 **부팅이 실패**하고 무엇이 없는지 말한다
#   frontend : 필수 설정이 없다(전부 기본값) — 대신 이미지에 설정 파일이 박혀 있지 않은가를 본다
#
# GNU coreutils의 `timeout`은 macOS에 기본 탑재되지 않는다(brew coreutils를 깔면 `gtimeout`으로 온다).
# 없다고 검사가 실패하면 안 된다 — 실제로 "출력 첫 줄: timeout: command not found"가 되어
# 이미지 결함으로 오인됐다(실측).
if command -v timeout >/dev/null 2>&1; then TIMEOUT="timeout 30"
elif command -v gtimeout >/dev/null 2>&1; then TIMEOUT="gtimeout 30"
else TIMEOUT=""; fi

if [ "$UNIT" = "backend" ]; then
  # 설정 없이 띄우면 **부팅이 실패**해야 한다(조용히 뜨면 안 됨).
  # 이 실행은 backend에서만 한다 — frontend는 필수 설정이 없어 서버가 그대로 떠 있으므로,
  # 공통으로 돌리면 상한이 없는 환경에서 무한 대기한다(실측: TIMEOUT 없이 7분 매달림).
  # backend는 DATABASE_URL이 없으면 스스로 즉시 종료하므로 상한은 안전망일 뿐이다.
  # shellcheck disable=SC2086  # 단어 분리가 의도다(명령 + 인자)
  out=$($TIMEOUT docker run --rm --network none "$IMG" 2>&1 | head -8 || true)
  if echo "$out" | grep -q 'DATABASE_URL'; then
    ok "필수 env 누락 시 부팅 실패 + 누락 항목 안내"
  else
    # 부팅이 실패하긴 했는데 **이유가 설정 누락이 아닐 수도** 있다(예: 의존 누락).
    # 그 경우를 "convention 위반"으로 뭉뚱그리면 원인을 찾는 데 시간이 걸린다 — 실제 출력을 보여 준다.
    ng "설정 누락을 알리지 않는다 — 실제 출력 첫 줄: $(echo "$out" | head -2 | tr '\n' ' ')"
  fi
else
  # frontend는 필수 설정이 없다(전부 기본값이 있다) — 그래도 이미지에 .env가 실려 있으면 안 된다.
  if docker run --rm --entrypoint sh "$IMG" -c 'ls -a /app/frontend | grep -q "^\.env$"' 2>/dev/null; then
    ng "이미지에 .env가 들어 있다 — 설정이 이미지에 박히면 같은 이미지를 재사용할 수 없다"
  else
    ok "이미지에 설정 파일이 없다(설정은 실행 시 환경변수로만)"
  fi
fi

echo; [ $fail -eq 0 ] && echo "  [$UNIT] runtime contract 준수" || echo "  [$UNIT] runtime contract 위반 있음"
exit $fail
