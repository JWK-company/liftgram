-- @plm SRS-006  계정·인증 — 사용자와 세션(refresh 토큰)
--
-- ── 옛 백엔드(server/, Prisma)와의 관계 ──────────────────────────────────────
-- 컬럼 이름·의미를 옛 `User` 모델과 맞췄다. 전환 시점에 기존 사용자를 **그대로 옮기기** 위해서다:
-- 비밀번호 해시가 같은 형식(bcrypt)이라 사람들이 다시 가입할 필요가 없다.
-- (옛 DB를 직접 가리키지는 않는다 — 새 데이터베이스를 쓰고, 이관은 명시적으로 한다.)
--
-- ── email이 nullable인 이유 ──────────────────────────────────────────────────
-- 지금은 이메일+비밀번호뿐이지만, 소셜 로그인(구글·애플)이 붙으면 이메일을 안 주는 경우가 있다.
-- 그때 컬럼을 바꾸는 것보다 처음부터 비워 둘 수 있게 두는 편이 싸다. unique는 유지한다 —
-- Postgres에서 null은 unique 제약에 걸리지 않으므로 "이메일 없는 계정 여럿"이 허용된다.
--
-- ── refresh 토큰을 해시로만 저장하는 이유 ────────────────────────────────────
-- 원문을 저장하면 DB가 새는 순간 모든 세션이 탈취된다. 해시만 두면 유출돼도 세션을 못 쓴다.
-- 사용자가 가진 원문으로 해시를 다시 계산해 대조하면 되므로 기능에는 손해가 없다.
--
-- 회전(rotation): 한 번 쓴 토큰은 `revoked_at`이 찍히고 새 토큰이 나온다. 폐기된 토큰이 다시
-- 오면 그건 **도난 신호**다 — 서비스가 그 사용자의 세션을 전부 끊을 수 있는 근거가 된다.

CREATE TABLE IF NOT EXISTS users (
  id                text        PRIMARY KEY,
  email             text        UNIQUE,
  display_name      text,
  avatar_url        text,
  -- 소셜 로그인 계정은 비밀번호가 없다.
  password_hash     text,
  -- local | google | apple | managed
  auth_provider     text        NOT NULL DEFAULT 'local',
  -- user | coworker | moderator | admin  (인가 판단의 단일 출처)
  role              text        NOT NULL DEFAULT 'user',
  -- beginner | intermediate | advanced  (선택 — 답하지 않아도 된다)
  experience_level  text,
  -- 코칭 의향. 자격 보증이 아니다(화면이 고지를 함께 띄운다).
  trainer_intent    boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  -- 원문이 아니라 해시가 곧 열쇠다.
  token_hash  text        PRIMARY KEY,
  user_id     text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  -- 회전·로그아웃으로 무효가 된 시각. null이면 아직 살아 있다.
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 로그아웃(전체)·정리 작업이 사용자 단위로 훑는다.
CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);
-- 만료된 토큰 청소용.
CREATE INDEX IF NOT EXISTS refresh_tokens_expires_idx ON refresh_tokens (expires_at);
