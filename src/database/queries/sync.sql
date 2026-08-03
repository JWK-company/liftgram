-- @plm SRS-006  오프라인 동기

-- 이 사람 것 중 주어진 시각 뒤로 바뀐 것 전부.
-- **상한을 함께 받는다** — pull이 시작될 때 정한 시각 이후의 쓰기는 다음 회차 몫이다.
-- 그래야 커서가 "읽지 않은 것"을 뛰어넘지 않는다.
-- name: ListSyncChanges :many
SELECT collection, record_id, payload, deleted
FROM sync_records
WHERE user_id = @user_id::text
  AND updated_at > @since::timestamptz
  AND updated_at <= @until::timestamptz
ORDER BY updated_at, record_id;

-- 서버의 지금 시각. **애플리케이션 시계를 쓰지 않는다** —
-- 커서와 updated_at이 다른 시계에서 나오면 몇 밀리초 차이로 레코드가 영영 누락된다.
-- name: SyncNow :one
SELECT now()::timestamptz AS now;

-- 레코드 묶음을 한 번에 올린다(있으면 덮고 없으면 만든다).
-- 한 문장으로 보내는 이유: 레코드마다 왕복하면 수백 건 push에서 그 왕복이 전부다.
-- name: UpsertSyncRecords :exec
INSERT INTO sync_records (id, user_id, collection, record_id, payload, deleted, updated_at)
SELECT
  unnest(@ids::text[]),
  @user_id::text,
  unnest(@collections::text[]),
  unnest(@record_ids::text[]),
  unnest(@payloads::jsonb[]),
  false,
  now()
ON CONFLICT (user_id, collection, record_id) DO UPDATE
  SET payload    = EXCLUDED.payload,
      deleted    = false,
      updated_at = now();

-- 삭제 표시. 행을 지우지 않는다 — 지우면 다른 기기가 되살린다.
-- 서버가 모르는 레코드를 지우라고 해도 **행을 만든다**(그 기기에만 있던 것을 다른 기기가 알아야 한다).
-- name: MarkSyncDeleted :exec
INSERT INTO sync_records (id, user_id, collection, record_id, payload, deleted, updated_at)
SELECT
  unnest(@ids::text[]),
  @user_id::text,
  unnest(@collections::text[]),
  unnest(@record_ids::text[]),
  '{}'::jsonb,
  true,
  now()
ON CONFLICT (user_id, collection, record_id) DO UPDATE
  SET deleted    = true,
      updated_at = now();
