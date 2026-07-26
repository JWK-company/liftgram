-- AlterTable
ALTER TABLE "User" ADD COLUMN     "experienceLevel" TEXT,
ADD COLUMN     "trainerIntent" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CoachingGrant" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scope" JSONB NOT NULL DEFAULT '{"routineEdit":true,"scheduleEdit":true,"logView":true}',
    "requestedBy" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachingGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachingAudit" (
    "id" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachingAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachingGrant_memberId_status_idx" ON "CoachingGrant"("memberId", "status");

-- CreateIndex
CREATE INDEX "CoachingGrant_trainerId_status_idx" ON "CoachingGrant"("trainerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CoachingGrant_trainerId_memberId_key" ON "CoachingGrant"("trainerId", "memberId");

-- CreateIndex
CREATE INDEX "CoachingAudit_grantId_createdAt_idx" ON "CoachingAudit"("grantId", "createdAt");

-- AddForeignKey
ALTER TABLE "CoachingGrant" ADD CONSTRAINT "CoachingGrant_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingGrant" ADD CONSTRAINT "CoachingGrant_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingAudit" ADD CONSTRAINT "CoachingAudit_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "CoachingGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

