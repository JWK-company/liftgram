-- 이용 기록과 활성 지표(SPEC-032 Phase 3) — 기능 이름·시간 단위 시각·앱 버전·플랫폼만 담는다(내용·IP 없음).
-- 원본 세 표는 집계 뒤 90일이 지나면 지운다. usage_daily 는 합계만 남아 지우지 않는다.
CREATE TABLE IF NOT EXISTS usage_events (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL, -- 시간 단위로 내린 값
  actor_kind text NOT NULL CHECK (actor_kind IN ('user', 'guest')),
  actor_id text NOT NULL,
  client_event_id uuid NOT NULL,
  event text NOT NULL,
  platform text NOT NULL DEFAULT 'unknown' CHECK (platform IN ('web', 'android', 'ios', 'unknown')),
  app_version text NOT NULL DEFAULT '',
  UNIQUE (actor_kind, actor_id, client_event_id)
);
CREATE INDEX IF NOT EXISTS usage_events_at_idx ON usage_events (at);
CREATE INDEX IF NOT EXISTS usage_events_event_at_idx ON usage_events (event, at);

CREATE TABLE IF NOT EXISTS usage_presence (
  actor_kind text NOT NULL,
  actor_id text NOT NULL,
  first_seen timestamptz NOT NULL,
  last_seen timestamptz NOT NULL,
  PRIMARY KEY (actor_kind, actor_id)
);
CREATE INDEX IF NOT EXISTS usage_presence_last_seen_idx ON usage_presence (last_seen);

CREATE TABLE IF NOT EXISTS usage_active_days (
  day date NOT NULL, -- Asia/Seoul
  actor_kind text NOT NULL,
  actor_id text NOT NULL,
  PRIMARY KEY (day, actor_kind, actor_id)
);
CREATE INDEX IF NOT EXISTS usage_active_days_actor_idx ON usage_active_days (actor_kind, actor_id);

CREATE TABLE IF NOT EXISTS usage_daily (
  day date NOT NULL,
  actor_kind text NOT NULL,
  metric text NOT NULL, -- dau · wau · mau · event:<이름> · platform:<이름>
  actors integer NOT NULL,
  events bigint NOT NULL,
  PRIMARY KEY (day, actor_kind, metric)
);
