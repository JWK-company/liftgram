#!/usr/bin/env bash
# @plm SRS-006  옛 배포 → 새 스택 데이터 이관 (전환 시점에 한 번)
#
# ─────────────────────────────────────────────────────────────────────────────
# 옛 서버(NestJS·Prisma)의 프로덕션 DB를 새 스택의 DB로 옮긴다.
#
# ── 왜 이 스크립트가 필요한가 ───────────────────────────────────────────────
# 두 스키마는 **컬럼을 맞춰 만들었지만 같지는 않다**:
#   · 옛쪽은 camelCase 컬럼("userId"), 새쪽은 snake_case(user_id)
#   · 옛 `Post.data`(불투명 JSON)를 새쪽은 **펼친 컬럼**으로 둔다(운동 요약·사진·장비)
#   · 좋아요·댓글 수를 새쪽은 컬럼으로 들고 있다 → 옮긴 뒤 **다시 세어** 채운다
#   · 옛 `Notification.type` → 새 `kind`
# 그래서 단순 덤프·복원이 되지 않는다.
#
# ── 안전 원칙 ───────────────────────────────────────────────────────────────
#   ① **읽기만 한다, 옛 DB는 절대 건드리지 않는다**(SELECT뿐)
#   ② 새 DB에 사람이 이미 있으면 멈춘다 — 실수로 두 번 돌려 섞이는 것을 막는다(`--force`로 넘김)
#   ③ 테이블마다 **한 트랜잭션** · `ON CONFLICT DO NOTHING`이라 중단 후 다시 돌려도 안전하다
#   ④ 마지막에 **양쪽 행 수를 비교**해 보여 준다 — 눈으로 확인하기 전에는 끝난 게 아니다
#
# ── 옮기지 않는 것 ──────────────────────────────────────────────────────────
#   · `RefreshToken` — 세션은 다시 만들면 된다. 옮기면 형식이 어긋난 토큰이 남는다
#   · `Device`·`PushToken` — 네이티브 푸시 전용(웹 스택에는 그 개념이 없다)
#   · 카탈로그(`exercises`) — 새 스택이 시드로 채운다. 사용자가 만든 종목은 `sync_records` 안에 있다
#
# ── 쓰는 법 ─────────────────────────────────────────────────────────────────
#   OLD_DATABASE_URL=postgres://…옛DB  NEW_DATABASE_URL=postgres://…새DB \
#     bash scripts/migrate-legacy.sh [--dry-run] [--force]
#
#   --dry-run  옮기지 않고 **양쪽 행 수만** 비교한다(먼저 이걸로 보라)
#   --force    새 DB에 이미 사람이 있어도 진행한다
#
# 전환 절차는 deploy/README.md의 "이관" 절에 있다. **백업을 뜨고 시작할 것.**
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DRY_RUN=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --force) FORCE=1 ;;
    *) echo "모르는 옵션: $arg" >&2; exit 2 ;;
  esac
done

: "${OLD_DATABASE_URL:?OLD_DATABASE_URL이 필요하다 (옛 배포의 DB — 읽기만 한다)}"
: "${NEW_DATABASE_URL:?NEW_DATABASE_URL이 필요하다 (새 스택의 DB — 여기에 쓴다)}"

command -v psql >/dev/null || { echo "psql이 필요하다 (brew install libpq)" >&2; exit 1; }

OLD() { psql "$OLD_DATABASE_URL" -v ON_ERROR_STOP=1 "$@"; }
NEW() { psql "$NEW_DATABASE_URL" -v ON_ERROR_STOP=1 "$@"; }

echo "▍ 연결 확인"
OLD -tAc "select 1" >/dev/null && echo "  옛 DB ✓"
NEW -tAc "select 1" >/dev/null && echo "  새 DB ✓"

