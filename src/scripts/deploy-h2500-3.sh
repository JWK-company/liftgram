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
# [원본] trap 'git -C "$ROOT" worktree remove --force "$CLEAN" >/dev/null 2>&1 || true; rm -rf "$CLEAN"' EXIT
# [개선] SPEC-018 Phase 1 qa 운영 L-4 — 지운 사본의 worktree 기록도 걷는다
trap 'git -C "$ROOT" worktree remove --force "$CLEAN" >/dev/null 2>&1 || true; rm -rf "$CLEAN"; git -C "$ROOT" worktree prune >/dev/null 2>&1 || true' EXIT
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
  # 이용 기록 횟수 제한은 실제 IP 로 센다 — 꺼져 있으면 터널 뒤 전원이 한 키로 묶인다(SPEC-032).
  grep -q \"^TRUST_CF_CONNECTING_IP=1\" \$f || { echo \"  !! .env 에 TRUST_CF_CONNECTING_IP=1 이 없다\"; exit 1; }
  echo '  .env 필수 키 OK'"

# ── 안드로이드 APK — SPEC-018 (SRS-099 · ADR-047) ─────────────────────────────────
# 커밋된 사본($CLEAN)에서 서명 APK + android.json 을 만들어 웹 이미지의 public/downloads 에 싣는다
# (같은 versionCode 가 이 맥의 캐시에 있으면 다시 확인해 그것을 쓴다 — src/scripts/build-android-release.sh 머리말).
#   SKIP_APK=1             빌드하지 않고 **지금 사이트의** android.json·APK 를 되받아 검증한 뒤 그대로 싣는다(웹만 되돌릴 때)
#   ALLOW_APK_DOWNGRADE=1  사이트보다 낮은 versionCode 를 내보낸다(기본은 멈춤 · 운영 H-2)
#   ALLOW_SAME_APK=1       사이트와 같은 versionCode 인데 바이트가 다른 APK 를 내보낸다(기본은 멈춤 · Phase 1 qa 운영 H-1)
#   ALLOW_UNKNOWN_APK=1    사이트 android.json 을 읽지 못했어도(404 아닌 오류) 계속한다
# 출시 키 백업 표식(~/.liftgram-release/BACKED_UP = 지문)이 없으면 APK 를 내보내지 않는다(Phase 1 qa 보안 H-2 —
# 키를 잃으면 모든 사용자가 다시 설치해야 한다).
APK_ON=1
DL="$CLEAN/src/frontend/public/downloads"
RELDIR=${LIFTGRAM_RELEASE_DIR:-$HOME/.liftgram-release}
if [ ! -f "$CLEAN/src/mobile/release.json" ]; then
  # SPEC-018 이전 커밋 — 그 웹은 APK 를 쓰지 않는다(되돌리기 · Phase 1 qa 운영 M-2)
  APK_ON=0
  echo "── 안드로이드 APK: 이 커밋에는 src/mobile/release.json 이 없다 — 싣지 않는다(SPEC-018 이전 버전) ──"
fi
if [ "$APK_ON" = "1" ]; then
  echo "── 안드로이드 APK ──"
  jf() { python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$1" "$2"; }
  # 지금 사이트의 android.json — 404 만 「아직 없음」이고 그 밖의 실패는 멈춘다(하강·같은 번호 검사가 조용히 꺼지지 않게 · 운영 M-1)
  live_tmp=$(mktemp)
  live_code=$(curl -s -m 20 -o "$live_tmp" -w '%{http_code}' -H 'Cache-Control: no-cache' "$SITE/downloads/android.json?deploy=$(date +%s)" || echo 000)
  APK_LIVE_VC=""; APK_LIVE_SHA=""
  if [ "$live_code" = "200" ]; then
    APK_LIVE_VC=$(python3 -c 'import json,sys;print(int(json.load(open(sys.argv[1]))["versionCode"]))' "$live_tmp" 2>/dev/null || true)
    APK_LIVE_SHA=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["sha256"])' "$live_tmp" 2>/dev/null || true)
    [ -n "$APK_LIVE_VC" ] || { echo "!! 사이트 android.json 형식이 깨졌다"; [ "${ALLOW_UNKNOWN_APK:-0}" = "1" ] || exit 1; }
    echo "  사이트: versionCode ${APK_LIVE_VC:-?} (sha ${APK_LIVE_SHA:0:12})"
  elif [ "$live_code" = "404" ]; then
    echo "  사이트: android.json 없음(첫 APK 배포)"
  else
    echo "!! 사이트 android.json 을 읽지 못했다(HTTP ${live_code}) — 하강·같은 번호 검사를 할 수 없어 멈춘다(ALLOW_UNKNOWN_APK=1 로 넘김)"
    [ "${ALLOW_UNKNOWN_APK:-0}" = "1" ] || exit 1
  fi
  if [ "${SKIP_APK:-0}" = "1" ]; then
    [ -n "$APK_LIVE_VC" ] || { echo "!! SKIP_APK=1 인데 사이트의 android.json 이 없다 — 싣지 않으면 앱 업데이트 안내가 사라진다"; exit 1; }
    mkdir -p "$DL"
    cp "$live_tmp" "$DL/android.json"
    url=$(jf "$DL/android.json" url); want=$(jf "$DL/android.json" sha256); size=$(jf "$DL/android.json" size)
    vn=$(jf "$DL/android.json" versionName); vc=$(jf "$DL/android.json" versionCode)
    python3 -c 'import json,sys,re
