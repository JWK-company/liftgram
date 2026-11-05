-- SPEC-031  검사하지 못한 사진 표시 — 검사기가 멈춘 동안 올라온 사진을 복구 뒤 다시 본다.
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS scan_pending boolean NOT NULL DEFAULT false;
-- 실패 횟수 — 적은 것부터 다시 봐서, 계속 실패하는 사진이 뒤에 쌓인 사진을 막지 않게 한다.
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS scan_attempts integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS media_assets_scan_pending_idx ON media_assets (scan_attempts, created_at) WHERE scan_pending;
