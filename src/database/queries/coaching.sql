-- @plm SRS-048  코칭

-- 코칭 의향을 밝힌 사람 찾기. **차단한/차단당한 사람과 나 자신은 빼고**.
-- [개선] SPEC-052 — trainer_intent 는 「코치 찾기 노출」 · is_coach(활성 연결의 코치)는 배지용 파생값.
-- [원본] SELECT id, display_name, avatar_url, experience_level, trainer_intent, coach_bio, coach_tags
-- name: SearchTrainers :many
SELECT id, display_name, avatar_url, experience_level, trainer_intent, coach_bio, coach_tags,
       EXISTS (SELECT 1 FROM coaching_grants cg WHERE cg.trainer_id = u.id AND cg.status = 'active')::boolean AS is_coach
FROM users u
WHERE u.trainer_intent = true
  AND u.id <> @viewer_id::text
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = @viewer_id::text AND b.blocked_id = u.id)
       OR (b.blocker_id = u.id AND b.blocked_id = @viewer_id::text)
  )
  AND (@query::text = '' OR u.display_name ILIKE '%' || @query::text || '%')
ORDER BY u.created_at
LIMIT 30;

-- name: GetGrantByID :one
SELECT * FROM coaching_grants WHERE id = $1;

-- name: GetGrantByPair :one
SELECT * FROM coaching_grants WHERE trainer_id = $1 AND member_id = $2;

-- 내가 낀 모든 관계. 최근 것부터 — 방금 요청한 것이 위에 있어야 한다.
-- name: ListGrantsForUser :many
SELECT
  g.*,
  t.display_name     AS trainer_name,
  t.avatar_url       AS trainer_avatar,
  t.experience_level AS trainer_level,
  t.trainer_intent   AS trainer_intent_flag,
  t.coach_bio        AS trainer_bio,
  t.coach_tags       AS trainer_tags,
  m.display_name     AS member_name,
  m.avatar_url       AS member_avatar,
  m.experience_level AS member_level,
  m.trainer_intent   AS member_intent_flag,
  m.coach_bio        AS member_bio,
  m.coach_tags       AS member_tags,
  -- 「코치」 배지 파생값(SPEC-052) — 그 사람이 활성 연결의 코치인가(이 관계와 무관하게)
  EXISTS (SELECT 1 FROM coaching_grants tg WHERE tg.trainer_id = g.trainer_id AND tg.status = 'active')::boolean AS trainer_is_coach,
  EXISTS (SELECT 1 FROM coaching_grants mg WHERE mg.trainer_id = g.member_id AND mg.status = 'active')::boolean AS member_is_coach
FROM coaching_grants g
JOIN users t ON t.id = g.trainer_id
JOIN users m ON m.id = g.member_id
WHERE g.trainer_id = @viewer_id::text OR g.member_id = @viewer_id::text
ORDER BY g.updated_at DESC;

-- [원본] v1 — 범위·메시지 없이 만든다(SPEC-050 부터 CreateGrantWithScope).
-- name: CreateGrant :one
INSERT INTO coaching_grants (id, trainer_id, member_id, status, requested_by)
VALUES ($1, $2, $3, 'pending', $4)
RETURNING *;

-- 해지된 관계에 다시 요청 — 새 행을 만들지 않고 **같은 행을** 되살린다(감사 기록이 이력을 보존한다).
-- [원본] v1 — 옛 범위가 되살아났다(REV-097 · SPEC-050 부터 ReopenGrantWithScope).
-- name: ReopenGrant :one
UPDATE coaching_grants
SET status = 'pending', requested_by = $2, consent_at = NULL, revoked_at = NULL, updated_at = now()
WHERE id = $1
RETURNING *;

-- [원본] v1 — 상태 조건이 없어 동시 수락에 깨졌다(SPEC-050 부터 AcceptPendingGrant).
-- name: AcceptGrant :one
UPDATE coaching_grants
SET status = 'active', consent_at = now(), updated_at = now()
WHERE id = $1
RETURNING *;

-- [원본] v1 — 상태 조건 없음(SPEC-050 부터 RevokeLiveGrant · 트랜잭션 RevokeGrantAndEndRoutines).
-- name: RevokeGrant :one
UPDATE coaching_grants
SET status = 'revoked', revoked_at = now(), updated_at = now()
WHERE id = $1
RETURNING *;

