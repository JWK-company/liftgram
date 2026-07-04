-- 해시태그 인덱스 (SRS-018)
CREATE TABLE "PostHashtag" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostHashtag_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PostHashtag_tag_idx" ON "PostHashtag"("tag");
CREATE UNIQUE INDEX "PostHashtag_postId_tag_key" ON "PostHashtag"("postId", "tag");
ALTER TABLE "PostHashtag" ADD CONSTRAINT "PostHashtag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