d=json.load(open(sys.argv[1]))
ok=d.get("v")==1 and re.fullmatch(r"[0-9a-f]{64}",d["sha256"]) and re.fullmatch(r"[0-9a-f]{64}",d["certSha256"]) \
   and 0<int(d["minVersionCode"])<=int(d["versionCode"]) and 0<int(d["minSignedVersionCode"])<=int(d["versionCode"]) \
   and re.fullmatch(r"/downloads/liftgram-[0-9.]+-[0-9]+-[0-9a-f]{8}\.apk",d["url"]) and d["url"].split("-")[-1][:8]==d["sha256"][:8]
sys.exit(0 if ok else 1)' "$DL/android.json" || { echo "!! 사이트 android.json 의 값이 규칙에 맞지 않는다 — 다시 싣지 않는다"; exit 1; }
    curl -sf -m 300 -o "$DL/${url#/downloads/}" "$SITE$url" || { echo "!! 사이트 APK 를 되받지 못했다: $url"; exit 1; }
    [ "$(shasum -a 256 "$DL/${url#/downloads/}" | cut -d' ' -f1)" = "$want" ] || { echo "!! 되받은 APK 의 sha256 이 json 과 다르다"; exit 1; }
    [ "$(wc -c < "$DL/${url#/downloads/}" | tr -d ' ')" = "$size" ] || { echo "!! 되받은 APK 크기가 json 과 다르다"; exit 1; }
    # 빌드와 같은 검증(서명자 수·v2·v3·지문·패키지·버전·debuggable) — 서버를 신뢰 근거로 다시 쓰지 않는다(보안 L-2 · Phase 1 qa 보안 M-5)
    # 지문 기준은 지금 작업 트리의 release-cert.json(옛 커밋 사본에는 없을 수 있다)
    bash "$HERE/scripts/build-android-release.sh" --verify "$DL/${url#/downloads/}" "$vn" "$vc" "$ROOT" || { echo "!! 되받은 APK 검증 실패"; exit 1; }
    echo "  SKIP_APK=1 — 사이트의 versionCode ${APK_LIVE_VC} 를 그대로 싣는다"
  else
    cert=$(jf "$CLEAN/src/mobile/release-cert.json" sha256 2>/dev/null || true)
    marked=$(tr -d ' :\n' < "$RELDIR/BACKED_UP" 2>/dev/null | tr 'A-F' 'a-f' || true)
    if [ -z "$cert" ] || [ "$marked" != "$cert" ]; then
      echo "!! 출시 키 백업 표식이 없다(또는 지문이 다르다): $RELDIR/BACKED_UP"
      echo "   키를 잃으면 모든 사용자가 다시 설치해야 한다 — 암호화 사본 2벌을 만들고 복원 시험(지문 대조)까지 한 뒤:"
      echo "     echo ${cert:-<지문>} > $RELDIR/BACKED_UP"
      echo "   (APK 없이 웹만 내보내려면 SKIP_APK=1)"
      exit 1
    fi
    NEW_VC=$(python3 -c 'import json,sys;print(int(json.load(open(sys.argv[1]))["versionCode"]))' "$CLEAN/src/mobile/release.json")
    if [ -n "$APK_LIVE_VC" ] && [ "$NEW_VC" -lt "$APK_LIVE_VC" ] && [ "${ALLOW_APK_DOWNGRADE:-0}" != "1" ]; then
      echo "!! 앱 versionCode 가 ${APK_LIVE_VC} → ${NEW_VC} 로 **내려간다** — 이미 받은 사람은 설치할 수 없고 안내만 헷갈린다"
      echo "   (되돌리기는 웹만: SKIP_APK=1 · 정말 낮추려면 ALLOW_APK_DOWNGRADE=1)"
      exit 1
    fi
    bash "$CLEAN/src/scripts/build-android-release.sh" "$CLEAN" "$DL" || { echo "!! APK 빌드 실패 — 배포하지 않는다(서버는 아직 건드리지 않았다)"; exit 1; }
    # 같은 versionCode 에 다른 바이트 — 이 맥의 캐시가 없거나(다른 맥·지운 캐시) 커밋이 바뀌었다(Phase 1 qa 운영 H-1)
    built_sha=$(jf "$DL/android.json" sha256)
    if [ -n "$APK_LIVE_VC" ] && [ "$NEW_VC" = "$APK_LIVE_VC" ] && [ -n "$APK_LIVE_SHA" ] && [ "$built_sha" != "$APK_LIVE_SHA" ] && [ "${ALLOW_SAME_APK:-0}" != "1" ]; then
      echo "!! 사이트와 같은 versionCode ${NEW_VC} 인데 APK 바이트가 다르다(${APK_LIVE_SHA:0:12} → ${built_sha:0:12})"
      echo "   이미 받은 사람은 같은 번호라 업데이트를 못 받는다 — src/mobile/release.json 의 versionCode 를 올려라"
      echo "   (앱은 그대로 두고 웹만 내보내려면 SKIP_APK=1 · 알고 넘기려면 ALLOW_SAME_APK=1)"
      exit 1
    fi
  fi
  rm -f "$live_tmp"
  APK_URL=$(jf "$DL/android.json" url)
  APK_SHA=$(jf "$DL/android.json" sha256)
  APK_VC=$(jf "$DL/android.json" versionCode)
fi

# 운영 웹은 따로 배포한다(SPEC-033). 운영 웹이 없던 옛 커밋으로 되돌릴 때 --remove-orphans 가 그 컨테이너를 지워
# 공개 주소가 끊기지 않게, compose 에 admin 이 있을 때만 이 옵션을 쓴다.
ORPHANS=""
grep -q '^  admin:' "$CLEAN/src/compose.yaml" && ORPHANS="--remove-orphans"

echo "── 소스 동기 ──"
$SSH "mkdir -p $REMOTE/src"
rsync -a --delete \
  --exclude '/.env' --exclude '/.env.*' \
  --exclude 'node_modules/' --exclude '.next/' \
  --exclude 'test-results/' --exclude 'playwright-report/' --exclude '.DS_Store' \
  --exclude '/mobile/android/app/build/' --exclude '/mobile/android/build/' --exclude '/mobile/android/.gradle/' \
  --exclude '/mobile/android/capacitor-cordova-android-plugins/build/' --exclude '/mobile/native/lock-core-check/.build/' \
  "$CLEAN/src/" "$HOST:$REMOTE/src/"

echo "── 빌드·기동 (migrate 가 먼저 돌고 끝나야 backend 가 뜬다) ──"
$SSH "cd $REMOTE/src && $COMPOSE build backend frontend imagescan >/tmp/liftgram-deploy.log 2>&1 \
  || { tail -30 /tmp/liftgram-deploy.log; exit 1; }
  $COMPOSE up -d --wait $ORPHANS backend frontend imagescan 2>&1 | tail -5
  $COMPOSE logs --no-log-prefix migrate 2>&1 | tail -3
  # 위 tail 이 --wait 실패를 가린다. 검사기가 꺼져도 사이트는 정상으로 보이므로 여기서 멈춘다(SPEC-031).
  [ \"\$(docker inspect -f '{{.State.Health.Status}}' \$($COMPOSE ps -q imagescan))\" = healthy ] \
    || { echo '사진 검사 컨테이너가 준비되지 않았다'; exit 1; }"

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
# ── APK 끝 확인 — SPEC-018 (운영 M-3 · Phase 1 qa 운영 H-2·M-4 · 웹 L-5) ─────────────────
# DEPLOYED_REF 를 적은 **뒤**에 본다(웹은 이미 바뀌었다 — 기록이 옛 값으로 남으면 다음 배포의 스키마 하강 검사가 틀린 기준을 쓴다).
# 실패는 끝에서 0 아닌 코드로 알린다. 엣지 캐시를 피하려고 json 은 캐시 우회 질의로, Range 는 오리진(서버 안)에서 본다.
APK_FAIL=""
if [ "$APK_ON" = "1" ]; then
  echo "── 안드로이드 APK 확인 ──"
  apk_check() {
    local j vc sha tmp h code
    j=$(curl -sf -m 20 -H 'Cache-Control: no-cache' "$SITE/downloads/android.json?check=$(date +%s)") || { echo "android.json 을 받지 못했다"; return 1; }
    vc=$(printf '%s' "$j" | python3 -c 'import json,sys;print(json.load(sys.stdin)["versionCode"])') || { echo "android.json 형식"; return 1; }
    sha=$(printf '%s' "$j" | python3 -c 'import json,sys;print(json.load(sys.stdin)["sha256"])')
    [ "$vc" = "$APK_VC" ] && [ "$sha" = "$APK_SHA" ] || { echo "사이트 android.json 이 새 값과 다르다(versionCode ${vc} · sha ${sha:0:12})"; return 1; }
    h=$(curl -sI -m 20 "$SITE/downloads/android.json" | tr -d '\r') || { echo "android.json 헤더를 받지 못했다"; return 1; }
    grep -qi '^cache-control:.*no-store' <<<"$h" || { echo "android.json 에 no-store 가 없다"; return 1; }
    ! grep -qi '^cf-cache-status: *HIT' <<<"$h" || { echo "android.json 이 엣지 캐시에 잡혀 있다(cf-cache-status HIT)"; return 1; }
    tmp=$(mktemp)
    curl -sf -m 300 -o "$tmp" "$SITE$APK_URL" || { rm -f "$tmp"; echo "APK 를 받지 못했다: $APK_URL"; return 1; }
    [ "$(shasum -a 256 "$tmp" | cut -d' ' -f1)" = "$APK_SHA" ] || { rm -f "$tmp"; echo "받은 APK 의 sha256 이 다르다"; return 1; }
    rm -f "$tmp"
    h=$(curl -sI -m 20 "$SITE$APK_URL" | tr -d '\r') || { echo "APK 헤더를 받지 못했다"; return 1; }
    grep -qi '^content-type: *application/vnd.android.package-archive' <<<"$h" || { echo "APK Content-Type 이 다르다"; return 1; }
    grep -qi '^content-disposition: *attachment' <<<"$h" || { echo "APK Content-Disposition 이 attachment 가 아니다"; return 1; }
    grep -qi '^cache-control:.*immutable' <<<"$h" || { echo "APK 에 immutable 이 없다"; return 1; }
    code=$($SSH "cd $REMOTE/src && port=\$(grep '^WEB_PORT=' .env | cut -d= -f2) && curl -s -o /dev/null -w '%{http_code}' -m 20 -r 0-0 http://127.0.0.1:\$port$APK_URL" || echo 000)
    [ "$code" = "206" ] || { echo "오리진 APK Range 응답이 206 이 아니다(${code}) — 이어받기가 안 된다"; return 1; }
    echo "  versionCode ${APK_VC} · sha256 일치 · 헤더·오리진 Range OK"
  }
  APK_FAIL=$(apk_check 2>&1) && echo "$APK_FAIL" || { echo "  !! $APK_FAIL"; APK_FAIL="${APK_FAIL:-실패}"; }
  # 성공이면 위 echo 가 출력한 문구가 APK_FAIL 에 남지 않게
  # [원본] case "$APK_FAIL" in "  versionCode"*) APK_FAIL="" ;; esac — ssh 경고(post-quantum 등)가 앞줄에 붙으면 성공도 실패로 보였다(2026-11-03 v0.59.0 배포)
  # [개선] 성공 줄이 어디에든 있으면 성공
  printf '%s\n' "$APK_FAIL" | grep -q '^  versionCode .* OK$' && APK_FAIL=""
fi
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
if [ -n "${APK_FAIL:-}" ]; then
  echo "!! 웹은 배포됐지만 안드로이드 APK 확인이 실패했다: ${APK_FAIL}"
  echo "   (앱 업데이트 안내가 틀린 파일을 가리킬 수 있다 — 위 「안드로이드 APK 확인」을 보고 고친 뒤 다시 배포)"
  exit 1
fi
