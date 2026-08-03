#!/usr/bin/env bash
# @plm SRS-009  제너레이터 검증 — 생성물이 레퍼런스와 같은 모양이고 CI를 통과하는가
#
# 저장소를 임시 사본으로 복제해 거기서 모듈을 생성하고 타입·테스트를 돌린다.
# 작업 트리를 건드리지 않으므로 CI에서도, 로컬에서도 안전하게 반복 실행할 수 있다.
set -euo pipefail
NAME="${1:-probe}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "  임시 사본 준비 ($TMP)"
# -c: 추적 중 · -o: 아직 커밋 안 한 새 파일 · --exclude-standard: .gitignore 존중
git ls-files -zco --exclude-standard | xargs -0 -I{} cp --parents {} "$TMP" 2>/dev/null || {
  # git 밖에서 실행될 때의 대비
  tar --exclude=node_modules --exclude=.next --exclude=.git -cf - . | (cd "$TMP" && tar xf -)
}
# 워크스페이스마다 node_modules가 따로 있다(bun workspaces) — 사본에도 같은 자리에 링크한다.
ln -s "$PWD/node_modules" "$TMP/node_modules"
for w in backend frontend contracts; do
  [ -d "$PWD/$w/node_modules" ] && ln -s "$PWD/$w/node_modules" "$TMP/$w/node_modules"
done

cd "$TMP"
node scripts/gen-module.mjs "$NAME" >/dev/null
echo "  생성 완료 — 계약 생성(proto → Go·TS)"
buf generate >/dev/null
echo "  SQL → Go 생성(sqlc)"
(cd backend && go run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.30.0 -f ../database/sqlc.yaml generate >/dev/null)
echo "  타입·빌드 검사(web=tsc · api=go)"
./node_modules/.bin/tsc --noEmit -p frontend
(cd backend && go build ./... && go vet ./...)
echo "  유닛 테스트"
(cd backend && go test ./... 2>&1 | tail -3)
echo "  ✅ 생성물이 빌드·테스트를 통과합니다"
