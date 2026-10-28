#!/usr/bin/env bash
# @plm SRS-087  h2500-3 월 복원 시험 — 최신 일일 덤프를 임시 DB 로 되살려 행 수를 대조하고 결과를 남긴다
#
#   crontab:  47 4 1 * * $HOME/liftgram/src/scripts/restore-test-h2500-3.sh >> $HOME/liftgram/backups/backup.log 2>&1
#
# 「백업이 돌았다」와 「백업으로 되살릴 수 있다」는 다르다. 매달 한 번 실제로 되살려 본다:
#   ① 남은 임시 DB(liftgram_restore_test_%)부터 지운다 — kill -9·재부팅이면 trap 이 못 돈다(qa spec M-3)
#   ② [원본] 최신 daily/*.dump 와, 그 덤프를 뜰 때 같은 스냅샷에서 센 행 수(ops_backup_runs.counts)를 찾는다
#      [개선] **마지막으로 성공한 daily 줄**(ok · counts 있음)의 file= 로 덤프를 고른다(qa code M-4) — 가장 새 파일이
#      실패한 날의 것이어도 되살릴 수 있는 덤프로 시험한다. 그런 줄이 없거나 파일이 없으면 ok=false 로 남기고 끝.
#   ③ DB 디스크(컨테이너 PGDATA) 여유가 덤프 × 3 보다 작으면 시험하지 않고 ok=false detail=low_disk_db
#   ④ createdb → pg_restore --no-owner --exit-on-error → 임시 DB 에서 users·sync_records 를 센다(-d 로 대상 명시)
#   ⑤ ok = 덤프 때 센 값과 **정확히** 같다(qa spec M-2). 운영 DB 의 지금 값은 참고로 detail 에만.
#   ⑥ 결과 insert · 임시 DB 는 **항상** 지운다(trap EXIT).
# 같은 postgres 컨테이너 안에서만 한다(운영 DB 와 같은 클러스터 · 다른 이름). 운영 DB 에는 읽기와 결과 한 줄 쓰기뿐이다.
#
# 로컬 시험용으로 바꿔 끼울 수 있는 값(backup-h2500-3.sh 와 같다):
#   LIFTGRAM_DB_CONTAINER · BACKUP_DIR · LIFTGRAM_SRC · BACKUP_PG_USER · BACKUP_PG_DB
set -euo pipefail
DIR="${BACKUP_DIR:-$HOME/liftgram/backups}"
C="${LIFTGRAM_DB_CONTAINER:-liftgram-db-1}"
TS=$(date +%Y%m%d%H%M%S)
cd "${LIFTGRAM_SRC:-$HOME/liftgram/src}"
# .env 에서 DB 계정만 읽는다(값은 찍지 않는다).
U="${BACKUP_PG_USER:-$(grep '^POSTGRES_USER=' .env | cut -d= -f2-)}"
D="${BACKUP_PG_DB:-$(grep '^POSTGRES_DB=' .env | cut -d= -f2-)}"
PREFIX=liftgram_restore_test_
TMPDB="${PREFIX}${TS}"

STAGE=init
OK=0
SIZE=""
TABLES=""
FREE=""
COUNTS=""
DETAIL=""
CREATED=0

psql_main() { docker exec -i "$C" psql -q -t -A -v ON_ERROR_STOP=1 -U "$U" -d "$D" "$@"; }

record() {
  local rc=$?
  set +e
  # 임시 DB 는 항상 지운다 — 결과를 쓰기 전에(디스크를 먼저 돌려준다).
  if [ "$CREATED" = "1" ]; then
    docker exec "$C" dropdb -U "$U" --if-exists "$TMPDB" >/dev/null 2>&1 ||
      DETAIL="${DETAIL:+$DETAIL · }drop_failed db=$TMPDB"
  fi
  [ "$OK" = "1" ] || DETAIL="${DETAIL:+$DETAIL · }failed stage=$STAGE rc=$rc"
  local okb=false
  [ "$OK" = "1" ] && okb=true
  if ! psql_main -v ok="$okb" -v size="$SIZE" -v tables="$TABLES" -v free="$FREE" \
    -v detail="${DETAIL:0:500}" -v counts="$COUNTS" >/dev/null <<'SQL'
INSERT INTO ops_backup_runs (kind, ok, size_bytes, tables, disk_free_bytes, detail, counts)
VALUES ('restore_test', :'ok'::boolean, NULLIF(:'size', '')::bigint, NULLIF(:'tables', '')::int,
        NULLIF(:'free', '')::bigint, NULLIF(:'detail', ''), NULLIF(:'counts', '')::jsonb);
SQL
  then
    echo "$(date -Is) RECORD_FAILED restore_test ok=$okb stage=$STAGE detail=${DETAIL:0:200}"
  fi
  echo "$(date -Is) restore_test ok=$okb · ${DETAIL:0:300}"
  exit "$rc"
}
trap record EXIT

