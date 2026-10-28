#!/usr/bin/env bash
# @plm SRS-049  h2500-3 배포 — 커밋된 소스 동기 + 빌드 + 기동 + 결과 확인
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

# ── 버전 — 배포마다 SemVer 가 올라가야 한다(deploy/README.md "버전") ────────────────
# 커밋은 새로 나가는데 버전이 그대로면 **멈춘다**(2026-10-26: DB 이전 배포가 번호 없이 나갔다).
# 같은 커밋을 다시 올리는 재배포만 같은 버전을 허락한다. 일부러 넘기려면 ALLOW_SAME_VERSION=1.
VERSION=$(node -p "require('$CLEAN/src/frontend/package.json').version")
BUILD=$(git -C "$ROOT" rev-list --count "$DEPLOY_SHA")
PREV_VERSION=$($SSH "cat $REMOTE/DEPLOYED_VERSION 2>/dev/null" || true)
echo "     버전 v${VERSION} (build ${BUILD}) · 지금 떠 있는 것 v${PREV_VERSION:-?}"
if [ -n "$PREV_VERSION" ] && [ "$VERSION" = "$PREV_VERSION" ] && [ "$PREV" != "$DEPLOY_SHA" ] && [ "${ALLOW_SAME_VERSION:-0}" != "1" ]; then
  echo "!! 새 커밋이 나가는데 버전이 v${VERSION} 그대로다 — src/frontend/package.json 을 올리고 커밋하라"
  echo "   (기능 = MINOR · 고침·설정·문구 = PATCH · 깨지는 변경 = MAJOR)"
  exit 1
fi
# ── 로컬 스키마 하강 차단(D-5) — @plm SRS-073 SAD-023 ──────────────────────────────
# 기기 DB(LokiJS)는 앱 스키마보다 높은 버전을 만나면 **기록을 전부 지운다**. 그래서 지금 떠 있는 배포본보다
# SCHEMA_VERSION 이 낮은 번들은 내보내지 않는다(롤백은 앞으로만 고치기).
# [원본] 비교 대상 = 서버에 동기된 소스 사본 하나 — 못 읽으면(ssh 일시 실패·형식 변경) 검사 없이 통과했고, 빌드가 실패한
#        배포 뒤에는 「마지막으로 rsync 한 소스」가 라이브와 달랐다(QA CD-8).
# [개선] 기준 = 라이브 커밋(서버 DEPLOYED_REF — 빌드·기동이 끝난 뒤에만 적힌다)의 schema.ts(git show) · 서버 사본은 보조.
#        라이브 커밋이 있는데 둘 다 못 읽으면 **멈춘다**(ALLOW_UNKNOWN_SCHEMA=1 로만 넘긴다).
schema_of() { sed -n 's/^export const SCHEMA_VERSION = \([0-9][0-9]*\);.*/\1/p' | head -1; }
SCHEMA=$(schema_of < "$CLEAN/src/core/src/db/schema.ts")
PREV_SCHEMA=""
SCHEMA_FROM=""
if [ -n "$PREV" ]; then
  PREV_SCHEMA=$(git -C "$ROOT" show "$PREV:src/core/src/db/schema.ts" 2>/dev/null | schema_of || true)
  [ -n "$PREV_SCHEMA" ] && SCHEMA_FROM="라이브 커밋 ${PREV:0:7}"
fi
if [ -z "$PREV_SCHEMA" ]; then
  PREV_SCHEMA=$($SSH "cat $REMOTE/src/core/src/db/schema.ts 2>/dev/null" | schema_of || true)
  [ -n "$PREV_SCHEMA" ] && SCHEMA_FROM="서버 소스 사본"
fi
[ -n "$SCHEMA" ] || { echo "!! 배포 사본에서 SCHEMA_VERSION 을 읽지 못했다(core/src/db/schema.ts)"; exit 1; }
echo "     로컬 스키마 v${SCHEMA} · 지금 떠 있는 것 v${PREV_SCHEMA:-?}${SCHEMA_FROM:+ (${SCHEMA_FROM})}"
if [ -n "$PREV" ] && [ -z "$PREV_SCHEMA" ]; then
  echo "!! 지금 떠 있는 배포본(${PREV:0:7})의 스키마 버전을 읽지 못했다 — 하강 검사를 할 수 없어 멈춘다"
  echo "   (git fetch 로 그 커밋을 받거나 ssh 를 확인하라 · 알고 넘기려면 ALLOW_UNKNOWN_SCHEMA=1)"
  [ "${ALLOW_UNKNOWN_SCHEMA:-0}" = "1" ] || exit 1
  echo "   ALLOW_UNKNOWN_SCHEMA=1 — 검사 없이 계속한다"
