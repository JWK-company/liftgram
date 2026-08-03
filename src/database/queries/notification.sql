-- @plm SRS-020  알림 쿼리
--
-- 차단한 사람이 일으킨 알림은 보이지 않는다 — 차단은 **양방향**이라 어느 쪽이 걸었든 가린다.

-- name: CreateNotification :exec
INSERT INTO notifications (id, user_id, kind, actor_id, post_id)
VALUES ($1, $2, $3, $4, $5);

-- name: ListNotifications :many
SELECT n.*, u.display_name AS actor_name, u.avatar_url AS actor_avatar
FROM notifications n
JOIN users u ON u.id = n.actor_id
WHERE n.user_id = @viewer_id::text
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = n.actor_id)
       OR (b.blocker_id = n.actor_id AND b.blocked_id = @viewer_id::text)
  )
ORDER BY n.created_at DESC, n.id DESC
LIMIT @lim;

-- name: CountUnreadNotifications :one
SELECT count(*)::int
FROM notifications n
WHERE n.user_id = @viewer_id::text
  AND n.read_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = n.actor_id)
       OR (b.blocker_id = n.actor_id AND b.blocked_id = @viewer_id::text)
  );

-- name: MarkAllNotificationsRead :exec
UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL;
