-- @plm SRS-088  운영 상태 쿼리 — 기기 건강 보고(upsert·정리) · 운영 화면 읽기
-- @plm SRS-087  백업 결과 읽기(ops_backup_runs — 넣는 쪽은 서버 스크립트의 psql 이다)

-- 기기 한 대의 보고. 처음 보고한 시각(first_reported_at)은 바꾸지 않는다 — 한 번도 성공 못 한 기기의 「N일째」 기준이다.
-- name: UpsertClientHealth :exec
INSERT INTO client_health (
  user_id, device_id, app_version, last_success_at, last_attempt_at,
  consecutive_failures, pending, blocked, last_error, reported_at
) VALUES (
  @user_id, @device_id, @app_version, @last_success_at, @last_attempt_at,
  @consecutive_failures, @pending, @blocked, @last_error, @reported_at
)
ON CONFLICT (user_id, device_id) DO UPDATE SET
  app_version          = EXCLUDED.app_version,
  last_success_at      = EXCLUDED.last_success_at,
  last_attempt_at      = EXCLUDED.last_attempt_at,
  consecutive_failures = EXCLUDED.consecutive_failures,
  pending              = EXCLUDED.pending,
  blocked              = EXCLUDED.blocked,
  last_error           = EXCLUDED.last_error,
  reported_at          = EXCLUDED.reported_at;

-- 사용자당 최신 N줄만 남긴다(남용 방지 — 기기 id 를 바꿔 가며 줄을 끝없이 만들 수 없게). upsert 와 같은 트랜잭션.
-- name: TrimClientHealth :exec
DELETE FROM client_health c
WHERE c.user_id = @user_id
  AND c.device_id NOT IN (
    SELECT k.device_id FROM client_health k
    WHERE k.user_id = @user_id
    ORDER BY k.reported_at DESC, k.device_id
    LIMIT @keep::int
  );

-- 조회 창(90일) 안의 보고 전부 — 사용자별로 묶고 최신순.
-- name: ListClientHealthSince :many
SELECT user_id, device_id, app_version, last_success_at, last_attempt_at,
       consecutive_failures, pending, blocked, last_error, first_reported_at, reported_at
FROM client_health
WHERE reported_at >= @since
ORDER BY user_id, reported_at DESC;

-- 운영 화면의 사용자 목록 — 서버 관점 마지막 동기 쓰기 · 마지막 활동(토큰 갱신 · qa spec M-10).
-- name: ListOpsUsers :many
SELECT u.id, u.email, u.display_name, u.created_at,
       (SELECT max(s.updated_at) FROM sync_records s WHERE s.user_id = u.id)::timestamptz AS last_sync_at,
       (SELECT max(r.created_at) FROM refresh_tokens r WHERE r.user_id = u.id)::timestamptz AS last_active_at
FROM users u
ORDER BY last_active_at DESC NULLS LAST, u.created_at DESC
LIMIT @lim::int;

-- 종류별 마지막 줄.
-- name: LastBackupRun :one
SELECT id, kind, ok, size_bytes, tables, disk_free_bytes, detail, counts, created_at
FROM ops_backup_runs
WHERE kind = @kind
ORDER BY created_at DESC, id DESC
LIMIT 1;

-- 종류별 마지막 **성공** 줄.
-- name: LastOkBackupRun :one
SELECT id, kind, ok, size_bytes, tables, disk_free_bytes, detail, counts, created_at
FROM ops_backup_runs
WHERE kind = @kind AND ok
ORDER BY created_at DESC, id DESC
LIMIT 1;
