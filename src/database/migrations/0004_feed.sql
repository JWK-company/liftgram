-- @plm SRS-007  피드 — 게시물·좋아요·댓글·팔로우·차단
--
-- 컬럼 이름·의미를 옛 백엔드(server/, Prisma)와 맞췄다. 전환 시점에 기존 글과 관계를
-- 그대로 옮기기 위해서다.
--
-- ── 카운트를 컬럼으로 들고 있는 이유 ────────────────────────────────────────
-- 좋아요·댓글 수는 **매번 세지 않고** 저장한다. 피드 한 페이지(20개)마다 두 번씩 COUNT를 돌면
-- 글이 쌓일수록 느려지고, 그 비용이 제일 자주 열리는 화면에 걸린다.
-- 대신 쓰기 때 함께 갱신한다 — 좋아요는 같은 트랜잭션에서 넣고 세므로 어긋나지 않는다.
--
-- ── 커서 인덱스 ─────────────────────────────────────────────────────────────
-- 피드 정렬이 (created_at desc, id desc)이므로 인덱스도 그 두 열로 만든다.
-- created_at 하나로는 같은 밀리초의 글이 페이지 경계에서 새거나 겹친다(옛 서버가 밟은 문제).

CREATE TABLE IF NOT EXISTS posts (
  id                text        PRIMARY KEY,
  author_id         text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- text | workout | image
  kind              text        NOT NULL DEFAULT 'text',
  caption           text,
  -- public | followers | private
  visibility        text        NOT NULL DEFAULT 'public',
  -- approved | pending | removed  — 내려간 글은 지우지 않고 감춘다(이의 제기·감사 때문에).
  moderation_status text        NOT NULL DEFAULT 'approved',

  -- 오운완 요약. 기기에서 확정된 값을 그대로 싣는다(서버가 다시 계산하지 않는다).
  workout_id        text,
  workout_name      text,
  total_volume_kg   double precision,
  working_sets      integer,
  duration_seconds  integer,
  pr_count          integer,

  media_urls        text[]      NOT NULL DEFAULT '{}',

  -- 같은 글이 두 번 올라가지 않게. 사용자마다 유일하다(아래 부분 인덱스).
  idempotency_key   text,

  like_count        integer     NOT NULL DEFAULT 0,
  comment_count     integer     NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 피드·프로필 목록이 쓰는 키셋 커서.
CREATE INDEX IF NOT EXISTS posts_created_idx ON posts (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS posts_author_created_idx ON posts (author_id, created_at DESC, id DESC);

-- 키가 있을 때만 유일하다 — 대부분의 글은 키 없이 올라온다(NULL은 서로 충돌하지 않는다).
CREATE UNIQUE INDEX IF NOT EXISTS posts_idempotency_idx
  ON posts (author_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS post_likes (
  post_id    text        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- 한 사람이 한 글에 하나. 두 번 눌러도 하나가 되는 근거가 여기 있다.
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id                text        PRIMARY KEY,
  post_id           text        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id         text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body              text        NOT NULL,
  moderation_status text        NOT NULL DEFAULT 'approved',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comments_post_created_idx ON comments (post_id, created_at, id);

CREATE TABLE IF NOT EXISTS follows (
  follower_id text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id)
);

-- "나를 팔로우하는 사람"을 훑는 방향.
CREATE INDEX IF NOT EXISTS follows_followee_idx ON follows (followee_id);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

-- 차단은 **양방향으로** 가린다 — 내가 차단한 사람도, 나를 차단한 사람도 서로 보이지 않는다.
-- 그래서 두 방향 모두로 훑을 수 있어야 한다.
CREATE INDEX IF NOT EXISTS blocks_blocked_idx ON blocks (blocked_id);
