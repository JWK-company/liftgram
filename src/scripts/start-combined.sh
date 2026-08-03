#!/bin/bash
# @plm SRS-008  합본 이미지 진입점 — 무료 호스트의 "프로세스 1개" 제약을 위한 것
#
# `bash`인 이유: 아래 `wait -n`("먼저 끝나는 쪽을 기다린다")이 POSIX sh(dash)에는 없다.
# 이미지 베이스(debian slim)에 bash가 들어 있어 추가 설치가 필요 없다.
#
# 마이그레이션을 먼저 적용하고(스키마 없는 DB에 첫 배포해도 뜨도록), 백엔드를 띄우고,
# 화면을 띄운다. **둘 중 하나라도 죽으면 컨테이너를 종료한다** — 반만 살아 있는 상태로
# 트래픽을 받는 것이 제일 나쁘다(호스트가 다시 띄우면 된다).
set -eu

echo "[start] 마이그레이션 적용"
cd /app && ./bin/migrate

echo "[start] 백엔드(:${API_PORT}) 시작"
cd /app && ./bin/server &
backend_pid=$!

# 백엔드가 뜨기 전에 화면이 첫 요청을 받으면 502가 난다 — 헬스가 설 때까지 잠깐 기다린다.
i=0
while [ "$i" -lt 60 ]; do
  if wget -q -O /dev/null "http://127.0.0.1:${API_PORT}/api/healthz" 2>/dev/null; then break; fi
  i=$((i + 1))
  sleep 0.5
done

echo "[start] 화면(:${PORT:-8080}) 시작"
cd /app/frontend && PORT="${PORT:-8080}" node server.mjs &
frontend_pid=$!

# 먼저 끝나는 쪽을 기다린다 — 하나가 죽으면 나머지도 정리하고 그 종료코드로 나간다.
wait -n "$backend_pid" "$frontend_pid"
code=$?
echo "[start] 프로세스 하나가 종료됨(code=$code) — 컨테이너를 내린다"
kill "$backend_pid" "$frontend_pid" 2>/dev/null || true
exit "$code"
