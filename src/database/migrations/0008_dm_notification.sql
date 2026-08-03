-- @plm SRS-017 @plm SRS-020  다이렉트 메시지 · 알림
--
-- ── 1:1 대화가 둘이 되지 않게 ───────────────────────────────────────────────
-- `direct_key`는 두 사람 id를 **정렬해서 이어 붙인 값**이고 유일하다. 두 사람이 동시에
-- "메시지 보내기"를 눌러도 하나만 만들어지고, 두 번째는 유일 제약에 걸려 기존 것을 찾아간다.
-- 애플리케이션에서 "있으면 쓰고 없으면 만든다"로만 처리하면 그 경합에서 대화가 둘이 된다.
--
-- ── 안 읽은 수를 저장하지 않는 이유 ─────────────────────────────────────────
-- 참여자마다 `last_read_at` 하나만 둔다. 안 읽은 수는 그 시각 이후 남의 메시지를 세면 나온다.
-- 수를 따로 저장하면 사람×대화마다 갱신해야 하고, 한 번 어긋나면 영영 틀린 채로 남는다.

CREATE TABLE IF NOT EXISTS conversations (
  id         text        PRIMARY KEY,
  is_group   boolean     NOT NULL DEFAULT false,
  -- 1:1에만 있다(그룹은 NULL — NULL끼리는 서로 충돌하지 않는다).
  direct_key text        UNIQUE,
  title      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 마지막 메시지 시각 = 목록 정렬 기준.
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversations_updated_idx ON conversations (updated_at DESC);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id text        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 여기까지 읽었다. 안 읽은 수는 이 시각 이후의 남의 메시지 개수다.
  last_read_at    timestamptz,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- "내가 낀 대화"를 훑는 방향.
CREATE INDEX IF NOT EXISTS conversation_participants_user_idx ON conversation_participants (user_id);

CREATE TABLE IF NOT EXISTS messages (
  id              text        PRIMARY KEY,
  conversation_id text        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- text | image
  kind            text        NOT NULL DEFAULT 'text',
  body            text,
  media_url       text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 대화를 열 때마다 쓰는 조회: 이 대화의 최신 N개.
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages (conversation_id, created_at DESC, id DESC);

-- ── 알림 ────────────────────────────────────────────────────────────────────
-- 문구를 저장하지 않는다. 종류·누가·어느 글만 남기고 **문장은 화면이 만든다** —
-- 서버는 보는 사람의 언어를 모르고, 나중에 표현을 바꿔도 옛 알림까지 함께 바뀐다.
CREATE TABLE IF NOT EXISTS notifications (
  id         text        PRIMARY KEY,
  -- 받는 사람.
  user_id    text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- follow | like | comment
  kind       text        NOT NULL,
  -- 일으킨 사람.
  actor_id   text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    text,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications (user_id, created_at DESC, id DESC);
