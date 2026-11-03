-- SPEC-018 §7  웹 → 앱 로그인 넘기기(CreateAppContinue)
--
-- 1) refresh_tokens.origin — 이 세션 계열이 어떻게 시작됐나.
--      login     비밀번호·소셜·가입 등 사람이 직접 로그인(기본값)
--      continue  웹에서 쓰던 세션을 앱으로 넘겨받음 — 「최근 로그인」이 아니다(LastLoginAt 이 뺀다)
--    계열의 첫 토큰(family_id = token_hash)에만 의미가 있다. 회전 토큰은 기본값을 그대로 갖는다.
--
-- 2) auth_tokens.purpose 에 app_continue(웹 → 앱 넘기기 일회용 코드 · 60초)를 더한다.

ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'login';
-- 닫힌 값만(REV-012 백엔드 L-7 — 오타 값이 조용히 쌓이지 않게)
ALTER TABLE refresh_tokens DROP CONSTRAINT IF EXISTS refresh_tokens_origin_check;
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_origin_check CHECK (origin IN ('login','continue'));

ALTER TABLE auth_tokens DROP CONSTRAINT IF EXISTS auth_tokens_purpose_check;
ALTER TABLE auth_tokens ADD CONSTRAINT auth_tokens_purpose_check
  CHECK (purpose IN ('verify_email','reset_password','login_code','link_ticket','app_continue'));