-- grant_id 는 비어 있을 수 있다(0033 — 초대 코드 만들기처럼 관계가 없는 행동).
-- name: CreateAudit :exec
INSERT INTO coaching_audits (id, grant_id, actor_id, action, detail)
VALUES ($1, $2, $3, $4, $5);

-- 같은 열람을 되풀이하면 감사를 한 번만 남긴다(CS-7) — 트레이너 화면이 카드를 그릴 때마다 Get 해도
-- 회원 이력(최근 100개)이 열람 기록으로 밀려나지 않게. since 뒤에 같은 (grant, actor, action)이 있으면 0행.
-- match_detail 이면 detail 까지 같아야 같은 것으로 본다(요약 id 별 — 다른 요약 열람은 따로 남는다).
-- name: CreateAuditOnce :execrows
INSERT INTO coaching_audits (id, grant_id, actor_id, action, detail)
SELECT @id::text, @grant_id::text, @actor_id::text, @action::text, @detail::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM coaching_audits a
  WHERE a.grant_id = @grant_id::text AND a.actor_id = @actor_id::text AND a.action = @action::text
    AND a.created_at > @since::timestamptz
    AND (@match_detail::boolean = false OR a.detail = @detail::jsonb)
);

-- name: ListAudit :many
SELECT id, actor_id, action, created_at
FROM coaching_audits
WHERE grant_id = $1
ORDER BY created_at DESC
LIMIT 100;

-- 회원이 동기해 둔 레코드를 컬렉션별로 읽는다 — 리포트·루틴 열람이 여기서 나온다.
-- **지워진 것은 빼고**(회원이 지운 기록을 트레이너가 계속 보면 안 된다).
-- name: ListMemberRecords :many
SELECT collection, record_id, payload
FROM sync_records
WHERE user_id = @member_id::text
  AND deleted = false
  AND collection = ANY (@collections::text[]);

-- ── GetMemberRecords(SRS-080) — 기간·부모 id 로 **SQL 에서** 거른다(CS-4) ─────────────────────────────
-- 전 이력을 Go 로 올리지 않는다. 모두 record_id 키셋 페이지(after_id 다음 lim 개)라 저장소가 읽은 바이트를 세다가
-- 상한을 넘으면 그 자리에서 멈춘다. jsonb 칸은 `->`(jsonb)로 꺼내 비교한다 — `->>`(글)로 꺼내면 큰 숫자가 펼쳐진다.
-- CASE 는 평가 순서를 보장한다(WHERE 의 AND 는 보장하지 않아 글자 started_at 에서 캐스트 오류가 날 수 있다).

-- [from_ms, to_ms)에 시작한 완료 운동.
-- name: ListMemberWorkoutsStartedIn :many
SELECT record_id, payload
FROM sync_records
WHERE user_id = @member_id::text
  AND collection = 'workouts'
  AND deleted = false
  AND record_id > @after_id::text
  AND payload->'state' = '"completed"'::jsonb
  AND CASE WHEN jsonb_typeof(payload->'started_at') = 'number'
           THEN (payload->'started_at')::numeric >= @from_ms::bigint
                AND (payload->'started_at')::numeric < @to_ms::bigint
           ELSE false END
ORDER BY record_id
LIMIT @lim::int;

-- 부모 id 칸(parent_field)이 parent_ids 중 하나인 행 — 블록(workout_id)·세트(workout_exercise_id).
-- name: ListMemberRecordsByParent :many
SELECT record_id, payload
FROM sync_records
WHERE user_id = @member_id::text
  AND collection = @collection::text
  AND deleted = false
  AND record_id > @after_id::text
  AND CASE WHEN jsonb_typeof(payload->(@parent_field::text)) = 'string'
           THEN payload->>(@parent_field::text) = ANY (@parent_ids::text[])
           ELSE false END
ORDER BY record_id
LIMIT @lim::int;

-- record_id 가 ids 중 하나인 행 — 쓰인 종목(exercises). (user_id, collection, record_id) 유일 인덱스를 탄다.
-- name: ListMemberRecordsByIDs :many
SELECT record_id, payload
FROM sync_records
WHERE user_id = @member_id::text
  AND collection = @collection::text
  AND deleted = false
  AND record_id > @after_id::text
  AND record_id = ANY (@ids::text[])
ORDER BY record_id
LIMIT @lim::int;

-- name: GetMemberRecord :one
SELECT id, payload FROM sync_records
WHERE user_id = $1 AND collection = $2 AND record_id = $3 AND deleted = false;

