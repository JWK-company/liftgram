-- @plm SRS-006  계정·인증 쿼리 — 여기 있는 것은 SQL뿐이다
--
-- 규칙(비밀번호를 어떻게 검사하는가·토큰을 언제 폐기하는가)은 internal/auth/service.go가 안다.
-- 이 파일은 "무엇을 읽고 쓰는가"만 적는다.

-- name: CreateUser :one
INSERT INTO users (id, email, display_name, password_hash, auth_provider, role)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- 로그인이 쓴다. 이메일은 대소문자를 가리지 않는다 —
-- 'A@b.com'으로 가입하고 'a@b.com'으로 로그인하는 것은 같은 사람이다.
-- name: GetUserByEmail :one
SELECT * FROM users WHERE lower(email) = lower($1);

-- 프로필 수정 — 보낸 것만 바꾼다.
-- `set_*` 플래그가 false면 기존 값을 그대로 둔다(빈 문자열로 지우는 것과 구분하기 위해서다).
-- name: UpdateUserProfile :one
UPDATE users SET
  display_name     = CASE WHEN @set_display_name::boolean     THEN @display_name::text     ELSE display_name END,
  avatar_url       = CASE WHEN @set_avatar_url::boolean       THEN @avatar_url::text       ELSE avatar_url END,
  experience_level = CASE WHEN @set_experience_level::boolean THEN @experience_level::text ELSE experience_level END,
  trainer_intent   = CASE WHEN @set_trainer_intent::boolean   THEN @trainer_intent::boolean ELSE trainer_intent END,
  updated_at       = now()
WHERE id = @id::text
RETURNING *;

-- name: CreateRefreshToken :exec
-- family_id: 새 로그인이면 자기 해시, 회전·유예 재발급이면 옛 토큰의 계열(0018 · SRS-083).
-- parent_hash: 회전으로 만들어졌으면 옛 토큰 해시, 새 로그인이면 NULL(0019 · 「미사용 후계」 규칙).
INSERT INTO refresh_tokens (token_hash, user_id, expires_at, family_id, parent_hash)
VALUES ($1, $2, $3, $4, sqlc.narg('parent_hash'));

-- 갱신이 쓴다(0018 · SRS-083). **폐기된 것도** 돌려준다 — 회전 유예·재사용 탐지를 가려야 하므로.
-- 만료는 여기서 거른다.
-- name: GetRefreshToken :one
SELECT * FROM refresh_tokens
WHERE token_hash = $1 AND expires_at > now();

-- 회전. 살아 있을 때만 폐기한다 — 영향 행 수가 곧 동시 갱신의 승패다(1 = 내가 회전했다).
-- 시각은 서비스 시계로 받는다(유예 판단과 같은 시계).
-- name: RotateRefreshToken :execrows
UPDATE refresh_tokens SET revoked_at = @at::timestamptz, revoke_reason = 'rotated'
WHERE token_hash = @token_hash AND revoked_at IS NULL;

-- [원본] 「마지막 회전이면 허용」 판단용 — /qa code H-1 로 쓰지 않는다(생성물은 남겨 둔다).
-- 이 계열에서 가장 최근 회전 시각. 회전된 토큰이 「마지막 회전」이면 그 뒤 새 토큰이 쓰인 적 없다.
-- name: LatestRotationAt :one
SELECT max(revoked_at)::timestamptz AS latest FROM refresh_tokens
WHERE family_id = $1 AND revoke_reason = 'rotated';

-- 계열의 살아 있는 토큰(0019 · SRS-083). 「미사용 후계」 규칙에서 언제나 하나다 — 가장 최근 것을 준다.
-- name: LiveRefreshInFamily :one
SELECT * FROM refresh_tokens
WHERE family_id = $1 AND revoked_at IS NULL AND expires_at > now()
ORDER BY created_at DESC
LIMIT 1;

-- 미사용 후계를 대체한다(응답 유실·탭 경합 구제 · 0019). 살아 있을 때만.
-- name: SupersedeRefreshToken :exec
UPDATE refresh_tokens SET revoked_at = @at::timestamptz, revoke_reason = 'superseded'
WHERE token_hash = @token_hash AND revoked_at IS NULL;

