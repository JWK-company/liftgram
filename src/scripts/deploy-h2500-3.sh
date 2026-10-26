#!/usr/bin/env bash
# @plm SRS-008  h2500-3 배포 — 커밋된 소스 동기 + 빌드 + 기동 + 결과 확인
#
#   bash scripts/deploy-h2500-3.sh            # HEAD 를 배포
#   DEPLOY_REF=<커밋> bash scripts/deploy-h2500-3.sh
#
# 구성: compose.yaml + compose.prod.yaml (DB 는 옛 배포의 Neon — compose.prod.yaml 머리말).
# 밖에서 들어오는 길은 Cloudflare 터널 하나다: liftgram.tarae.org → http://localhost:$WEB_PORT.
# 서버 쪽 `~/liftgram/src/.env` 는 사람이 만든다(비밀이 있다) — 이 스크립트는 **읽기만** 한다.
#
# 안전장치는 같은 서버의 booktarae 배포(booktarae/src/scripts/deploy-h2500-3.sh)가 실제 사고로
# 얻은 것을 그대로 옮겼다:
#   ① 작업 트리가 아니라 **커밋된 사본**(git worktree)에서 보낸다 — 미커밋 WIP 가 나가지 않는다
#   ② 서버를 건드리기 **전에** 디스크 여유를 본다 — 꽉 찬 공용 디스크에 빌드하면 남의 DB 까지 죽는다
#   ③ 지금 떠 있는 커밋과 비교해 **무엇이 새로 나가는지** 찍는다(서버의 DEPLOYED_REF)
#   ④ 끝에 상태코드가 아니라 **DB 까지 닿는지**(readyz)를 본다
set -euo pipefail
HOST=${HOST:-h2500-3}
HERE=$(cd "$(dirname "$0")/.." && pwd)
ROOT=$(cd "$HERE/.." && pwd)
REMOTE=${REMOTE:-'~/liftgram'}
SITE=${SITE:-https://liftgram.tarae.org}
MIN_FREE_GB=${MIN_FREE_GB:-40}
CACHE_CAP_GB=${CACHE_CAP_GB:-20}
IMAGE_KEEP_H=${IMAGE_KEEP_H:-24}
COMPOSE="docker compose -p liftgram -f compose.yaml -f compose.prod.yaml"
SSH="ssh -o BatchMode=yes $HOST"

# 움직이는 이름(HEAD·브랜치)은 여기서 한 번만 SHA 로 못 박는다 — 뒤에서 다시 해석하면
# 그 사이 옆 세션의 커밋이 끼어든다.
DEPLOY_REF=${DEPLOY_REF:-HEAD}
DEPLOY_SHA=$(git -C "$ROOT" rev-parse "$DEPLOY_REF") || { echo "!! DEPLOY_REF=$DEPLOY_REF 를 해석하지 못했습니다"; exit 1; }
SHORT=$(git -C "$ROOT" rev-parse --short "$DEPLOY_SHA")
echo "── 배포 대상: ${SHORT} ($(git -C "$ROOT" log -1 --format=%s "$DEPLOY_SHA" | cut -c1-60)) ──"

PREV=$($SSH "cat $REMOTE/DEPLOYED_REF 2>/dev/null" || true)
if [ -n "$PREV" ] && git -C "$ROOT" cat-file -e "${PREV}^{commit}" 2>/dev/null; then
  n=$(git -C "$ROOT" rev-list --count "${PREV}..${DEPLOY_SHA}")
  if [ "$PREV" = "$DEPLOY_SHA" ]; then
    echo "     새로 나갈 커밋 없음(재빌드만 한다)"
  elif [ "$n" = "0" ]; then
    echo "     ⚠ **되돌리기** — 라이브에서 사라질 것:"
    git -C "$ROOT" log --oneline "${DEPLOY_SHA}..${PREV}" | sed 's/^/       −/'
  else
    echo "     새로 나갈 커밋 ${n}건:"
    git -C "$ROOT" log --oneline "${PREV}..${DEPLOY_SHA}" -- src | sed 's/^/       /'
  fi
else
  echo "     (서버에 직전 배포 기록이 없다 — 첫 배포)"
fi

CLEAN=$(mktemp -d)
# trap 은 worktree 를 만들기 **전에** 건다 — 그 사이에 죽어도 사본이 남지 않게.
trap 'git -C "$ROOT" worktree remove --force "$CLEAN" >/dev/null 2>&1 || true; rm -rf "$CLEAN"' EXIT
git -C "$ROOT" worktree add --detach --quiet "$CLEAN" "$DEPLOY_SHA"
d=$(git -C "$ROOT" status --porcelain -- src | wc -l | tr -d ' ')
[ "$d" != "0" ] && echo "     작업 트리 미커밋 ${d}건 — **배포에는 들어가지 않는다**"

echo "── 여유 공간·설정 확인(서버를 건드리기 전에) ──"
$SSH "
  free=\$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
  echo \"  남은 공간 \${free}G (최소 ${MIN_FREE_GB}G)\"
  [ \"\$free\" -ge ${MIN_FREE_GB} ] || { echo '  !! 여유가 모자랍니다 — 빌드하지 않습니다(공용 디스크의 DB 가 함께 죽는다)'; exit 1; }
  f=$REMOTE/src/.env
  [ -f \$f ] || { echo \"  !! \$f 가 없다 — deploy/README.md 의 h2500-3 절대로 먼저 만든다\"; exit 1; }
  for k in DATABASE_URL JWT_SECRET APP_URL WEB_PORT; do
    grep -q \"^\$k=.\" \$f || { echo \"  !! .env 에 \$k 가 비었다\"; exit 1; }
  done
  echo '  .env 필수 키 OK'"

echo "── 소스 동기 ──"
$SSH "mkdir -p $REMOTE/src"
rsync -a --delete \
  --exclude '/.env' --exclude '/.env.*' \
  --exclude 'node_modules/' --exclude '.next/' \
  --exclude 'test-results/' --exclude 'playwright-report/' --exclude '.DS_Store' \
  "$CLEAN/src/" "$HOST:$REMOTE/src/"

echo "── 빌드·기동 (migrate 가 먼저 돌고 끝나야 backend 가 뜬다) ──"
$SSH "cd $REMOTE/src && $COMPOSE build backend frontend >/tmp/liftgram-deploy.log 2>&1 \
  || { tail -30 /tmp/liftgram-deploy.log; exit 1; }
  $COMPOSE up -d --wait --remove-orphans backend frontend 2>&1 | tail -5
  $COMPOSE logs --no-log-prefix migrate 2>&1 | tail -3"

echo "── 빌드 찌꺼기 회수(우리 것만) ──"
$SSH "docker builder prune -f --keep-storage ${CACHE_CAP_GB}GB 2>&1 | tail -1
  docker image prune -f --filter 'label=project=liftgram' --filter 'until=${IMAGE_KEEP_H}h' 2>&1 | tail -1
  df -h / | tail -1"

$SSH "echo $DEPLOY_SHA > $REMOTE/DEPLOYED_REF"

echo "── 결과 확인 ──"
# 컨테이너 안에서 먼저(터널과 무관하게 앱이 DB 까지 닿는가), 그다음 공개 주소.
$SSH "cd $REMOTE/src && port=\$(grep '^WEB_PORT=' .env | cut -d= -f2)
  curl -sf -m 10 http://127.0.0.1:\$port/api/readyz || { echo '  !! readyz 실패 — DB 에 닿지 않는다'; exit 1; }; echo"
code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE/api/readyz" || true)
if [ "$code" = "200" ]; then
  echo "  $SITE → readyz 200"
else
  echo "  ⚠ $SITE/api/readyz → ${code:-응답 없음} (터널 공개 호스트명 설정을 확인 — deploy/README.md)"
fi
echo "── 끝: ${SHORT} ──"
