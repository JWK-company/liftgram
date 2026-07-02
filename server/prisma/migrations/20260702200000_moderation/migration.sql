-- 모더레이션 (SAD-012 · ADR-017): 역할·소프트제거 상태·자동스캔 플래그·신고 테이블

-- User 역할
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'user';

-- Post 모더레이션 상태
ALTER TABLE "Post" ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE "Post" ADD COLUMN "removedAt" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN "removedReason" TEXT;
CREATE INDEX "Post_moderationStatus_idx" ON "Post"("moderationStatus");

-- Story 모더레이션 상태
ALTER TABLE "Story" ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE "Story" ADD COLUMN "removedAt" TIMESTAMP(3);
ALTER TABLE "Story" ADD COLUMN "removedReason" TEXT;

-- Comment 모더레이션 상태
ALTER TABLE "Comment" ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE "Comment" ADD COLUMN "removedAt" TIMESTAMP(3);

-- MediaAsset 자동 스캔 플래그
ALTER TABLE "MediaAsset" ADD COLUMN "flagged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MediaAsset" ADD COLUMN "flagReason" TEXT;

-- 신고 테이블
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "actionTaken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Report_reporterId_targetType_targetId_key" ON "Report"("reporterId", "targetType", "targetId");
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");
CREATE INDEX "Report_status_idx" ON "Report"("status");
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
