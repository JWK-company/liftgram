-- SPEC-032  피드백 쿼리

-- name: LockUserFeedback :exec
SELECT pg_advisory_xact_lock(hashtextextended('feedback:' || @user_id::text, 0));

-- name: CountUserFeedbackSince :one
SELECT count(*) FROM feedback_items
WHERE kind = 'user' AND author_id = @author_id AND created_at >= @since;

-- name: CreateFeedbackItem :one
INSERT INTO feedback_items (kind, author_id, category, title, body, app_version, platform)
VALUES (@kind, @author_id, @category, @title, @body, @app_version, @platform)
RETURNING id;

-- 미처리를 먼저, 그 안에서 최신순(상한에 미처리가 밀려나지 않게). 이메일은 읽지 않는다.
-- name: ListFeedbackItems :many
SELECT f.id, f.kind, f.author_id, f.category, f.title, f.body, f.app_version, f.platform,
       f.status, f.resolution, f.created_at, u.display_name AS author_name
FROM feedback_items f
LEFT JOIN users u ON u.id = f.author_id
WHERE f.kind = @kind
ORDER BY (f.status IN ('new', 'approved', 'in_progress')) DESC, f.id DESC
LIMIT @lim;

-- name: GetFeedbackItemForUpdate :one
SELECT id, kind, author_id, category, title, body, app_version, platform, status, resolution, created_at
FROM feedback_items WHERE id = @id FOR UPDATE;

-- 승인 해시·지시는 승인 때만 함께 넘어온다. 다른 상태로 옮겨도 승인 기록은 지우지 않는다.
-- name: SetFeedbackStatus :exec
UPDATE feedback_items SET
  status = @status,
  resolution = CASE WHEN @resolution::text = '' THEN resolution ELSE @resolution END,
  approved_body_sha256 = COALESCE(sqlc.narg('approved_body_sha256'), approved_body_sha256),
  approved_instruction = COALESCE(sqlc.narg('approved_instruction'), approved_instruction),
  closed_at = CASE WHEN @status::text IN ('rejected', 'done') THEN now() ELSE NULL END
WHERE id = @id;

-- name: InsertFeedbackEvent :exec
INSERT INTO feedback_events (item_id, actor_id, from_status, to_status, note)
VALUES (@item_id, @actor_id, @from_status, @to_status, @note);

-- 탈퇴: 사용자 의견은 지운다. 운영 피드백은 ON DELETE SET NULL 로 작성자만 비워진다.
-- name: DeleteUserFeedbackByAuthor :exec
DELETE FROM feedback_items WHERE kind = 'user' AND author_id = @author_id;

-- 처리 끝난 사용자 의견은 1년 뒤 지운다.
-- name: PurgeClosedUserFeedback :execrows
DELETE FROM feedback_items WHERE kind = 'user' AND closed_at < @before;