fi
if [ -n "$PREV_SCHEMA" ] && [ "$SCHEMA" -lt "$PREV_SCHEMA" ]; then
  echo "!! 로컬 스키마가 v${PREV_SCHEMA} → v${SCHEMA} 로 **내려간다** — 배포하지 않는다"
  echo "   (옛 번들이 새 DB 를 열면 기기 기록이 지워진다 · 롤백 대신 앞으로 고쳐서 내보내라)"
  exit 1
fi
# 프로필 하단에 보이는 빌드 번호·커밋 — 커밋된 것은 "dev" 자리표시자이고, 배포 사본에만 찍는다.
printf '{ "build": "%s", "commit": "%s" }\n' "$BUILD" "$SHORT" > "$CLEAN/src/frontend/app/build-info.json"

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

# ── 백업 cron 확인 — @plm SRS-087 ────────────────────────────────────────────────
# 사용자 crontab 에 매일 백업·월 복원 시험 두 줄이 있어야 한다. 없으면 더하고 알린다 · 있으면 그대로 둔다.
# 빈 crontab 은 `crontab -l` 이 1 로 끝난다 → set -e 에 안 걸리게 `|| true`(qa spec L-4). 중복은 스크립트 경로로 grep 해 막는다
# (시각을 사람이 손으로 바꿔 둔 줄도 「있음」으로 본다).
echo "── 백업 cron 확인 ──"
$SSH 'set -e
  chmod +x $HOME/liftgram/src/scripts/backup-h2500-3.sh $HOME/liftgram/src/scripts/restore-test-h2500-3.sh
  cur=$(crontab -l 2>/dev/null || true)
  new="$cur"
  added=""
  B="17 4 * * * \$HOME/liftgram/src/scripts/backup-h2500-3.sh >> \$HOME/liftgram/backups/backup.log 2>&1"
  R="47 4 1 * * \$HOME/liftgram/src/scripts/restore-test-h2500-3.sh >> \$HOME/liftgram/backups/backup.log 2>&1"
  printf "%s\n" "$cur" | grep -q "liftgram/src/scripts/backup-h2500-3.sh" || { new="${new:+$new
}$B"; added="$added 매일백업"; }
  printf "%s\n" "$cur" | grep -q "liftgram/src/scripts/restore-test-h2500-3.sh" || { new="${new:+$new
}$R"; added="$added 복원시험"; }
  if [ -n "$added" ]; then
    printf "%s\n" "$new" | crontab -
    # [원본] echo "  ⚠ crontab 에 추가:$added — 첫 배포면 두 스크립트를 손으로 한 번씩 돌려 첫 줄을 만든다(운영 화면 「기록 없음」 방지)"
    # [개선] 순서를 말한다(qa code M-3) — 끝의 「첫 백업 기록 확인」이 명령까지 다시 안내한다
    echo "  ⚠ crontab 에 추가:$added — 첫 배포면 ① backup-h2500-3.sh → ② restore-test-h2500-3.sh 순서로 손으로 한 번씩"
  else
    echo "  crontab 두 줄 있음(매일 백업 · 월 복원 시험)"
  fi'

$SSH "echo $DEPLOY_SHA > $REMOTE/DEPLOYED_REF; echo $VERSION > $REMOTE/DEPLOYED_VERSION"
# 배포된 버전에 태그를 단다 — 「v0.18.2 에 무엇이 들어 있었나」를 git 이 답하게.
if git -C "$ROOT" rev-parse -q --verify "refs/tags/v$VERSION" >/dev/null; then
  [ "$(git -C "$ROOT" rev-list -n1 "v$VERSION")" = "$DEPLOY_SHA" ] || echo "  ⚠ 태그 v$VERSION 이 다른 커밋에 이미 있다(재배포면 무시)"
else
  git -C "$ROOT" tag -a "v$VERSION" "$DEPLOY_SHA" -m "release v$VERSION (build $BUILD)" &&
    git -C "$ROOT" push -q origin "v$VERSION" 2>/dev/null && echo "  태그 v$VERSION 푸시" || echo "  ⚠ 태그 v$VERSION 푸시 실패(로컬에는 있다)"
fi