-- 처방을 회원의 레코드에 써 넣는다. `updated_at`이 움직여야 회원 기기가 다음 pull에서 받는다.
-- name: UpdateMemberRecord :exec
UPDATE sync_records
SET payload = $2, updated_at = now()
WHERE id = $1;

-- 서버 카탈로그의 종목 이름·주 근육(카탈로그 개편 QA H4). 리포트는 종목을 **여기서 먼저** 해석한다 —
-- 기기는 이제 시드 종목 행을 동기하지 않아(D10) sync_records 에는 커스텀 종목만 있다.
-- name: ListCatalogExerciseMeta :many
SELECT id, name_ko, primary_muscles FROM exercises WHERE is_custom = false;

-- ── 기간 성과 요약(SRS-080 · ADR-041) ──────────────────────────────────────────
-- @plm SRS-080

-- 같은 (회원, client_id)면 새 행을 만들지 않는다 — 오프라인 재전송이 한 행으로 모인다.
-- 충돌이면 행이 안 나온다(pgx.ErrNoRows) → 부르는 쪽이 GetProgressSummaryByMemberClient로 기존 행을 읽는다.
-- name: InsertProgressSummary :one
INSERT INTO progress_summaries (
  id, member_id, trainer_id, grant_consent_at, period_start, period_end, schema_version, snapshot, client_id
) VALUES (
  @id::text, @member_id::text, @trainer_id::text, @grant_consent_at::timestamptz,
  @period_start::timestamptz, @period_end::timestamptz, @schema_version::int, @snapshot::jsonb, @client_id::text
)
ON CONFLICT (member_id, client_id) DO NOTHING
-- 스냅샷은 돌려받지 않는다(CS-1) — 요청에 이미 있고, jsonb 를 글로 다시 받는 일이 곧 숫자 펼침 비용이다.
RETURNING id, created_at;

-- 하루 상한 세기와 넣기 사이의 경쟁을 막는다(CS-5) — 같은 회원의 보내기는 이 트랜잭션 잠금으로 한 줄로 선다.
-- 키 80 = SRS-080(다른 advisory 잠금과 이름 공간을 가른다). 트랜잭션이 끝나면 저절로 풀린다.
-- name: LockMemberSummaries :exec
SELECT pg_advisory_xact_lock(hashtextextended(@member_id::text, 80));

-- 같은 client_id 재전송 비교용 — 스냅샷은 싣지 않고 **SQL 에서 jsonb 동등**으로 판정한다(CS-1: 글로 펼쳐 읽지 않는다).
-- jsonb 동등은 키 순서·공백·숫자 표기(1.0 = 1)를 무시한다.
-- name: GetProgressSummaryByMemberClient :one
SELECT id, member_id, trainer_id, grant_consent_at, period_start, period_end, schema_version, client_id,
       message_id, created_at, (snapshot = @snapshot::jsonb)::boolean AS same_snapshot
FROM progress_summaries
WHERE member_id = @member_id::text AND client_id = @client_id::text;

-- name: GetProgressSummary :one
SELECT * FROM progress_summaries WHERE id = $1;

-- DM 전달을 **한 번만** 기록한다. 이미 적혀 있으면 0행 — 부르는 쪽은 알림·감사를 건너뛴다.
-- name: SetProgressSummaryMessageID :execrows
UPDATE progress_summaries SET message_id = @message_id::text
WHERE id = @id::text AND message_id IS NULL;

-- 회원이 보낸 요약(최근 것부터). 커서 = 마지막으로 받은 (created_at, id) — 그보다 앞선 것만.
-- 스냅샷은 싣지 않는다(목록이 50 × 64KB가 되지 않게) — 펼칠 때 GetProgressSummary.
-- name: ListProgressSummariesByMember :many
SELECT id, trainer_id, period_start, period_end, schema_version, message_id, created_at
FROM progress_summaries
WHERE member_id = @member_id::text
  AND (@has_cursor::boolean = false
       OR (created_at, id) < (@cursor_created_at::timestamptz, @cursor_id::text))
ORDER BY created_at DESC, id DESC
LIMIT @lim::int;

-- 하루 전송 상한(트레이너 DM·알림 도배 방지 · S-19).
-- name: CountProgressSummariesByMemberSince :one
SELECT count(*)::int FROM progress_summaries
WHERE member_id = @member_id::text AND created_at >= @since::timestamptz;