# ① 남은 임시 DB 정리(이름 규칙에 맞는 것만 — 다른 DB 는 건드리지 않는다)
STAGE=cleanup
left=$(psql_main -v pfx="$PREFIX" <<'SQL'
SELECT datname FROM pg_database WHERE starts_with(datname, :'pfx') AND datname ~ '^liftgram_restore_test_[0-9]+$';
SQL
)
for db in $left; do
  docker exec "$C" dropdb -U "$U" --if-exists "$db"
  DETAIL="${DETAIL:+$DETAIL · }dropped_leftover=$db"
done

# ② 덤프 + 그 덤프의 counts
STAGE=find_dump
# [원본] 가장 새 파일을 골랐다 — verify 에 실패한 날의 덤프면 counts 가 없어 「복원 불가」로 오판했다(qa code M-4)
# f=$(ls -1t "$DIR"/daily/*.dump 2>/dev/null | head -1 || true)
# [ -n "$f" ] || { DETAIL="${DETAIL:+$DETAIL · }no_dump"; exit 1; }
# name=$(basename "$f")
# SIZE=$(wc -c <"$f" | tr -d ' ')
# DETAIL="${DETAIL:+$DETAIL · }file=$name"
# expected=$(psql_main -v f="file=$name" <<'SQL'
# SELECT (counts->>'users') || ' ' || (counts->>'sync_records')
# FROM ops_backup_runs
# WHERE kind = 'daily' AND ok AND counts IS NOT NULL AND position(:'f' in detail) > 0
# ORDER BY id DESC LIMIT 1;
# SQL
# )
# [ -n "$expected" ] || { DETAIL="$DETAIL · no_counts"; exit 1; }
# [개선] 마지막 성공 daily 줄 → 파일 이름 · counts. 이름은 정규식으로 뽑아 경로 문자(/ ..)가 끼어들 수 없다.
pick=$(psql_main <<'SQL'
SELECT substring(detail from 'file=(liftgram-[0-9]{8}-[0-9]{6}\.dump)') || ' ' ||
       (counts->>'users') || ' ' || (counts->>'sync_records')
FROM ops_backup_runs
WHERE kind = 'daily' AND ok AND counts IS NOT NULL
  AND detail ~ 'file=liftgram-[0-9]{8}-[0-9]{6}\.dump'
ORDER BY id DESC LIMIT 1;
SQL
)
[ -n "$pick" ] || { DETAIL="${DETAIL:+$DETAIL · }no_ok_daily"; exit 1; }
name=${pick%% *}
expected=${pick#* }
DETAIL="${DETAIL:+$DETAIL · }file=$name"
f="$DIR/daily/$name"
[ -f "$f" ] || { DETAIL="$DETAIL · file_missing"; exit 1; }
SIZE=$(wc -c <"$f" | tr -d ' ')

# ③ DB 디스크 여유(컨테이너 안 PGDATA — 운영 DB 와 같은 디스크)
STAGE=disk
FREE=$(docker exec "$C" sh -c 'df -B1 --output=avail "${PGDATA:-/var/lib/postgresql/data}" | tail -1' | tr -dc '0-9')
if [ -z "$FREE" ] || [ "$FREE" -lt $((SIZE * 3)) ]; then
  DETAIL="$DETAIL · low_disk_db free=${FREE:-?} need=$((SIZE * 3))"
  exit 1
fi

# ④ 되살리기
STAGE=createdb
docker exec "$C" createdb -U "$U" "$TMPDB"
CREATED=1
STAGE=restore
docker exec -i "$C" pg_restore --no-owner --exit-on-error -U "$U" -d "$TMPDB" <"$f"
STAGE=count
restored=$(docker exec -i "$C" psql -q -t -A -v ON_ERROR_STOP=1 -U "$U" -d "$TMPDB" -c \
  "SELECT (SELECT count(*) FROM users) || ' ' || (SELECT count(*) FROM sync_records);")
COUNTS=$(docker exec -i "$C" psql -q -t -A -v ON_ERROR_STOP=1 -U "$U" -d "$TMPDB" -c \
  "SELECT json_build_object('users', (SELECT count(*) FROM users), 'sync_records', (SELECT count(*) FROM sync_records));")
TABLES=2
# 참고: 운영 DB 의 지금 값(백업 뒤 늘거나 줄었을 수 있다 — 판정에 쓰지 않는다)
prod=$(psql_main -c "SELECT (SELECT count(*) FROM users) || ' ' || (SELECT count(*) FROM sync_records);" || echo "?")

# ⑤ 판정
STAGE=compare
DETAIL="$DETAIL · expected=$expected restored=$restored prod=$prod"
[ "$restored" = "$expected" ] || { DETAIL="$DETAIL · mismatch"; exit 1; }
OK=1
STAGE=done
