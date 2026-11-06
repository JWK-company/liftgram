#!/usr/bin/env bash
# 공식 예시 글(ADR-060)을 운영에 넣거나 걷는다. 앱 배포(deploy-h2500-3.sh) 뒤에 돌린다.
#
#   bash scripts/seed-official-feed-h2500-3.sh           사진 복사 → 글 넣기 → 확인
#   bash scripts/seed-official-feed-h2500-3.sh --remove  글·사진 걷기
#
# 사진을 먼저 복사한다 — 글이 먼저 들어가면 그 사이에 깨진 사진이 보인다.
set -euo pipefail
cd "$(dirname "$0")/.."
HOST=${HOST:-h2500-3}
REMOTE=${REMOTE:-'~/liftgram/src'}
MODE=${1:-}

# 서버 .env 를 읽어 DB 이름·역할을 쓴다(값은 출력하지 않는다).
PSQL='U=$(grep ^POSTGRES_USER= .env|cut -d= -f2-); D=$(grep ^POSTGRES_DB= .env|cut -d= -f2-); docker exec -i liftgram-db-1 psql -q -v ON_ERROR_STOP=1 -At -U "${U:-app}" -d "${D:-app}"'

echo "── 사전 확인 ──"
ssh "$HOST" "cd $REMOTE
  provider=\$(grep ^STORAGE_PROVIDER= .env | cut -d= -f2- || true)
  [ -z \"\$provider\" ] || [ \"\$provider\" = disk ] || { echo '저장소가 disk 가 아니다'; exit 1; }
  grep ^DATABASE_URL= .env | grep -q '@db:' || { echo '앱 DB 가 compose db 가 아니다'; exit 1; }
  docker volume inspect liftgram_media >/dev/null"
echo "확인 완료"

if [ "$MODE" = "--remove" ]; then
  node scripts/seed-official-feed.mjs --remove | ssh "$HOST" "cd $REMOTE; $PSQL"
  ssh "$HOST" 'docker run --rm -v liftgram_media:/m alpine sh -c "rm -f /m/seed-official-*"'
  echo "걷기 완료"
  exit 0
fi

# 저장소 사본과 서버 사본이 다르면 복사 전에 멈춘다(커밋·배포를 빠뜨린 경우).
local_sum=$(cd scripts/feed-seed/images && shasum -a 256 * | shasum -a 256 | cut -d' ' -f1)
remote_sum=$(ssh "$HOST" "cd $REMOTE/scripts/feed-seed/images && sha256sum * | sha256sum | cut -d' ' -f1")
[ "$local_sum" = "$remote_sum" ] || { echo "서버의 사진이 저장소와 다르다 — 먼저 커밋·배포한다"; exit 1; }

echo "── 사진 복사 ──"
ssh "$HOST" "cd $REMOTE/scripts/feed-seed/images && docker run --rm -v liftgram_media:/m -v \"\$PWD\":/s:ro alpine sh -ec 'for f in /s/*; do t=/m/seed-official-\$(basename \$f); cp \$f \$t; chown \$(stat -c %u:%g /m) \$t; chmod 644 \$t; cmp \$f \$t; done; ls /m/seed-official-* | wc -l'"

echo "── 글 넣기 ──"
node scripts/seed-official-feed.mjs | ssh "$HOST" "cd $REMOTE; $PSQL"

echo "── 확인 ──"
want=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("scripts/feed-seed/posts.json","utf8")).length)')
got=$(echo "select count(*) from posts where id like 'seed-official-%' and official_meta is not null and moderation_status='approved' and visibility='public';" | ssh "$HOST" "cd $REMOTE; $PSQL")
[ "$got" = "$want" ] || { echo "글 수가 다르다: $got / $want"; exit 1; }
echo "공식 글 $got 개"

echo "── 안 쓰는 옛 사진 파일 지우기 ──"
keep=$(cd scripts/feed-seed/images && ls | sed 's/^/seed-official-/' | tr '\n' ' ')
ssh "$HOST" "docker run --rm -v liftgram_media:/m alpine sh -ec 'cd /m; for f in seed-official-*; do case \" $keep \" in *\" \$f \"*) ;; *) rm -f \"\$f\"; echo \"지움 \$f\";; esac; done; ls seed-official-* | wc -l'"