echo "── 결과 확인 ──"
# 컨테이너 안에서 먼저(터널과 무관하게 앱이 DB 까지 닿는가), 그다음 공개 주소.
$SSH "cd $REMOTE/src && port=\$(grep '^WEB_PORT=' .env | cut -d= -f2)
  curl -sf -m 10 http://127.0.0.1:\$port/api/readyz || { echo '  !! readyz 실패 — DB 에 닿지 않는다'; exit 1; }; echo"
# 메일이 켜져 있으면 SMTP 로그인까지 본다(보내지는 않는다) — 배포가 "끝"이라 해도 가입 확인·재설정 메일이
# 안 나가면 사용자는 오지 않을 메일을 기다린다(booktarae 2026-10-01 실사 F1: 거절을 아무도 몰랐다).
$SSH "cd $REMOTE/src && if grep -q '^MAIL_TRANSPORT=smtp' .env; then
  H=\$(grep '^MAIL_SMTP_HOST=' .env | cut -d= -f2-) PORT=\$(grep '^MAIL_SMTP_PORT=' .env | cut -d= -f2-) \
  U=\$(grep '^MAIL_SMTP_USER=' .env | cut -d= -f2-) P=\$(grep '^MAIL_SMTP_PASSWORD=' .env | cut -d= -f2-) python3 -c '
import os,smtplib,ssl,sys
h,p=os.environ[\"H\"],int(os.environ.get(\"PORT\") or 587)
try:
  s=smtplib.SMTP_SSL(h,p,context=ssl.create_default_context(),timeout=15) if p==465 else smtplib.SMTP(h,p,timeout=15)
  if p!=465: s.starttls(context=ssl.create_default_context())
  s.login(os.environ[\"U\"],os.environ[\"P\"]); s.quit(); print(\"  메일 발신 점검 OK\")
except Exception as e:
  print(\"  !! 메일 발신 점검 실패 —\", type(e).__name__, e); sys.exit(1)
'; else echo '  메일: console(꺼짐) — 화면이 확인 안내를 숨긴다'; fi"
code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 "$SITE/api/readyz" || true)
if [ "$code" = "200" ]; then
  echo "  $SITE → readyz 200"
else
  echo "  ⚠ $SITE/api/readyz → ${code:-응답 없음} (터널 공개 호스트명 설정을 확인 — deploy/README.md)"
fi
# ── 첫 백업 기록 확인 — @plm SRS-087 (qa code M-3) ───────────────────────────────
# 복원 시험은 「counts 가 있는 성공 daily 줄」이 있어야 시험할 수 있다. 이 기록 방식 전에 뜬 덤프에는 counts 가 없다 —
# 그래서 첫 배포 뒤 복원 시험을 **먼저** 돌리면 ok=false 가 남아 다음 달 1일까지 /ops 가 restore_failed 로 빨갛다.
# 안 돌리면 restore_none 이 다음 달 1일까지 켜진다. 기록이 없을 때만 순서를 못박아 안내한다(읽기만 · 자동 실행 안 함).
echo "── 첫 백업 기록 확인 ──"
first=$($SSH "cd $REMOTE/src && U=\$(grep '^POSTGRES_USER=' .env | cut -d= -f2-) && D=\$(grep '^POSTGRES_DB=' .env | cut -d= -f2-) &&
  docker exec liftgram-db-1 psql -q -t -A -U \"\$U\" -d \"\$D\" -c \"SELECT count(*) FILTER (WHERE kind='daily' AND ok AND counts IS NOT NULL) || ' ' || count(*) FILTER (WHERE kind='restore_test') FROM ops_backup_runs\"" 2>/dev/null || echo "? ?")
okd=${first%% *}
rst=${first##* }
if [ "$okd" = "0" ] || [ "$rst" = "0" ] || [ "$okd" = "?" ]; then
  echo "  ⚠ 첫 백업 기록이 아직 없다(성공 daily ${okd} · 복원 시험 ${rst}) — 서버에서 **이 순서로** 한 번:"
  echo "     ① ~/liftgram/src/scripts/backup-h2500-3.sh       >> ~/liftgram/backups/backup.log 2>&1"
  echo "     ② ~/liftgram/src/scripts/restore-test-h2500-3.sh >> ~/liftgram/backups/backup.log 2>&1"
  echo "     (②를 먼저 돌리면 counts 없는 옛 덤프만 있어 ok=false → 다음 달 1일까지 /ops 「복원 시험 실패」)"
else
  echo "  성공 daily ${okd}줄 · 복원 시험 ${rst}줄"
fi
echo "── 끝: v${VERSION} (build ${BUILD}) · ${SHORT} ──"
