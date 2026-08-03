-- @plm SRS-007  피드 쿼리 — 여기 있는 것은 SQL뿐이다
--
-- 규칙(누가 무엇을 볼 수 있는가·누가 지울 수 있는가)은 internal/feed/service.go가 안다.
-- 다만 **누구의 글을 고를 것인가**는 SQL이 한다 — 팔로우·차단 목록을 Go로 가져와 거르면
-- 사람이 늘수록 느려지고, 페이지 크기도 못 맞춘다.

-- 피드 한 페이지.
--
-- 보이는 것: 내 글 전부 + 팔로우하는 사람의 public|followers 글.
-- 가리는 것: 내려간 글 · 내가 차단한 사람 · 나를 차단한 사람(양방향).
-- 커서: (created_at, id)를 함께 비교한다 — 같은 시각의 글이 새거나 겹치지 않게.
-- name: ListFeed :many
SELECT p.*, u.display_name AS author_name, u.avatar_url AS author_avatar,
       (l.user_id IS NOT NULL)::boolean AS liked_by_me,
       (bm.user_id IS NOT NULL)::boolean AS bookmarked_by_me
FROM posts p
JOIN users u ON u.id = p.author_id
LEFT JOIN post_likes l ON l.post_id = p.id AND l.user_id = @viewer_id::text
LEFT JOIN post_bookmarks bm ON bm.post_id = p.id AND bm.user_id = @viewer_id::text
WHERE p.moderation_status = 'approved'
  AND (
    p.author_id = @viewer_id::text
    OR (
      p.visibility IN ('public', 'followers')
      AND EXISTS (
        SELECT 1 FROM follows f
        WHERE f.follower_id = @viewer_id::text AND f.followee_id = p.author_id
      )
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = p.author_id)
       OR (b.blocker_id = p.author_id AND b.blocked_id = @viewer_id::text)
  )
  AND (
    @has_cursor::boolean = false
    OR (p.created_at, p.id) < (@cursor_at::timestamptz, @cursor_id::text)
  )
ORDER BY p.created_at DESC, p.id DESC
LIMIT @lim;

-- 한 사람의 글. 보는 사람과의 관계가 공개범위를 정한다:
--   본인      public + followers + private
--   팔로워    public + followers
--   그 외     public
-- name: ListUserPosts :many
SELECT p.*, u.display_name AS author_name, u.avatar_url AS author_avatar,
       (l.user_id IS NOT NULL)::boolean AS liked_by_me,
       (bm.user_id IS NOT NULL)::boolean AS bookmarked_by_me
FROM posts p
JOIN users u ON u.id = p.author_id
LEFT JOIN post_likes l ON l.post_id = p.id AND l.user_id = @viewer_id::text
LEFT JOIN post_bookmarks bm ON bm.post_id = p.id AND bm.user_id = @viewer_id::text
WHERE p.author_id = @author_id::text
  AND p.moderation_status = 'approved'
  AND p.visibility = ANY (@allowed_visibility::text[])
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = p.author_id)
       OR (b.blocker_id = p.author_id AND b.blocked_id = @viewer_id::text)
  )
  AND (
    @has_cursor::boolean = false
    OR (p.created_at, p.id) < (@cursor_at::timestamptz, @cursor_id::text)
  )
ORDER BY p.created_at DESC, p.id DESC
LIMIT @lim;

-- name: GetPost :one
SELECT p.*, u.display_name AS author_name, u.avatar_url AS author_avatar,
       (l.user_id IS NOT NULL)::boolean AS liked_by_me,
       (bm.user_id IS NOT NULL)::boolean AS bookmarked_by_me
FROM posts p
JOIN users u ON u.id = p.author_id
LEFT JOIN post_likes l ON l.post_id = p.id AND l.user_id = @viewer_id::text
LEFT JOIN post_bookmarks bm ON bm.post_id = p.id AND bm.user_id = @viewer_id::text
WHERE p.id = @post_id::text;

