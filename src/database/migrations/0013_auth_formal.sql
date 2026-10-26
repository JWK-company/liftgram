-- @plm SRS-052  정식 계정 — 이메일 소유 검증 · 일회용 토큰(검증·재설정·로그인 코드) · 소셜 로그인 수단
--
-- 지금까지는 가입이 이메일·비밀번호를 받기만 했다. 주소가 진짜인지 몰랐고, 비밀번호를 잊으면 되찾을 길이
-- 없었다(2026-10-26 운영진 계정을 DB에서 직접 바꿨다). booktarae.org 방식을 들여온다.

-- 소유가 확인된 시각. null = 아직 확인 안 됨.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

-- 이 마이그레이션 전에 있던 계정은 운영진·초기 사용자뿐이다(4명) — 확인된 것으로 둔다.
-- 그러지 않으면 정식 오픈 첫날 기존 사람 모두가 "주소를 확인해 주세요"에 갇힌다.
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL AND email IS NOT NULL;

-- 일회용 토큰 — 원문은 메일·리다이렉트로만 나가고 여기엔 해시만 남는다.
--   verify_email   : 가입 주소 확인(24시간)
--   reset_password : 비밀번호 재설정(30분)
--   login_code     : 소셜 콜백 → 화면이 토큰으로 바꾸는 일회용 코드(60초)
--   link_ticket    : 로그인한 사람이 소셜을 연결하러 나갈 때 들고 가는 표(2분)
CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash  text        PRIMARY KEY,
  user_id     text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     text        NOT NULL CHECK (purpose IN ('verify_email','reset_password','login_code','link_ticket')),
  -- 토큰이 발급된 시점의 이메일(검증) 등 — 그 사이 주소가 바뀌었으면 쓰지 못하게 하려고
  email       text,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_tokens_user_purpose_idx ON auth_tokens (user_id, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_tokens_expires_idx ON auth_tokens (expires_at);

-- 소셜 로그인 수단. 앵커는 (제공자, 제공자 사용자 ID)이고 **이메일이 아니다** —
-- 제공자 쪽에서 이메일을 바꿔도 계정이 갈아타면 안 된다.
CREATE TABLE IF NOT EXISTS auth_identities (
  id                text        PRIMARY KEY,
  user_id           text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider          text        NOT NULL CHECK (provider IN ('google','kakao','naver')),
  provider_user_id  text        NOT NULL,
  -- 제공자가 준 주소 스냅샷(앵커 아님 · 화면 표시용)
  email             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS auth_identities_user_idx ON auth_identities (user_id);