-- ── 코칭 v2(SPEC-050 · 0033) ─────────────────────────────────────────────────
-- 상태 조건은 **쿼리에** 둔다 — 앱 검사만으로는 동시 요청에 깨진다(REV-097). 0행이면 부르는 쪽이 Conflict.

-- 새 요청 — 범위·한 줄 메시지와 함께.
-- name: CreateGrantWithScope :one
INSERT INTO coaching_grants (id, trainer_id, member_id, status, requested_by, scope, request_note)
VALUES (@id::text, @trainer_id::text, @member_id::text, 'pending', @requested_by::text, @scope::jsonb, @request_note::text)
RETURNING *;

-- 해지된 관계에 다시 요청 — 같은 행을 되살리되 **범위는 이번 요청값(없으면 기본값)으로 덮는다**(옛 범위가 되살아나지 않게).
-- name: ReopenGrantWithScope :one
UPDATE coaching_grants
SET status = 'pending', requested_by = @requested_by::text, scope = @scope::jsonb, request_note = @request_note::text,
    consent_at = NULL, revoked_at = NULL, updated_at = now()
WHERE id = @id::text AND status = 'revoked'
RETURNING *;

-- 수락 — pending 일 때만. 회원이 수락하면 그때 고른 범위를 저장한다(set_scope).
-- 같은 회원에게 활성 관계가 이미 있으면 coaching_grants_one_coach 가 23505 로 막는다.
-- name: AcceptPendingGrant :one
UPDATE coaching_grants
SET status = 'active', consent_at = now(), updated_at = now(),
    scope = CASE WHEN @set_scope::boolean THEN @scope::jsonb ELSE scope END
WHERE id = @id::text AND status = 'pending'
RETURNING *;

-- 범위 바꾸기 — 활성일 때만.
-- name: UpdateActiveGrantScope :one
UPDATE coaching_grants SET scope = @scope::jsonb, updated_at = now()
WHERE id = @id::text AND status = 'active'
RETURNING *;

-- 해지 트랜잭션의 첫 줄 — 같은 관계의 루틴 보내기(P3b)와 줄을 세운다.
-- name: LockGrant :one
SELECT * FROM coaching_grants WHERE id = $1 FOR UPDATE;

-- name: RevokeLiveGrant :one
UPDATE coaching_grants
SET status = 'revoked', revoked_at = now(), updated_at = now()
WHERE id = $1 AND status <> 'revoked'
RETURNING *;

-- 해지·탈퇴 때 그 관계의 활성 코치 루틴을 끝낸다(회원 sync 행 패치는 P3b).
-- name: EndActiveCoachingRoutines :execrows
UPDATE coaching_routines SET status = 'ended', updated_at = now()
WHERE grant_id = $1 AND status = 'active';

-- 이 회원에게 (except_trainer_id 가 아닌) 활성 코치가 있는가 — 화면에 먼저 알리려는 확인(정본은 one_coach 인덱스).
-- name: HasOtherActiveCoach :one
SELECT EXISTS (
  SELECT 1 FROM coaching_grants
  WHERE member_id = @member_id::text AND status = 'active' AND trainer_id <> @except_trainer_id::text
)::boolean;

-- 초대 코드로 연결 — 회원이 범위를 골라 바로 활성. 같은 쌍의 기존 행(pending·revoked)은 되살린다.
-- 이미 활성이면 0행(부르는 쪽이 Conflict). 다른 코치와 활성이면 one_coach 가 23505.
-- name: ActivateGrantFromInvite :one
INSERT INTO coaching_grants (id, trainer_id, member_id, status, scope, requested_by, consent_at)
VALUES (@id::text, @trainer_id::text, @member_id::text, 'active', @scope::jsonb, 'trainer', now())
ON CONFLICT (trainer_id, member_id) DO UPDATE
SET status = 'active', scope = EXCLUDED.scope, requested_by = 'trainer', consent_at = now(),
    revoked_at = NULL, request_note = '', updated_at = now()
WHERE coaching_grants.status <> 'active'
RETURNING *;

-- 코치 한 사람의 공개 카드(초대 코드 화면).
-- [원본] SELECT id, display_name, avatar_url, experience_level, trainer_intent, coach_bio, coach_tags FROM users WHERE id = $1;
-- [개선] SPEC-052 — 배지 파생값 is_coach 를 함께.
-- name: GetCoachPeer :one
SELECT u.id, u.display_name, u.avatar_url, u.experience_level, u.trainer_intent, u.coach_bio, u.coach_tags,
       EXISTS (SELECT 1 FROM coaching_grants cg WHERE cg.trainer_id = u.id AND cg.status = 'active')::boolean AS is_coach
