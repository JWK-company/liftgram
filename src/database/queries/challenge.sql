-- 그룹 챌린지(SPEC-064 · SRS-118~121) — 만들기·참가·상세·인증·판정 입력·이의·벌칙·알림 기록·보관.
--
-- 판정 입력은 sync_records JSON 이다(서버는 payload 를 해석하지 않는 동기 저장소 — 숫자 칸은 CASE 안에서만 형변환).
-- 세트 = workouts → workout_exercises(workout_id) → set_logs(workout_exercise_id) · 웜업 제외 · done 이 false 가 아닌 것.

-- ── 챌린지 ──────────────────────────────────────────────────────────────

-- name: InsertChallenge :exec
INSERT INTO challenges (id, owner_id, title, starts_on, weeks, rule_kind, weekdays, min_sets, proof_mode,
                        penalty_text, pass_per_week, invite_token)
VALUES (@id, @owner_id, @title, @starts_on, @weeks, @rule_kind, @weekdays, @min_sets, @proof_mode,
        @penalty_text, @pass_per_week, @invite_token);

-- name: UpdateChallengeRule :execrows
UPDATE challenges SET title = @title, starts_on = @starts_on, weeks = @weeks, rule_kind = @rule_kind,
       weekdays = @weekdays, min_sets = @min_sets, proof_mode = @proof_mode, penalty_text = @penalty_text,
       pass_per_week = @pass_per_week
WHERE id = @id AND status = 'recruiting';

-- name: GetChallenge :one
SELECT * FROM challenges WHERE id = @id;

-- name: GetChallengeForUpdate :one
-- [원본] FOR UPDATE — 루프가 days·debts·notices 를 넣을 때의 외래키 KEY SHARE 와 부딪혔다(REV-160 3)
SELECT * FROM challenges WHERE id = @id FOR NO KEY UPDATE;

-- name: GetChallengeByToken :one
SELECT * FROM challenges WHERE invite_token = @invite_token;

-- name: SetInviteToken :exec
UPDATE challenges SET invite_token = @invite_token WHERE id = @id;

-- name: SetChallengeOwner :exec
UPDATE challenges SET owner_id = sqlc.narg('owner_id') WHERE id = @id;

-- name: SetChallengeStatus :execrows
UPDATE challenges SET status = @status,
       ended_at = CASE WHEN @status IN ('ended', 'cancelled') THEN @at::timestamptz ELSE ended_at END
WHERE id = @id AND status = @from_status;

-- 루프 대상: 시작할 것(모집 중 · 시작 시각 지남) · 판정할 것(진행 중).
-- name: ListChallengesByStatus :many
SELECT * FROM challenges WHERE status = @status ORDER BY id;

-- 내 챌린지(나가지 않은 것) — 진행 · 모집 · 끝 순서는 화면이 정한다.
-- name: ListMyChallenges :many
SELECT c.* FROM challenges c
JOIN challenge_members m ON m.challenge_id = c.id
WHERE m.user_id = @user_id AND m.left_at IS NULL
ORDER BY c.starts_on DESC, c.id
LIMIT 50;

-- 동시에 모집·진행 중인 내 챌린지 수(사용자 advisory xact lock 안에서 센다 · REV-159).
-- name: CountMyOpenChallenges :one
SELECT count(*)::bigint FROM challenges c
JOIN challenge_members m ON m.challenge_id = c.id
WHERE m.user_id = @user_id AND m.left_at IS NULL AND c.status IN ('recruiting', 'active');

-- name: LockUserChallenges :exec
SELECT pg_advisory_xact_lock(hashtextextended('challenge-user:' || @user_id::text, 0));

-- name: TryLoopLock :one
SELECT pg_try_advisory_xact_lock(7321064)::boolean AS ok;

-- ── 멤버 ────────────────────────────────────────────────────────────────

-- name: ListMembers :many
SELECT m.user_id, m.joined_at, m.left_at, coalesce(u.display_name, '')::text AS display_name,
       coalesce(u.avatar_url, '')::text AS avatar_url
FROM challenge_members m JOIN users u ON u.id = m.user_id
WHERE m.challenge_id = @challenge_id
ORDER BY m.joined_at, m.user_id;

-- name: GetMember :one
SELECT * FROM challenge_members WHERE challenge_id = @challenge_id AND user_id = @user_id;

