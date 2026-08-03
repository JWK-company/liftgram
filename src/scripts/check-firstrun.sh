#!/usr/bin/env bash
# @plm SRS-011  첫 복제 경험 검사 — 문서에 적힌 퀵스타트가 **처음 받는 사람에게** 실제로 도는가
#
# 왜 필요한가: `make bootstrap`이 .env가 없는 상태에서만 실패한 적이 있다.
# 두 번째 실행부터는 성공해서(첫 실행이 .env를 만들어 놓으므로) 개발자는 원인을 못 찾고,
# 정작 처음 복제한 팀원만 겪는다. 그 경로를 기계가 매번 밟는다.
#
# 사용: bash scripts/check-firstrun.sh   (CI 필수 단계)
set -euo pipefail
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
echo "  임시 복제 → $TMP/app"
git clone -q "$PWD" "$TMP/app"
cd "$TMP/app"
test ! -f .env || { echo "  ✗ 복제본에 .env가 딸려왔다 — 설정이 커밋되고 있다"; exit 1; }
# 설치 시간을 아끼려 의존만 재사용한다(경로 구성은 그대로 검사).
# 워크스페이스마다 node_modules가 따로 있으므로 같은 자리에 각각 링크한다.
ln -s "$OLDPWD/node_modules" node_modules
for w in backend frontend contracts; do
  [ -d "$w" ] && [ -d "$OLDPWD/$w/node_modules" ] && ln -s "$OLDPWD/$w/node_modules" "$w/node_modules"
done
true  # 위 루프의 마지막 판정이 실패여도 여기서 멈추지 않는다(set -e)

echo "  make env-init (문서 1단계)"
make --no-print-directory env-init >/dev/null
test -f .env || { echo "  ✗ .env가 만들어지지 않았다"; exit 1; }

echo "  마이그레이션 entry point이 설정을 찾는가 (인프라 없이 '연결 시도'까지만 확인)"
set +e
out="$(cd backend && bun src/db/migrate.ts 2>&1)"; rc=$?
set -e
if echo "$out" | grep -q "설정 검증 실패"; then
  echo "  ✗ .env를 만들었는데도 설정을 못 찾는다 — 첫 복제에서 bootstrap이 깨진다"
  echo "$out" | head -3
  exit 1
fi
# 연결 실패(인프라 미기동)는 정상 — 여기서 보는 것은 "설정을 찾았는가"뿐이다.
echo "  ✅ 첫 복제 경로에서 설정이 정상적으로 잡힌다"
