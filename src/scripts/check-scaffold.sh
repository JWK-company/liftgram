#!/usr/bin/env bash
# @plm SRS-011  스캐폴더 산출물 검증 — 만든 저장소가 **실제로 도는가**
#
# 스캐폴더는 만들어 놓고 방치하면 반드시 썩는다(템플릿이 바뀌면 생성 로직이 따라오지 못한다).
# 그래서 CI가 매번 만들어보고, 만든 것으로 검증까지 돌린다.
#
# 확인 순서(문서가 팀원에게 시키는 그대로):
#   1. make create 로 생성
#   2. 이름이 남아 있지 않은가(남으면 이미지·네트워크가 충돌한다)
#   3. .env의 포트 짝이 맞는가
#   4. make verify (lint·타입·테스트·문서)
#   5. **설정 없이 빌드**되는가 (빌드 산출물에 설정이 박히면 이미지를 재사용할 수 없다)
#
# BARE=1 변형도 같은 검사를 받는다.
set -euo pipefail
ROOT="$PWD"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
NAME="${1:-scaffold-probe}"
BARE_FLAG="${BARE:-0}"

echo "  생성 — make create NAME=$NAME (BARE=$BARE_FLAG)"
BARE="$BARE_FLAG" node scripts/create-app.mjs "$NAME" "$TMP" >/dev/null
APP="$TMP/$NAME"
# 심볼릭 링크로 node_modules를 빌려 쓰면 Turbopack이 "파일시스템 루트 밖"이라며 거부한다.
# 팀원도 실제로 설치를 하므로 그대로 설치한다(bun 캐시 덕에 몇 초면 끝난다).
( cd "$APP" && bun install --frozen-lockfile >/dev/null 2>&1 || bun install >/dev/null 2>&1 )
# Go 모듈은 별도 캐시를 쓴다 — 의존은 호스트 캐시에서 재사용되므로 추가 설치가 필요 없다.

TEMPLATE="$(node -p "require('$ROOT/package.json').name")"
echo "  이름 잔존 검사"
leftover="$(grep -rl "$TEMPLATE" "$APP" --include='*.json' --include='*.tsx' --include='*.ts' 2>/dev/null | grep -v node_modules || true)"
[ -z "$leftover" ] || { echo "  ✗ 템플릿 이름이 남았다: $leftover"; exit 1; }

echo "  설정 짝 검사"
( cd "$APP" && node scripts/env-check.mjs >/dev/null ) || { echo "  ✗ env-check 실패"; exit 1; }

echo "  make verify"
( cd "$APP" && make --no-print-directory verify >/dev/null ) || { echo "  ✗ 생성된 저장소가 verify를 통과하지 못한다"; exit 1; }

echo "  설정 없이 빌드 (api 정적 바이너리 + web standalone)"
( cd "$APP" && rm -f .env && bun run build >/dev/null 2>&1 ) || {
  echo "  ✗ 설정 없이 빌드되지 않는다 — 빌드에 런타임 설정이 박혀 있다"; exit 1; }

echo "  ✅ 스캐폴더 산출물이 검증·빌드를 통과한다 (BARE=$BARE_FLAG)"
