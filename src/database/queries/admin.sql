-- 운영자 통계 집계(SPEC-032) — 숫자만 돌려준다. 이메일·이름·운동 내용은 꺼내지 않는다.
-- 모두 운영진(role <> 'user')과 제외 계정(stats_excluded)을 뺀다.
-- 동기 기록은 운동·루틴만, 시행일(@since) 뒤에 올라온 것만 읽는다(체중 등 다른 컬렉션은 쓰지 않는다).
-- jsonb 칸은 CASE 로 형을 확인한 뒤 숫자로 바꾼다(WHERE 의 AND 는 평가 순서를 보장하지 않는다 · coaching.sql 선례).

-- name: AdminSignupTotals :one
SELECT count(*)::bigint AS total,
       count(*) FILTER (WHERE email_verified_at IS NOT NULL)::bigint AS email_verified
FROM users
WHERE role = 'user' AND stats_excluded = false;

-- name: AdminSignupDaily :many
SELECT to_char(created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')::text AS day, count(*)::bigint AS n
FROM users
WHERE role = 'user' AND stats_excluded = false AND created_at >= @from_at
GROUP BY 1
ORDER BY 1;

-- 메일 가입은 비밀번호가 있는 계정, 소셜은 연결 표. 둘 다 있는 계정은 각각 센다.
-- name: AdminSignupEmailCount :one
SELECT count(*)::bigint
FROM users
WHERE role = 'user' AND stats_excluded = false AND password_hash IS NOT NULL;

-- name: AdminSignupProviders :many
SELECT i.provider::text AS provider, count(DISTINCT i.user_id)::bigint AS n
FROM auth_identities i
JOIN users u ON u.id = i.user_id
WHERE u.role = 'user' AND u.stats_excluded = false
GROUP BY i.provider
ORDER BY 2 DESC, 1;

-- 시행일 뒤 가입해 7일이 지난 계정 중 7일 안에 운동을 완료한 비율.
-- name: AdminFirstWorkout :one
SELECT count(*)::bigint AS cohort,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM sync_records s
         WHERE s.user_id = u.id
           AND s.collection = 'workouts' AND s.deleted = false
           AND s.created_at >= @since
           AND s.payload->'state' = '"completed"'::jsonb
           AND coalesce(s.payload->'source', 'null'::jsonb) = 'null'::jsonb
           AND CASE WHEN jsonb_typeof(s.payload->'started_at') = 'number'
                    THEN (s.payload->'started_at')::numeric >= (extract(epoch FROM u.created_at) * 1000)::numeric
                         AND (s.payload->'started_at')::numeric < (extract(epoch FROM u.created_at) * 1000)::numeric + 604800000
                    ELSE false END
       ))::bigint AS done
FROM users u
WHERE u.role = 'user' AND u.stats_excluded = false
  AND u.created_at >= @since
  AND u.created_at < @cutoff;

-- name: AdminRoutineBuckets :one
WITH per AS (
  SELECT s.user_id, count(*) AS n
  FROM sync_records s
  WHERE s.collection = 'routines' AND s.deleted = false
    AND s.created_at >= @since
    AND coalesce(s.payload->'is_archived', 'false'::jsonb) <> 'true'::jsonb
    AND coalesce(s.payload->'is_archived', 'false'::jsonb) <> '1'::jsonb
  GROUP BY s.user_id
)
SELECT count(*) FILTER (WHERE coalesce(p.n, 0) = 0)::bigint AS b0,
       count(*) FILTER (WHERE p.n = 1)::bigint AS b1,
       count(*) FILTER (WHERE p.n BETWEEN 2 AND 3)::bigint AS b2,
       count(*) FILTER (WHERE p.n BETWEEN 4 AND 6)::bigint AS b4,
       count(*) FILTER (WHERE p.n >= 7)::bigint AS b7
FROM users u
LEFT JOIN per p ON p.user_id = u.id
WHERE u.role = 'user' AND u.stats_excluded = false;

