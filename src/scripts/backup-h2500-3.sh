#!/usr/bin/env bash
# @plm SRS-049  h2500-3 운영 백업 — DB 매일 · 사진 매주 (사용자 crontab에서 돈다)
# @plm SRS-087  백업 결과 기록 — 끝날 때(성공·실패 모두) ops_backup_runs 에 한 줄 · 덤프와 같은 스냅샷의 행 수
#
#   crontab:  17 4 * * * $HOME/liftgram/src/scripts/backup-h2500-3.sh >> $HOME/liftgram/backups/backup.log 2>&1
#
# DB가 Neon에서 이 서버로 옮겨 왔다(2026-10-26). 그 전에는 Neon이 스냅샷을 쥐고 있었고,
# 이제는 **우리가 뜨지 않으면 아무도 안 뜬다.**
#   · DB    — 매일 pg_dump(-Fc) · 14개 보관
#   · 사진  — 일요일마다 named volume을 tar · 4개 보관 (결과 기록은 이번 범위 밖 — qa spec L-7)
# [원본] ⚠ 같은 디스크다. 잘못된 삭제·마이그레이션은 되돌릴 수 있어도 **디스크 고장은 못 막는다** —
#   바깥으로 내보내는 사본이 필요해지면 이 디렉터리를 옮기면 된다.
# [개선] 디스크: DB volume = /var/lib/docker(sdb) · 백업 = /home(sda · 다른 물리 디스크) — 하나가 고장 나도 둘이 같이 사라지지
#   않는다(2026-10-28 조사 · 스펙 Q1). 대신 결과를 남기고(이 파일) · 월 1회 되살려 보고(restore-test-h2500-3.sh) · /ops 에 보인다.
#
# ── 결과 기록(qa spec M-1·M-2) ──────────────────────────────────────────────
#   · `trap record EXIT` 하나 + 상태 변수(STAGE·OK) — set -e 로 중간에 죽어도 「어디서 죽었는지」가 남는다.
#   · insert 는 psql 변수 인용(:'detail') — 오류 문자열의 따옴표가 SQL 을 깨거나 끼어들지 못한다.
#   · 기록 insert 자체가 실패하면(DB 가 죽었다) 로그에 RECORD_FAILED — 운영 화면은 「36시간 성공 없음」으로 결국 알린다.
#   · counts = 덤프와 **같은 스냅샷**(pg_export_snapshot → pg_dump --snapshot)에서 센 users·sync_records 행 수.
#     복원 시험이 이 값과 정확히 같은지 본다. 스냅샷을 못 잡으면 덤프 직전 REPEATABLE READ 로 세고 detail 에 counts_approx.
#
# 로컬 시험용으로 바꿔 끼울 수 있는 값(운영에서는 쓰지 않는다):
#   LIFTGRAM_DB_CONTAINER(기본 liftgram-db-1) · BACKUP_DIR(기본 ~/liftgram/backups) · LIFTGRAM_SRC(.env 위치 · 기본 ~/liftgram/src)
#   BACKUP_PG_USER·BACKUP_PG_DB(.env 대신) · SKIP_MEDIA=1 · LOW_DISK_BYTES(기본 20GB)
set -euo pipefail
# [원본] DIR="$HOME/liftgram/backups"
DIR="${BACKUP_DIR:-$HOME/liftgram/backups}"
C="${LIFTGRAM_DB_CONTAINER:-liftgram-db-1}"
LOW_DISK_BYTES="${LOW_DISK_BYTES:-$((20 * 1024 * 1024 * 1024))}"
mkdir -p "$DIR/daily" "$DIR/media"
TS=$(date +%Y%m%d-%H%M%S)
# [원본] cd "$HOME/liftgram/src"
cd "${LIFTGRAM_SRC:-$HOME/liftgram/src}"
# .env 에서 DB 계정만 읽는다(비밀이 로그에 남지 않게 값은 찍지 않는다).
# [원본] U=$(grep '^POSTGRES_USER=' .env | cut -d= -f2-)
# [원본] D=$(grep '^POSTGRES_DB=' .env | cut -d= -f2-)
U="${BACKUP_PG_USER:-$(grep '^POSTGRES_USER=' .env | cut -d= -f2-)}"
D="${BACKUP_PG_DB:-$(grep '^POSTGRES_DB=' .env | cut -d= -f2-)}"

