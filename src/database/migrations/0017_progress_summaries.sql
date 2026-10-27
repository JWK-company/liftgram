-- @plm SRS-080  기간 성과 요약 — 회원이 담당 트레이너에게 보낸 스냅샷 (ADR-041 · SAD-024)
--
-- 규칙: 재실행해도 결과가 같도록 IF NOT EXISTS · ON CONFLICT 를 쓴다.
-- 한 번 적용된 파일은 고치지 않는다 — 새 파일을 만든다.
--
-- ── 0012의 원칙을 의도적으로 깨는 첫 테이블 ──────────────────────────────────
-- 0012는 "회원 기록을 복사해 두지 않는다(해지 뒤에도 남는다)"였다. 요약은 **회원이 스스로 골라 보낸 것**이고,
-- 보낸 뒤 기록이 바뀌어도 그대로여야 해서(SRS-080) 스냅샷으로 남긴다. 대신 회수는 읽기 가드가 맡는다:
--   · 열 수 있는 사람 = 그 요약의 회원 ∨ (받은 트레이너 ∧ 지금 active ∧ logView ∧ 보낼 때의 동의 시각과 같음)
--   · grant_consent_at 이 그 "같음"의 근거다 — 해지 뒤 다시 맺으면(ReopenGrant → AcceptGrant) consent_at 이
--     새로 찍혀 옛 요약은 열리지 않는다(S-13).
--   · 계정을 지우면 함께 사라진다(ON DELETE CASCADE · S-19).
--
-- ── 저장과 DM 전달을 한 번씩만 ───────────────────────────────────────────────
-- UNIQUE(member_id, client_id)가 오프라인 재전송을 한 행으로 모은다. message_id 가 NULL이면 아직 DM이
-- 안 간 것이다 — 재전송이 오면 그때 보낸다(S-5). 기록은 `WHERE message_id IS NULL`로 한 번만 한다.
--
-- ── 감사 action 목록 갱신(0012 주석의 후속 — 0012 파일은 고치지 않는다) ─────
-- coaching_audits.action:
--   request · accept · revoke · report_view · routines_view · prescription_edit
--   · summary_send(회원이 보냄 — 첫 실제 전달 때만) · summary_view(받은 트레이너가 열람)
--   · records_view(트레이너가 원본 레코드 열람 — detail = 실제로 내준 기간·행 수)
CREATE TABLE IF NOT EXISTS progress_summaries (
  id               text        PRIMARY KEY,
  member_id        text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trainer_id       text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 보낼 때의 coaching_grants.consent_at. 트레이너가 열 때 지금 grant 의 consent_at 과 같아야 한다.
  grant_consent_at timestamptz NOT NULL,
  -- 회원이 고른 기간 [start, end) — 절대 시각(UTC). 날짜 경계는 스냅샷 range.tz 가 회원 기준으로 싣는다.
  period_start     timestamptz NOT NULL,
  period_end       timestamptz NOT NULL,
  schema_version   int         NOT NULL,
  -- 서버는 해석하지 않는다(최상위 schemaVersion 일치·객체 여부만 본다). 64KB 상한은 계약이 지킨다.
  snapshot         jsonb       NOT NULL,
  -- 기기가 만든 uuid — 오프라인 재전송 멱등 키.
  client_id        text        NOT NULL,
  -- DM 메시지 id. NULL = 아직 전달 안 됨(재전송이 오면 그때 보낸다).
  message_id       text,
  created_at       timestamptz NOT NULL DEFAULT now(),

  UNIQUE (member_id, client_id)
);

-- 트레이너 쪽 훑기(받은 요약) — 스펙 칸.
CREATE INDEX IF NOT EXISTS progress_summaries_trainer_idx ON progress_summaries (trainer_id, created_at DESC);
-- 회원 쪽: 보낸 요약 목록(커서) · 하루 전송 상한 세기.
CREATE INDEX IF NOT EXISTS progress_summaries_member_idx ON progress_summaries (member_id, created_at DESC, id DESC);

-- ── DM 메시지가 가리키는 대상 ─────────────────────────────────────────────────
-- SUMMARY 메시지의 body 는 숫자 없는 대체 문구(옛 앱용)이고, 새 앱은 ref_id(=요약 id)로 GetProgressSummary 한다.
-- 다른 종류(text·image)에서는 NULL.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS ref_id text;
