-- @plm SRS-019  미디어 쿼리 — 메타를 넣고, 키로 찾는다
--
-- 바이트는 여기 없다(저장소에 있다). 이 파일이 아는 것은 "누가 올렸고 서브해도 되는가"뿐이다.

-- name: CreateMediaAsset :one
INSERT INTO media_assets (id, owner_id, key, url, content_type, kind, bytes, flagged, flag_reason, scan_pending)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- 검사하지 못한 사진 — 오래된 것부터 다시 본다.
-- name: ListScanPending :many
SELECT * FROM media_assets WHERE scan_pending ORDER BY scan_attempts, created_at LIMIT @lim;

-- name: BumpScanAttempts :exec
UPDATE media_assets SET scan_attempts = scan_attempts + 1 WHERE id = @id;

-- 다시 본 결과. 걸렸으면 이 사진을 쓴 글·스토리도 검토 대기로 돌린다.
-- name: ApplyRescan :exec
WITH held_posts AS (
  UPDATE posts SET moderation_status = 'pending'
  WHERE @flagged::boolean AND moderation_status = 'approved' AND @url::text = ANY(media_urls)
), held_stories AS (
  UPDATE stories SET moderation_status = 'pending'
  WHERE @flagged::boolean AND moderation_status = 'approved' AND media_url = @url::text
)
UPDATE media_assets
SET scan_pending = false,
    flagged = flagged OR @flagged::boolean,
    flag_reason = CASE WHEN @flagged::boolean THEN 'auto_scan' ELSE flag_reason END
WHERE key = @key::text;

-- 파일 서브가 매 요청 부른다 — 키에 유일 인덱스가 걸려 있다.
-- name: GetMediaAssetByKey :one
SELECT * FROM media_assets WHERE key = $1;
