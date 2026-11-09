-- 보낸 루틴 이름(SPEC-050 P3b 리뷰 L-1) — 코치가 보낸 때의 이름을 coaching_routines 에 남긴다.
-- 「보낸 루틴」 목록은 회원 레코드 대신 이 값을 보인다(회원이 지우거나·코칭이 끝나 회원 것이 된 뒤에도 코치가 보낸 이름).
-- NOT NULL DEFAULT '' — 이미 있는 행은 회원 레코드의 마지막 이름으로 채운다(없으면 빈 글자).
ALTER TABLE coaching_routines ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';

UPDATE coaching_routines cr
SET name = COALESCE(sr.payload->>'name', '')
FROM sync_records sr
WHERE cr.name = ''
  AND sr.user_id = cr.member_id AND sr.collection = 'routines' AND sr.record_id = cr.member_routine_id;
