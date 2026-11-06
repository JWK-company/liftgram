-- 공식 계정 글의 표시 정보(ADR-060) — AI 고지 종류와 붙일 크리에이터 루틴 id.
-- 사용자 요청으로는 쓸 수 없고 src/scripts/seed-official-feed.mjs 만 넣는다.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS official_meta jsonb;
