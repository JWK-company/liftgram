-- 이용 기록 받기와 밤 작업(SPEC-032 Phase 3).

-- name: UsageUserExists :one
SELECT EXISTS (SELECT 1 FROM users WHERE id = @id::text)::boolean;

-- name: UsagePresenceExists :one
SELECT EXISTS (SELECT 1 FROM usage_presence WHERE actor_kind = @actor_kind::text AND actor_id = @actor_id::text)::boolean;

-- name: UsageInsertEvent :execrows
INSERT INTO usage_events (at, actor_kind, actor_id, client_event_id, event, platform, app_version)
VALUES (sqlc.arg(at_hour)::timestamptz, sqlc.arg(actor_kind)::text, sqlc.arg(actor_id)::text, sqlc.arg(client_event_id)::uuid, sqlc.arg(event_name)::text, sqlc.arg(platform)::text, sqlc.arg(app_version)::text)
ON CONFLICT (actor_kind, actor_id, client_event_id) DO NOTHING;

-- name: UsageCountActorEvents :one
SELECT count(*)::bigint FROM usage_events
WHERE actor_kind = @actor_kind::text AND actor_id = @actor_id::text AND received_at >= @since_at;

-- name: UsageCountEventsSince :one
SELECT count(*)::bigint FROM usage_events WHERE received_at >= @since_at;

-- 2분 안의 신호는 쓰지 않는다 — 고쳐 쓴 행이 없으면 활성일도 쓰지 않아 쓰기가 사용자당 2분에 한 번으로 묶인다.
-- name: UsageTouchPresence :execrows
INSERT INTO usage_presence (actor_kind, actor_id, first_seen, last_seen)
VALUES (@actor_kind::text, @actor_id::text, @now_at, @now_at)
ON CONFLICT (actor_kind, actor_id) DO UPDATE
SET last_seen = EXCLUDED.last_seen
WHERE usage_presence.last_seen <= EXCLUDED.last_seen - interval '2 minutes';

-- name: UsageMarkActiveDay :exec
INSERT INTO usage_active_days (day, actor_kind, actor_id)
VALUES (@day::date, @actor_kind::text, @actor_id::text)
ON CONFLICT DO NOTHING;

-- 탈퇴 트랜잭션 안에서 지운다. 합계(usage_daily)에는 사람이 없어 남는다.
-- name: DeleteUsageByUser :exec
WITH a AS (
  DELETE FROM usage_events WHERE actor_kind = 'user' AND actor_id = @user_id::text
), b AS (
  DELETE FROM usage_presence WHERE actor_kind = 'user' AND actor_id = @user_id::text
)
DELETE FROM usage_active_days WHERE actor_kind = 'user' AND actor_id = @user_id::text;

-- ── 밤 작업 ──

-- 여러 인스턴스가 떠도 한 곳만 돈다.
-- name: UsageTryLock :one
SELECT pg_try_advisory_xact_lock(@key::bigint)::boolean;

-- name: UsageLastDailyDay :one
SELECT coalesce(max(day)::text, '')::text FROM usage_daily;

-- name: UsageFirstEventAt :one
SELECT coalesce(to_char(min(at) AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD'), '')::text FROM usage_events;

-- name: UsageDeleteDaily :exec
DELETE FROM usage_daily WHERE day = @day::date;

-- 운영진과 제외 계정은 뺀다.
-- name: UsageAggregateEvents :exec
INSERT INTO usage_daily (day, actor_kind, metric, actors, events)
SELECT @day::date, e.actor_kind, 'event:' || e.event, count(DISTINCT e.actor_id)::int, count(*)::bigint
FROM usage_events e
WHERE e.at >= @from_at AND e.at < @to_at
  AND (e.actor_kind = 'guest' OR EXISTS (SELECT 1 FROM users u WHERE u.id = e.actor_id AND u.role = 'user' AND u.stats_excluded = false))
GROUP BY e.actor_kind, e.event;

-- name: UsageAggregatePlatforms :exec
INSERT INTO usage_daily (day, actor_kind, metric, actors, events)
SELECT @day::date, e.actor_kind, 'platform:' || e.platform, count(DISTINCT e.actor_id)::int, count(*)::bigint
FROM usage_events e
WHERE e.at >= @from_at AND e.at < @to_at
  AND (e.actor_kind = 'guest' OR EXISTS (SELECT 1 FROM users u WHERE u.id = e.actor_id AND u.role = 'user' AND u.stats_excluded = false))
GROUP BY e.actor_kind, e.platform;

-- name: UsageAggregateActive :exec
INSERT INTO usage_daily (day, actor_kind, metric, actors, events)
SELECT @day::date, x.actor_kind, x.metric, x.n, 0
FROM (
  SELECT a.actor_kind, 'dau'::text AS metric, count(DISTINCT a.actor_id)::int AS n
  FROM usage_active_days a
  WHERE a.day = @day::date
    AND (a.actor_kind = 'guest' OR EXISTS (SELECT 1 FROM users u WHERE u.id = a.actor_id AND u.role = 'user' AND u.stats_excluded = false))
  GROUP BY a.actor_kind
  UNION ALL
  SELECT a.actor_kind, 'wau', count(DISTINCT a.actor_id)::int
  FROM usage_active_days a
  WHERE a.day BETWEEN @d7::date AND @day::date
    AND (a.actor_kind = 'guest' OR EXISTS (SELECT 1 FROM users u WHERE u.id = a.actor_id AND u.role = 'user' AND u.stats_excluded = false))
  GROUP BY a.actor_kind
  UNION ALL
  SELECT a.actor_kind, 'mau', count(DISTINCT a.actor_id)::int
  FROM usage_active_days a
  WHERE a.day BETWEEN @d30::date AND @day::date
    AND (a.actor_kind = 'guest' OR EXISTS (SELECT 1 FROM users u WHERE u.id = a.actor_id AND u.role = 'user' AND u.stats_excluded = false))
  GROUP BY a.actor_kind
) x;

-- 90일 지난 원본을 잘라 지운다. 긴 잠금을 피하려고 묶음으로.
-- name: UsagePurgeEvents :execrows
DELETE FROM usage_events WHERE id IN (SELECT e.id FROM usage_events e WHERE e.at < @cutoff LIMIT 5000);

-- name: UsagePurgePresence :execrows
DELETE FROM usage_presence WHERE (actor_kind, actor_id) IN (
  SELECT p.actor_kind, p.actor_id FROM usage_presence p WHERE p.last_seen < @cutoff LIMIT 5000
);

-- name: UsagePurgeActiveDays :execrows
DELETE FROM usage_active_days WHERE (day, actor_kind, actor_id) IN (
  SELECT a.day, a.actor_kind, a.actor_id FROM usage_active_days a WHERE a.day < @cutoff_day::date LIMIT 5000
);

-- 탈퇴 때 지우지 못한 행(같은 순간 들어온 보고)을 청소한다.
-- name: UsagePurgeOrphans :exec
WITH a AS (
  DELETE FROM usage_events e WHERE e.actor_kind = 'user' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = e.actor_id)
), b AS (
  DELETE FROM usage_presence p WHERE p.actor_kind = 'user' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.actor_id)
)
DELETE FROM usage_active_days d WHERE d.actor_kind = 'user' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = d.actor_id);
