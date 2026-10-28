-- @plm SRS-087  백업 결과 기록 — 매일 백업·월 복원 시험이 끝날 때마다 한 줄씩 남는다
-- @plm SRS-088  기기 동기 건강 보고 — 운영진이 사용자 화면을 보지 않고도 동기 멈춤을 안다
--
-- 2026-10 사고: 옛 앱의 동기가 두 달 동안 조용히 실패했고, 경고는 사용자 화면에만 있어 운영진은 몰랐다.
-- 백업도 「돌았다」는 사실만 있었지 되살아나는지 아무도 확인하지 않았다. 그래서 두 표를 둔다.
--
-- ops_backup_runs   스크립트(scripts/backup-h2500-3.sh · restore-test-h2500-3.sh)가 끝날 때(성공·실패 모두) 넣는다.
--   kind            daily(매일 pg_dump) | restore_test(월 1회 임시 DB 로 되살려 행 수 대조)
--   tables          daily: 덤프 안 TABLE DATA 수 · restore_test: 대조한 표 수
--   disk_free_bytes 백업 디스크(/home) 남은 공간 — restore_test 는 DB 디스크(/var/lib/docker)
--   detail          실패 이유·low_disk 표시·대조 요약(짧게)
--   counts          daily: 덤프 직전 같은 스냅샷(REPEATABLE READ)으로 센 {"users":N,"sync_records":M}
--                   restore_test: 되살린 DB 에서 센 같은 모양 — 그 덤프의 daily counts 와 **정확히** 같아야 ok
--
-- client_health     기기가 동기를 시도한 **뒤** 보고한다(로그인 사용자만 · 10분 쓰로틀 · 상태가 바뀌면 즉시).
--   device_id       기기 무작위 id 를 sha256(device_id + user_id) 앞 16자로 바꾼 값(계정 간 같은 기기 연결 숨김)
--   last_*_at       서버가 server_now − 기기가 보낸 나이(ms)로 다시 계산한 시각(기기 시계 틀어짐 무관)
--   first_reported_at  처음 보고한 시각 — upsert 에서 바꾸지 않는다(한 번도 성공 못 한 기기의 「N일째」 기준)
--   사용자당 최신 8줄만 남긴다(서버가 upsert 와 같은 트랜잭션에서 정리) · 90일 넘게 보고 없는 줄은 조회에서 뺀다.

CREATE TABLE IF NOT EXISTS ops_backup_runs (
  id               bigserial   PRIMARY KEY,
  kind             text        NOT NULL CHECK (kind IN ('daily', 'restore_test')),
  ok               boolean     NOT NULL,
  size_bytes       bigint,
  tables           int,
  disk_free_bytes  bigint,
  detail           text,
  counts           jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 운영 화면의 질문 그대로: "이 종류의 마지막 줄" · "마지막 성공한 daily".
CREATE INDEX IF NOT EXISTS ops_backup_runs_kind_created_idx
  ON ops_backup_runs (kind, created_at DESC);

CREATE TABLE IF NOT EXISTS client_health (
  user_id               text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id             text        NOT NULL,
  app_version           text        NOT NULL DEFAULT '',
  last_success_at       timestamptz,
  last_attempt_at       timestamptz,
  consecutive_failures  int         NOT NULL DEFAULT 0,
  -- 모르면 NULL(기기가 아직 세지 못했다)
  pending               int,
  blocked               boolean     NOT NULL DEFAULT false,
  -- 앞 200자 · 제어문자 제거(서버가 자른다)
  last_error            text,
  first_reported_at     timestamptz NOT NULL DEFAULT now(),
  reported_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);

-- 사용자당 최신 8줄 정리 · 90일 창 조회.
CREATE INDEX IF NOT EXISTS client_health_reported_idx
  ON client_health (reported_at DESC);
