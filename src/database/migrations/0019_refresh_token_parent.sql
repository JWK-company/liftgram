-- @plm SRS-083  refresh 토큰 부모 연결 — 「미사용 후계」 규칙의 바탕(/qa code H-1·H-2)
--
-- 회전된 토큰 R 이 다시 오면, R 의 후계(parent_hash = R)가 아직 한 번도 쓰이지 않았을 때만 응답 유실로 보고
-- 그 후계를 대체(superseded)해 새 후계를 준다. 후계가 이미 쓰였으면 재사용 → 계열 전체 폐기.
-- 그래서 한 계열에 살아 있는 토큰은 언제나 하나다.
--
--   parent_hash    이 토큰을 만든 회전의 옛 토큰 해시. 새 로그인이면 NULL.
--   revoke_reason  0018 의 값에 superseded(미사용 후계를 대체) 가 더해진다.
--
-- 0018 은 아직 운영에 나가지 않았지만, 이미 적용된 개발 DB 가 있어 새 파일로 둔다(파일명 집합 기준 적용).

ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS parent_hash text;

-- 계열의 살아 있는 토큰 찾기(갱신마다 한 번).
CREATE INDEX IF NOT EXISTS refresh_tokens_family_live_idx
  ON refresh_tokens (family_id) WHERE revoked_at IS NULL;