FROM users u WHERE u.id = $1;

-- 코치로서 활성 연결이 있는가(SPEC-052) — 「코치」 배지·홈 담당 회원 카드의 파생값.
-- coaching_grants_trainer_idx (trainer_id, status) 를 탄다.
-- name: IsActiveCoach :one
SELECT EXISTS (SELECT 1 FROM coaching_grants WHERE trainer_id = @user_id::text AND status = 'active')::boolean;

-- ── 초대 코드 ──
-- 코치마다 살아 있는 코드는 하나 — 새로 만들기 전에 옛것을 회수한다(같은 트랜잭션).
-- name: RevokeTrainerInvites :exec
UPDATE coaching_invites SET revoked_at = now() WHERE trainer_id = $1 AND revoked_at IS NULL;

-- name: InsertInvite :one
INSERT INTO coaching_invites (id, code, trainer_id, expires_at)
VALUES (@id::text, @code::text, @trainer_id::text, @expires_at::timestamptz)
RETURNING *;

-- name: GetLiveInviteByCode :one
SELECT * FROM coaching_invites WHERE code = $1 AND revoked_at IS NULL;

-- name: GetLiveInviteByTrainer :one
SELECT * FROM coaching_invites WHERE trainer_id = $1 AND revoked_at IS NULL;

-- 만료된 코드는 조회할 때 회수한다.
-- name: RevokeInvite :exec
UPDATE coaching_invites SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL;

-- ── 체중·인바디(bodyView 일 때만 · 허용 칸은 서버 상수) ──
-- [from_ms, to_ms)에 잰 체중 기록. measured_at 이 숫자가 아니면 뺀다(CASE 로 캐스트 순서를 지킨다).
-- name: ListMemberBodyweightIn :many
SELECT record_id, payload
FROM sync_records
WHERE user_id = @member_id::text
  AND collection = 'bodyweight_logs'
  AND deleted = false
  AND record_id > @after_id::text
  AND CASE WHEN jsonb_typeof(payload->'measured_at') = 'number'
           THEN (payload->'measured_at')::numeric >= @from_ms::bigint
                AND (payload->'measured_at')::numeric < @to_ms::bigint
           ELSE false END
ORDER BY record_id
LIMIT @lim::int;

-- 탈퇴할 때 관계 없이 남긴 감사(invite_create 등 grant_id NULL)도 지운다 — 관계에 붙은 감사는 CASCADE 로 사라진다(P1a 리뷰).
-- name: DeleteOrphanCoachingAudits :exec
DELETE FROM coaching_audits WHERE grant_id IS NULL AND actor_id = $1;

-- ── 코치가 짠 루틴 보내기(SPEC-050 P3b) ─────────────────────────────────────
-- 보내기 트랜잭션의 첫 줄 — 같은 관계의 해지와 줄을 세운다(LockGrant 와 같은 행 잠금).
-- name: LockGrantByPair :one
SELECT * FROM coaching_grants
WHERE trainer_id = @trainer_id::text AND member_id = @member_id::text
FOR UPDATE;

-- 같은 초안의 활성 행(하나뿐 — coaching_routines_active_source).
-- name: GetActiveCoachingRoutine :one
SELECT * FROM coaching_routines
WHERE trainer_id = @trainer_id::text AND member_id = @member_id::text
  AND source_routine_id = @source_routine_id::text AND status = 'active';

-- 회원이 지운 루틴이면 그 행을 끝내고 새로 보낸다.
-- name: EndCoachingRoutine :exec
UPDATE coaching_routines SET status = 'ended', updated_at = now() WHERE id = $1;

-- line_ids 는 빈 배열로라도 넘긴다(nil 이면 NULL 이 되어 NOT NULL 에 걸린다). name = 보낸 때의 이름(0034).
-- name: InsertCoachingRoutine :one
INSERT INTO coaching_routines (id, grant_id, trainer_id, member_id, source_routine_id, member_routine_id, line_ids, name)
VALUES (@id::text, @grant_id::text, @trainer_id::text, @member_id::text, @source_routine_id::text,
        @member_routine_id::text, @line_ids::text[], @name::text)
RETURNING *;