-- name: CreatePost :one
INSERT INTO posts (
  id, author_id, kind, caption, visibility,
  workout_id, workout_name, total_volume_kg, working_sets, duration_seconds, pr_count,
  streak_days, weekly_reached, exercises, gear,
  media_urls, idempotency_key
) VALUES (
  $1, $2, $3, $4, $5,
  $6, $7, $8, $9, $10, $11,
  $12, $13, $14, $15,
  $16, $17
)
RETURNING *;

-- 같은 멱등 키로 이미 올린 글 — 재시도가 두 번째 글을 만들지 않게.
-- name: GetPostByIdempotencyKey :one
SELECT p.*, u.display_name AS author_name, u.avatar_url AS author_avatar,
       false::boolean AS liked_by_me,
       false::boolean AS bookmarked_by_me
FROM posts p
JOIN users u ON u.id = p.author_id
WHERE p.author_id = $1 AND p.idempotency_key = $2;

-- name: DeletePost :exec
DELETE FROM posts WHERE id = $1 AND author_id = $2;

-- 좋아요는 멱등이다 — 두 번 눌러도 하나.
-- name: LikePost :execrows
INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: UnlikePost :execrows
DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2;

-- 실제로 넣거나 뺐을 때만 부른다(멱등 호출은 카운트를 건드리지 않는다).
-- name: BumpLikeCount :one
UPDATE posts SET like_count = GREATEST(0, like_count + @delta::int) WHERE id = @post_id::text
RETURNING like_count;

-- name: ListComments :many
SELECT c.*, u.display_name AS author_name, u.avatar_url AS author_avatar,
       (cl.user_id IS NOT NULL)::boolean AS liked_by_me
FROM comments c
JOIN users u ON u.id = c.author_id
LEFT JOIN comment_likes cl ON cl.comment_id = c.id AND cl.user_id = @viewer_id::text
WHERE c.post_id = @post_id::text
  AND c.parent_id IS NULL
  AND c.moderation_status = 'approved'
  AND (
    @has_cursor::boolean = false
    OR (c.created_at, c.id) > (@cursor_at::timestamptz, @cursor_id::text)
  )
ORDER BY c.created_at ASC, c.id ASC
LIMIT @lim;

-- name: CreateComment :one
INSERT INTO comments (id, post_id, author_id, body, parent_id) VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetComment :one
SELECT * FROM comments WHERE id = $1;

-- name: DeleteComment :exec
DELETE FROM comments WHERE id = $1;

-- name: BumpCommentCount :exec
UPDATE posts SET comment_count = GREATEST(0, comment_count + @delta::int) WHERE id = @post_id::text;

-- name: Follow :execrows
INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: Unfollow :execrows
DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2;

-- name: IsFollowing :one
SELECT EXISTS (SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2);

-- 사람 찾기 — 표시 이름·이메일 부분일치. 자기 자신과 차단 관계는 뺀다.
-- LIKE 대신 position()을 쓴다: 사용자가 친 '%'가 와일드카드로 해석되면 전부 일치가 된다.
-- name: SearchUsers :many
SELECT u.id, u.display_name, u.avatar_url,
       EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = @viewer_id::text AND f.followee_id = u.id) ::boolean AS following
FROM users u
WHERE u.id <> @viewer_id::text
  AND (
    position(lower(@q::text) in lower(coalesce(u.display_name, ''))) > 0
    OR position(lower(@q::text) in lower(coalesce(u.email, ''))) > 0
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = u.id)
       OR (b.blocker_id = u.id AND b.blocked_id = @viewer_id::text)
  )
ORDER BY u.display_name NULLS LAST, u.id
LIMIT @lim;

-- 단건 조회의 접근 판정이 쓴다. 차단은 **양방향**으로 가린다.
-- name: IsBlockedEitherWay :one
SELECT EXISTS (
  SELECT 1 FROM blocks
  WHERE (blocker_id = @a::text AND blocked_id = @b::text)
     OR (blocker_id = @b::text AND blocked_id = @a::text)
)::boolean;

-- 댓글 삭제 권한 판정이 쓴다(글 주인도 지울 수 있다).
-- name: GetPostAuthor :one
SELECT author_id FROM posts WHERE id = $1;

