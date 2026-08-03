-- @plm SRS-048  코칭 권한과 감사 기록 (SAD-022)
--
-- 옛 서버의 CoachingGrant·CoachingAudit와 같은 모양이다.
--
-- 여기 담기는 것은 **권한과 그 권한을 쓴 기록**뿐이다. 회원의 운동 기록은 이 테이블에 없다 —
-- 그건 `sync_records`에 있고, 트레이너가 볼 때 서버가 그 자리에서 집계한다.
-- 복사해 두면 해지한 뒤에도 남아 있게 된다.
CREATE TABLE IF NOT EXISTS coaching_grants (
  id           text        PRIMARY KEY,
  trainer_id   text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id    text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- pending → active → revoked. 해지된 관계에 다시 요청하면 **같은 행이** pending으로 돌아간다
  -- (이력은 감사 기록이 보존한다).
  status       text        NOT NULL DEFAULT 'pending',
  -- 열리는 범위. **신체 정보는 없다** — 기본 제외 원칙이라 목록에 아예 두지 않는다.
  scope        jsonb       NOT NULL DEFAULT '{"routineEdit":true,"scheduleEdit":true,"logView":true}'::jsonb,
  -- 'trainer' | 'member'. 수락은 **반대편만** 할 수 있다.
  requested_by text        NOT NULL,
  -- 동의한 시각. 이 값이 있어야 열린 것이다.
  consent_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  -- 한 쌍에 한 행. 이 제약이 "재요청은 되살리기"의 근거다.
  UNIQUE (trainer_id, member_id)
);

CREATE INDEX IF NOT EXISTS coaching_grants_member_idx ON coaching_grants (member_id, status);
CREATE INDEX IF NOT EXISTS coaching_grants_trainer_idx ON coaching_grants (trainer_id, status);

-- 트레이너가 무엇을 보고 무엇을 고쳤는지. **회원이 읽을 수 있다** —
-- 감시받는 쪽이 감시 기록을 볼 수 없으면 신뢰 장치가 아니다.
CREATE TABLE IF NOT EXISTS coaching_audits (
  id         text        PRIMARY KEY,
  grant_id   text        NOT NULL REFERENCES coaching_grants(id) ON DELETE CASCADE,
  actor_id   text        NOT NULL,
  -- request · accept · revoke · report_view · routines_view · prescription_edit
  action     text        NOT NULL,
  detail     jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coaching_audits_grant_idx ON coaching_audits (grant_id, created_at DESC);
