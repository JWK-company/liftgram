-- 코치 코멘트는 회원 것(SPEC-050 P4 리뷰) — 코치가 탈퇴해도 회원이 받은 코멘트는 남는다.
--
-- 0033 은 trainer_id·grant_id 가 ON DELETE CASCADE 라 코치가 탈퇴하면(users → coaching_grants CASCADE) 코멘트가 함께 사라졌다.
-- 스펙 정책 「받은 말은 회원 것」에 맞춰 둘 다 nullable · ON DELETE SET NULL 로 바꾼다 — 화면은 코치가 비면 「탈퇴한 코치」.
-- 회원 탈퇴는 그대로 지운다(member_id 는 CASCADE 그대로).
--
-- 규칙: 재실행해도 결과가 같다(DROP CONSTRAINT IF EXISTS → 같은 이름으로 다시 ADD).
-- 한 번 적용된 파일은 고치지 않는다 — 새 파일을 만든다.

ALTER TABLE coaching_comments ALTER COLUMN trainer_id DROP NOT NULL;
ALTER TABLE coaching_comments ALTER COLUMN grant_id DROP NOT NULL;

ALTER TABLE coaching_comments DROP CONSTRAINT IF EXISTS coaching_comments_trainer_id_fkey;
ALTER TABLE coaching_comments
  ADD CONSTRAINT coaching_comments_trainer_id_fkey FOREIGN KEY (trainer_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE coaching_comments DROP CONSTRAINT IF EXISTS coaching_comments_grant_id_fkey;
ALTER TABLE coaching_comments
  ADD CONSTRAINT coaching_comments_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES coaching_grants(id) ON DELETE SET NULL;
