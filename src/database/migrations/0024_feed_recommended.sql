-- SPEC-030  추천 탭 — 내 글을 추천에서 빼는 설정과, 관심도 계산용 좋아요 인덱스.
ALTER TABLE users ADD COLUMN IF NOT EXISTS recommend_opt_out boolean NOT NULL DEFAULT false;

-- 「내가 최근 좋아요한 글」은 사용자 방향 조회다. PK(post_id, user_id)로는 전체를 훑는다.
CREATE INDEX IF NOT EXISTS post_likes_user_created_idx ON post_likes (user_id, created_at DESC);
