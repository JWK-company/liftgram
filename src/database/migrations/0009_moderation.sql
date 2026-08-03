-- @plm SRS-020  신고·모더레이션 (ADR-017)
--
-- ── 신고자당 대상 1건 ───────────────────────────────────────────────────────
-- 같은 사람이 같은 글을 열 번 신고해도 한 건이다. 유일 제약이 그 규칙의 근거다 —
-- 앱에서만 막으면 재시도·중복 탭이 그대로 뚫는다(그리고 신고 수가 부풀어 판단이 왜곡된다).
--
-- ── 내려도 지우지 않는다 ────────────────────────────────────────────────────
-- 제거는 `moderation_status='removed'`로 감추는 것이고, 언제·왜 내렸는지를 함께 남긴다.
-- 이의 제기가 들어오면 그 기록이 유일한 근거다.

CREATE TABLE IF NOT EXISTS reports (
  id           text        PRIMARY KEY,
  -- post | story | comment
  target_type  text        NOT NULL,
  target_id    text        NOT NULL,
  reporter_id  text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- spam|nudity|harassment|violence|self_harm|minor_safety|misinformation|other
  reason       text        NOT NULL,
  details      text,
  -- pending | resolved | dismissed
  status       text        NOT NULL DEFAULT 'pending',
  -- 검토자는 지워질 수 있다(퇴사·탈퇴) — 그때 신고 기록까지 사라지면 안 되므로 SET NULL.
  reviewed_by  text        REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at  timestamptz,
  -- removed | dismissed
  action_taken text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- 같은 사람이 같은 대상을 다시 신고해도 한 건이다.
  UNIQUE (reporter_id, target_type, target_id)
);

-- 큐가 매번 쓰는 방향: 아직 안 본 신고를 최신순으로.
CREATE INDEX IF NOT EXISTS reports_status_created_idx ON reports (status, created_at DESC);
-- 대상 하나에 달린 신고들을 모을 때.
CREATE INDEX IF NOT EXISTS reports_target_idx ON reports (target_type, target_id);

-- 제거 기록 — 무엇을 언제 왜 내렸는지. 옛 Prisma의 removedAt/removedReason과 같은 자리다.
ALTER TABLE posts    ADD COLUMN IF NOT EXISTS removed_at     timestamptz;
ALTER TABLE posts    ADD COLUMN IF NOT EXISTS removed_reason text;
ALTER TABLE stories  ADD COLUMN IF NOT EXISTS removed_at     timestamptz;
ALTER TABLE stories  ADD COLUMN IF NOT EXISTS removed_reason text;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS removed_at     timestamptz;

-- 자동 보류(pending)된 것을 훑는 방향 — 신고가 없어도 큐에 올라온다.
CREATE INDEX IF NOT EXISTS posts_moderation_idx  ON posts (moderation_status) WHERE moderation_status <> 'approved';
CREATE INDEX IF NOT EXISTS stories_moderation_idx ON stories (moderation_status) WHERE moderation_status <> 'approved';
