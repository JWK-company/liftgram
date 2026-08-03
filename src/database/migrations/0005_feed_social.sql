-- @plm SRS-007 @plm SRS-008 @plm SRS-018  피드 확장 — 저장·해시태그·대댓글·운동 상세
--
-- 0004가 "글을 올리고 서로 본다"였다면 여기는 **화면이 실제로 쓰는 나머지**다:
-- 저장(북마크) · 해시태그 모아보기 · 답글과 댓글 좋아요 · 오운완의 종목/세트 상세.
--
-- ── 왜 exercises를 jsonb로 두는가 ───────────────────────────────────────────
-- 게시된 운동은 **그때 찍힌 사진**이다. 나중에 종목 이름이 바뀌거나 세트가 수정돼도
-- 올라간 글은 그대로여야 한다. 정규화해서 exercise 테이블을 참조하면 그 불변성이 깨진다
-- (옛 서버도 같은 이유로 data JSON에 통째로 실었다 — 그 판단을 그대로 가져온다).
-- 대신 이 컬럼으로는 **검색하지 않는다.** 검색이 필요해지면 그때 인덱스를 판다.

ALTER TABLE posts ADD COLUMN IF NOT EXISTS streak_days    integer;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS weekly_reached boolean;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS exercises      jsonb;

-- 저장(북마크). 좋아요와 달리 **남에게 보이지 않으므로** 카운트를 들고 있지 않는다.
CREATE TABLE IF NOT EXISTS post_bookmarks (
  post_id    text        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

-- "내가 저장한 글"을 훑는 방향.
CREATE INDEX IF NOT EXISTS post_bookmarks_user_idx ON post_bookmarks (user_id, created_at DESC);

-- 해시태그 색인. 캡션을 LIKE로 훑지 않고 **올릴 때 뽑아 따로 저장한다** —
-- 캡션 안의 '#상체'는 '#상체운동'과도 부분일치해서, 문자열 검색으로는 태그가 될 수 없다.
CREATE TABLE IF NOT EXISTS post_hashtags (
  post_id text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  -- 소문자로 정규화해 저장한다(#상체 = #상체, #Chest = #chest).
  tag     text NOT NULL,
  PRIMARY KEY (post_id, tag)
);

CREATE INDEX IF NOT EXISTS post_hashtags_tag_idx ON post_hashtags (tag);

-- 답글 — 한 단계까지만. 답글의 답글은 부모(루트)에 붙인다(화면이 감당하는 깊이).
ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id   text REFERENCES comments(id) ON DELETE CASCADE;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS like_count  integer NOT NULL DEFAULT 0;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS reply_count integer NOT NULL DEFAULT 0;

-- 루트 댓글 목록(부모 없는 것)과 한 댓글의 답글 목록, 두 방향 모두 이 인덱스를 탄다.
CREATE INDEX IF NOT EXISTS comments_parent_created_idx ON comments (parent_id, created_at, id);

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id text        NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);
