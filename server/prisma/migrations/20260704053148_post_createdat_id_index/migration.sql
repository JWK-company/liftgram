-- 키셋 커서 페이지네이션(무한스크롤): orderBy [createdAt desc, id desc] 커버 인덱스.
CREATE INDEX IF NOT EXISTS "Post_createdAt_id_idx" ON "Post"("createdAt", "id");