# ── 결과 기록 ────────────────────────────────────────────────────────────────
STAGE=init
OK=0
SIZE=""
TABLES=""
FREE=""
COUNTS=""
DETAIL=""
SNAP_PID=""
WORK=$(mktemp -d)

# 백업 디렉터리 디스크의 남은 바이트(GNU df · 안 되면 BSD df 로).
free_bytes() {
  local v
  v=$(df -B1 --output=avail "$1" 2>/dev/null | tail -1 | tr -dc '0-9') || true
  [ -n "$v" ] || v=$(df -k "$1" 2>/dev/null | awk 'NR==2{print $4*1024}') || true
  echo "${v:-}"
}

record() {
  local rc=$?
  set +e
  # 스냅샷을 쥔 세션이 남아 있으면 닫는다(덤프 중 죽은 경우).
  if [ -n "$SNAP_PID" ]; then
    exec 3>&- 2>/dev/null
    wait "$SNAP_PID" 2>/dev/null
  fi
  rm -rf "$WORK"
  FREE=$(free_bytes "$DIR")
  if [ -n "$FREE" ] && [ "$FREE" -lt "$LOW_DISK_BYTES" ]; then
    DETAIL="${DETAIL:+$DETAIL · }low_disk free=$((FREE / 1024 / 1024 / 1024))G"
  fi
  if [ "$OK" != "1" ]; then
    DETAIL="${DETAIL:+$DETAIL · }failed stage=$STAGE rc=$rc"
  fi
  local okb=false
  [ "$OK" = "1" ] && okb=true
  # 변수는 전부 psql 이 인용한다(:'x') — -c 는 변수 치환을 하지 않으므로 표준 입력으로 보낸다.
  if ! docker exec -i "$C" psql -q -v ON_ERROR_STOP=1 -U "$U" -d "$D" \
    -v ok="$okb" -v size="$SIZE" -v tables="$TABLES" -v free="$FREE" -v detail="${DETAIL:0:500}" -v counts="$COUNTS" \
    >/dev/null <<'SQL'
INSERT INTO ops_backup_runs (kind, ok, size_bytes, tables, disk_free_bytes, detail, counts)
VALUES ('daily', :'ok'::boolean, NULLIF(:'size', '')::bigint, NULLIF(:'tables', '')::int,
        NULLIF(:'free', '')::bigint, NULLIF(:'detail', ''), NULLIF(:'counts', '')::jsonb);
SQL
  then
    echo "$(date -Is) RECORD_FAILED daily ok=$okb stage=$STAGE detail=${DETAIL:0:200}"
  fi
  [ "$OK" = "1" ] || echo "$(date -Is) db  실패 — stage=$STAGE rc=$rc"
  exit "$rc"
}
trap record EXIT

COUNT_SQL="SELECT json_build_object('users', (SELECT count(*) FROM users), 'sync_records', (SELECT count(*) FROM sync_records));"

# ── 행 수: 덤프와 같은 스냅샷 ────────────────────────────────────────────────
# 세션 하나가 REPEATABLE READ 트랜잭션을 열어 스냅샷을 내보내고(pg_export_snapshot) 그 스냅샷으로 센다.
# pg_dump 가 같은 스냅샷(--snapshot)으로 뜨는 동안 그 트랜잭션을 열어 둔다 — 덤프의 행 수 = counts.
STAGE=counts
SNAP=""
mkfifo "$WORK/in"
docker exec -i "$C" psql -q -t -A -v ON_ERROR_STOP=1 -U "$U" -d "$D" <"$WORK/in" >"$WORK/out" 2>"$WORK/err" &
SNAP_PID=$!
exec 3>"$WORK/in"
printf 'BEGIN ISOLATION LEVEL REPEATABLE READ;\nSELECT pg_export_snapshot();\n%s\n' "$COUNT_SQL" >&3
for _ in $(seq 1 100); do
  [ "$(wc -l <"$WORK/out" | tr -d ' ')" -ge 2 ] && break
  kill -0 "$SNAP_PID" 2>/dev/null || break
  sleep 0.1
