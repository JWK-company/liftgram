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
INSERT INTO refresh_tokens (token_hash, user_id, expires_at)
VALUES ($1, $2, $3);

-- 갱신이 쓴다. **살아 있는 것만** 돌려준다 — 폐기·만료 판단을 Go로 미루지 않는다.
-- name: GetLiveRefreshToken :one
SELECT * FROM refresh_tokens
WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now();

-- 회전·로그아웃. 이미 폐기된 것을 다시 폐기해도 문제 없다(멱등).
-- name: RevokeRefreshToken :exec
UPDATE refresh_tokens SET revoked_at = now()
WHERE token_hash = $1 AND revoked_at IS NULL;

-- 이 사용자의 모든 세션을 끊는다. 토큰 도난이 드러났을 때 쓸 자리다.
-- name: RevokeAllRefreshTokensForUser :exec
UPDATE refresh_tokens SET revoked_at = now()
WHERE user_id = $1 AND revoked_at IS NULL;

-- 만료된 토큰 청소 — 쌓아 둘 이유가 없다.
-- name: DeleteExpiredRefreshTokens :exec
DELETE FROM refresh_tokens WHERE expires_at < now();
