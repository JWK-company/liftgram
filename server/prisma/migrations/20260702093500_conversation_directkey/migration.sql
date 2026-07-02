-- 1:1 대화 중복 방지: 정규화 키(정렬된 유저쌍) directKey + unique 인덱스
ALTER TABLE "Conversation" ADD COLUMN "directKey" TEXT;

CREATE UNIQUE INDEX "Conversation_directKey_key" ON "Conversation"("directKey");
