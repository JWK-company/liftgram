-- @plm SRS-019  스토리 쿼리
--
-- **누구의 스토리를 고를 것인가**는 SQL이 한다(팔로우·차단 목록을 Go로 끌어와 거르면
-- 사람이 늘수록 느려진다 — 피드와 같은 판단).

-- name: CreateStory :one
INSERT INTO stories (id, author_id, media_url, caption, moderation_status, expires_at)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- 살아 있는 스토리 — 나 + 내가 팔로우하는 사람, 만료 전, 승인된 것.
-- 차단은 **양방향**으로 가린다. 정렬은 (사람, 오래된 것 먼저) — 넘겨 보는 순서 그대로.
-- name: ListActiveStories :many
SELECT s.*, u.display_name AS author_name, u.avatar_url AS author_avatar
FROM stories s
JOIN users u ON u.id = s.author_id
WHERE s.expires_at > now()
  AND s.moderation_status = 'approved'
  AND (
    s.author_id = @viewer_id::text
    OR EXISTS (
      SELECT 1 FROM follows f
      WHERE f.follower_id = @viewer_id::text AND f.followee_id = s.author_id
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = s.author_id)
       OR (b.blocker_id = s.author_id AND b.blocked_id = @viewer_id::text)
  )
ORDER BY s.author_id, s.created_at ASC, s.id ASC;
