-- 게시물 저장(북마크) (SRS-007).
CREATE TABLE "Bookmark" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Bookmark_postId_userId_key" ON "Bookmark"("postId", "userId");
CREATE INDEX "Bookmark_userId_createdAt_idx" ON "Bookmark"("userId", "createdAt");
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