-- [from_ms, to_ms)에 시작한 완료 운동. 불러온 기록(source)은 뺀다. 시간은 1분~12시간만 중앙값에 넣는다.
-- name: AdminWorkoutStats :one
WITH w AS (
  SELECT s.user_id,
         s.payload->'routine_id' AS routine_id,
         CASE WHEN jsonb_typeof(s.payload->'duration_seconds') = 'number'
              THEN (s.payload->'duration_seconds')::numeric END AS duration
  FROM sync_records s
  JOIN users u ON u.id = s.user_id
  WHERE s.collection = 'workouts' AND s.deleted = false
    AND s.created_at >= @since
    AND u.role = 'user' AND u.stats_excluded = false
    AND s.payload->'state' = '"completed"'::jsonb
    AND coalesce(s.payload->'source', 'null'::jsonb) = 'null'::jsonb
    AND CASE WHEN jsonb_typeof(s.payload->'started_at') = 'number'
             THEN (s.payload->'started_at')::numeric >= @from_ms::bigint
                  AND (s.payload->'started_at')::numeric < @to_ms::bigint
             ELSE false END
)
SELECT count(*)::bigint AS workouts,
       count(*) FILTER (WHERE jsonb_typeof(routine_id) = 'string' AND routine_id <> '""'::jsonb)::bigint AS from_routine,
       count(DISTINCT user_id)::bigint AS active_users,
       coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration::double precision)
                FILTER (WHERE duration >= 60 AND duration <= 43200), 0)::bigint AS median_seconds
FROM w;

-- 삭제된 글은 행이 없어 세지 못한다(화면에 고지). 내려간 글은 뺀다.
-- name: AdminContentRows :many
SELECT 'post'::text AS key,
       count(*) FILTER (WHERE x.created_at >= @d7)::bigint AS last7d,
       count(*) FILTER (WHERE x.created_at >= @d30)::bigint AS last30d,
       count(*)::bigint AS total
FROM posts x JOIN users u ON u.id = x.author_id
WHERE u.role = 'user' AND u.stats_excluded = false AND x.moderation_status <> 'removed'
UNION ALL
SELECT 'comment', count(*) FILTER (WHERE x.created_at >= @d7)::bigint, count(*) FILTER (WHERE x.created_at >= @d30)::bigint, count(*)::bigint
FROM comments x JOIN users u ON u.id = x.author_id
WHERE u.role = 'user' AND u.stats_excluded = false AND x.moderation_status <> 'removed'
UNION ALL
SELECT 'like', count(*) FILTER (WHERE x.created_at >= @d7)::bigint, count(*) FILTER (WHERE x.created_at >= @d30)::bigint, count(*)::bigint
FROM post_likes x JOIN users u ON u.id = x.user_id
WHERE u.role = 'user' AND u.stats_excluded = false
UNION ALL
SELECT 'follow', count(*) FILTER (WHERE x.created_at >= @d7)::bigint, count(*) FILTER (WHERE x.created_at >= @d30)::bigint, count(*)::bigint
FROM follows x JOIN users u ON u.id = x.follower_id
WHERE u.role = 'user' AND u.stats_excluded = false
UNION ALL
SELECT 'story', count(*) FILTER (WHERE x.created_at >= @d7)::bigint, count(*) FILTER (WHERE x.created_at >= @d30)::bigint, count(*)::bigint
FROM stories x JOIN users u ON u.id = x.author_id
WHERE u.role = 'user' AND u.stats_excluded = false AND x.moderation_status <> 'removed'
UNION ALL
SELECT 'message', count(*) FILTER (WHERE x.created_at >= @d7)::bigint, count(*) FILTER (WHERE x.created_at >= @d30)::bigint, count(*)::bigint
FROM messages x JOIN users u ON u.id = x.sender_id
WHERE u.role = 'user' AND u.stats_excluded = false
UNION ALL
SELECT 'gear_click', count(*) FILTER (WHERE x.created_at >= @d7)::bigint, count(*) FILTER (WHERE x.created_at >= @d30)::bigint, count(*)::bigint
FROM gear_clicks x JOIN users u ON u.id = x.user_id
WHERE u.role = 'user' AND u.stats_excluded = false;

-- name: AdminOperations :one
SELECT (SELECT count(*) FROM reports r WHERE r.status = 'pending')::bigint AS pending_reports,
       (SELECT count(*) FROM feedback_items f WHERE f.kind = 'user' AND f.closed_at IS NULL AND f.status NOT IN ('rejected', 'done'))::bigint AS open_user_feedback,
       (SELECT count(*) FROM feedback_items f WHERE f.kind = 'ops' AND f.closed_at IS NULL AND f.status NOT IN ('rejected', 'done'))::bigint AS open_ops_feedback;
