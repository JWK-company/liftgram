-- SPEC-032  피드백을 우리 DB에 — 운영 피드백(ops)과 사용자 의견(user)은 kind 로 나뉘어 섞이지 않는다.
-- approved_* 는 나중의 자동 수정을 위해 예약한 칸이다. 지금은 값만 저장하고 아무것도 실행하지 않는다.
-- 작성자가 탈퇴하면 사용자 의견은 삭제 트랜잭션이 지우고, 운영 피드백은 작성자만 비운다.
CREATE TABLE IF NOT EXISTS feedback_items (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('ops', 'user')),
  author_id text REFERENCES users(id) ON DELETE SET NULL,
  category text CHECK (category IN ('bug', 'improvement')), -- 사용자 의견은 NULL
  title text NOT NULL DEFAULT '',
  body text NOT NULL,
  app_version text NOT NULL DEFAULT '',
  platform text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'approved', 'rejected', 'in_progress', 'done')),
  resolution text NOT NULL DEFAULT '',
  approved_body_sha256 text,
  approved_instruction text NOT NULL DEFAULT '',
  closed_at timestamptz, -- 반려·완료 시각. 사용자 의견은 이로부터 1년 뒤 지운다.
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_items_list_idx ON feedback_items (kind, status, created_at);
CREATE INDEX IF NOT EXISTS feedback_items_author_idx ON feedback_items (author_id, created_at);

-- 상태 변경 기록. 추가만 한다.
CREATE TABLE IF NOT EXISTS feedback_events (
  id bigserial PRIMARY KEY,
  item_id bigint NOT NULL REFERENCES feedback_items(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  from_status text NOT NULL,
  to_status text NOT NULL,
  note text NOT NULL DEFAULT '',
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_events_item_idx ON feedback_events (item_id, at);
