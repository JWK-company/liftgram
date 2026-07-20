-- 착용장비 태그 클릭 집계 (SRS-039 · SAD-020 · ADR-027 D8).
-- Phase 0의 유일한 판정 지표. postId에는 FK를 걸지 않는다 — 게시물이 지워져도 클릭 이력이 남아야
-- Phase 1 투자 판단의 표본이 보존된다(Notification.postId 선례와 동일).
CREATE TABLE "GearClick" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GearClick_pkey" PRIMARY KEY ("id")
);
-- 중복 억제 조회(동일 사용자·게시물·카테고리의 최근 행 1건) 전용.
CREATE INDEX "GearClick_userId_postId_category_createdAt_idx" ON "GearClick"("userId", "postId", "category", "createdAt");
-- 카테고리별·기간별 집계(admin 통계) 전용.
CREATE INDEX "GearClick_category_createdAt_idx" ON "GearClick"("category", "createdAt");
-- 특정 사용자에 클릭이 몰리는 이상 패턴 조회(부정 클릭 방어).
CREATE INDEX "GearClick_userId_createdAt_idx" ON "GearClick"("userId", "createdAt");
ALTER TABLE "GearClick" ADD CONSTRAINT "GearClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
