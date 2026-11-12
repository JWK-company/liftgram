-- 이달의 리프터(SPEC-063 · SRS-117) — 집계·수상 읽기·쓰기.
--
-- 집계는 운영 통계(admin.sql)와 같은 jsonb 형식을 쓴다: 숫자 칸은 CASE 안에서만 형변환한다(문자열 하나에 쿼리 전체가 깨지지 않게).
-- 달 경계는 Go 가 KST 로 계산해 ms·시각으로 넘긴다(MonthBounds).

-- 운동한 날 — 완료·앱 기록(source null)·10분 이상·그 달에 시작. 서버 수신 시각이 시작 −1시간 ~ +3일 밖이면
-- 지난 날짜를 몰아 올린 기록으로 보고 세지 않는다(late 로 따로 센다 · REV-153).
-- name: AwardWorkoutDays :many
WITH w AS (
  SELECT s.user_id, s.created_at,
         CASE WHEN jsonb_typeof(s.payload->'started_at') = 'number'
              THEN (s.payload->'started_at')::numeric END AS st,
         CASE WHEN jsonb_typeof(s.payload->'duration_seconds') = 'number'
              THEN (s.payload->'duration_seconds')::numeric END AS dur
  FROM sync_records s
  WHERE s.collection = 'workouts' AND s.deleted = false
    AND s.created_at >= @since::timestamptz AND s.created_at < @until::timestamptz
    AND (sqlc.narg('only_user')::text IS NULL OR s.user_id = sqlc.narg('only_user')::text)
    AND s.payload->'state' = '"completed"'::jsonb
    AND coalesce(s.payload->'source', 'null'::jsonb) = 'null'::jsonb
), m AS (
  SELECT user_id, st,
         (created_at >= to_timestamp(((st - 3600000) / 1000)::float8)
          AND created_at <= to_timestamp(((st + 259200000) / 1000)::float8)) AS ok
  FROM w
  WHERE st >= @from_ms::bigint AND st < @to_ms::bigint AND dur >= 600
)
SELECT user_id,
       count(DISTINCT to_char(to_timestamp((st / 1000)::float8) AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD'))
         FILTER (WHERE ok)::bigint AS days,
       count(*) FILTER (WHERE NOT ok)::bigint AS late
FROM m
GROUP BY user_id;

-- 인정 좋아요 — 그 달에 눌린 좋아요 중 공개·승인·공식 아닌 글, 누른 사람 ≠ 작성자,
-- 누른 사람은 일반 계정·통계 제외 아님·그 시각 메일 확인·가입 7일, 서로 차단 없음.
-- 누른 사람 한 명이 같은 작성자에게 준 것은 한 달 5개까지(품앗이 완화 · REV-153).
-- name: AwardLikes :many
WITH l AS (
  SELECT p.author_id, pl.user_id AS liker
  FROM post_likes pl
  JOIN posts p ON p.id = pl.post_id
  JOIN users lu ON lu.id = pl.user_id
  WHERE pl.created_at >= @from_ts::timestamptz AND pl.created_at < @to_ts::timestamptz
    AND (sqlc.narg('only_author')::text IS NULL OR p.author_id = sqlc.narg('only_author')::text)
    AND p.visibility = 'public' AND p.moderation_status = 'approved' AND p.official_meta IS NULL
    AND pl.user_id <> p.author_id
    AND lu.role = 'user' AND lu.stats_excluded = false
    AND lu.email_verified_at IS NOT NULL AND lu.email_verified_at <= pl.created_at
    AND lu.created_at <= pl.created_at - interval '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_id = p.author_id AND b.blocked_id = pl.user_id)
         OR (b.blocker_id = pl.user_id AND b.blocked_id = p.author_id)
    )
), capped AS (
  SELECT author_id, liker, least(count(*), 5) AS n FROM l GROUP BY author_id, liker
)
SELECT author_id, sum(n)::bigint AS likes, count(*)::bigint AS likers
FROM capped
GROUP BY author_id
ORDER BY likes DESC, likers DESC, author_id
LIMIT @lim;

-- name: AwardUsers :many
SELECT id, display_name, avatar_url, role, stats_excluded, email_verified_at, age_confirmed_at, created_at
FROM users WHERE id = ANY(@ids::text[]);

-- 운영진 픽 고르기 — 메일·이름으로 찾는다(운영 웹 전용).
-- name: SearchAwardUsers :many
SELECT id, display_name, avatar_url, role, stats_excluded, email_verified_at, age_confirmed_at, created_at
FROM users
WHERE role = 'user'
  AND (lower(email) = lower(@q::text) OR display_name ILIKE '%' || @q_like::text || '%' ESCAPE '\' OR id = @q::text)
ORDER BY created_at
LIMIT 10;

-- 그 달 화면을 처음 열 때 씨앗을 만든다. 이미 있으면 그대로(경합해도 하나).
-- name: EnsureAwardMonth :exec
INSERT INTO award_months (month, seed, seed_hash) VALUES (@month, @seed, @seed_hash)
ON CONFLICT (month) DO NOTHING;

-- name: GetAwardMonth :one
SELECT * FROM award_months WHERE month = @month;

-- 확정 — open 인 행만 바꾼다. 행이 안 나오면 이미 확정된 달이다(동시 두 번이어도 하나만 이긴다 · REV-153).
-- name: AnnounceAwardMonth :one
UPDATE award_months
SET status = 'announced', announced_at = now(), announced_by = @announced_by, candidates_hash = @candidates_hash
WHERE month = @month AND status = 'open'
RETURNING month;

-- name: InsertAward :exec
INSERT INTO awards (id, month, category, user_id, rank, reason, days, likes)
VALUES (@id, @month, @category, @user_id, @rank, @reason, @days, @likes);

-- name: ListAnnouncedMonths :many
SELECT * FROM award_months WHERE status = 'announced' ORDER BY month DESC LIMIT @lim;

-- 수상 + 표시 이름(탈퇴면 user_id·이름이 NULL).
-- name: ListAwardsForMonths :many
SELECT a.*, u.display_name, u.avatar_url
FROM awards a
LEFT JOIN users u ON u.id = a.user_id
WHERE a.month = ANY(@months::text[])
ORDER BY a.month DESC, CASE a.category WHEN 'steady' THEN 0 WHEN 'popular' THEN 1 ELSE 2 END, a.rank;

-- name: ListAwardsByUser :many
SELECT * FROM awards WHERE user_id = @user_id ORDER BY month DESC;

-- name: GetAward :one
SELECT * FROM awards WHERE id = @id;

-- 받음 표시 — 본인 · 번호가 있어야 한다. 되돌리기도 된다.
-- name: MarkAwardClaimed :execrows
UPDATE awards
SET claimed_at = CASE WHEN @claimed::boolean THEN coalesce(claimed_at, now()) ELSE NULL END
WHERE id = @id AND user_id = @user_id AND coupon_code IS NOT NULL;

-- name: SetAwardPublic :execrows
UPDATE awards SET public = @public WHERE id = @id AND user_id = @user_id;

-- 쿠폰 등록 — 번호가 실제로 바뀐 경우에만 받음 표시를 지운다(REV-153).
-- name: SetAwardCoupon :execrows
UPDATE awards
SET claimed_at = CASE WHEN coupon_code IS DISTINCT FROM @coupon_code::text THEN NULL ELSE claimed_at END,
    coupon_code = @coupon_code::text, coupon_item = @coupon_item::text, coupon_expires = @coupon_expires,
    coupon_set_by = @set_by, coupon_set_at = now()
WHERE id = @id AND user_id IS NOT NULL;

-- name: AwardBlockedEither :one
SELECT EXISTS (
  SELECT 1 FROM blocks
  WHERE (blocker_id = @a AND blocked_id = @b) OR (blocker_id = @b AND blocked_id = @a)
) AS blocked;