done
if [ "$(wc -l <"$WORK/out" | tr -d ' ')" -ge 2 ]; then
  SNAP=$(sed -n 1p "$WORK/out")
  COUNTS=$(sed -n 2p "$WORK/out")
else
  # 스냅샷을 못 잡았다 — 세션을 닫고 덤프 직전 REPEATABLE READ 로 센다(차이는 덤프 몇 초 사이의 쓰기뿐).
  exec 3>&-
  wait "$SNAP_PID" 2>/dev/null || true
  SNAP_PID=""
  COUNTS=$(printf 'BEGIN ISOLATION LEVEL REPEATABLE READ;\n%s\nCOMMIT;\n' "$COUNT_SQL" |
    docker exec -i "$C" psql -q -t -A -v ON_ERROR_STOP=1 -U "$U" -d "$D")
  DETAIL="counts_approx"
fi

STAGE=dump
f="$DIR/daily/liftgram-$TS.dump"
# [원본] docker exec liftgram-db-1 pg_dump -U "$U" -d "$D" -Fc > "$f.part"
docker exec "$C" pg_dump -U "$U" -d "$D" -Fc ${SNAP:+--snapshot="$SNAP"} >"$f.part"
if [ -n "$SNAP_PID" ]; then
  echo 'COMMIT;' >&3
  exec 3>&-
  wait "$SNAP_PID" || true
  SNAP_PID=""
fi
mv "$f.part" "$f"; chmod 600 "$f"
# 받은 덤프가 읽히는지까지 본다 — 0바이트·잘린 파일을 "백업했다"고 믿지 않는다.
STAGE=verify
# [원본] n=$(docker exec -i liftgram-db-1 pg_restore -l < "$f" | grep -c 'TABLE DATA' || true)
n=$(docker exec -i "$C" pg_restore -l <"$f" | grep -c 'TABLE DATA' || true)
[ "$n" -gt 0 ] || { DETAIL="${DETAIL:+$DETAIL · }empty_dump"; exit 1; }
SIZE=$(wc -c <"$f" | tr -d ' ')
TABLES="$n"
# 복원 시험이 이 덤프의 counts 를 찾는 열쇠(파일 이름).
DETAIL="file=$(basename "$f")${DETAIL:+ · $DETAIL}"
OK=1
echo "$(date -Is) db  $(du -h "$f" | cut -f1) · 테이블 데이터 ${n}개 · ${COUNTS}"
STAGE=rotate
ls -1t "$DIR"/daily/*.dump | tail -n +15 | xargs -r rm -f

if [ "${SKIP_MEDIA:-0}" != "1" ] && { [ "$(date +%u)" = "7" ] || [ "${FORCE_MEDIA:-0}" = "1" ]; }; then
  # 사진이 실패해도 DB 줄은 성공으로 남긴다(사진 결과 기록은 이번 범위 밖) — 실패는 로그와 detail 에.
  STAGE=media
  m="$DIR/media/media-$TS.tgz"
  if docker run --rm -v liftgram_media:/m:ro alpine tar -C /m -czf - . >"$m.part"; then
    mv "$m.part" "$m"; chmod 600 "$m"
    echo "$(date -Is) media $(du -h "$m" | cut -f1)"
    ls -1t "$DIR"/media/*.tgz | tail -n +5 | xargs -r rm -f
  else
    rm -f "$m.part"
    DETAIL="$DETAIL · media_failed"
    echo "$(date -Is) media 실패"
  fi
fi
STAGE=done