-- name: UpdateCoachingRoutineSent :one
UPDATE coaching_routines SET line_ids = @line_ids::text[], name = @name::text, sent_at = now(), updated_at = now()
WHERE id = @id::text
RETURNING *;

-- 보내기가 쓸 회원 행을 한 번에 잠근다(리뷰 M-2·M-3) — 루틴 행 + 그 루틴의 자식 줄(지운 것도) + 새로 쓸 줄 id.
-- 순서는 sync Push 의 LockSyncRecords 와 같다(ORDER BY collection, record_id) — 둘이 엇갈려 잠가 교착되지 않게.
-- 잠근 뒤 살아 있나·자식 줄을 이 결과로 판단한다(회원이 방금 지운 루틴을 되살리지 않는다).
-- name: LockMemberRoutineRows :many
SELECT collection, record_id, payload, deleted FROM sync_records
WHERE user_id = @user_id::text AND (
  (collection = 'routines' AND record_id = ANY(@routine_ids::text[]))
  OR (collection = 'routine_exercises'
      AND (record_id = ANY(@line_ids::text[]) OR payload->>'routine_id' = ANY(@routine_ids::text[])))
)
ORDER BY collection, record_id
FOR UPDATE;

-- 회원 루틴 순서의 최댓값(없으면 -1) — 처음 보낸 루틴은 맨 끝에 붙는다.
-- name: MaxMemberRoutineSortOrder :one
SELECT COALESCE(MAX(CASE WHEN jsonb_typeof(payload->'sort_order') = 'number'
                         THEN (payload->'sort_order')::numeric END), -1)::bigint AS max_sort
FROM sync_records
WHERE user_id = @user_id::text AND collection = 'routines' AND deleted = false;

-- 회원 sync 행 쓰기(서버가 쓰는 코치 루틴) — 얕은 병합이라 넘기지 않은 칸(폴더·순서·변형)은 남는다.
-- name: UpsertMemberSyncRecords :exec
INSERT INTO sync_records (id, user_id, collection, record_id, payload, deleted, updated_at)
SELECT unnest(@ids::text[]), @user_id::text, unnest(@collections::text[]), unnest(@record_ids::text[]),
       unnest(@payloads::jsonb[]), false, now()
ON CONFLICT (user_id, collection, record_id) DO UPDATE
  SET payload = sync_records.payload || EXCLUDED.payload, deleted = false, updated_at = now();

-- name: MarkMemberSyncDeleted :exec
UPDATE sync_records SET deleted = true, updated_at = now()
WHERE user_id = @user_id::text AND collection = @collection::text AND record_id = ANY(@record_ids::text[])
  AND deleted = false;

-- 해지·탈퇴 — 그 관계의 활성 코치 루틴을 회원 기기에서 「코칭 끝남」으로(한 칸 패치 · EndActiveCoachingRoutines 보다 먼저).
-- name: MarkCoachRoutinesEnded :execrows
UPDATE sync_records sr
SET payload = sr.payload || jsonb_build_object('origin', 'coach_ended', 'updated_at', @now_ms::bigint),
    updated_at = now()
FROM coaching_routines cr
WHERE cr.grant_id = @grant_id::text AND cr.status = 'active'
  AND sr.user_id = cr.member_id AND sr.collection = 'routines' AND sr.record_id = cr.member_routine_id
  AND sr.deleted = false;

-- 탈퇴 — 그 사람이 낀 관계를 모두 잠근다(보내기와 줄을 세운다).
-- name: LockUserGrants :many
SELECT id FROM coaching_grants WHERE trainer_id = $1 OR member_id = $1 ORDER BY id FOR UPDATE;

-- 보낸 루틴 목록(코치 본인 · 끝난 것 포함). 이름은 보낸 때의 이름(coaching_routines.name · 0034) —
-- 회원 레코드를 읽지 않는다(코칭이 끝나 회원이 이름을 바꿔도 코치에게 보이지 않게 · 리뷰 L-1).
-- name: ListSentRoutines :many
SELECT cr.id, cr.source_routine_id, cr.member_routine_id, cr.member_id, cr.status, cr.sent_at, cr.name
FROM coaching_routines cr
WHERE cr.trainer_id = @trainer_id::text AND cr.member_id = @member_id::text
ORDER BY cr.sent_at DESC, cr.id
LIMIT 200;

-- 보낼 종목 — 서버 카탈로그에 있는 것만(직접 만든 종목·내린 종목은 회원 기기에 없다).
-- name: ListExercisesByIDs :many
SELECT id, name_ko, is_custom, is_archived FROM exercises WHERE id = ANY(@ids::text[]);