-- 한 사용자의 세션 결정(갱신·로그아웃·전체 폐기)을 한 줄로 세운다 — 트랜잭션이 끝나면 풀린다(H-3).
-- name: LockUserSessions :exec
SELECT pg_advisory_xact_lock(hashtextextended('refresh:' || @user_id::text, 0));

-- 계열 전체를 끊는다(로그아웃·재사용 탐지). **이미 폐기된 행의 사유도 덮어쓴다** — 그래야 유예가 닫힌다.
-- name: RevokeRefreshFamily :exec
UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, @at::timestamptz), revoke_reason = @reason::text
WHERE family_id = @family_id;

-- 갱신이 쓴다. **살아 있는 것만** 돌려준다 — 폐기·만료 판단을 Go로 미루지 않는다.
-- name: GetLiveRefreshToken :one
SELECT * FROM refresh_tokens
WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now();

-- 회전·로그아웃. 이미 폐기된 것을 다시 폐기해도 문제 없다(멱등).
-- name: RevokeRefreshToken :exec
UPDATE refresh_tokens SET revoked_at = now(), revoke_reason = 'logout'
WHERE token_hash = $1 AND revoked_at IS NULL;

-- 이 사용자의 모든 세션을 끊는다. 토큰 도난이 드러났을 때 쓸 자리다.
-- name: RevokeAllRefreshTokensForUser :exec
-- 이미 회전으로 폐기된 행의 사유도 'all'로 덮어쓴다 — 아니면 비밀번호를 바꾼 뒤에도 옛 기기가 회전 유예로
-- 되살아난다(0018 · SRS-083 · QA Q4).
-- [개선] 살아 있는 것과 유예 대상(rotated·superseded)만 — 역사 행 전부를 매번 고치지 않는다(QA L-3).
UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()), revoke_reason = 'all'
WHERE user_id = $1 AND (revoked_at IS NULL OR revoke_reason IN ('rotated', 'superseded'));

-- 만료된 토큰 청소 — 쌓아 둘 이유가 없다.
-- name: DeleteExpiredRefreshTokens :exec
DELETE FROM refresh_tokens WHERE expires_at < now();

-- ── 정식 계정 (0013 · SRS-052) ─────────────────────────────────────────────

-- name: SetEmailVerified :exec
UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1;

-- name: SetPasswordHash :exec
UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1;

-- name: CreateAuthToken :exec
INSERT INTO auth_tokens (token_hash, user_id, purpose, email, expires_at)
VALUES ($1, $2, $3, $4, $5);

-- 쓰는 순간 소모한다 — 같은 토큰으로 두 번 성공하지 않게 한 문장에서 확인·표시한다.
-- name: ConsumeAuthToken :one
UPDATE auth_tokens SET used_at = now()
WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
RETURNING *;

-- 재발송 간격 판단 — 이 사람의 이 목적 토큰 중 가장 최근 발급 시각.
-- name: LastAuthTokenAt :one
SELECT COALESCE(max(created_at), 'epoch'::timestamptz)::timestamptz AS last_at
FROM auth_tokens WHERE user_id = $1 AND purpose = $2;

-- 새로 발급하면 같은 목적의 옛 토큰은 못 쓰게 한다(메일함에 남은 옛 링크가 살아 있지 않게).
-- name: InvalidateAuthTokens :exec
UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL;

-- name: DeleteExpiredAuthTokens :exec
DELETE FROM auth_tokens WHERE expires_at < now() - interval '7 days';

-- name: GetIdentity :one
SELECT * FROM auth_identities WHERE provider = $1 AND provider_user_id = $2;

-- name: CreateIdentity :one
INSERT INTO auth_identities (id, user_id, provider, provider_user_id, email)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListIdentities :many
SELECT * FROM auth_identities WHERE user_id = $1 ORDER BY created_at;

-- name: DeleteIdentity :execrows
DELETE FROM auth_identities WHERE user_id = $1 AND provider = $2;

-- name: CountIdentities :one
SELECT count(*) FROM auth_identities WHERE user_id = $1;
