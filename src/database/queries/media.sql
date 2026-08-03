-- @plm SRS-019  미디어 쿼리 — 메타를 넣고, 키로 찾는다
--
-- 바이트는 여기 없다(저장소에 있다). 이 파일이 아는 것은 "누가 올렸고 서브해도 되는가"뿐이다.

-- name: CreateMediaAsset :one
INSERT INTO media_assets (id, owner_id, key, url, content_type, kind, bytes, flagged, flag_reason)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- 파일 서브가 매 요청 부른다 — 키에 유일 인덱스가 걸려 있다.
-- name: GetMediaAssetByKey :one
SELECT * FROM media_assets WHERE key = $1;