# 새 DB가 마이그레이션을 마쳤는지 — 테이블이 없으면 서버를 한 번 띄워 스키마를 만들어야 한다.
NEW -tAc "select 1 from users limit 1" >/dev/null 2>&1 || {
  NEW -tAc "select to_regclass('public.users')" | grep -q users || {
    echo "새 DB에 스키마가 없다 — 새 스택을 한 번 띄워 마이그레이션을 돌린 뒤 다시 실행하라" >&2
    exit 1
  }
}

EXISTING=$(NEW -tAc "select count(*) from users")
if [ "$EXISTING" -gt 0 ] && [ "$FORCE" -eq 0 ] && [ "$DRY_RUN" -eq 0 ]; then
  echo "새 DB에 이미 사용자가 ${EXISTING}명 있다. 두 번 돌리면 섞인다 — 확인했다면 --force" >&2
  exit 1
fi

# ── 옮기는 순서 ──────────────────────────────────────────────────────────────
# 참조하는 쪽이 나중이다(사용자 → 글 → 댓글 → …). 순서를 바꾸면 외래키가 막는다.
#
# 각 항목: "이름|옛 SELECT|새 INSERT 대상(컬럼)"
# `COPY … TO STDOUT` → 임시 테이블 → `INSERT … ON CONFLICT DO NOTHING`.
# 임시 테이블을 거치는 이유: COPY에는 충돌 무시가 없어서, 다시 돌릴 수 없게 된다.

# 한 테이블을 옮긴다.
#
# **스테이징 테이블을 거친다.** `COPY`에는 "충돌하면 건너뛰기"가 없어서 곧바로 넣으면
# 중단 뒤 다시 돌릴 수 없다. 받아 놓고 `INSERT … ON CONFLICT DO NOTHING`으로 옮기면
# 몇 번을 다시 돌려도 결과가 같다.
#
# 임시(TEMP) 테이블이 아니라 **실체 테이블**을 쓰는 이유: 옛 DB에서 읽는 psql과 새 DB에
# 넣는 psql이 서로 다른 세션이라, 세션에 매인 임시 테이블로는 주고받을 수 없다.
copy_table() {
  local label="$1" select_sql="$2" target="$3" columns="$4"

  local n
  n=$(OLD -tAc "select count(*) from ($select_sql) s")
  if [ "$DRY_RUN" -eq 1 ]; then
    local have
    have=$(NEW -tAc "select count(*) from $target" 2>/dev/null || echo "?")
    printf "  %-26s 옛 %8s → 새 %8s\n" "$label" "$n" "$have"
    return
  fi

  printf "  %-26s %6s행 " "$label" "$n"

  # 넣을 컬럼만 뽑아 같은 타입의 빈 테이블을 만든다(`WITH NO DATA`).
  NEW -q -c "DROP TABLE IF EXISTS _mig_stage; CREATE TABLE _mig_stage AS SELECT $columns FROM $target WITH NO DATA;"

  # 옛 DB에서 읽어 새 DB의 스테이징으로 그대로 흘려보낸다 — 메모리에 쌓지 않는다.
  OLD -c "\\copy ($select_sql) TO STDOUT" | NEW -q -c "\\copy _mig_stage ($columns) FROM STDIN"

  NEW -q -c "INSERT INTO $target ($columns) SELECT $columns FROM _mig_stage ON CONFLICT DO NOTHING; DROP TABLE _mig_stage;"
  echo "✓"
}

echo
if [ "$DRY_RUN" -eq 1 ]; then
  echo "▍ 이관 (dry-run — 아무것도 쓰지 않는다)"
else
  echo "▍ 이관"
fi

# ① 사람 — 비밀번호 해시를 그대로 옮긴다(같은 방식이면 기존 비밀번호가 그대로 통한다).
copy_table "users" \
  'SELECT id, email, "displayName", "avatarUrl", "passwordHash", "authProvider", role, "experienceLevel", "trainerIntent", "createdAt", "updatedAt" FROM "User"' \
  users \
  'id, email, display_name, avatar_url, password_hash, auth_provider, role, experience_level, trainer_intent, created_at, updated_at'

