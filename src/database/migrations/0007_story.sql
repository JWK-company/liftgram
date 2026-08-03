-- @plm SRS-019  스토리 — 24시간 뒤 안 보이는 한 컷
--
-- ── 지우지 않고 감추는 이유 ─────────────────────────────────────────────────
-- 만료는 `expires_at > now()` 필터로만 한다. 행을 지우면 신고가 들어왔을 때 무엇이 올라왔었는지
-- 확인할 수 없다(내려간 글을 지우지 않는 것과 같은 이유 — ADR-017).
-- 정리 작업은 나중에 배치로 돈다. 그때도 "만료 후 N일"처럼 유예를 둔다.
--
-- 컬럼 이름·의미를 옛 Prisma Story와 맞췄다 — 전환 시점에 살아 있는 스토리를 그대로 옮기려고.

CREATE TABLE IF NOT EXISTS stories (
  id                text        PRIMARY KEY,
  author_id         text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 미리 올린 사진의 주소(`/media/file/<key>`). 바이트는 media_assets·저장소에 있다.
  media_url         text        NOT NULL,
  caption           text,
  -- approved | pending | removed — 자동 스캔에 걸린 사진은 pending으로 들어와 보이지 않는다.
  moderation_status text        NOT NULL DEFAULT 'approved',
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL
);

-- 트레이가 매번 쓰는 조회: "이 사람들 중 아직 안 끝난 것".
CREATE INDEX IF NOT EXISTS stories_author_expires_idx ON stories (author_id, expires_at);
-- 나중에 붙일 정리 배치가 쓸 방향.
CREATE INDEX IF NOT EXISTS stories_expires_idx ON stories (expires_at);
