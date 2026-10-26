#!/usr/bin/env bash
# @plm SRS-008  h2500-3 운영 백업 — DB 매일 · 사진 매주 (사용자 crontab에서 돈다)
#
#   crontab:  17 4 * * * $HOME/liftgram/src/scripts/backup-h2500-3.sh >> $HOME/liftgram/backups/backup.log 2>&1
#
# DB가 Neon에서 이 서버로 옮겨 왔다(2026-10-26). 그 전에는 Neon이 스냅샷을 쥐고 있었고,
# 이제는 **우리가 뜨지 않으면 아무도 안 뜬다.**
#   · DB    — 매일 pg_dump(-Fc) · 14개 보관
#   · 사진  — 일요일마다 named volume을 tar · 4개 보관
# ⚠ 같은 디스크다. 잘못된 삭제·마이그레이션은 되돌릴 수 있어도 **디스크 고장은 못 막는다** —
#   바깥으로 내보내는 사본이 필요해지면 이 디렉터리를 옮기면 된다.
set -euo pipefail
DIR="$HOME/liftgram/backups"
mkdir -p "$DIR/daily" "$DIR/media"
TS=$(date +%Y%m%d-%H%M%S)
cd "$HOME/liftgram/src"
# .env 에서 DB 계정만 읽는다(비밀이 로그에 남지 않게 값은 찍지 않는다).
U=$(grep '^POSTGRES_USER=' .env | cut -d= -f2-)
D=$(grep '^POSTGRES_DB=' .env | cut -d= -f2-)

f="$DIR/daily/liftgram-$TS.dump"
docker exec liftgram-db-1 pg_dump -U "$U" -d "$D" -Fc > "$f.part"
mv "$f.part" "$f"; chmod 600 "$f"
# 받은 덤프가 읽히는지까지 본다 — 0바이트·잘린 파일을 "백업했다"고 믿지 않는다.
n=$(docker exec -i liftgram-db-1 pg_restore -l < "$f" | grep -c 'TABLE DATA' || true)
echo "$(date -Is) db  $(du -h "$f" | cut -f1) · 테이블 데이터 ${n}개"
ls -1t "$DIR"/daily/*.dump | tail -n +15 | xargs -r rm -f

if [ "$(date +%u)" = "7" ] || [ "${FORCE_MEDIA:-0}" = "1" ]; then
  m="$DIR/media/media-$TS.tgz"
  docker run --rm -v liftgram_media:/m:ro alpine tar -C /m -czf - . > "$m.part"
  mv "$m.part" "$m"; chmod 600 "$m"
  echo "$(date -Is) media $(du -h "$m" | cut -f1)"
  ls -1t "$DIR"/media/*.tgz | tail -n +5 | xargs -r rm -f
fi
