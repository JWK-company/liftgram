-- @plm SRS-048  코칭

-- 코칭 의향을 밝힌 사람 찾기. **차단한/차단당한 사람과 나 자신은 빼고**.
-- name: SearchTrainers :many
SELECT id, display_name, avatar_url, experience_level, trainer_intent
FROM users u
WHERE u.trainer_intent = true
  AND u.id <> @viewer_id::text
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = u.id)
       OR (b.blocker_id = u.id AND b.blocked_id = @viewer_id::text)
  )
  AND (@query::text = '' OR u.display_name ILIKE '%' || @query::text || '%')
ORDER BY u.created_at
LIMIT 30;

-- name: GetGrantByID :one
SELECT * FROM coaching_grants WHERE id = $1;

-- name: GetGrantByPair :one
SELECT * FROM coaching_grants WHERE trainer_id = $1 AND member_id = $2;

-- 내가 낀 모든 관계. 최근 것부터 — 방금 요청한 것이 위에 있어야 한다.
-- name: ListGrantsForUser :many
SELECT
  g.*,
  t.display_name     AS trainer_name,
  t.avatar_url       AS trainer_avatar,
  t.experience_level AS trainer_level,
  t.trainer_intent   AS trainer_intent_flag,
  m.display_name     AS member_name,
  m.avatar_url       AS member_avatar,
  m.experience_level AS member_level,
  m.trainer_intent   AS member_intent_flag
FROM coaching_grants g
JOIN users t ON t.id = g.trainer_id
JOIN users m ON m.id = g.member_id
WHERE g.trainer_id = @viewer_id::text OR g.member_id = @viewer_id::text
ORDER BY g.updated_at DESC;

-- name: CreateGrant :one
INSERT INTO coaching_grants (id, trainer_id, member_id, status, requested_by)
VALUES ($1, $2, $3, 'pending', $4)
RETURNING *;

-- 해지된 관계에 다시 요청 — 새 행을 만들지 않고 **같은 행을** 되살린다(감사 기록이 이력을 보존한다).
-- name: ReopenGrant :one
UPDATE coaching_grants
SET status = 'pending', requested_by = $2, consent_at = NULL, revoked_at = NULL, updated_at = now()
WHERE id = $1
RETURNING *;

-- name: AcceptGrant :one
UPDATE coaching_grants
SET status = 'active', consent_at = now(), updated_at = now()
WHERE id = $1
RETURNING *;

-- name: RevokeGrant :one
UPDATE coaching_grants
SET status = 'revoked', revoked_at = now(), updated_at = now()
WHERE id = $1
RETURNING *;

-- name: CreateAudit :exec
INSERT INTO coaching_audits (id, grant_id, actor_id, action, detail)
VALUES ($1, $2, $3, $4, $5);

-- name: ListAudit :many
SELECT id, actor_id, action, created_at
FROM coaching_audits
WHERE grant_id = $1
ORDER BY created_at DESC
LIMIT 100;

-- 회원이 동기해 둔 레코드를 컬렉션별로 읽는다 — 리포트·루틴 열람이 여기서 나온다.
-- **지워진 것은 빼고**(회원이 지운 기록을 트레이너가 계속 보면 안 된다).
-- name: ListMemberRecords :many
SELECT collection, record_id, payload
FROM sync_records
WHERE user_id = @member_id::text
  AND deleted = false
  AND collection = ANY (@collections::text[]);

-- name: GetMemberRecord :one
SELECT id, payload FROM sync_records
WHERE user_id = $1 AND collection = $2 AND record_id = $3 AND deleted = false;

-- 처방을 회원의 레코드에 써 넣는다. `updated_at`이 움직여야 회원 기기가 다음 pull에서 받는다.
-- name: UpdateMemberRecord :exec
UPDATE sync_records
SET payload = $2, updated_at = now()
WHERE id = $1;
