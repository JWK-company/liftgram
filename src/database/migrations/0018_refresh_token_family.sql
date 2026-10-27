-- @plm SRS-083  refresh 토큰 계열(family)·폐기 사유 — 회전 유예와 재사용 탐지의 바탕
--
-- 회전은 그대로 한다. 다만 회전으로 폐기된 토큰이 다시 오면, 그것이 **응답을 못 받은 정상 클라이언트**인지
-- **훔친 토큰**인지 가려야 한다. 그러려면 한 로그인에서 이어진 토큰들을 묶는 계열과, 왜 폐기됐는지가 필요하다.
--
--   family_id      한 번의 로그인(세션)에서 회전으로 이어진 토큰 묶음. 첫 토큰의 해시를 계열 id로 쓴다.
--   revoke_reason  rotated(회전) · logout(이 기기 로그아웃) · reuse(재사용 탐지) · all(전체 폐기) · legacy(이 마이그레이션 전)
--
-- 0017 은 병행 작업(opengym)이 쓴다 — 적용은 파일명 집합 기준이라 순서가 바뀌어도 둘 다 적용된다.

ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS family_id text;
ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS revoke_reason text;

-- 기존 토큰은 저마다 자기 계열이다. 이미 폐기된 것은 유예 대상이 아니다(사유를 알 수 없다).
UPDATE refresh_tokens SET family_id = token_hash WHERE family_id IS NULL;
UPDATE refresh_tokens SET revoke_reason = 'legacy' WHERE revoked_at IS NOT NULL AND revoke_reason IS NULL;

-- 재사용 탐지·로그아웃이 계열 단위로 훑는다.
CREATE INDEX IF NOT EXISTS refresh_tokens_family_idx ON refresh_tokens (family_id);