-- 코치 기기의 직접 만든 종목 이름(오류 문구용).
-- name: GetUserCustomExerciseName :one
SELECT COALESCE(payload->>'name_ko', '')::text AS name FROM sync_records
WHERE user_id = @user_id::text AND collection = 'exercises' AND record_id = @record_id::text;

-- 코치당 시간당 보내기 수(감사 기록으로 센다).
-- name: CountRoutineSendsSince :one
SELECT count(*) FROM coaching_audits
WHERE actor_id = @actor_id::text AND action IN ('routine_send', 'routine_update') AND created_at >= @since::timestamptz;

-- 같은 루틴의 「바꿨어요」 알림 10분 묶음 — 그 사이 같은 루틴을 바꾼 기록이 있으면 알림을 다시 보내지 않는다.
-- name: HasRecentRoutineUpdate :one
SELECT EXISTS (
  SELECT 1 FROM coaching_audits
  WHERE grant_id = @grant_id::text AND action = 'routine_update'
    AND detail->>'coachingRoutineId' = @coaching_routine_id::text AND created_at >= @since::timestamptz
)::boolean;

-- ── 코치 코멘트(SPEC-050 P4 · coaching_comments 는 0033) ─────────────────────────────
-- 코치가 회원 운동 하나에 남기는 말. 숨기면 hidden_at — 숨긴 코멘트는 누구에게도 나가지 않는다.

-- name: InsertCoachingComment :one
INSERT INTO coaching_comments (id, grant_id, trainer_id, member_id, workout_id, body)
VALUES (@id::text, @grant_id::text, @trainer_id::text, @member_id::text, @workout_id::text, @body::text)
RETURNING id, created_at;

-- 하루 상한 — 이 코치가 이 회원에게 since 뒤에 남긴 수(숨긴 것도 센다 · 지웠다 다시 쓰기로 상한을 넘지 않게).
-- name: CountCommentsByPairSince :one
SELECT count(*) FROM coaching_comments
WHERE trainer_id = @trainer_id::text AND member_id = @member_id::text AND created_at >= @since::timestamptz;

-- 운동 하나의 코멘트(숨긴 것 빼고 · 오래된 것부터). trainer_id 가 비면 모든 코치 — 회원이 볼 때.
-- 회원 쪽은 차단한(된) 코치의 코멘트를 빼고 보인다(차단 사이에는 서로 보이지 않는다).
-- [원본] JOIN users u ON u.id = c.trainer_id · c.trainer_id 그대로
-- [개선] 0035 — 코치가 탈퇴하면 trainer_id 가 NULL(코멘트는 회원 것으로 남는다) → LEFT JOIN · 빈 글자(화면 「탈퇴한 코치」)
-- name: ListCommentsForWorkout :many
SELECT c.id, COALESCE(c.trainer_id, '')::text AS trainer_id, c.member_id, c.workout_id, c.body, c.created_at,
       COALESCE(u.display_name, '')::text AS trainer_name
FROM coaching_comments c
LEFT JOIN users u ON u.id = c.trainer_id
WHERE c.member_id = @member_id::text AND c.workout_id = @workout_id::text AND c.hidden_at IS NULL
  AND (@trainer_id::text = '' OR c.trainer_id = @trainer_id::text)
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = c.member_id AND b.blocked_id = c.trainer_id)
       OR (b.blocker_id = c.trainer_id AND b.blocked_id = c.member_id)
  )
ORDER BY c.created_at, c.id
LIMIT 200;

-- 이 코치가 이 회원에게 남긴 코멘트(숨긴 것 빼고 · 최근 것부터) — 회원 화면 기록 탭이 운동마다 묶는다.
-- name: ListCommentsByPair :many
SELECT c.id, COALESCE(c.trainer_id, '')::text AS trainer_id, c.member_id, c.workout_id, c.body, c.created_at,
       COALESCE(u.display_name, '')::text AS trainer_name
FROM coaching_comments c
JOIN users u ON u.id = c.trainer_id
WHERE c.trainer_id = @trainer_id::text AND c.member_id = @member_id::text AND c.hidden_at IS NULL
ORDER BY c.created_at DESC, c.id
LIMIT 500;

