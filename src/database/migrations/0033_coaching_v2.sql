-- 코칭 v2 — 연결·범위·초대·코치 루틴·코멘트 (SPEC-050 · ADR-062 · SRS-115)
--
-- 규칙: 재실행해도 결과가 같도록 IF NOT EXISTS 를 쓴다. 한 번 적용된 파일은 고치지 않는다 — 새 파일을 만든다.
-- 이 파일 하나에 v2 의 표·칸·인덱스를 모두 둔다(나중 단계 — 코치 루틴 P3b · 코멘트 P4 — 가 쓸 표도 함께).
-- 공개 저장소다: 시험용 코드·계정·비밀을 여기 넣지 않는다.

-- ── 코치 소개·태그(users) ───────────────────────────────────────────────────
-- 코치 여부는 기존 trainer_intent 그대로다. 소개는 80자(룬) · 태그는 정해진 6개 중 3개까지(검사는 서버 몫).
-- 태그는 NOT NULL DEFAULT '{}' — Go 는 nil 대신 빈 슬라이스를 넘긴다(nil 이면 NULL 이 되어 DEFAULT 가 무력화된다).
ALTER TABLE users ADD COLUMN IF NOT EXISTS coach_bio  text   NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS coach_tags text[] NOT NULL DEFAULT '{}';

-- ── 연결 범위·요청 메시지(coaching_grants) ──────────────────────────────────
-- 범위 키는 넷뿐: logView(운동 기록·분석) · routineEdit(코치가 짠 루틴 받기·내 루틴 처방 고치기)
-- · bodyView(체중·인바디) · pastRecords(연결 전 기록도). 옛 행에 없는 키는 false 로 읽는다(서버 parseScope).
-- 옛 기본값의 scheduleEdit 는 쓰는 곳이 없어 새 기본값에서 뺀다(옛 행은 그대로 둔다).
ALTER TABLE coaching_grants
  ALTER COLUMN scope SET DEFAULT '{"logView":true,"routineEdit":true,"bodyView":false,"pastRecords":false}'::jsonb;
-- 요청할 때 남기는 한 줄(100자 · 검사는 서버 몫).
ALTER TABLE coaching_grants ADD COLUMN IF NOT EXISTS request_note text NOT NULL DEFAULT '';

-- 코치는 한 명 — 앱 검사만으로는 동시 수락에 깨진다(REV-097). 인덱스를 만들기 전에 이미 겹친 회원이 있으면
-- 알아볼 수 있는 말로 멈춘다(운영 DB 는 배포 전에 확인한다).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM coaching_grants WHERE status = 'active' GROUP BY member_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION '활성 코칭이 둘 이상인 회원이 있다 — coaching_grants_one_coach 를 만들기 전에 정리할 것';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS coaching_grants_one_coach ON coaching_grants (member_id) WHERE status = 'active';

-- 감사는 관계(grant)가 없는 행동도 남긴다 — 초대 코드 만들기(invite_create)는 아직 관계가 없다.
-- 관계가 있는 행동은 지금처럼 grant_id 를 채운다(ListAudit 은 grant_id 로만 읽는다).
ALTER TABLE coaching_audits ALTER COLUMN grant_id DROP NOT NULL;

-- ── 초대 코드(coaching_invites) ─────────────────────────────────────────────
-- 코드 = Crockford base32 8자(화면은 4-4 로 끊어 보인다). 코치마다 살아 있는 코드는 하나 —
-- 새로 만들면 한 트랜잭션에서 옛 코드를 회수(revoked_at)하고 넣는다. 만료(14일)는 조회할 때 회수한다.
-- 만료·회수·없음은 같은 NotFound 로 답한다(코드가 있었는지 알리지 않는다).
CREATE TABLE IF NOT EXISTS coaching_invites (
  id         text        PRIMARY KEY,
  code       text        NOT NULL,
  trainer_id text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS coaching_invites_code_live    ON coaching_invites (code)       WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS coaching_invites_trainer_live ON coaching_invites (trainer_id) WHERE revoked_at IS NULL;

-- ── 코치가 보낸 루틴(coaching_routines · P3b 가 쓴다) ──────────────────────
-- 코치 기기의 초안(source_routine_id) ↔ 회원 sync 의 루틴(member_routine_id = coach-<id>).
-- line_ids = 회원 쪽 줄 id(다시 보낼 때 빠진 줄을 지우는 기준). 해지·탈퇴면 ended(회원 루틴은 「코칭 끝남」).
CREATE TABLE IF NOT EXISTS coaching_routines (
  id                text        PRIMARY KEY,
  grant_id          text        NOT NULL REFERENCES coaching_grants(id) ON DELETE CASCADE,
  trainer_id        text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id         text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_routine_id text        NOT NULL,
  member_routine_id text        NOT NULL,
  line_ids          text[]      NOT NULL DEFAULT '{}',
  status            text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  sent_at           timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
-- 같은 초안은 활성 행 하나 — ended 이거나 회원이 지운 루틴이면 새 행으로 새로 보낸다.
CREATE UNIQUE INDEX IF NOT EXISTS coaching_routines_active_source
  ON coaching_routines (trainer_id, member_id, source_routine_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS coaching_routines_grant_idx ON coaching_routines (grant_id, status);

-- ── 운동 코멘트(coaching_comments · P4 가 쓴다) ─────────────────────────────
-- 코치가 회원 운동 하나에 남기는 말. 숨기면 hidden_at(코치 자기 것 · 회원 둘 다).
CREATE TABLE IF NOT EXISTS coaching_comments (
  id         text        PRIMARY KEY,
  grant_id   text        NOT NULL REFERENCES coaching_grants(id) ON DELETE CASCADE,
  trainer_id text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id  text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workout_id text        NOT NULL,
  body       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  hidden_at  timestamptz
);
CREATE INDEX IF NOT EXISTS coaching_comments_member_workout_idx ON coaching_comments (member_id, workout_id, created_at);
CREATE INDEX IF NOT EXISTS coaching_comments_trainer_created_idx ON coaching_comments (trainer_id, created_at);

-- ── 알림 대상(notifications.ref_id) ─────────────────────────────────────────
-- 코칭 알림의 대상(관계 id·운동 id 등). 코칭 kind 는 post_id 를 비운다 — 옛 화면이 글 화면으로 가지 않게.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS ref_id text;
