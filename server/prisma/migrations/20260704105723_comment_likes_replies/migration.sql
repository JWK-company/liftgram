-- 대댓글(1단계) + 댓글 좋아요 (SRS-007).
ALTER TABLE "Comment" ADD COLUMN "parentId" TEXT;
CREATE INDEX "Comment_parentId_createdAt_idx" ON "Comment"("parentId", "createdAt");
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CommentLike" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommentLike_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommentLike_commentId_userId_key" ON "CommentLike"("commentId", "userId");
CREATE INDEX "CommentLike_commentId_idx" ON "CommentLike"("commentId");
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_commentId_fkey"
  FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommentLike" ADD CONSTRAINT "CommentLike_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
