-- @plm SRS-039 @plm SRS-040  착용장비 — 글의 태그와 클릭 집계 (ADR-027)
--
-- ── 왜 클릭을 쌓는가 ────────────────────────────────────────────────────────
-- 지금 단계는 수수료를 벌지 않는다. 남는 자산은 **"사람들이 사진 속 장비를 실제로 눌러보는가"** 하나뿐이고,
-- 그 수치가 다음 단계 투자 판단의 근거가 된다.
--
-- ── post_id에 FK를 걸지 않는다 ──────────────────────────────────────────────
-- 글이 지워져도 클릭 이력은 남아야 표본이 보존된다. CASCADE로 함께 사라지면 지표가 조용히 줄어든다
-- (알림의 post_id와 같은 판단).

ALTER TABLE posts ADD COLUMN IF NOT EXISTS gear jsonb;

CREATE TABLE IF NOT EXISTS gear_clicks (
  id         text        PRIMARY KEY,
  user_id    text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- FK 없음(위 주석).
  post_id    text        NOT NULL,
  -- wristWrap|strap|belt|kneeSleeve|gloves|shoes|chalk|armSleeve
  category   text        NOT NULL,
  -- user|auto — 사용자가 단 태그와 자동 감지의 성과를 나눠 본다.
  source     text        NOT NULL DEFAULT 'user',
  -- deeplink|search — 제휴 링크로 열렸는지 검색으로 폴백했는지.
  kind       text        NOT NULL DEFAULT 'search',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 중복 억제가 매 요청 타는 인덱스: (누가, 어느 글, 어느 장비, 언제).
CREATE INDEX IF NOT EXISTS gear_clicks_dedupe_idx ON gear_clicks (user_id, post_id, category, created_at DESC);
-- 집계가 훑는 방향.
CREATE INDEX IF NOT EXISTS gear_clicks_created_idx ON gear_clicks (created_at DESC);