-- 올린 뒤 고칠 수 있는 것은 캡션과 공개범위뿐이다. 운동 기록은 그때의 사실이라 손대지 않는다.
-- name: UpdatePost :execrows
UPDATE posts
SET caption = @caption,
    visibility = CASE WHEN @set_visibility::boolean THEN @visibility::text ELSE visibility END,
    updated_at = now()
WHERE id = @id::text AND author_id = @author_id::text;

-- ── 저장(북마크) ────────────────────────────────────────────────────────────
-- name: BookmarkPost :execrows
INSERT INTO post_bookmarks (post_id, user_id) VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: UnbookmarkPost :execrows
DELETE FROM post_bookmarks WHERE post_id = $1 AND user_id = $2;

-- 내가 저장한 글. 그새 못 보게 된 글(비공개 전환·차단)은 빠진다 — 저장은 열람권이 아니다.
-- name: ListBookmarks :many
SELECT p.*, u.display_name AS author_name, u.avatar_url AS author_avatar,
       (l.user_id IS NOT NULL)::boolean AS liked_by_me,
       true::boolean AS bookmarked_by_me
FROM post_bookmarks bm
JOIN posts p ON p.id = bm.post_id
JOIN users u ON u.id = p.author_id
LEFT JOIN post_likes l ON l.post_id = p.id AND l.user_id = @viewer_id::text
WHERE bm.user_id = @viewer_id::text
  AND p.moderation_status = 'approved'
  AND (
    p.author_id = @viewer_id::text
    OR p.visibility = 'public'
    OR (
      p.visibility = 'followers'
      AND EXISTS (
        SELECT 1 FROM follows f
        WHERE f.follower_id = @viewer_id::text AND f.followee_id = p.author_id
      )
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = p.author_id)
       OR (b.blocker_id = p.author_id AND b.blocked_id = @viewer_id::text)
  )
  AND (
    @has_cursor::boolean = false
    OR (p.created_at, p.id) < (@cursor_at::timestamptz, @cursor_id::text)
  )
ORDER BY p.created_at DESC, p.id DESC
LIMIT @lim;

-- ── 해시태그 ────────────────────────────────────────────────────────────────
-- name: AddHashtag :exec
INSERT INTO post_hashtags (post_id, tag) VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- 캡션을 고치면 태그를 다시 뽑는다 — 지우고 새로 넣는 편이 차이를 계산하는 것보다 안전하다.
-- name: ClearHashtags :exec
DELETE FROM post_hashtags WHERE post_id = $1;

-- 태그로 모아 보기. 공개 글만(팔로워 전용·비공개는 태그로 새 나가면 안 된다).
-- name: ListHashtagPosts :many
SELECT p.*, u.display_name AS author_name, u.avatar_url AS author_avatar,
       (l.user_id IS NOT NULL)::boolean AS liked_by_me,
       (bm.user_id IS NOT NULL)::boolean AS bookmarked_by_me
FROM post_hashtags h
JOIN posts p ON p.id = h.post_id
JOIN users u ON u.id = p.author_id
LEFT JOIN post_likes l ON l.post_id = p.id AND l.user_id = @viewer_id::text
LEFT JOIN post_bookmarks bm ON bm.post_id = p.id AND bm.user_id = @viewer_id::text
WHERE h.tag = @tag::text
  AND p.moderation_status = 'approved'
  AND (p.visibility = 'public' OR p.author_id = @viewer_id::text)
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = p.author_id)
       OR (b.blocker_id = p.author_id AND b.blocked_id = @viewer_id::text)
  )
  AND (
    @has_cursor::boolean = false
    OR (p.created_at, p.id) < (@cursor_at::timestamptz, @cursor_id::text)
  )
ORDER BY p.created_at DESC, p.id DESC
LIMIT @lim;

-- 많이 쓰인 태그. 공개 글만 세고, 차단 관계는 뺀다.
-- name: TrendingHashtags :many
SELECT h.tag, count(*)::int AS uses
FROM post_hashtags h
JOIN posts p ON p.id = h.post_id
WHERE p.moderation_status = 'approved'
  AND p.visibility = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = p.author_id)
       OR (b.blocker_id = p.author_id AND b.blocked_id = @viewer_id::text)
  )
GROUP BY h.tag
ORDER BY count(*) DESC, h.tag
LIMIT @lim;

