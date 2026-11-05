-- SPEC-030  만 14세 확인 기록 — 언제, 어떤 경로로 확인했는지 남긴다(email = 확인 칸, social_notice = 소셜 안내 문구).
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_confirmed_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS age_confirm_via text;
