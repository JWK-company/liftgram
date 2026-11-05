-- 운영 경고 메일 상태(SPEC-033). 앱의 빨간 점이 사라져 운영 웹을 열지 않으면 경고를 알 수 없으므로 메일로 알린다.
-- 줄은 하나뿐이다: 마지막으로 알린 경고 코드와 시각. 재시작해도 같은 경고를 다시 보내지 않으려고 DB 에 둔다.
CREATE TABLE IF NOT EXISTS ops_alert_mail_state (
  id       boolean     PRIMARY KEY DEFAULT true CHECK (id),
  reasons  text[]      NOT NULL,
  sent_at  timestamptz NOT NULL
);