-- ── 댓글: 답글과 좋아요 ─────────────────────────────────────────────────────
-- name: ListReplies :many
SELECT c.*, u.display_name AS author_name, u.avatar_url AS author_avatar,
       (cl.user_id IS NOT NULL)::boolean AS liked_by_me
FROM comments c
JOIN users u ON u.id = c.author_id
LEFT JOIN comment_likes cl ON cl.comment_id = c.id AND cl.user_id = @viewer_id::text
WHERE c.parent_id = @parent_id::text
  AND c.moderation_status = 'approved'
ORDER BY c.created_at ASC, c.id ASC
LIMIT @lim;

-- name: LikeComment :execrows
INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: UnlikeComment :execrows
DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2;

-- name: BumpCommentLikeCount :one
UPDATE comments SET like_count = GREATEST(0, like_count + @delta::int) WHERE id = @comment_id::text
RETURNING like_count;

-- 답글 수는 루트 댓글이 들고 있다.
-- name: BumpReplyCount :exec
UPDATE comments SET reply_count = GREATEST(0, reply_count + @delta::int) WHERE id = @comment_id::text;

-- ── 차단 ────────────────────────────────────────────────────────────────────
-- 차단하면 팔로우 관계도 **양쪽 다** 끊는다 — 남겨 두면 차단이 풀리는 순간 다시 이어진다.
-- name: BlockUser :exec
INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: UnblockUser :exec
DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2;

-- name: DropFollowBothWays :exec
DELETE FROM follows
WHERE (follower_id = @a::text AND followee_id = @b::text)
   OR (follower_id = @b::text AND followee_id = @a::text);

-- name: IsBlockedByMe :one
SELECT EXISTS (
  SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2
)::boolean;

-- ── 프로필 ──────────────────────────────────────────────────────────────────
-- 카운트는 저장하지 않고 셀 때 센다 — 프로필은 피드만큼 자주 열리지 않는다.
-- name: GetProfileCounts :one
SELECT
  (SELECT count(*) FROM posts   WHERE author_id = @user_id::text AND moderation_status = 'approved')::int AS post_count,
  (SELECT count(*) FROM follows WHERE followee_id = @user_id::text)::int AS follower_count,
  (SELECT count(*) FROM follows WHERE follower_id = @user_id::text)::int AS following_count;

-- name: ListFollowers :many
SELECT u.id, u.display_name, u.avatar_url,
       EXISTS (SELECT 1 FROM follows f2 WHERE f2.follower_id = @viewer_id::text AND f2.followee_id = u.id)::boolean AS following
FROM follows f
JOIN users u ON u.id = f.follower_id
WHERE f.followee_id = @user_id::text
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = u.id)
       OR (b.blocker_id = u.id AND b.blocked_id = @viewer_id::text)
  )
ORDER BY f.created_at DESC
LIMIT @lim;

-- name: ListFollowing :many
SELECT u.id, u.display_name, u.avatar_url,
       EXISTS (SELECT 1 FROM follows f2 WHERE f2.follower_id = @viewer_id::text AND f2.followee_id = u.id)::boolean AS following
FROM follows f
JOIN users u ON u.id = f.followee_id
WHERE f.follower_id = @user_id::text
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = u.id)
       OR (b.blocker_id = u.id AND b.blocked_id = @viewer_id::text)
  )
ORDER BY f.created_at DESC
LIMIT @lim;

-- 내가 차단한 사람들 — 풀려면 여기서 찾아야 한다.
-- name: ListBlockedUsers :many
SELECT u.id, u.display_name, u.avatar_url
FROM blocks b
JOIN users u ON u.id = b.blocked_id
WHERE b.blocker_id = @viewer_id::text
ORDER BY b.created_at DESC;

-- ── 발견(Explore) ───────────────────────────────────────────────────────────
-- 인기 글 — **공개·승인**만. 좋아요가 많은 순, 같으면 최신 순.
-- 댓글 수로 정렬하지 않는 이유: 내려간 댓글까지 세어 순위가 오염된다(옛 서버의 판단 그대로).
-- name: ListExplore :many
SELECT p.*, u.display_name AS author_name, u.avatar_url AS author_avatar,
       (l.user_id IS NOT NULL)::boolean AS liked_by_me,
       (bm.user_id IS NOT NULL)::boolean AS bookmarked_by_me