# ② 관계 — 차단이 먼저다(가시성 판단이 이걸 본다).
copy_table "blocks" \
  'SELECT "blockerId", "blockedId", "createdAt" FROM "Block"' \
  blocks 'blocker_id, blocked_id, created_at'

copy_table "follows" \
  'SELECT "followerId", "followeeId", "createdAt" FROM "Follow"' \
  follows 'follower_id, followee_id, created_at'

# ③ 사진 — 글보다 먼저(글이 주소를 가리킨다).
copy_table "media_assets" \
  'SELECT id, "ownerId", key, url, "contentType", kind, bytes, flagged, "flagReason", "createdAt" FROM "MediaAsset"' \
  media_assets 'id, owner_id, key, url, content_type, kind, bytes, flagged, flag_reason, created_at'

# ④ 글 — **여기가 변환의 핵심**이다.
#    옛 `data`(불투명 JSON)를 새 스택의 펼친 컬럼으로 나눈다. 키 이름은 옛 앱이 쓰던 그대로다
#    (WorkoutSummaryScreen이 만들던 payload). 없는 키는 NULL로 남는다.
#    like_count·comment_count는 여기서 0으로 두고 마지막에 **실제로 세어** 채운다.
copy_table "posts" \
  $'SELECT id, "authorId", kind, caption, visibility, "moderationStatus",\n         data->>\'workoutId\',\n         data->>\'name\',\n         (data->>\'volumeKg\')::double precision,\n         (data->>\'setCount\')::int,\n         (data->>\'durationSeconds\')::int,\n         (data->>\'prCount\')::int,\n         CASE WHEN data->>\'imageUrl\' IS NULL THEN \'{}\'::text[] ELSE ARRAY[data->>\'imageUrl\'] END,\n         (data->>\'streakDays\')::int,\n         (data->>\'weeklyReached\')::boolean,\n         data->\'exercises\',\n         data->\'gear\',\n         "removedAt", "removedReason", "createdAt", "updatedAt"\n  FROM "Post"' \
  posts \
  'id, author_id, kind, caption, visibility, moderation_status, workout_id, workout_name, total_volume_kg, working_sets, duration_seconds, pr_count, media_urls, streak_days, weekly_reached, exercises, gear, removed_at, removed_reason, created_at, updated_at'

copy_table "post_hashtags" \
  'SELECT "postId", tag FROM "PostHashtag"' \
  post_hashtags 'post_id, tag'

copy_table "post_likes" \
  'SELECT "postId", "userId", "createdAt" FROM "PostLike"' \
  post_likes 'post_id, user_id, created_at'

copy_table "post_bookmarks" \
  'SELECT "postId", "userId", "createdAt" FROM "Bookmark"' \
  post_bookmarks 'post_id, user_id, created_at'

# 댓글 — 답글(parent_id)이 자기 테이블을 가리키므로 **부모가 먼저** 들어가야 한다.
copy_table "comments (부모)" \
  'SELECT id, "postId", "authorId", body, "moderationStatus", "createdAt", NULL::text, "removedAt" FROM "Comment" WHERE "parentId" IS NULL' \
  comments 'id, post_id, author_id, body, moderation_status, created_at, parent_id, removed_at'

copy_table "comments (답글)" \
  'SELECT id, "postId", "authorId", body, "moderationStatus", "createdAt", "parentId", "removedAt" FROM "Comment" WHERE "parentId" IS NOT NULL' \
  comments 'id, post_id, author_id, body, moderation_status, created_at, parent_id, removed_at'

copy_table "comment_likes" \
  'SELECT "commentId", "userId", "createdAt" FROM "CommentLike"' \
  comment_likes 'comment_id, user_id, created_at'

