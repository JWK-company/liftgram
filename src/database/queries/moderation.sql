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

-- 신고 행이 사라져도(신고자 탈퇴·목록 상한) 숨긴 댓글이 검토 목록에서 빠지지 않게 한다.
-- name: ListPendingComments :many
SELECT c.id, c.author_id, c.body, c.created_at, u.display_name AS author_name
FROM comments c JOIN users u ON u.id = c.author_id
WHERE c.moderation_status = 'pending'
ORDER BY c.created_at DESC
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

-- 자동 숨김에 셀 신고자 수. 신고자당 한 건이 유일 제약으로 보장된다.
-- 새 계정 몇 개로 글을 내리지 못하게 가입 7일 이상·메일 확인 계정만 세고(메일 없는 소셜 계정은 쓰기 게이트와 같이 통과),
-- 의견이 갈리기 쉬운 사유는 빼며, 검토자가 한 번 기각한 대상은 다시 자동으로 숨기지 않는다. 나머지 신고도 검토 목록에는 오른다.
-- name: CountPendingReporters :one
SELECT count(*)::int FROM reports r
JOIN users u ON u.id = r.reporter_id
WHERE r.target_type = @target_type::text AND r.target_id = @target_id::text AND r.status = 'pending'
  AND r.reason NOT IN ('spam', 'other', 'misinformation')
  AND u.created_at <= now() - interval '7 days'
  AND (u.email IS NULL OR u.email_verified_at IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM reports d
    WHERE d.target_type = r.target_type AND d.target_id = r.target_id AND d.status = 'dismissed'
  );
