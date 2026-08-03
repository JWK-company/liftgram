-- @plm SRS-039  착용장비 클릭

-- 같은 사람이 같은 글의 같은 장비를 짧은 시간에 다시 눌렀는가.
-- 반복 클릭은 집계를 부풀릴 뿐 아니라 제재 사유이기도 하다 — 서버에서 눌러 둔다.
-- name: RecentGearClickExists :one
SELECT EXISTS (
  SELECT 1 FROM gear_clicks
  WHERE user_id = @user_id::text
    AND post_id = @post_id::text
    AND category = @category::text
    AND created_at >= @since::timestamptz
)::boolean;

-- name: CreateGearClick :exec
INSERT INTO gear_clicks (id, user_id, post_id, category, source, kind)
VALUES ($1, $2, $3, $4, $5, $6);