# ⑤ 스토리 — 만료된 것도 옮긴다(지우는 것은 스토리 규칙이 정한다, 이관이 정하지 않는다).
copy_table "stories" \
  'SELECT id, "authorId", "mediaUrl", caption, "moderationStatus", "createdAt", "expiresAt", "removedAt", "removedReason" FROM "Story"' \
  stories 'id, author_id, media_url, caption, moderation_status, created_at, expires_at, removed_at, removed_reason'

# ⑥ 대화 — 방 → 참가자 → 메시지 순서.
copy_table "conversations" \
  'SELECT id, "isGroup", "directKey", title, "createdAt", "updatedAt" FROM "Conversation"' \
  conversations 'id, is_group, direct_key, title, created_at, updated_at'

copy_table "conversation_participants" \
  'SELECT "conversationId", "userId", "lastReadAt", "joinedAt" FROM "ConversationParticipant"' \
  conversation_participants 'conversation_id, user_id, last_read_at, joined_at'

copy_table "messages" \
  'SELECT id, "conversationId", "senderId", kind, body, "mediaUrl", "createdAt" FROM "Message"' \
  messages 'id, conversation_id, sender_id, kind, body, media_url, created_at'

# ⑦ 알림 — 옛 `type`이 새 `kind`다(이름만 다르고 값은 같다).
copy_table "notifications" \
  'SELECT id, "userId", type, "actorId", "postId", "readAt", "createdAt" FROM "Notification"' \
  notifications 'id, user_id, kind, actor_id, post_id, read_at, created_at'

# ⑧ 신고·장비·코칭
copy_table "reports" \
  'SELECT id, "targetType", "targetId", "reporterId", reason, details, status, "reviewedBy", "reviewedAt", "actionTaken", "createdAt" FROM "Report"' \
  reports 'id, target_type, target_id, reporter_id, reason, details, status, reviewed_by, reviewed_at, action_taken, created_at'

copy_table "gear_clicks" \
  'SELECT id, "userId", "postId", category, source, kind, "createdAt" FROM "GearClick"' \
  gear_clicks 'id, user_id, post_id, category, source, kind, created_at'

copy_table "coaching_grants" \
  'SELECT id, "trainerId", "memberId", status, scope, "requestedBy", "consentAt", "revokedAt", "createdAt", "updatedAt" FROM "CoachingGrant"' \
  coaching_grants 'id, trainer_id, member_id, status, scope, requested_by, consent_at, revoked_at, created_at, updated_at'

copy_table "coaching_audits" \
  'SELECT id, "grantId", "actorId", action, detail, "createdAt" FROM "CoachingAudit"' \
  coaching_audits 'id, grant_id, actor_id, action, detail, created_at'

# ⑨ **운동 기록 전체** — 여기가 사용자 데이터의 대부분이다.
#    운동·루틴·세트·커스텀 종목이 전부 이 JSON 안에 있다. 옛 `version`은 새 스택에 없다(쓰지 않는다).
copy_table "sync_records" \
  'SELECT id, "userId", collection, "recordId", payload, deleted, "createdAt", "updatedAt" FROM "SyncRecord"' \
  sync_records 'id, user_id, collection, record_id, payload, deleted, created_at, updated_at'

if [ "$DRY_RUN" -eq 1 ]; then
  echo
  echo "dry-run이라 아무것도 쓰지 않았다. 위 숫자를 확인하고 옵션 없이 다시 실행하라."
  exit 0
fi

# ── 세어서 채우는 값 ─────────────────────────────────────────────────────────
# 좋아요·댓글 수를 새 스택은 컬럼으로 들고 있다(목록을 빠르게 그리려고).
# 옛 DB에는 그 컬럼이 없으므로 **옮긴 뒤 실제로 세어** 맞춘다 — 틀린 수는 화면에서 바로 보인다.
echo
echo "▍ 집계 다시 세기"
NEW -q <<'SQL'
BEGIN;
UPDATE posts p SET
  like_count    = (SELECT count(*) FROM post_likes l WHERE l.post_id = p.id),
  comment_count = (SELECT count(*) FROM comments  c WHERE c.post_id = p.id AND c.parent_id IS NULL
                                                      AND c.moderation_status = 'approved');