-- 0035 — 코치가 탈퇴했으면 trainer_id·grant_id 가 빈 글자(NULL).
-- name: GetCoachingComment :one
SELECT id, COALESCE(grant_id, '')::text AS grant_id, COALESCE(trainer_id, '')::text AS trainer_id,
       member_id, workout_id, body, created_at, hidden_at
FROM coaching_comments WHERE id = @id::text;

-- 숨기기 — 아직 숨기지 않은 것만(0행이면 이미 숨김).
-- name: HideCoachingComment :execrows
UPDATE coaching_comments SET hidden_at = now() WHERE id = @id::text AND hidden_at IS NULL;

-- ── 담당 회원 점검(ListMemberDigest · SPEC-050 P4) ──────────────────────────────────
-- [원본] MemberWorkoutDigest — 회원마다 한 번(ListGrants → Blocked → 숫자 · N+1)
-- [개선] 한 질의 — 이 코치의 활성 관계 + 차단 사이 빼기(NOT EXISTS blocks) + LATERAL 숫자(리뷰 · N+1 없앰).
-- 회원 한 명의 완료 운동 숫자 — 모두 visible_from 뒤만 센다(Go visibleFrom 과 같은 기준):
--   pastRecords 켬 → 0 · consent_at 없음 → now_ms(지금부터만) · 그 밖 → consent_at(ms, 내림)
--   week_workouts           week_start 뒤에 시작한 운동 수
--   last_started_at         마지막 운동 시작 시각(없으면 0)
--   week_coach_workouts     그중 이 코치가 보낸 루틴(coaching_routines.member_routine_id)으로 한 운동 수
-- logView 가 꺼진 관계는 세지 않는다(LATERAL 안 WHERE 가 0행 → 0). 잘림 판정용으로 row_limit 은 200 + 1 을 준다.
-- CASE 는 평가 순서를 보장한다(글자 started_at 에서 캐스트 오류가 나지 않게 — ListMemberWorkoutsStartedIn 과 같은 꼴).
-- name: ListMemberDigestRows :many
SELECT g.member_id, g.scope,
       COALESCE(d.week_workouts, 0)::int AS week_workouts,
       COALESCE(d.last_started_at, 0)::bigint AS last_started_at,
       COALESCE(d.week_coach_workouts, 0)::int AS week_coach_workouts
FROM coaching_grants g
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE w.started >= @week_start_ms::bigint) AS week_workouts,
    max(w.started) AS last_started_at,
    count(*) FILTER (WHERE w.started >= @week_start_ms::bigint AND w.routine_id IN (
       SELECT cr.member_routine_id FROM coaching_routines cr
       WHERE cr.trainer_id = g.trainer_id AND cr.member_id = g.member_id
    )) AS week_coach_workouts
  FROM (
    SELECT CASE WHEN jsonb_typeof(sr.payload->'started_at') = 'number'
                THEN (sr.payload->'started_at')::numeric::bigint END AS started,
           sr.payload->>'routine_id' AS routine_id
    FROM sync_records sr
    WHERE g.scope->'logView' = 'true'::jsonb
      AND sr.user_id = g.member_id
      AND sr.collection = 'workouts'
      AND sr.deleted = false
      AND sr.payload->'state' = '"completed"'::jsonb
      AND CASE WHEN jsonb_typeof(sr.payload->'started_at') = 'number'
               THEN (sr.payload->'started_at')::numeric >= (CASE
                        WHEN g.scope->'pastRecords' = 'true'::jsonb THEN 0
                        WHEN g.consent_at IS NULL THEN @now_ms::bigint
                        ELSE floor(extract(epoch FROM g.consent_at) * 1000)::bigint END)
                    AND (sr.payload->'started_at')::numeric < @to_ms::bigint
               ELSE false END
  ) w
) d ON true
WHERE g.trainer_id = @trainer_id::text AND g.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM blocks b
    WHERE (b.blocker_id = g.trainer_id AND b.blocked_id = g.member_id)
       OR (b.blocker_id = g.member_id AND b.blocked_id = g.trainer_id)
  )
ORDER BY g.consent_at DESC NULLS LAST, g.id
LIMIT @row_limit::int;

-- 처방 대 실제 — 이 코치가 이 회원에게 보낸 루틴의 회원 쪽 id(끝난 것 포함 · 점검 week_coach_workouts 와 같은 기준).
-- name: ListCoachMemberRoutineIDs :many
SELECT member_routine_id FROM coaching_routines
WHERE trainer_id = @trainer_id::text AND member_id = @member_id::text;
