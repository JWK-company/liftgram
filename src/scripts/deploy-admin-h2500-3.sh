#!/usr/bin/env bash
# 운영 웹 단독 배포(SPEC-033) — 앱을 재시작하지 않고 운영 웹만 올리거나 되돌린다.
#
#   bash scripts/deploy-admin-h2500-3.sh               # HEAD
#   DEPLOY_REF=<커밋> bash scripts/deploy-admin-h2500-3.sh
#
# 앱 배포(deploy-h2500-3.sh)와 다른 점:
#   · 소스 사본은 ~/liftgram-admin/src 다. ~/liftgram/src 를 덮으면 라이브 앱과 서버 사본이 어긋난다.
#   · 설정은 앱의 ~/liftgram/src/.env 를 읽기만 하고, 운영 웹 값은 ~/liftgram-admin/.env 에 있다.
#   · compose 프로젝트 이름이 같아(-p liftgram) 앱 네트워크의 backend 에 닿는다. --no-deps 로 다른 서비스는 건드리지 않는다.
#
# ~/liftgram-admin/.env 필수 키: ADMIN_PORT · ADMIN_URL
# CF_ACCESS_AUD · CF_ACCESS_TEAM_DOMAIN 이 비면 운영 웹은 뜨되 모든 요청을 거절한다(열린 채로 뜨는 일은 없다).
#   ALLOW_CONTRACT_DRIFT=1  계약이 라이브 앱과 달라도 올린다(기본은 멈춤)
#   ALLOW_SAME_VERSION=1    새 커밋인데 버전이 그대로여도 올린다(기본은 멈춤)
set -euo pipefail
HOST=${HOST:-h2500-3}
HERE=$(cd "$(dirname "$0")/.." && pwd)
ROOT=$(cd "$HERE/.." && pwd)
REMOTE=${REMOTE:-'~/liftgram-admin'}
APP_REMOTE=${APP_REMOTE:-'~/liftgram'}
MIN_FREE_GB=${MIN_FREE_GB:-40}
SSH="ssh -o BatchMode=yes $HOST"
COMPOSE="docker compose -p liftgram --profile admin --env-file $APP_REMOTE/src/.env --env-file $REMOTE/.env -f compose.yaml -f compose.admin.prod.yaml"

DEPLOY_REF=${DEPLOY_REF:-HEAD}
DEPLOY_SHA=$(git -C "$ROOT" rev-parse "$DEPLOY_REF")
SHORT=$(git -C "$ROOT" rev-parse --short "$DEPLOY_SHA")
echo "── 운영 웹 배포 대상: ${SHORT} ($(git -C "$ROOT" log -1 --format=%s "$DEPLOY_SHA" | cut -c1-60)) ──"

CLEAN=$(mktemp -d)
trap 'git -C "$ROOT" worktree remove --force "$CLEAN" >/dev/null 2>&1 || true; rm -rf "$CLEAN"; git -C "$ROOT" worktree prune >/dev/null 2>&1 || true' EXIT
git -C "$ROOT" worktree add --detach --quiet "$CLEAN" "$DEPLOY_SHA"
[ -f "$CLEAN/src/admin/package.json" ] || { echo "!! 이 커밋에는 운영 웹이 없다"; exit 1; }
d=$(git -C "$ROOT" status --porcelain -- src | wc -l | tr -d ' ')
[ "$d" != "0" ] && echo "     작업 트리 미커밋 ${d}건 — **배포에는 들어가지 않는다**"

# ── 버전 ─────────────────────────────────────────────────────────────────────────
VERSION=$(node -p "require('$CLEAN/src/admin/package.json').version")
PREV=$($SSH "cat $REMOTE/DEPLOYED_ADMIN_REF 2>/dev/null" || true)
PREV_VERSION=$($SSH "cat $REMOTE/DEPLOYED_ADMIN_VERSION 2>/dev/null" || true)
echo "     운영 웹 v${VERSION} · 지금 떠 있는 것 v${PREV_VERSION:-없음}"
if [ -n "$PREV_VERSION" ] && [ "$VERSION" = "$PREV_VERSION" ] && [ "$PREV" != "$DEPLOY_SHA" ] && [ "${ALLOW_SAME_VERSION:-0}" != "1" ]; then
  echo "!! 새 커밋이 나가는데 버전이 그대로다 — src/admin/package.json 을 올리고 커밋하라"
  exit 1
fi

# ── 계약 — 운영 웹과 라이브 백엔드가 같은 계약이어야 한다 ─────────────────────────────
APP_REF=$($SSH "cat $APP_REMOTE/DEPLOYED_REF 2>/dev/null" || true)
[ -n "$APP_REF" ] || { echo "!! 라이브 앱 커밋을 읽지 못했다($APP_REMOTE/DEPLOYED_REF)"; exit 1; }
git -C "$ROOT" cat-file -e "${APP_REF}^{commit}" 2>/dev/null || { echo "!! 라이브 앱 커밋 ${APP_REF:0:7} 이 이 저장소에 없다 — git fetch"; exit 1; }
if ! git -C "$ROOT" diff --quiet "$APP_REF" "$DEPLOY_SHA" -- src/proto src/contracts; then
  echo "!! 계약이 라이브 앱(${APP_REF:0:7})과 다르다 — 앱을 먼저 배포하거나 ALLOW_CONTRACT_DRIFT=1"
  [ "${ALLOW_CONTRACT_DRIFT:-0}" = "1" ] || exit 1
fi