-- name: CountActiveMembers :one
SELECT count(*)::bigint FROM challenge_members WHERE challenge_id = @challenge_id AND left_at IS NULL;

-- 다시 참가(모집 중 · 나갔던 사람)도 같은 행을 되살린다.
-- name: UpsertMember :exec
INSERT INTO challenge_members (challenge_id, user_id, joined_at) VALUES (@challenge_id, @user_id, @at)
ON CONFLICT (challenge_id, user_id) DO UPDATE SET left_at = NULL, joined_at = EXCLUDED.joined_at;

-- name: MarkMemberLeft :execrows
UPDATE challenge_members SET left_at = @at WHERE challenge_id = @challenge_id AND user_id = @user_id AND left_at IS NULL;

-- name: DeleteMember :exec
DELETE FROM challenge_members WHERE challenge_id = @challenge_id AND user_id = @user_id;

-- 둘 중 하나라도 막았으면 참가를 거부한다.
-- name: BlockedWithAnyMember :one
SELECT EXISTS (
  SELECT 1 FROM challenge_members m JOIN blocks b
    ON (b.blocker_id = m.user_id AND b.blocked_id = @user_id) OR (b.blocker_id = @user_id AND b.blocked_id = m.user_id)
  WHERE m.challenge_id = @challenge_id AND m.left_at IS NULL
)::boolean AS blocked;

-- ── 지시·인증 ────────────────────────────────────────────────────────────

-- name: InsertPrompt :exec
INSERT INTO challenge_prompts (id, challenge_id, user_id, workout_id, prompt_code, issued_at)
VALUES (@id, @challenge_id, @user_id, @workout_id, @prompt_code, @issued_at);

-- name: GetPromptForUpdate :one
SELECT * FROM challenge_prompts WHERE id = @id FOR UPDATE;

-- name: UsePrompt :exec
UPDATE challenge_prompts SET used_at = @at WHERE id = @id;

-- 사용자당 분당 발급·올리기 상한(REV-159) — 최근 1분 지시 수.
-- name: CountRecentPrompts :one
SELECT count(*)::bigint FROM challenge_prompts WHERE user_id = @user_id AND issued_at > @since;

-- name: InsertProof :exec
INSERT INTO challenge_proofs (id, challenge_id, user_id, workout_id, prompt_id, prompt_code, issued_at, captured_at,
                              storage_key, dhash, source, dup_of, status)
VALUES (@id, @challenge_id, @user_id, @workout_id, @prompt_id, @prompt_code, @issued_at, @captured_at,
        @storage_key, @dhash, @source, sqlc.narg('dup_of'), @status);

-- name: GetProof :one
SELECT * FROM challenge_proofs WHERE id = @id;

-- name: GetProofForUpdate :one
SELECT * FROM challenge_proofs WHERE id = @id FOR UPDATE;

-- name: ListProofsByChallenge :many
SELECT p.*, (SELECT count(*) FROM challenge_flags f WHERE f.proof_id = p.id)::bigint AS flags,
       EXISTS (SELECT 1 FROM challenge_flags f WHERE f.proof_id = p.id AND f.voter_id = @viewer_id)::boolean AS flagged_by_me
FROM challenge_proofs p
WHERE p.challenge_id = @challenge_id
ORDER BY p.captured_at;

-- 판정 입력 — 한 챌린지 멤버들의 인증(무효 포함 · 규칙 함수가 거른다).
-- name: ListProofsForJudge :many
SELECT id, user_id, workout_id, issued_at, captured_at, status FROM challenge_proofs
WHERE challenge_id = @challenge_id;

