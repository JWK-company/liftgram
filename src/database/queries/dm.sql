-- @plm SRS-017  DM 쿼리
--
-- 참여자 확인은 **모든 접근의 첫 관문**이다(대화 열기·메시지 읽기·보내기·읽음 처리).
-- 그래서 참여자 표의 기본 키가 (대화, 사람)이다 — 확인이 인덱스 한 번이면 끝난다.

-- 1:1 대화는 정규화 키로 찾는다. 동시에 만들어도 유일 제약이 하나만 남긴다.
-- name: FindDirectConversation :one
SELECT * FROM conversations WHERE direct_key = $1;

-- name: CreateConversation :one
INSERT INTO conversations (id, is_group, direct_key, title)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: AddParticipant :exec
INSERT INTO conversation_participants (conversation_id, user_id) VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: RemoveParticipant :exec
DELETE FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2;

-- name: CountParticipants :one
SELECT count(*)::int FROM conversation_participants WHERE conversation_id = $1;

-- name: DeleteConversation :exec
DELETE FROM conversations WHERE id = $1;

-- name: IsParticipant :one
SELECT EXISTS (
  SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2
)::boolean;

-- name: GetConversation :one
SELECT * FROM conversations WHERE id = $1;

-- 내가 낀 대화들. 최근 것이 앞.
-- name: ListMyConversations :many
SELECT c.*
FROM conversations c
JOIN conversation_participants p ON p.conversation_id = c.id AND p.user_id = @viewer_id::text
ORDER BY c.updated_at DESC
LIMIT @lim;

-- 한 대화의 참여자들(이름까지).
-- name: ListParticipants :many
SELECT p.conversation_id, u.id, u.display_name, u.avatar_url
FROM conversation_participants p
JOIN users u ON u.id = p.user_id
WHERE p.conversation_id = ANY (@conversation_ids::text[]);

-- 안 읽은 수 — 저장하지 않고 셀 때 센다(내 last_read_at 이후의 **남의** 메시지).
-- name: CountUnread :one
SELECT count(*)::int
FROM messages m
JOIN conversation_participants p
  ON p.conversation_id = m.conversation_id AND p.user_id = @viewer_id::text
WHERE m.conversation_id = @conversation_id::text
  AND m.sender_id <> @viewer_id::text
  AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at);

-- 목록에 붙는 마지막 메시지.
-- name: GetLastMessage :one
SELECT m.*, u.display_name AS sender_name, u.avatar_url AS sender_avatar
FROM messages m
JOIN users u ON u.id = m.sender_id
WHERE m.conversation_id = $1
ORDER BY m.created_at DESC, m.id DESC
LIMIT 1;

-- 대화 내용. 차단 관계인 사람의 메시지는 빼고 본다(1:1이면 상대, 그룹이면 그 멤버).
-- name: ListMessages :many
SELECT m.*, u.display_name AS sender_name, u.avatar_url AS sender_avatar
FROM messages m
JOIN users u ON u.id = m.sender_id
WHERE m.conversation_id = @conversation_id::text
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = m.sender_id)
       OR (b.blocker_id = m.sender_id AND b.blocked_id = @viewer_id::text)
  )
  AND (@has_before::boolean = false OR m.created_at < @before::timestamptz)
ORDER BY m.created_at DESC, m.id DESC
LIMIT @lim;

-- 스트림이 쓰는 방향: 이 시각 **이후**의 새 메시지(오래된 것부터).
-- name: ListMessagesAfter :many
SELECT m.*, u.display_name AS sender_name, u.avatar_url AS sender_avatar
FROM messages m
JOIN users u ON u.id = m.sender_id
WHERE m.conversation_id = @conversation_id::text
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = m.sender_id)
       OR (b.blocker_id = m.sender_id AND b.blocked_id = @viewer_id::text)
  )
  AND m.created_at > @after::timestamptz
ORDER BY m.created_at ASC, m.id ASC
LIMIT @lim;

-- name: CreateMessage :one
INSERT INTO messages (id, conversation_id, sender_id, kind, body, media_url)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- 목록 정렬이 최신 대화 순이므로, 메시지를 넣으면 대화도 함께 올린다(같은 트랜잭션).
-- name: TouchConversation :exec
UPDATE conversations SET updated_at = now() WHERE id = $1;

-- name: MarkRead :exec
UPDATE conversation_participants SET last_read_at = now()
WHERE conversation_id = $1 AND user_id = $2;

-- 그룹에 넣을 수 있는지 — 내가 팔로우하는 사람만.
-- name: CountFollowedAmong :one
SELECT count(*)::int FROM follows
WHERE follower_id = @follower_id::text AND followee_id = ANY (@user_ids::text[]);

-- name: CountUsersAmong :one
SELECT count(*)::int FROM users WHERE id = ANY (@user_ids::text[]);
