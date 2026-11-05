-- 파일이 곧 트랜잭션이다 — users 잠금과 인덱스 만들기를 한 트랜잭션에 묶지 않으려고 0028 에서 나눴다(코드 리뷰 M-2).
-- 통계는 전체 동기 표를 훑지 않는다 — 운동·루틴 행만 시행일 뒤 범위로 읽는다.
CREATE INDEX IF NOT EXISTS sync_records_stats_workouts_idx
  ON sync_records (created_at, user_id) WHERE collection = 'workouts' AND deleted = false;
CREATE INDEX IF NOT EXISTS sync_records_stats_routines_idx
  ON sync_records (created_at, user_id) WHERE collection = 'routines' AND deleted = false;