-- 본인 지난 인증 · 같은 그룹 다른 사람 인증 중 가장 가까운 것(거리 = 64비트 해시의 다른 비트 수).
-- name: NearestOwnProof :one
SELECT id, bit_count((dhash # @dhash::bigint)::bit(64))::int AS dist FROM challenge_proofs
WHERE user_id = @user_id AND status <> 'invalid'
ORDER BY dist, captured_at DESC LIMIT 1;

-- name: NearestGroupProof :one
SELECT id, bit_count((dhash # @dhash::bigint)::bit(64))::int AS dist FROM challenge_proofs
WHERE challenge_id = @challenge_id AND user_id <> @user_id AND status <> 'invalid'
ORDER BY dist, captured_at DESC LIMIT 1;

-- name: SetProofInvalid :execrows
UPDATE challenge_proofs SET status = 'invalid', invalid_at = @at WHERE id = @id AND status <> 'invalid';

-- ── 이의 ────────────────────────────────────────────────────────────────

-- name: InsertFlag :exec
INSERT INTO challenge_flags (proof_id, voter_id, created_at) VALUES (@proof_id, @voter_id, @at)
ON CONFLICT DO NOTHING;

-- name: DeleteFlag :exec
DELETE FROM challenge_flags WHERE proof_id = @proof_id AND voter_id = @voter_id;

-- 과반은 누른 순간의 활성 멤버 표만 센다(나간 사람 표는 뺀다 · REV-159).
-- name: CountActiveFlags :one
SELECT count(*)::bigint FROM challenge_flags f
JOIN challenge_members m ON m.challenge_id = @challenge_id AND m.user_id = f.voter_id AND m.left_at IS NULL
WHERE f.proof_id = @proof_id;

-- ── 판정 ────────────────────────────────────────────────────────────────

-- name: ListDays :many
SELECT * FROM challenge_days WHERE challenge_id = @challenge_id ORDER BY day, user_id;

-- name: UpsertDay :exec
INSERT INTO challenge_days (challenge_id, user_id, day, result, final, workout_id, sets, proof_id, judged_at)
VALUES (@challenge_id, @user_id, @day, @result, @final, sqlc.narg('workout_id'), sqlc.narg('sets'), sqlc.narg('proof_id'), @judged_at)
ON CONFLICT (challenge_id, user_id, day) DO UPDATE SET
  result = EXCLUDED.result, final = EXCLUDED.final, workout_id = EXCLUDED.workout_id, sets = EXCLUDED.sets,
  proof_id = EXCLUDED.proof_id, judged_at = EXCLUDED.judged_at;

-- name: DeleteDay :exec
DELETE FROM challenge_days WHERE challenge_id = @challenge_id AND user_id = @user_id AND day = @day;

-- name: ListDaysByProof :many
SELECT * FROM challenge_days WHERE challenge_id = @challenge_id AND proof_id = @proof_id;

-- 판정 입력 — 멤버들의 완료 운동(앱 기록 · 지우지 않음)과 세트 수. 기간 = [from_ms, to_ms) 시작 시각.
-- name: ListJudgeWorkouts :many
-- 첫 판정 컷오프(REV-160 4): 그 운동이 시작한 날의 첫 판정 시각(하루 시작 + 36시간) 뒤에 서버에 처음 온
-- 운동·블록·세트는 세지 않는다(늦게 올리거나 세트를 덧붙여 확정 뒤 결과를 바꾸지 못하게). created_at 은 upsert 로 바뀌지 않는다.
-- 세트 = 웜업 아님 · done 이 false 아님 · 횟수나 시간이 0보다 큼(빈 세트로 채우지 못하게 · REV-160 10).
-- [원본] 컷오프·빈 세트 조건 없음
WITH w AS (
  SELECT s.user_id, s.record_id, s.created_at,
         CASE WHEN jsonb_typeof(s.payload->'started_at') = 'number' THEN (s.payload->'started_at')::numeric END AS st,
         CASE WHEN jsonb_typeof(s.payload->'completed_at') = 'number' THEN (s.payload->'completed_at')::numeric END AS ca
  FROM sync_records s
  WHERE s.collection = 'workouts' AND s.deleted = false
    AND s.user_id = ANY (@user_ids::text[])
    AND s.payload->'state' = '"completed"'::jsonb
    AND coalesce(s.payload->'source', 'null'::jsonb) = 'null'::jsonb
), wc AS (
  -- 하루 = 04:00 KST(= UTC 19:00) 경계 → 하루 시작 ms = floor((st + 5h) / 24h) * 24h − 5h, 첫 판정 = 시작 + 36h
  SELECT w.*, to_timestamp(((floor((w.st + 18000000) / 86400000) * 86400000 - 18000000 + 129600000) / 1000)::double precision) AS cutoff
  FROM w WHERE w.st IS NOT NULL AND w.ca IS NOT NULL AND w.st >= @from_ms::bigint AND w.st < @to_ms::bigint
)
SELECT wc.user_id, wc.record_id, wc.st::bigint AS started_ms, wc.ca::bigint AS completed_ms,
       (SELECT count(*) FROM sync_records we
          JOIN sync_records sl ON sl.user_id = we.user_id AND sl.collection = 'set_logs' AND sl.deleted = false
                              AND sl.payload->>'workout_exercise_id' = we.record_id
         WHERE we.user_id = wc.user_id AND we.collection = 'workout_exercises' AND we.deleted = false
           AND we.payload->>'workout_id' = wc.record_id
           AND we.created_at <= wc.cutoff AND sl.created_at <= wc.cutoff
           AND coalesce(sl.payload->'is_warmup', 'false'::jsonb) <> 'true'::jsonb
           AND coalesce(sl.payload->'done', 'null'::jsonb) <> 'false'::jsonb
           AND ((jsonb_typeof(sl.payload->'reps') = 'number' AND (sl.payload->'reps')::numeric > 0)
             OR (jsonb_typeof(sl.payload->'duration_sec') = 'number' AND (sl.payload->'duration_sec')::numeric > 0)))::bigint AS sets
FROM wc
WHERE wc.created_at <= wc.cutoff;

-- ── 벌칙 ────────────────────────────────────────────────────────────────

-- name: InsertDebt :exec
INSERT INTO challenge_debts (challenge_id, user_id, day) VALUES (@challenge_id, @user_id, @day)
ON CONFLICT DO NOTHING;

-- name: DeleteDebt :exec
DELETE FROM challenge_debts WHERE challenge_id = @challenge_id AND user_id = @user_id AND day = @day;

-- name: ListDebts :many
SELECT * FROM challenge_debts WHERE challenge_id = @challenge_id ORDER BY day, user_id;

-- name: SetDebtPaid :execrows
UPDATE challenge_debts SET paid_at = sqlc.narg('paid_at'), paid_by = sqlc.narg('paid_by')
WHERE challenge_id = @challenge_id AND user_id = @user_id AND day = @day;

-- ── 알림 기록 ────────────────────────────────────────────────────────────

-- 처음 넣을 때만 행을 돌려준다 — 그때만 알림을 보낸다(한 번만 · REV-159).
-- name: InsertNotice :many
INSERT INTO challenge_notices (challenge_id, user_id, kind, ref) VALUES (@challenge_id, @user_id, @kind, @ref)
ON CONFLICT DO NOTHING
RETURNING user_id;

-- ── 보관 ────────────────────────────────────────────────────────────────

-- 끝·취소 30일이 지났고 아직 사진을 지우지 않은 챌린지.
-- name: ListPurgeDue :many
SELECT id FROM challenges
WHERE status IN ('ended', 'cancelled') AND photos_purged_at IS NULL AND ended_at < @before
ORDER BY ended_at LIMIT 50;

-- 처리 안 된 신고가 걸린 인증 사진은 뒤로 미룬다(REV-159).
-- name: ListPurgeKeys :many
SELECT p.id, p.storage_key::text AS storage_key FROM challenge_proofs p
WHERE p.challenge_id = @challenge_id AND p.storage_key IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.target_type = 'challenge_proof' AND r.target_id = p.id AND r.status = 'pending');

-- name: ClearProofKey :exec
UPDATE challenge_proofs SET storage_key = NULL WHERE id = @id;

-- name: CountProofKeys :one
SELECT count(*)::bigint FROM challenge_proofs WHERE challenge_id = @challenge_id AND storage_key IS NOT NULL;

-- name: MarkPhotosPurged :exec
UPDATE challenges SET photos_purged_at = @at WHERE id = @id;

-- name: DeleteOldPrompts :exec
DELETE FROM challenge_prompts WHERE challenge_id = @challenge_id;

-- 탈퇴한 사람의 인증(user_id NULL) — 파일을 지운 뒤 행을 지운다.
-- name: ListOrphanProofs :many
SELECT id, coalesce(storage_key, '')::text AS storage_key FROM challenge_proofs WHERE user_id IS NULL LIMIT 200;

-- name: DeleteProof :exec
DELETE FROM challenge_proofs WHERE id = @id;

-- 판정 루프는 챌린지마다 트랜잭션을 따로 연다(REV-160 2) — 서버가 여러 대여도 한 챌린지는 한 곳만.
-- name: TryChallengeLock :one
SELECT pg_try_advisory_xact_lock(7321064, hashtext(@id::text))::bool AS ok;

-- 보관 삭제 목록은 한 서버만 만든다(REV-160 8).
-- name: TryPurgeLock :one
SELECT pg_try_advisory_xact_lock(7321065)::bool AS ok;
