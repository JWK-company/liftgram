-- 코치 역할 없애기(SPEC-052) — 데이터 정리 한 번. 스키마는 바꾸지 않는다.
--
-- 지금까지는 코칭 의향(users.trainer_intent)을 끄면 그 사람의 초대 코드가 「없는 코드」로 막혔다(checkInviteUsable).
-- SPEC-052 부터 의향은 「코치 찾기 노출」일 뿐이라 그 검사가 없어진다 — 그대로 두면 「회원 받기를 그만둔다」며 끈 사람의
-- 옛 코드(14일 수명)가 배포 순간 다시 쓸 수 있게 된다(REV-105 S2). 그래서 그런 코드만 이번에 회수한다.
-- 앞으로 노출을 끈 사람이 새로 만드는 코드는 정상이다(이 파일은 한 번만 적용된다 — schema_migrations).
--
-- 실행기가 한 번만 적용한다(_migrations 기록 · 한 트랜잭션). **손으로 다시 돌리지 않는다** — 그 뒤 노출을 끈 채
-- 정상으로 만든 코드까지 회수한다. 한 번 적용된 파일은 고치지 않는다 — 새 파일을 만든다.

UPDATE coaching_invites
SET revoked_at = now()
WHERE revoked_at IS NULL
  AND trainer_id IN (SELECT id FROM users WHERE trainer_intent = false);
