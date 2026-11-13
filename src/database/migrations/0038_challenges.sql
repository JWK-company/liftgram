-- 그룹 챌린지(SPEC-064 · SRS-118~121 · ADR-065) — 초대 그룹 · 앱 카메라 인증 · 하루 판정 · 만회 · 면제권 · 벌칙 기록 · 이의.
--
-- 돈은 다루지 않는다(ADR-065). 벌칙은 그룹이 정한 글(앱 밖에서 이행)을 기록만 한다.
-- 하루 = 04:00 KST 경계(Go 가 계산). 판정은 서버 루프가 하고, 첫 판정 때의 증거를 challenge_days 에 남긴다.
-- 확정(final)된 날은 기록을 다시 읽지 않는다(얼림 · REV-159) — 이의 무효만 예외.
-- 인증 사진 바이트는 공개 미디어(media_assets)와 분리된 비공개 저장소에 둔다(storage_key).

-- 배포 중 옛 서버가 sync_records 에 쓰는 동안 색인을 만든다 — 막히면 오래 기다리지 말고 실패해 다시 배포하게(REV-163 2차 M-1).
-- (실행기가 파일 하나를 트랜잭션 하나로 돌려 SET LOCAL 이 이 파일에만 걸린다.)
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS challenges (
  id               text        PRIMARY KEY,
  owner_id         text        REFERENCES users(id) ON DELETE SET NULL,
  title            text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 30),
  starts_on        date        NOT NULL,
  weeks            integer     NOT NULL CHECK (weeks BETWEEN 1 AND 8),
  rule_kind        text        NOT NULL CHECK (rule_kind IN ('daily', 'weekdays')),
  -- 비트 0 = 월 … 6 = 일
  weekdays         integer     NOT NULL CHECK (weekdays BETWEEN 1 AND 127),
  min_sets         integer     NOT NULL DEFAULT 5 CHECK (min_sets BETWEEN 1 AND 30),
  proof_mode       text        NOT NULL CHECK (proof_mode IN ('gym', 'any_photo', 'record')),
  penalty_text     text        NOT NULL DEFAULT '' CHECK (char_length(penalty_text) <= 60),
  pass_per_week    integer     NOT NULL DEFAULT 1 CHECK (pass_per_week IN (0, 1)),
  invite_token     text        NOT NULL UNIQUE,
  status           text        NOT NULL DEFAULT 'recruiting' CHECK (status IN ('recruiting', 'active', 'ended', 'cancelled')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,
  photos_purged_at timestamptz,
  CHECK (rule_kind <> 'daily' OR weekdays = 127)
);

CREATE INDEX IF NOT EXISTS challenges_status_idx ON challenges (status);

CREATE TABLE IF NOT EXISTS challenge_members (
  challenge_id text        NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id      text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  left_at      timestamptz,
  PRIMARY KEY (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS challenge_members_user_idx ON challenge_members (user_id) WHERE left_at IS NULL;

-- 오늘의 지시 — 일회용 번호(3분). 운동이 아직 서버에 없어도 발급한다(동기 지연 · REV-159).
CREATE TABLE IF NOT EXISTS challenge_prompts (
  id           text        PRIMARY KEY,
  challenge_id text        NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id      text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workout_id   text        NOT NULL,
  prompt_code  text        NOT NULL,
  issued_at    timestamptz NOT NULL,
  used_at      timestamptz
);

CREATE INDEX IF NOT EXISTS challenge_prompts_user_idx ON challenge_prompts (user_id, issued_at);

-- 탈퇴하면 user_id 가 NULL 이 되고, 판정 루프가 다음 회차에 그 사진 파일과 행을 지운다
-- (행이 CASCADE 로 먼저 사라지면 비공개 저장소의 파일 키를 잃는다 · REV-159).
CREATE TABLE IF NOT EXISTS challenge_proofs (
  id           text        PRIMARY KEY,
  challenge_id text        NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id      text        REFERENCES users(id) ON DELETE SET NULL,
  workout_id   text        NOT NULL,
  prompt_id    text        NOT NULL UNIQUE,
  prompt_code  text        NOT NULL,
  issued_at    timestamptz NOT NULL,
  -- 서버가 사진을 받은 시각(기기 시각은 믿지 않는다 · ADR-065)
  captured_at  timestamptz NOT NULL,
  storage_key  text,
  dhash        bigint      NOT NULL,
  source       text        NOT NULL CHECK (source IN ('app', 'web')),
  dup_of       text,
  status       text        NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'suspect_dup', 'invalid')),
  invalid_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS challenge_proofs_ch_user_idx ON challenge_proofs (challenge_id, user_id);
CREATE INDEX IF NOT EXISTS challenge_proofs_user_idx ON challenge_proofs (user_id);

CREATE TABLE IF NOT EXISTS challenge_days (
  challenge_id text        NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id      text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day          date        NOT NULL,
  result       text        NOT NULL CHECK (result IN ('done', 'made_up', 'pass', 'missed_open', 'missed', 'rest')),
  final        boolean     NOT NULL DEFAULT false,
  workout_id   text,
  sets         integer,
  proof_id     text,
  judged_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, user_id, day),
  CHECK (result <> 'missed_open' OR NOT final)
);

CREATE TABLE IF NOT EXISTS challenge_flags (
  proof_id   text        NOT NULL REFERENCES challenge_proofs(id) ON DELETE CASCADE,
  voter_id   text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proof_id, voter_id)
);

CREATE TABLE IF NOT EXISTS challenge_debts (
  challenge_id text        NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id      text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day          date        NOT NULL,
  paid_at      timestamptz,
  paid_by      text        REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (challenge_id, user_id, day)
);

-- 알림을 한 번만 보내기 위한 기록(INSERT … ON CONFLICT DO NOTHING RETURNING · REV-159).
-- ref = 날짜(YYYY-MM-DD) 또는 proof id. 끝·취소는 마지막 날·시작일.
CREATE TABLE IF NOT EXISTS challenge_notices (
  challenge_id text        NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id      text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         text        NOT NULL,
  ref          text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, user_id, kind, ref)
);

-- 판정 입력: 운동 → 블록(workout_id) → 세트(workout_exercise_id). 부모 칸으로 찾는다.
CREATE INDEX IF NOT EXISTS sync_records_we_parent_idx
  ON sync_records (user_id, (payload->>'workout_id')) WHERE collection = 'workout_exercises' AND deleted = false;
CREATE INDEX IF NOT EXISTS sync_records_set_parent_idx
  ON sync_records (user_id, (payload->>'workout_exercise_id')) WHERE collection = 'set_logs' AND deleted = false;