# ── 서버 확인(건드리기 전에) ──────────────────────────────────────────────────────
echo "── 여유 공간·설정·포트 확인 ──"
PORT=$($SSH "
  set -e
  free=\$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
  [ \"\$free\" -ge ${MIN_FREE_GB} ] || { echo \"!! 여유 공간 \${free}G — 빌드하지 않는다\" >&2; exit 1; }
  f=$REMOTE/.env
  [ -f \$f ] || { echo \"!! \$f 가 없다 — deploy/README.md 의 운영 웹 절대로 먼저 만든다\" >&2; exit 1; }
  docker buildx version >/dev/null 2>&1 || { echo \"!! buildx 가 없다 — 이 배포의 제외 문맥은 BuildKit 이 필요하다\" >&2; exit 1; }
  # compose 는 따옴표를 벗기지만 아래 검사는 원문을 읽는다. 어긋나면 입구 검사가 조용히 빗나간다.
  if grep -Eq \"^(ADMIN_PORT|ADMIN_URL|CF_ACCESS_AUD|CF_ACCESS_TEAM_DOMAIN)=[\\\"']\" \$f; then
    echo \"!! \$f 의 운영 웹 값에서 따옴표를 빼라\" >&2; exit 1
  fi
  for k in ADMIN_PORT ADMIN_URL; do
    grep -q \"^\$k=.\" \$f || { echo \"!! \$f 에 \$k 가 비었다\" >&2; exit 1; }
  done
  for k in CF_ACCESS_AUD CF_ACCESS_TEAM_DOMAIN; do
    grep -q \"^\$k=.\" \$f || echo \"  ⚠ \$k 가 비어 있다 — 모든 요청을 거절한 채로 뜬다\" >&2
  done
  port=\$(grep '^ADMIN_PORT=' \$f | cut -d= -f2)
  # 이 포트를 쥔 것이 우리 컨테이너가 아니면 멈춘다. 공용 서버라 다른 프로세스를 죽이지 않는다.
  ours=\$(docker ps --filter 'label=com.docker.compose.project=liftgram' --filter 'label=com.docker.compose.service=admin' --filter \"publish=\$port\" -q)
  if [ -z \"\$ours\" ] && ss -ltn | grep -q \"127.0.0.1:\$port \\|:\$port \"; then
    echo \"!! 포트 \$port 을 다른 프로세스가 쓰고 있다\" >&2; exit 1
  fi
  echo \$port")
echo "     포트 $PORT OK"

echo "── 소스 동기 ──"
$SSH "mkdir -p $REMOTE/src"
rsync -a --delete \
  --exclude '/.env' --exclude '/.env.*' \
  --exclude 'node_modules/' --exclude '.next/' \
  --exclude 'test-results/' --exclude 'playwright-report/' --exclude '.DS_Store' \
  --exclude '/mobile/' --exclude '/frontend/public/' \
  "$CLEAN/src/" "$HOST:$REMOTE/src/"

echo "── 빌드·기동(운영 웹만) ──"
$SSH "cd $REMOTE/src && $COMPOSE build admin >/tmp/liftgram-admin-deploy.log 2>&1 \
  || { tail -30 /tmp/liftgram-admin-deploy.log; exit 1; }
  $COMPOSE up -d --no-deps --wait admin"

echo "── 결과 확인 ──"
$SSH "
  cd $REMOTE/src
  [ \"\$(docker inspect -f '{{.State.Health.Status}}' \$($COMPOSE ps -q admin))\" = healthy ] || { echo '  !! 컨테이너가 준비되지 않았다'; exit 1; }
  curl -sf -m 10 http://127.0.0.1:$PORT/healthz >/dev/null || { echo '  !! healthz 실패'; exit 1; }
  curl -sf -m 10 http://127.0.0.1:$PORT/readyz >/dev/null || { echo '  !! readyz 실패 — 백엔드에 닿지 않는다'; exit 1; }
  # Access 토큰 없는 직접 접근은 원본에서도 거절돼야 한다.
  code=\$(curl -s -o /dev/null -m 10 -w '%{http_code}' http://127.0.0.1:$PORT/login)
  [ \"\$code\" = 403 ] || { echo \"  !! 토큰 없는 접근이 \$code — 입구 검증이 꺼져 있다\"; exit 1; }
  echo '  원본 healthz·readyz OK · 토큰 없는 접근 403'"
$SSH "echo $DEPLOY_SHA > $REMOTE/DEPLOYED_ADMIN_REF; echo $VERSION > $REMOTE/DEPLOYED_ADMIN_VERSION"

# 공개 주소는 사람이 터널 호스트명을 추가해야 생긴다. 없으면 건너뛰되 그렇다고 말한다.
ADMIN_SITE=$($SSH "grep '^ADMIN_URL=' $REMOTE/.env | cut -d= -f2")
code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$ADMIN_SITE/healthz" || true)
case "$code" in
  302|403) echo "  공개 주소 ${ADMIN_SITE} : Access 가 막고 있다($code)" ;;
  200) echo "  !! 공개 주소가 Access 없이 열려 있다 — Access 애플리케이션을 먼저 걸어라"; exit 1 ;;
  530|404) echo "  공개 주소 아직 없음($code) — 터널 공개 호스트명을 추가해야 한다" ;;
  000) echo "  ⚠ 공개 주소를 확인하지 못했다(연결 실패) — DNS·터널을 확인하고 Access 가 걸렸는지 직접 본다" ;;
  *) echo "  ⚠ 공개 주소 응답 $code — 터널 설정을 확인하라" ;;
esac
echo "운영 웹 v${VERSION} 배포 끝"
