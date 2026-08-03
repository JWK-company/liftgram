-- @plm SRS-020  신고·모더레이션 쿼리

-- 같은 신고자·대상은 한 건이다(유일 제약) — 다시 눌러도 조용히 넘어간다.
-- name: CreateReport :exec
INSERT INTO reports (id, target_type, target_id, reporter_id, reason, details)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (reporter_id, target_type, target_id) DO NOTHING;

-- 아직 안 본 신고들. 대상별 묶음은 Go가 만든다(사유 집합·건수·가장 최근 시각).
-- name: ListPendingReports :many
SELECT target_type, target_id, reason, created_at
FROM reports
WHERE status = 'pending'
ORDER BY created_at DESC
LIMIT @lim;

-- 대상 하나에 달린 신고를 한꺼번에 종결한다.
-- name: ResolveReportsForTarget :exec
UPDATE reports
SET status = @status::text,
    reviewed_by = @reviewed_by::text,
    reviewed_at = now(),
    action_taken = @action_taken::text
WHERE target_type = @target_type::text AND target_id = @target_id::text AND status = 'pending';

-- ── 대상 조회(미리보기) ─────────────────────────────────────────────────────
-- name: GetPostForModeration :one
SELECT p.id, p.author_id, p.moderation_status, p.kind, p.caption, p.media_urls, p.created_at,
       u.display_name AS author_name
FROM posts p JOIN users u ON u.id = p.author_id
WHERE p.id = $1;

-- name: GetStoryForModeration :one
SELECT s.id, s.author_id, s.moderation_status, s.media_url, s.caption, s.created_at, s.expires_at,
       u.display_name AS author_name
FROM stories s JOIN users u ON u.id = s.author_id
WHERE s.id = $1;

-- name: GetCommentForModeration :one
SELECT c.id, c.author_id, c.post_id, c.moderation_status, c.body, c.created_at,
       u.display_name AS author_name
FROM comments c JOIN users u ON u.id = c.author_id
WHERE c.id = $1;

-- ── 자동 보류된 것(신고가 없어도 검토 대상) ─────────────────────────────────
-- name: ListPendingPosts :many
SELECT p.id, p.author_id, p.kind, p.caption, p.media_urls, p.created_at, u.display_name AS author_name
FROM posts p JOIN users u ON u.id = p.author_id
WHERE p.moderation_status = 'pending'
ORDER BY p.created_at DESC
LIMIT @lim;

-- name: ListPendingStories :many
SELECT s.id, s.author_id, s.media_url, s.caption, s.created_at, u.display_name AS author_name
FROM stories s JOIN users u ON u.id = s.author_id
WHERE s.moderation_status = 'pending'
ORDER BY s.created_at DESC
LIMIT @lim;

-- ── 처리 ────────────────────────────────────────────────────────────────────
-- name: SetPostModeration :exec
UPDATE posts SET moderation_status = @status::text,
                 removed_at = CASE WHEN @removed::boolean THEN now() ELSE NULL END,
                 removed_reason = CASE WHEN @removed::boolean THEN @reason::text ELSE NULL END
WHERE id = @id::text;

-- name: SetStoryModeration :exec
UPDATE stories SET moderation_status = @status::text,
                   removed_at = CASE WHEN @removed::boolean THEN now() ELSE NULL END,
                   removed_reason = CASE WHEN @removed::boolean THEN @reason::text ELSE NULL END
WHERE id = @id::text;

-- name: SetCommentModeration :exec
UPDATE comments SET moderation_status = @status::text,
                    removed_at = CASE WHEN @removed::boolean THEN now() ELSE NULL END
WHERE id = @id::text;

-- 제거하면 사진의 바이트도 막는다(승인하면 다시 푼다) — "내려갔다"가 참이려면 파일도 안 보여야 한다.
-- name: SetMediaFlagged :exec
UPDATE media_assets SET flagged = @flagged::boolean WHERE key = @key::text;

-- 가시성 판정에 쓰는 최소 조회.
-- name: GetPostVisibility :one
SELECT author_id, visibility, moderation_status FROM posts WHERE id = $1;

-- name: IsFollowingSimple :one
SELECT EXISTS (SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2)::boolean;