FROM posts p
JOIN users u ON u.id = p.author_id
LEFT JOIN post_likes l ON l.post_id = p.id AND l.user_id = @viewer_id::text
LEFT JOIN post_bookmarks bm ON bm.post_id = p.id AND bm.user_id = @viewer_id::text
WHERE p.visibility = 'public'
  AND p.moderation_status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = p.author_id)
       OR (b.blocker_id = p.author_id AND b.blocked_id = @viewer_id::text)
  )
ORDER BY p.like_count DESC, p.created_at DESC, p.id DESC
LIMIT @lim;

-- 캡션으로 글 찾기 — 공개·승인만. 사용자가 친 '%'가 와일드카드가 되지 않게 position()을 쓴다.
-- name: SearchPosts :many
SELECT p.*, u.display_name AS author_name, u.avatar_url AS author_avatar,
       (l.user_id IS NOT NULL)::boolean AS liked_by_me,
       (bm.user_id IS NOT NULL)::boolean AS bookmarked_by_me
FROM posts p
JOIN users u ON u.id = p.author_id
LEFT JOIN post_likes l ON l.post_id = p.id AND l.user_id = @viewer_id::text
LEFT JOIN post_bookmarks bm ON bm.post_id = p.id AND bm.user_id = @viewer_id::text
WHERE p.visibility = 'public'
  AND p.moderation_status = 'approved'
  AND position(lower(@q::text) in lower(coalesce(p.caption, ''))) > 0
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = p.author_id)
       OR (b.blocker_id = p.author_id AND b.blocked_id = @viewer_id::text)
  )
ORDER BY p.created_at DESC, p.id DESC
LIMIT @lim;

-- 태그 검색 — 이름에 포함되는 태그를 많이 쓰인 순으로.
-- name: SearchHashtags :many
SELECT h.tag, count(*)::int AS uses
FROM post_hashtags h
JOIN posts p ON p.id = h.post_id
WHERE p.visibility = 'public'
  AND p.moderation_status = 'approved'
  AND position(lower(@q::text) in h.tag) > 0
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = p.author_id)
       OR (b.blocker_id = p.author_id AND b.blocked_id = @viewer_id::text)
  )
GROUP BY h.tag
ORDER BY count(*) DESC, h.tag
LIMIT @lim;

-- 추천 ① 친구의 친구 — 내가 팔로우하는 사람들이 팔로우하는 사람을, 겹치는 수가 많은 순으로.
-- name: SuggestFriendsOfFriends :many
SELECT u.id, u.display_name, u.avatar_url, count(*)::int AS mutuals
FROM follows f
JOIN follows ff ON ff.follower_id = f.followee_id
JOIN users u ON u.id = ff.followee_id
WHERE f.follower_id = @viewer_id::text
  AND ff.followee_id <> @viewer_id::text
  -- 이미 팔로우하는 사람은 뺀다.
  AND NOT EXISTS (
    SELECT 1 FROM follows mine
    WHERE mine.follower_id = @viewer_id::text AND mine.followee_id = ff.followee_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = ff.followee_id)
       OR (b.blocker_id = ff.followee_id AND b.blocked_id = @viewer_id::text)
  )
GROUP BY u.id, u.display_name, u.avatar_url
ORDER BY count(*) DESC, u.id
LIMIT @lim;

-- 추천 ② 모자란 만큼 — 팔로워가 많은 사람으로 채운다.
-- name: SuggestPopular :many
SELECT u.id, u.display_name, u.avatar_url,
       (SELECT count(*) FROM follows f WHERE f.followee_id = u.id)::int AS followers
FROM users u
WHERE u.id <> @viewer_id::text
  AND u.id <> ALL (@exclude::text[])
  AND NOT EXISTS (
    SELECT 1 FROM follows mine
    WHERE mine.follower_id = @viewer_id::text AND mine.followee_id = u.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = u.id)
       OR (b.blocker_id = u.id AND b.blocked_id = @viewer_id::text)
  )
ORDER BY followers DESC, u.id
LIMIT @lim;