UPDATE comments c SET
  like_count  = (SELECT count(*) FROM comment_likes cl WHERE cl.comment_id = c.id),
  reply_count = (SELECT count(*) FROM comments r WHERE r.parent_id = c.id AND r.moderation_status = 'approved');
COMMIT;
SQL
echo "  posts.like_count·comment_count ✓"
echo "  comments.like_count·reply_count ✓"

# ── 검증 ─────────────────────────────────────────────────────────────────────
# 옮겼다고 끝이 아니다. **양쪽을 세어 눈으로 대조**한다 — 다르면 그 줄이 빨갛게 보인다.
echo
echo "▍ 검증 — 옛 DB와 새 DB의 행 수"
printf "  %-26s %10s %10s %s\n" "테이블" "옛" "새" ""
check() {
  local label="$1" old_q="$2" new_q="$3"
  local a b mark
  a=$(OLD -tAc "$old_q"); b=$(NEW -tAc "$new_q")
  if [ "$a" = "$b" ]; then mark="✓"; else mark="✗ 다르다"; fi
  printf "  %-26s %10s %10s %s\n" "$label" "$a" "$b" "$mark"
}
check "users"         'select count(*) from "User"'         'select count(*) from users'
check "follows"       'select count(*) from "Follow"'       'select count(*) from follows'
check "blocks"        'select count(*) from "Block"'        'select count(*) from blocks'
check "media_assets"  'select count(*) from "MediaAsset"'   'select count(*) from media_assets'
check "posts"         'select count(*) from "Post"'         'select count(*) from posts'
check "post_likes"    'select count(*) from "PostLike"'     'select count(*) from post_likes'
check "bookmarks"     'select count(*) from "Bookmark"'     'select count(*) from post_bookmarks'
check "hashtags"      'select count(*) from "PostHashtag"'  'select count(*) from post_hashtags'
check "comments"      'select count(*) from "Comment"'      'select count(*) from comments'
check "comment_likes" 'select count(*) from "CommentLike"'  'select count(*) from comment_likes'
check "stories"       'select count(*) from "Story"'        'select count(*) from stories'
check "conversations" 'select count(*) from "Conversation"' 'select count(*) from conversations'
check "participants"  'select count(*) from "ConversationParticipant"' 'select count(*) from conversation_participants'
check "messages"      'select count(*) from "Message"'      'select count(*) from messages'
check "notifications" 'select count(*) from "Notification"' 'select count(*) from notifications'
check "reports"       'select count(*) from "Report"'       'select count(*) from reports'
check "gear_clicks"   'select count(*) from "GearClick"'    'select count(*) from gear_clicks'
check "coaching"      'select count(*) from "CoachingGrant"' 'select count(*) from coaching_grants'
check "coaching_audit" 'select count(*) from "CoachingAudit"' 'select count(*) from coaching_audits'
check "sync_records"  'select count(*) from "SyncRecord"'   'select count(*) from sync_records'

echo
echo "▍ 운동 기록 표본 — 컬렉션별(사용자 데이터의 대부분이 여기 있다)"
NEW -c "SELECT collection, count(*) AS 행수 FROM sync_records GROUP BY collection ORDER BY 2 DESC;"

cat <<'DONE'

▍ 다음에 할 일 (사람이 확인한다)
  1. 새 배포에서 **옛 계정으로 로그인**해 본다 — 비밀번호 해시가 그대로 통하는지 확인
  2. 그 계정의 운동 기록이 보이는지(동기가 sync_records를 내려받는다)
  3. 사진이 뜨는지 — 옛 배포와 **다른 저장소**를 쓰면 주소가 살아 있어도 파일이 없다
     (같은 R2 버킷을 가리키게 하거나, 파일을 따로 옮겨야 한다)
  4. 그다음에야 옛 배포를 내린다
DONE
